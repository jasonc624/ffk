import Phaser from 'phaser';
import { Character } from './Character';
import type { CharacterData } from '../storage';

export class PlayerCharacter extends Character {
  controls: any;
  canDoubleJump: boolean = true;
  isUsingCE: boolean = false;
  private lastEnergySoundTime: number = 0;

  constructor(scene: Phaser.Scene, config: { 
    id: string; 
    name: string; 
    team: 'player'; 
    data: CharacterData;
    controls: any;
  }) {
    super(scene, config);
    this.controls = config.controls;
  }

  spawn(x: number, y: number) {
    this.sprite = this.scene.physics.add.sprite(x, y, 'character');
    this.sprite.setScale(0.8);
    this.sprite.setDepth(2);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setSize(40, 80);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setOffset(44, 48);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    
    // Create hurtbox
    const debugAlpha = (this.scene as any).debugMode ? 0.2 : 0;
    this.hurtbox = this.scene.add.rectangle(x, y, 40, 80, 0xffffff, debugAlpha);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    if (!this.isAlive) return;
    this.handleInput();
  }

  handleInput() {
    if (this.isAttacking || this.isHitstun) return;

    const speed = 300;
    const jumpVelocity = -600;

    // Movement
    if (this.controls.left.isDown) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(-speed);
      this.sprite.setFlipX(true);
    } else if (this.controls.right.isDown) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(speed);
      this.sprite.setFlipX(false);
    } else {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    }

    // Jump
    const onGround = (this.sprite.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (Phaser.Input.Keyboard.JustDown(this.controls.jump)) {
      if (onGround) {
        (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityY(jumpVelocity);
      } else if (this.canDoubleJump) {
        (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityY(jumpVelocity * 0.8);
        this.canDoubleJump = false;
        (this.scene as any).createJumpBurst(this.sprite.x, this.sprite.y);
      }
    }
    if (onGround) this.canDoubleJump = true;

    // Fast Fall / Block
    if (this.controls.down.isDown) {
      if (!onGround) this.sprite.body.setVelocityY(800);
      else {
        this.isBlocking = true;
        this.sprite.setAlpha(0.6);
        this.sprite.body.setVelocityX(0);
      }
    } else {
      this.isBlocking = false;
      this.sprite.setAlpha(1);
    }

    // Animation
    this.updateAnimation(onGround);

    // Combat
    if (Phaser.Input.Keyboard.JustDown(this.controls.light)) this.performAttack('light');
    if (Phaser.Input.Keyboard.JustDown(this.controls.heavy)) this.performAttack('heavy');
    
    // Ability 1 (Special)
    if (Phaser.Input.Keyboard.JustDown(this.controls.special)) {
        if (this.abilityManager?.activate('Ability1')) {
            this.performSpecial();
        }
    }

    // Ability 2
    if (this.controls.ability2 && Phaser.Input.Keyboard.JustDown(this.controls.ability2)) {
        if (this.abilityManager?.activate('Ability2')) {
            this.performAbility2();
        }
    }

    // Ability 3
    if (this.controls.ability3 && Phaser.Input.Keyboard.JustDown(this.controls.ability3)) {
        if (this.abilityManager?.activate('Ability3')) {
            this.performAbility3();
        }
    }

    if (Phaser.Input.Keyboard.JustDown(this.controls.domain)) {
        if (this.activeDomain) this.activeDomain.activate(this);
    }

    // CE Focus
    if (Phaser.Input.Keyboard.JustDown(this.controls.ce) && this.cursedEnergy.current > 0) {
      this.isUsingCE = true;
      (this.scene as any).activateCEAura(this);
      
      // Debounced energy sound
      const now = this.scene.time.now;
      if (now - this.lastEnergySoundTime > 500) {
        this.scene.sound.play('energy', { volume: 0.4 });
        this.lastEnergySoundTime = now;
      }
    }
    if (this.isUsingCE) {
       this.cursedEnergy.current -= 15 / 60;
       if (this.cursedEnergy.current <= 0) {
           this.isUsingCE = false;
           (this.scene as any).deactivateCEAura(this);
       }
       (this.scene as any).updateCEAura(this);
    }
    if (Phaser.Input.Keyboard.JustUp(this.controls.ce)) {
      this.isUsingCE = false;
      (this.scene as any).deactivateCEAura(this);
    }
  }

  updateAnimation(onGround: boolean) {
    const texture = this.sprite.texture.key;
    if (!onGround) {
      if (this.sprite.body.velocity.y > 0) this.sprite.play(`${texture}_descend`, true);
      else this.sprite.play(`${texture}_jump`, true);
    } else if ((this.sprite.body as Phaser.Physics.Arcade.Body).velocity.x !== 0) {
      this.sprite.play(`${texture}_walk`, true);
    } else {
      this.sprite.play(`${texture}_idle`, true);
    }
  }

  performAbility2() {
      this.isAttacking = true;
      const texture = this.sprite.texture.key;
      this.sprite.play(`${texture}_special`, true); // Placeholder anim
      this.scene.time.delayedCall(200, () => {
          (this.scene as any).performBurst(this); // Placeholder effect
          this.isAttacking = false;
      });
  }

  performAbility3() {
      this.isAttacking = true;
      const texture = this.sprite.texture.key;
      this.sprite.play(`${texture}_special`, true); // Placeholder anim
      this.scene.time.delayedCall(200, () => {
          (this.scene as any).performBurst(this); // Placeholder effect
          this.isAttacking = false;
      });
  }
}
