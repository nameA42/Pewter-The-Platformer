// Effects Manager for visual effects (trails, death effects, etc.)
import type { EffectsDefinition } from "../cedl/schema";

export class EffectsManager {
  private effects: EffectsDefinition | undefined;
  private scene: Phaser.Scene;
  private trailParticles: Phaser.GameObjects.Particles.ParticleEmitter | null =
    null;
  private trailCounter: number = 0;

  constructor(scene: Phaser.Scene, effects?: EffectsDefinition) {
    this.scene = scene;
    this.effects = effects;

    if (effects?.trail?.enabled) {
      this.initTrail(effects.trail);
    }
  }

  private initTrail(trail: NonNullable<EffectsDefinition["trail"]>) {
    // Create particle emitter for trail
    // Using kenny-particles texture if available
    const texture = this.scene.textures.exists("kenny-particles")
      ? "kenny-particles"
      : null;

    if (texture) {
      this.trailParticles = this.scene.add.particles(0, 0, texture, {
        scale: { start: 0.1, end: 0.05 },
        alpha: { start: 0.8, end: 0 },
        lifespan: 300,
        frequency: -1, // Manual emit
      });

      this.trailParticles.stop();
    }
  }

  update(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.effects?.trail?.enabled && this.trailParticles) {
      const frequency = this.effects.trail.frequency || 5;
      this.trailCounter++;

      if (this.trailCounter >= frequency) {
        this.trailCounter = 0;
        this.trailParticles.emitParticleAt(enemy.x, enemy.y);
      }

      // Update emitter position to follow enemy
      this.trailParticles.setPosition(enemy.x, enemy.y);
    }
  }

  triggerDeath(enemy: Phaser.Physics.Arcade.Sprite) {
    if (this.effects?.death) {
      const death = this.effects.death;

      switch (death.type) {
        case "explosion":
          this.createExplosion(enemy.x, enemy.y, death.particle_count || 10);
          break;
        default:
          console.warn(`Unknown death effect type: ${death.type}`);
      }

      // Play sound if specified
      if (death.sound && this.scene.sound.get(death.sound)) {
        this.scene.sound.play(death.sound);
      }
    }

    // Cleanup trail
    if (this.trailParticles) {
      this.trailParticles.destroy();
      this.trailParticles = null;
    }
  }

  private createExplosion(x: number, y: number, count: number) {
    const texture = this.scene.textures.exists("kenny-particles")
      ? "kenny-particles"
      : null;

    if (!texture) return;

    const explosion = this.scene.add.particles(x, y, texture, {
      speed: { min: 50, max: 200 },
      scale: { start: 0.2, end: 0.1 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      quantity: count,
      gravityY: 200,
    });

    // Cleanup after animation
    this.scene.time.delayedCall(600, () => {
      if (explosion) {
        explosion.destroy();
      }
    });
  }

  destroy() {
    if (this.trailParticles) {
      this.trailParticles.destroy();
      this.trailParticles = null;
    }
  }
}
