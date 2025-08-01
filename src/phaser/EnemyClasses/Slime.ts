import Phaser from "phaser";

export class Slime extends Phaser.GameObjects.Sprite {
  // health
  private health: number = 10;

  // essentials
  private frameCounter: number = 0;

  // pellet information
  private fireRate: number = 100;
  private pellets: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private pelletVelocity: number = 200;

  // flipped left or right
  private isFlipped = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "spritesheet", 7);
    scene.add.existing(this);
  }

  update(player: Phaser.GameObjects.Sprite, playerHealth: number) {
    this.frameCounter++;

    if (this.frameCounter % this.fireRate === 0) {
      this.shootPellet();
    }

    this.pellets = this.pellets.filter((pellet) => {
      this.scene.physics.add.overlap(player, pellet, () => {
        playerHealth--;
        pellet.destroy();
      });
      return playerHealth;
    });
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 1);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    this.pellets.push(pellet);
    this.scene.time.delayedCall(2000, () => pellet.destroy());
  }

  causeDamage(healthDamage: number) {
    this.health -= healthDamage;

    if (this.health <= 0) {
      this.destroy();
    }
  }

  getHealth() {
    return this.health;
  }

  flip(flip: boolean) {
    this.isFlipped = flip;

    if (this.isFlipped == true) {
      this.flipX = true;
    } else {
      this.flipX = false;
    }
  }
}
