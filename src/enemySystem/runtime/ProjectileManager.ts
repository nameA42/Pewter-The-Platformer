// Projectile Manager for handling multiple projectile types with patterns
import type { ProjectileDefinition } from "../cedl/schema";

interface HomingProjectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  definition: ProjectileDefinition;
  target: Phaser.GameObjects.Sprite | null;
  homingStartTime: number;
}

export class ProjectileManager {
  private projectiles: Map<string, ProjectileDefinition>;
  private activeProjectiles: Phaser.Physics.Arcade.Sprite[] = [];
  private homingProjectiles: HomingProjectile[] = [];
  private scene: Phaser.Scene;
  private fireCooldowns: Map<string, number> = new Map();
  private burstQueues: Map<
    string,
    { remaining: number; delay: number; lastShot: number }
  > = new Map();

  constructor(scene: Phaser.Scene, definitions?: ProjectileDefinition[]) {
    this.scene = scene;
    this.projectiles = new Map();

    if (definitions) {
      for (const def of definitions) {
        this.projectiles.set(def.name, def);
      }
    }
  }

  // Main shooting method - handles all patterns
  shootWithPattern(
    projectileName: string,
    x: number,
    y: number,
    direction: number = 1,
    targetX?: number,
    targetY?: number,
    target?: Phaser.GameObjects.Sprite,
  ): Phaser.Physics.Arcade.Sprite[] {
    const definition = this.projectiles.get(projectileName);
    if (!definition) {
      console.warn(`Projectile "${projectileName}" not found`);
      return [];
    }

    const pattern = definition.pattern;
    const patternType = pattern?.type || "single";

    switch (patternType) {
      case "spread":
        return this.shootSpread(
          definition,
          x,
          y,
          direction,
          pattern?.spread_count || 3,
          pattern?.spread_angle || 45,
        );

      case "burst":
        this.queueBurst(
          definition,
          x,
          y,
          direction,
          pattern?.burst_count || 3,
          pattern?.burst_delay || 100,
          targetX,
          targetY,
        );
        return []; // Burst shots are queued, not immediate

      case "circular":
        return this.shootCircular(
          definition,
          x,
          y,
          pattern?.circular_count || 8,
        );

      case "homing":
        const homingSprite = this.shootHoming(
          definition,
          x,
          y,
          direction,
          target || null,
          pattern?.homing_strength || 0.5,
          pattern?.homing_delay || 200,
        );
        return homingSprite ? [homingSprite] : [];

      case "single":
      default:
        const sprite = this.shoot(
          projectileName,
          x,
          y,
          direction,
          targetX,
          targetY,
        );
        return sprite ? [sprite] : [];
    }
  }

  // Original single shot method
  shoot(
    projectileName: string,
    x: number,
    y: number,
    direction: number = 1,
    targetX?: number,
    targetY?: number,
  ): Phaser.Physics.Arcade.Sprite | null {
    const definition = this.projectiles.get(projectileName);
    if (!definition) {
      console.warn(`Projectile "${projectileName}" not found`);
      return null;
    }

    return this.createProjectile(definition, x, y, direction, targetX, targetY);
  }

  // Create a single projectile with given angle
  private createProjectile(
    definition: ProjectileDefinition,
    x: number,
    y: number,
    direction: number = 1,
    targetX?: number,
    targetY?: number,
    angleOffset: number = 0, // Angle offset in radians
  ): Phaser.Physics.Arcade.Sprite | null {
    const sprite = this.scene.physics.add.sprite(
      x,
      y,
      "pellets",
      definition.sprite_frame,
    );

    if (!sprite.body) {
      sprite.destroy();
      return null;
    }

    // Set size if specified, otherwise default to a small hitbox matching the dot art
    if (definition.size) {
      sprite.setDisplaySize(definition.size, definition.size);
      sprite.body.setSize(definition.size, definition.size, true);
    } else {
      sprite.body.setSize(6, 6, true);
    }

    // Calculate velocity
    let vx: number;
    let vy: number = 0;
    let baseAngle: number;

    if (targetX !== undefined && targetY !== undefined) {
      // Aim at target
      const dx = targetX - x;
      const dy = targetY - y;
      baseAngle = Math.atan2(dy, dx);
    } else {
      // Horizontal shot based on direction
      baseAngle = direction > 0 ? 0 : Math.PI;
    }

    // Apply angle offset
    const finalAngle = baseAngle + angleOffset;
    vx = Math.cos(finalAngle) * definition.speed;
    vy = Math.sin(finalAngle) * definition.speed;

    sprite.body.setVelocity(vx, vy);

    // Rotate sprite to face direction of travel
    sprite.setRotation(finalAngle);

    // Handle gravity - disable world gravity by default, apply custom if specified
    // Always disable gravity first to ensure world gravity doesn't affect projectiles
    sprite.body.setAllowGravity(false);
    sprite.body.setGravityY(0);

    if (definition.gravity !== undefined && definition.gravity !== 0) {
      // Enable gravity and set custom value only if explicitly specified
      sprite.body.setAllowGravity(true);
      sprite.body.setGravityY(definition.gravity);
    }

    // Store definition reference for damage lookup
    sprite.setData("projectileName", definition.name);
    sprite.setData("damage", definition.damage);

    // Auto-destroy after lifetime
    this.scene.time.delayedCall(definition.lifetime, () => {
      if (sprite && sprite.active) {
        sprite.destroy();
        const index = this.activeProjectiles.indexOf(sprite);
        if (index !== -1) {
          this.activeProjectiles.splice(index, 1);
        }
      }
    });

    this.activeProjectiles.push(sprite);
    return sprite;
  }

  // Spread shot pattern (3-way, 5-way, etc.)
  private shootSpread(
    definition: ProjectileDefinition,
    x: number,
    y: number,
    direction: number,
    count: number,
    totalAngle: number,
  ): Phaser.Physics.Arcade.Sprite[] {
    const sprites: Phaser.Physics.Arcade.Sprite[] = [];
    const baseAngle = direction > 0 ? 0 : Math.PI;
    const angleRad = (totalAngle * Math.PI) / 180; // Convert to radians
    const startAngle = -angleRad / 2;
    const angleStep = count > 1 ? angleRad / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const offset = startAngle + angleStep * i;
      const sprite = this.createProjectile(
        definition,
        x,
        y,
        direction,
        undefined,
        undefined,
        offset,
      );
      if (sprite) {
        sprites.push(sprite);
      }
    }

    return sprites;
  }

  // Burst fire pattern (rapid succession)
  private queueBurst(
    definition: ProjectileDefinition,
    x: number,
    y: number,
    direction: number,
    count: number,
    delay: number,
    targetX?: number,
    targetY?: number,
  ) {
    // Fire first shot immediately
    this.createProjectile(definition, x, y, direction, targetX, targetY);

    // Queue remaining shots
    for (let i = 1; i < count; i++) {
      this.scene.time.delayedCall(delay * i, () => {
        this.createProjectile(definition, x, y, direction, targetX, targetY);
      });
    }
  }

  // Circular pattern (bullet hell style)
  private shootCircular(
    definition: ProjectileDefinition,
    x: number,
    y: number,
    count: number,
  ): Phaser.Physics.Arcade.Sprite[] {
    const sprites: Phaser.Physics.Arcade.Sprite[] = [];
    const angleStep = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const angle = angleStep * i;
      const sprite = this.createProjectile(
        definition,
        x,
        y,
        1,
        undefined,
        undefined,
        angle,
      );
      if (sprite) {
        sprites.push(sprite);
      }
    }

    return sprites;
  }

  // Homing projectile
  private shootHoming(
    definition: ProjectileDefinition,
    x: number,
    y: number,
    direction: number,
    target: Phaser.GameObjects.Sprite | null,
    strength: number,
    delay: number,
  ): Phaser.Physics.Arcade.Sprite | null {
    const sprite = this.createProjectile(definition, x, y, direction);
    if (!sprite) return null;

    // Store homing data
    const homingData: HomingProjectile = {
      sprite,
      definition,
      target,
      homingStartTime: Date.now() + delay,
    };

    sprite.setData("homingStrength", strength);
    sprite.setData("homingTarget", target);

    this.homingProjectiles.push(homingData);
    return sprite;
  }

  // Update method - call this every frame to update homing projectiles
  update(target?: Phaser.GameObjects.Sprite) {
    const now = Date.now();

    // Update homing projectiles
    this.homingProjectiles = this.homingProjectiles.filter((homing) => {
      if (!homing.sprite || !homing.sprite.active) {
        return false;
      }

      // Check if homing should be active yet
      if (now < homing.homingStartTime) {
        return true;
      }

      const actualTarget = homing.target || target;
      if (!actualTarget || !actualTarget.active) {
        return true; // Keep projectile but don't home
      }

      const strength = homing.sprite.getData("homingStrength") || 0.5;
      const body = homing.sprite.body as Phaser.Physics.Arcade.Body;

      // Calculate desired direction to target
      const dx = actualTarget.x - homing.sprite.x;
      const dy = actualTarget.y - homing.sprite.y;
      const targetAngle = Math.atan2(dy, dx);

      // Get current velocity angle
      const currentAngle = Math.atan2(body.velocity.y, body.velocity.x);

      // Interpolate towards target angle
      let angleDiff = targetAngle - currentAngle;

      // Normalize angle difference to -PI to PI
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Apply turn rate based on strength
      const maxTurnRate = 0.1 * strength; // Radians per frame
      const turnAmount = Math.max(
        -maxTurnRate,
        Math.min(maxTurnRate, angleDiff),
      );
      const newAngle = currentAngle + turnAmount;

      // Apply new velocity
      const speed = homing.definition.speed;
      body.setVelocity(Math.cos(newAngle) * speed, Math.sin(newAngle) * speed);

      // Update sprite rotation
      homing.sprite.setRotation(newAngle);

      return true;
    });
  }

  getActiveProjectiles(): Phaser.Physics.Arcade.Sprite[] {
    return this.activeProjectiles.filter((p) => p && p.active);
  }

  updateActiveProjectiles() {
    this.activeProjectiles = this.getActiveProjectiles();
  }

  clearAll() {
    for (const proj of this.activeProjectiles) {
      if (proj && proj.active) {
        proj.destroy();
      }
    }
    this.activeProjectiles = [];
    this.homingProjectiles = [];
    this.burstQueues.clear();
  }

  canShoot(projectileName: string, rate: number): boolean {
    const lastFire = this.fireCooldowns.get(projectileName) || 0;
    const now = Date.now();
    const cooldownMs = (60 / rate) * 1000; // Convert rate (shots per minute) to milliseconds

    if (now - lastFire >= cooldownMs) {
      this.fireCooldowns.set(projectileName, now);
      return true;
    }
    return false;
  }
}
