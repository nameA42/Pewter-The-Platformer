// Dynamic Enemy - Runtime enemy instance created from CEDL
import Phaser from "phaser";
import { Pathfinding } from "../../phaser/ExternalClasses/Pathfinding";
import type {
  EnemyDefinition as ParsedEnemyDefinition,
  ActionDefinition,
} from "../cedl/schema";
import { StateMachine } from "./StateMachine";
import { ProjectileManager } from "./ProjectileManager";
import { EffectsManager } from "./EffectsManager";
import { TerrainAwareness } from "./TerrainAwareness";
import type { EnemyContext, TerrainContext } from "../cedl/types";

type EnemyDefinition = ParsedEnemyDefinition["enemy"];

export class DynamicEnemy extends Phaser.Physics.Arcade.Sprite {
  // Static flag to enable/disable debug overlay for all enemies
  public static debugMode: boolean = false;

  private definition: EnemyDefinition;
  private stateMachine: StateMachine;
  private projectileManager: ProjectileManager;
  private effectsManager: EffectsManager;
  private terrainAwareness: TerrainAwareness;
  private pathfinder: Pathfinding | null = null;
  private health: number;
  private maxHealth: number;
  private speed: number;
  private damageOnContact: number;
  private isFlipped: boolean = false;
  private patrolStartX: number = 0;
  private patrolDistance: number = 0;
  private patrolDirection: number = 1; // 1 = right, -1 = left
  private facingDirection: number = 1; // 1 = right, -1 = left
  private frameCounter: number = 0;
  private overlayGraphics: Phaser.GameObjects.Graphics | null = null;
  private actionTimers: Map<string, number> = new Map();
  private map: Phaser.Tilemaps.Tilemap;
  private groundLayer: Phaser.Tilemaps.TilemapLayer;

  // Debug overlay elements
  private debugText: Phaser.GameObjects.Text | null = null;
  private debugBackground: Phaser.GameObjects.Graphics | null = null;
  private lastContext: EnemyContext | null = null;

  private headHitbox: Phaser.GameObjects.Zone | null = null;

  // Type property for WorldFacts compatibility
  public type: string;

  public getDefinition(): EnemyDefinition {
    return this.definition;
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: EnemyDefinition,
    map: Phaser.Tilemaps.Tilemap,
    groundLayer: Phaser.Tilemaps.TilemapLayer,
  ) {
    // Support both custom textures and spritesheet frames
    let textureKey: string;
    let frameId: number | undefined;

    if (definition.looks?.custom_texture) {
      // Use custom generated texture
      textureKey = definition.looks.custom_texture;
      frameId = undefined; // Custom textures don't use frames
    } else {
      // Use spritesheet frame 7 as default (like Slime), can be overridden by looks
      textureKey = "spritesheet";
      frameId = definition.looks?.base_sprite ?? 7;
    }

    super(scene, x, y, textureKey, frameId);

    this.definition = definition;
    this.type = definition.name;
    this.health = definition.stats.health;
    this.maxHealth = definition.stats.health;
    this.speed = definition.stats.speed;
    this.damageOnContact = definition.stats.damage_on_contact ?? 0;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    scene.physics.add.collider(this, groundLayer);

    this.headHitbox = scene.add.zone(x, y, 1, 1);
    scene.physics.add.existing(this.headHitbox);
    const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
    headBody.setAllowGravity(false);
    headBody.immovable = true;

    // Store references for terrain awareness
    this.map = map;
    this.groundLayer = groundLayer;

    // Initialize components
    this.stateMachine = new StateMachine(definition.behavior);
    this.projectileManager = new ProjectileManager(
      scene,
      definition.projectiles,
    );
    this.effectsManager = new EffectsManager(scene, definition.effects);
    this.terrainAwareness = new TerrainAwareness(scene, map, groundLayer);

    // Initialize pathfinding (for patrol and movement actions)
    this.pathfinder = new Pathfinding(
      scene,
      map,
      this,
      "Ground_Layer",
      this.speed,
    );

    // Apply looks
    this.applyLooks(definition.looks);

    // Store patrol starting position
    this.patrolStartX = x;
  }

  update(
    player: Phaser.GameObjects.Sprite,
    playerHealth: number,
    active: boolean,
  ): number {
    if (!active) {
      this.hideDebugOverlay();
      return playerHealth;
    }

    this.frameCounter++;

    // Build context for state machine
    const context = this.buildContext(player);
    this.lastContext = context;

    // Update state machine and get actions
    const actions = this.stateMachine.update(context, 16); // Assume ~60fps, ~16ms delta

    // Execute actions
    this.executeActions(actions, context, player);

    // Update effects
    this.effectsManager.update(this);

    // Update projectile manager (for homing projectiles)
    this.projectileManager.update(player as Phaser.GameObjects.Sprite);

    // Update debug overlay if enabled
    if (DynamicEnemy.debugMode) {
      this.updateDebugOverlay(context);
    } else {
      this.hideDebugOverlay();
    }

    // Update overlay graphics position
    if (this.overlayGraphics && this.active) {
      this.overlayGraphics.setPosition(this.x, this.y);
    }

    // Handle projectile collisions with player
    const activeProjectiles = this.projectileManager.getActiveProjectiles();
    for (const proj of activeProjectiles) {
      if (proj && proj.active && this.scene.physics.overlap(player, proj)) {
        const damage = proj.getData("damage") as number | undefined;
        if (damage !== undefined) {
          playerHealth -= damage;
        }
        proj.destroy();
      }
    }
    this.projectileManager.updateActiveProjectiles();

    // Sync head hitbox to top 40% of enemy body
    if (this.headHitbox?.active && this.active) {
      const thisBody = this.body as Phaser.Physics.Arcade.Body;
      const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
      headBody.x = thisBody.x;
      headBody.y = thisBody.y;
      headBody.setSize(thisBody.width, thisBody.height * 0.4, false);
    }

    // Handle stomp via head hitbox
    if (this.headHitbox?.active && this.scene.physics.overlap(player, this.headHitbox)) {
      const playerBody = (player as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body;
      playerBody.setVelocityY(-450);
      this.causeDamage(this.health);
      return playerHealth;
    }

    // Handle contact damage
    if (this.active && this.damageOnContact > 0 && this.scene.physics.overlap(player, this)) {
      playerHealth -= this.damageOnContact;
    }

    return playerHealth;
  }

  private buildContext(player: Phaser.GameObjects.Sprite): EnemyContext {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let playerXRelative: "left" | "right" | "center" = "center";
    if (Math.abs(dx) > 5) {
      playerXRelative = dx > 0 ? "right" : "left";
    }

    // Update facing direction based on movement or player position
    if (this.body && Math.abs(this.body.velocity.x) > 5) {
      this.facingDirection = this.body.velocity.x > 0 ? 1 : -1;
    }

    // Get terrain awareness info
    const terrainInfo = this.terrainAwareness.analyze(
      this.x,
      this.y,
      this.facingDirection,
      player.x,
      player.y,
    );

    // Build terrain context
    const terrain: TerrainContext = {
      pitAhead: terrainInfo.pitAhead,
      pitDistance: terrainInfo.pitDistance,
      pitDepth: terrainInfo.pitDepth,
      platformAbove: terrainInfo.platformAbove,
      platformBelow: terrainInfo.platformBelow,
      platformAboveDistance: terrainInfo.platformAboveDistance,
      nearestPlatformX: terrainInfo.nearestPlatformX,
      nearestPlatformY: terrainInfo.nearestPlatformY,
      coverNearby: terrainInfo.coverNearby,
      coverDirection: terrainInfo.coverDirection,
      coverDistance: terrainInfo.coverDistance,
      coverX: terrainInfo.coverX,
      coverY: terrainInfo.coverY,
      hazardNearby: terrainInfo.hazardNearby,
      hazardType: terrainInfo.hazardType,
      hazardDistance: terrainInfo.hazardDistance,
      playerNearHazard: terrainInfo.playerNearHazard,
      onGround: terrainInfo.onGround,
      wallAhead: terrainInfo.wallAhead,
      wallDistance: terrainInfo.wallDistance,
    };

    return {
      playerDistance: distance,
      playerX: player.x,
      playerY: player.y,
      playerXRelative,
      health: this.health,
      timer: this.stateMachine.getStateTimer(),
      position: { x: this.x, y: this.y },
      facingDirection: this.facingDirection,
      terrain,
    };
  }

  private executeActions(
    actions: ActionDefinition[],
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
  ) {
    for (const action of actions) {
      this.executeAction(action, context, player);
    }
  }

  private executeAction(
    action: ActionDefinition,
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
  ) {
    switch (action.type) {
      case "patrol":
        this.handlePatrol(action.distance || 3);
        break;

      case "move_toward_player":
        this.handleMoveTowardPlayer(action.speed_multiplier || 1.0, player);
        break;

      case "move_away_from_player":
        this.handleMoveAwayFromPlayer(action.speed_multiplier || 1.0, player);
        break;

      case "shoot":
        if (action.projectile && action.rate) {
          if (this.projectileManager.canShoot(action.projectile, action.rate)) {
            const direction = context.playerXRelative === "left" ? -1 : 1;
            // Use shootWithPattern for all pattern types (single, spread, burst, circular, homing)
            this.projectileManager.shootWithPattern(
              action.projectile,
              this.x,
              this.y,
              direction,
              player.x, // Target X for aimed shots
              player.y, // Target Y for aimed shots
              player as Phaser.GameObjects.Sprite, // Target for homing projectiles
            );
          }
        }
        break;

      case "jump":
        if (this.body && this.body.touching.down) {
          const velocity = action.velocity || -400;
          this.body.setVelocityY(velocity);
        }
        break;

      case "tint":
        if (action.color !== undefined) {
          this.setTint(action.color);
        }
        break;

      case "scale":
        if (action.value !== undefined) {
          this.setScale(action.value);
        }
        break;

      case "wait":
        // Wait action is handled by state timer, no action needed here
        break;

      // ═══════════════════════════════════════════════════════════════════
      // ENVIRONMENTAL AWARENESS ACTIONS
      // ═══════════════════════════════════════════════════════════════════

      case "avoid_pit":
        this.handleAvoidPit(context);
        break;

      case "smart_patrol":
        // Patrol that automatically avoids pits and walls
        this.handleSmartPatrol(action.distance || 3, context);
        break;

      case "jump_to_platform":
        // Jump toward a detected platform
        this.handleJumpToPlatform(context, action.max_height || 4);
        break;

      case "seek_cover":
        // Move toward nearby cover
        this.handleSeekCover(context, player);
        break;

      case "lure_to_hazard":
        // Try to position so player moves toward hazard
        this.handleLureToHazard(context, player);
        break;

      case "flee_from_hazard":
        // Move away from nearby hazards
        this.handleFleeFromHazard(context);
        break;

      case "ambush":
        // Hide and wait for player, then attack
        this.handleAmbush(context, player, action.trigger_distance || 80);
        break;

      case "drop_attack":
        // Drop down from platform to attack player below
        this.handleDropAttack(context, player);
        break;

      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENVIRONMENTAL ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private handleAvoidPit(context: EnemyContext): void {
    if (!this.body) return;

    const terrain = context.terrain;

    if (terrain.pitAhead && terrain.pitDistance < 32) {
      // Turn around when approaching a pit
      this.facingDirection *= -1;
      this.body.setVelocityX(this.speed * this.facingDirection * 0.5);
      this.setFlipX(this.facingDirection < 0);
    }
  }

  private handleSmartPatrol(distance: number, context: EnemyContext): void {
    if (!this.body) return;

    const terrain = context.terrain;
    const tileSize = this.map.tileWidth;
    const currentTileX = Math.floor(this.x / tileSize);
    const startTileX = Math.floor(this.patrolStartX / tileSize);
    const patrolTileDistance = distance;

    // Check for pit or wall ahead
    if (terrain.pitAhead && terrain.pitDistance < 48) {
      // Turn around before pit
      this.patrolDirection *= -1;
    } else if (terrain.wallAhead && terrain.wallDistance < 24) {
      // Turn around before wall
      this.patrolDirection *= -1;
    } else {
      // Normal patrol bounds check
      const leftBound = startTileX - patrolTileDistance;
      const rightBound = startTileX + patrolTileDistance;

      if (currentTileX <= leftBound) {
        this.patrolDirection = 1;
      } else if (currentTileX >= rightBound) {
        this.patrolDirection = -1;
      }
    }

    // Move in patrol direction
    this.body.setVelocityX(this.speed * this.patrolDirection);
    this.setFlipX(this.patrolDirection < 0);
    this.facingDirection = this.patrolDirection;
  }

  private handleJumpToPlatform(context: EnemyContext, maxHeight: number): void {
    if (!this.body || !this.body.touching.down) return;

    const terrain = context.terrain;

    // Only jump if there's a platform above within reach
    if (
      terrain.platformAbove &&
      terrain.platformAboveDistance <= maxHeight * this.map.tileHeight
    ) {
      // Calculate jump trajectory
      const jumpData = this.terrainAwareness.calculateJumpToTarget(
        this.x,
        this.y,
        terrain.nearestPlatformX,
        terrain.nearestPlatformY,
        800, // gravity
      );

      if (jumpData) {
        this.body.setVelocity(jumpData.velocityX, jumpData.velocityY);
      } else {
        // Simple jump if trajectory calculation fails
        this.body.setVelocityY(-400);
        // Move toward platform horizontally
        const direction = terrain.nearestPlatformX > this.x ? 1 : -1;
        this.body.setVelocityX(this.speed * direction * 1.5);
      }
    }
  }

  private handleSeekCover(
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
  ): void {
    if (!this.body) return;

    const terrain = context.terrain;

    if (terrain.coverNearby) {
      // Move toward cover
      const coverDirection = terrain.coverX > this.x ? 1 : -1;

      // Only move to cover if it puts us between cover and player
      const coverBetweenUsAndPlayer =
        (terrain.coverDirection === "left" && player.x > this.x) ||
        (terrain.coverDirection === "right" && player.x < this.x);

      if (coverBetweenUsAndPlayer || terrain.coverDistance > 32) {
        this.body.setVelocityX(this.speed * coverDirection);
        this.setFlipX(coverDirection < 0);
        this.facingDirection = coverDirection;
      } else {
        // Already at cover, stop
        this.body.setVelocityX(0);
        // Face the player
        this.facingDirection = player.x > this.x ? 1 : -1;
        this.setFlipX(this.facingDirection < 0);
      }
    }
  }

  private handleLureToHazard(
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
  ): void {
    if (!this.body) return;

    const terrain = context.terrain;

    if (terrain.hazardNearby) {
      // Position ourselves so the player would need to cross the hazard to reach us
      const hazardBetweenUsAndPlayer =
        terrain.hazardType !== "none" &&
        ((this.x < player.x &&
          terrain.hazardDistance < context.playerDistance) ||
          (this.x > player.x &&
            terrain.hazardDistance < context.playerDistance));

      if (!hazardBetweenUsAndPlayer) {
        // Move to put hazard between us and player
        // We want to be on the opposite side of the hazard from the player
        const directionAwayFromPlayer = player.x > this.x ? -1 : 1;
        this.body.setVelocityX(this.speed * directionAwayFromPlayer * 0.8);
        this.setFlipX(directionAwayFromPlayer < 0);
      } else {
        // Good position - taunt by moving slightly
        this.body.setVelocityX(
          Math.sin(this.frameCounter * 0.1) * this.speed * 0.3,
        );
        // Face the player
        this.facingDirection = player.x > this.x ? 1 : -1;
        this.setFlipX(this.facingDirection < 0);
      }
    } else {
      // No hazard nearby, just patrol
      this.handlePatrol(3);
    }
  }

  private handleFleeFromHazard(context: EnemyContext): void {
    if (!this.body) return;

    const terrain = context.terrain;

    if (terrain.hazardNearby && terrain.hazardDistance < 64) {
      // Find safe ground away from hazard
      const hazardDirection = Math.sign(this.x - terrain.hazardDistance);
      const safeGround = this.terrainAwareness.findSafeGround(
        this.x,
        this.y,
        hazardDirection,
        5,
      );

      if (safeGround) {
        const moveDirection = safeGround.x > this.x ? 1 : -1;
        this.body.setVelocityX(this.speed * moveDirection * 1.5);
        this.setFlipX(moveDirection < 0);
        this.facingDirection = moveDirection;
      }
    }
  }

  private handleAmbush(
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
    triggerDistance: number,
  ): void {
    if (!this.body) return;

    const terrain = context.terrain;

    // If we're near cover and player is far, hide
    if (terrain.coverNearby && context.playerDistance > triggerDistance * 2) {
      this.handleSeekCover(context, player);
      // Make semi-transparent when hiding
      this.setAlpha(0.5);
    } else if (context.playerDistance <= triggerDistance) {
      // Player is close - spring the ambush!
      this.setAlpha(1);
      this.handleMoveTowardPlayer(2.0, player); // Double speed burst
    } else {
      this.setAlpha(0.8);
      this.body.setVelocityX(0);
    }
  }

  private handleDropAttack(
    context: EnemyContext,
    player: Phaser.GameObjects.Sprite,
  ): void {
    if (!this.body) return;

    const terrain = context.terrain;

    // Only drop if player is below us and we're on a platform
    const playerBelow = player.y > this.y + 32;
    const playerNearbyX = Math.abs(player.x - this.x) < 64;

    if (playerBelow && playerNearbyX && terrain.onGround) {
      // Walk off the edge toward player
      const direction = player.x > this.x ? 1 : -1;
      this.body.setVelocityX(this.speed * direction * 2);
      this.setFlipX(direction < 0);
      this.facingDirection = direction;
    } else if (!terrain.onGround) {
      // Already falling - aim for player
      const direction = player.x > this.x ? 1 : -1;
      this.body.setVelocityX(this.speed * direction * 0.5);
    }
  }

  private handlePatrol(distance: number) {
    if (!this.pathfinder) return;

    const tileSize = 16;
    const currentTileX = Math.floor(this.x / tileSize);
    const startTileX = Math.floor(this.patrolStartX / tileSize);
    const patrolTileDistance = distance;

    // Simple patrol: move left/right within distance
    const leftBound = startTileX - patrolTileDistance;
    const rightBound = startTileX + patrolTileDistance;

    if (this.patrolDirection === 1) {
      // Moving right
      if (currentTileX >= rightBound) {
        this.patrolDirection = -1;
        this.setFlipX(true);
        this.isFlipped = true;
      }
    } else {
      // Moving left
      if (currentTileX <= leftBound) {
        this.patrolDirection = 1;
        this.setFlipX(false);
        this.isFlipped = false;
      }
    }

    // Set velocity based on direction
    if (this.body) {
      this.body.setVelocityX(this.speed * this.patrolDirection);
    }
  }

  private handleMoveTowardPlayer(
    multiplier: number,
    player: Phaser.GameObjects.Sprite,
  ) {
    if (!this.body) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 5) {
      const vx = (dx / distance) * this.speed * multiplier;
      const vy = (dy / distance) * this.speed * multiplier;
      this.body.setVelocityX(vx);
      // Only apply Y velocity if not on ground (for jumping/flying enemies)
      if (!this.body.touching.down) {
        this.body.setVelocityY(vy);
      }

      // Face player
      if (dx > 0) {
        this.setFlipX(false);
        this.isFlipped = false;
      } else {
        this.setFlipX(true);
        this.isFlipped = true;
      }
    }
  }

  private handleMoveAwayFromPlayer(
    multiplier: number,
    player: Phaser.GameObjects.Sprite,
  ) {
    if (!this.body) return;

    const dx = this.x - player.x;
    const dy = this.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      const vx = (dx / distance) * this.speed * multiplier;
      this.body.setVelocityX(vx);

      // Face away from player
      if (dx > 0) {
        this.setFlipX(false);
        this.isFlipped = false;
      } else {
        this.setFlipX(true);
        this.isFlipped = true;
      }
    }
  }

  private applyLooks(looks?: EnemyDefinition["looks"]) {
    if (!looks) return;

    // Base sprite (only if not using custom texture)
    if (looks.base_sprite !== undefined && !looks.custom_texture) {
      this.setFrame(looks.base_sprite);
    }

    // Tint
    if (looks.tint !== undefined) {
      this.setTint(looks.tint);
    }

    // Scale
    if (looks.scale !== undefined) {
      this.setScale(looks.scale);
    }

    // Shape overlay (procedural)
    if (looks.shape_overlay) {
      this.createOverlay(looks.shape_overlay);
    }
  }

  private createOverlay(
    overlay: NonNullable<EnemyDefinition["looks"]>["shape_overlay"],
  ) {
    if (this.overlayGraphics) {
      this.overlayGraphics.destroy();
    }

    this.overlayGraphics = this.scene.add.graphics();
    this.overlayGraphics.setDepth(this.depth + 1);

    const color = overlay.color;
    const alpha = overlay.alpha ?? 1.0;

    this.overlayGraphics.fillStyle(color, alpha);

    // Draw shapes at (0, 0) relative to graphics object, then position graphics object
    switch (overlay.type) {
      case "circle":
        if (overlay.radius !== undefined) {
          this.overlayGraphics.fillCircle(0, 0, overlay.radius);
        }
        break;

      case "rectangle":
        const width = overlay.width ?? 16;
        const height = overlay.height ?? 16;
        this.overlayGraphics.fillRect(-width / 2, -height / 2, width, height);
        break;

      case "triangle":
        // Simple triangle
        const size = overlay.width ?? 16;
        this.overlayGraphics.fillTriangle(
          0,
          -size / 2,
          -size / 2,
          size / 2,
          size / 2,
          size / 2,
        );
        break;
    }

    // Set initial position
    this.overlayGraphics.setPosition(this.x, this.y);
  }

  private findProjectileByFrame(
    frameName: string,
  ): EnemyDefinition["projectiles"][0] | undefined {
    if (!this.definition.projectiles) return undefined;
    const frameNum = parseInt(frameName);
    return this.definition.projectiles.find((p) => p.sprite_frame === frameNum);
  }

  causeDamage(damage: number) {
    this.health -= damage;
    if (this.health <= 0) {
      this.effectsManager.triggerDeath(this);
      this.projectileManager.clearAll();
      this.hideDebugOverlay();
      if (this.overlayGraphics) this.overlayGraphics.setVisible(false);
      if (this.headHitbox) { this.headHitbox.destroy(); this.headHitbox = null; }
      this.disableBody(true, true);
    }
  }

  respawn(x: number, y: number) {
    this.health = this.maxHealth;
    this.enableBody(true, x, y, true, true);
    this.body.velocity.x = 0;
    this.body.velocity.y = 0;
    if (this.overlayGraphics) this.overlayGraphics.setVisible(true);
    if (!this.headHitbox) {
      this.headHitbox = this.scene.add.zone(x, y, 1, 1);
      this.scene.physics.add.existing(this.headHitbox);
      const headBody = this.headHitbox.body as Phaser.Physics.Arcade.Body;
      headBody.setAllowGravity(false);
      headBody.immovable = true;
    }
  }

  clearProjectiles() {
    this.projectileManager.clearAll();
  }

  getHealth(): number {
    return this.health;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODIFICATION METHODS - For runtime property updates
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update enemy stats (health, speed, damage_on_contact)
   * Can be updated in-place without recreating the enemy
   */
  updateStats(stats: Partial<EnemyDefinition["stats"]>): void {
    if (stats.health !== undefined) {
      const healthRatio = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
      this.maxHealth = stats.health;
      this.health = Math.ceil(this.maxHealth * healthRatio); // Preserve health percentage
      if (this.health > this.maxHealth) this.health = this.maxHealth;

      // Update definition
      this.definition.stats.health = stats.health;
    }

    if (stats.speed !== undefined) {
      this.speed = stats.speed;
      this.definition.stats.speed = stats.speed;
      // Update pathfinder speed if it exists
      if (this.pathfinder) {
        // Pathfinding speed might need to be updated - check if Pathfinding has a setSpeed method
        // For now, just update the stored speed
      }
    }

    if (stats.damage_on_contact !== undefined) {
      this.damageOnContact = stats.damage_on_contact;
      this.definition.stats.damage_on_contact = stats.damage_on_contact;
    }
  }

  /**
   * Update enemy looks (tint, scale, base_sprite, shape_overlay)
   * Can be updated in-place without recreating the enemy
   */
  updateLooks(looks: Partial<EnemyDefinition["looks"]>): void {
    if (!this.definition.looks) {
      this.definition.looks = {};
    }

    // Merge new looks with existing
    Object.assign(this.definition.looks, looks);

    // Apply the looks
    this.applyLooks(this.definition.looks);
  }

  /**
   * Update enemy name/type
   * Updates both the type property and definition name
   */
  updateName(newName: string): void {
    this.type = newName;
    this.definition.name = newName;
  }

  /**
   * Get the current enemy definition (read-only copy)
   */
  getDefinition(): Readonly<EnemyDefinition> {
    return this.definition;
  }

  /**
   * Check if behavior or projectiles need to be updated
   * Returns true if enemy needs to be recreated for the changes
   */
  needsRecreation(newDefinition: Partial<EnemyDefinition>): boolean {
    // If behavior changes, need recreation
    if (newDefinition.behavior) {
      return true;
    }

    // If projectiles change, need recreation
    if (newDefinition.projectiles) {
      return true;
    }

    // If effects change, might need recreation (but effects can be updated)
    // For now, only behavior and projectiles require recreation

    return false;
  }

  // Debug overlay methods
  private createDebugOverlay() {
    if (this.debugText) return; // Already created

    // Create background for better readability
    this.debugBackground = this.scene.add.graphics();
    this.debugBackground.setDepth(1000);

    // Create text
    this.debugText = this.scene.add.text(this.x, this.y - 50, "", {
      fontSize: "10px",
      fontFamily: "monospace",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 4, y: 2 },
      align: "center",
    });
    this.debugText.setOrigin(0.5, 1);
    this.debugText.setDepth(1001);
  }

  private updateDebugOverlay(context: EnemyContext) {
    if (!this.debugText) {
      this.createDebugOverlay();
    }

    if (!this.debugText) return;

    const currentState = this.stateMachine.getCurrentState();
    const stateTimer = Math.floor(this.stateMachine.getStateTimer());
    const distance = Math.floor(context.playerDistance);

    // Get next transition info
    const nextTransition = this.getNextTransitionInfo();

    // Build debug text
    const lines = [
      `[${this.type}]`,
      `State: ${currentState.toUpperCase()}`,
      `HP: ${this.health}/${this.maxHealth}`,
      `Dist: ${distance}px | Timer: ${stateTimer}ms`,
    ];

    if (nextTransition) {
      lines.push(`→ ${nextTransition}`);
    }

    this.debugText.setText(lines.join("\n"));
    this.debugText.setPosition(this.x, this.y - 20);

    // Update health bar color based on health percentage
    const healthPercent = this.health / this.maxHealth;
    if (healthPercent <= 0.25) {
      this.debugText.setStyle({ backgroundColor: "#aa0000cc" });
    } else if (healthPercent <= 0.5) {
      this.debugText.setStyle({ backgroundColor: "#aa6600cc" });
    } else {
      this.debugText.setStyle({ backgroundColor: "#000000aa" });
    }
  }

  private hideDebugOverlay() {
    if (this.debugText) {
      this.debugText.destroy();
      this.debugText = null;
    }
    if (this.debugBackground) {
      this.debugBackground.destroy();
      this.debugBackground = null;
    }
  }

  private getNextTransitionInfo(): string | null {
    const currentState = this.stateMachine.getCurrentState();
    const stateDef = this.definition.behavior.states.find(
      (s) => s.name === currentState,
    );

    if (
      !stateDef ||
      !stateDef.transitions ||
      stateDef.transitions.length === 0
    ) {
      return null;
    }

    // Return the first transition condition
    const firstTransition = stateDef.transitions[0];
    return `${firstTransition.condition} → ${firstTransition.target}`;
  }

  destroy(fromScene?: boolean) {
    // Cleanup
    this.effectsManager.destroy();
    this.projectileManager.clearAll();

    if (this.overlayGraphics) {
      this.overlayGraphics.destroy();
      this.overlayGraphics = null;
    }

    // Cleanup debug overlay
    this.hideDebugOverlay();

    super.destroy(fromScene);
  }
}
