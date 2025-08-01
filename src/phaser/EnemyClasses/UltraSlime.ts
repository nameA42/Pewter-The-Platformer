import Phaser from "phaser";

export class UltraSlime extends Phaser.GameObjects.Sprite {
  // health
  private health: number = 20;

  // essentials
  private frameCounter: number = 0;

  // pellet information
  private fireRate: number = 50;
  private pellets: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody[] = [];
  private pelletVelocity: number = 250;
  private megaPelletVelocity: number = 275;
  private isRapidFiring = false;

  // flipped left or right
  private isFlipped = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "spritesheet", 6);
    scene.add.existing(this);
  }

  update(player: Phaser.GameObjects.Sprite, playerHealth: number) {
    this.frameCounter++;

    if (this.frameCounter > 100 && this.frameCounter <= 200) {
      this.isRapidFiring = true;
    } else if (this.frameCounter <= 100) {
      this.isRapidFiring = false;
    } else if (this.frameCounter > 200) {
      this.frameCounter = 0;
    }

    if (this.isRapidFiring == false) {
      if (this.frameCounter % this.fireRate === 0) {
        this.shootPellet();
      }
    } else {
      if ((this.frameCounter % this.fireRate) / 10 === 0) {
        this.shootMegaPellet();
      }
    }

    this.pellets = this.pellets.filter((pellet) => {
      this.scene.physics.add.overlap(player, pellet, () => {
        const isMega = pellet.getData("isMega") === true;
        playerHealth -= isMega ? 5 : 2;
        pellet.destroy();
      });
      return playerHealth;
    });
  }

  private shootPellet() {
    const pellet = this.scene.physics.add.sprite(this.x, this.y, "pellets", 0);
    pellet.body.velocity.x = !this.isFlipped
      ? this.pelletVelocity
      : -this.pelletVelocity;
    this.pellets.push(pellet);
    this.scene.time.delayedCall(2000, () => pellet.destroy());
  }

  private shootMegaPellet() {
    const mega = this.scene.physics.add.sprite(this.x, this.y, "pellets", 2); // Different frame
    mega.body.velocity.x = !this.isFlipped
      ? this.megaPelletVelocity
      : -this.megaPelletVelocity;
    mega.setData("isMega", true);
    this.pellets.push(mega);
    this.scene.time.delayedCall(2000, () => mega.destroy());
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
