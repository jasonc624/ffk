import Phaser from 'phaser';
import { Character } from './Character';
import type { CharacterData } from '../storage';

export class CPUCharacter extends Character {
  aiTimer: number = 0;

  constructor(scene: Phaser.Scene, config: { 
    id: string; 
    name: string; 
    team: 'opponent'; 
    data: CharacterData;
  }) {
    super(scene, config);
  }

  spawn(x: number, y: number) {
    // Use the same 'character' texture for animation compatibility, but tint it
    this.sprite = this.scene.physics.add.sprite(x, y, 'character');
    this.sprite.setScale(0.8);
    this.sprite.setDepth(2);
    this.sprite.setTint(0xff9999); // Light red tint for the rival
    (this.sprite.body as Phaser.Physics.Arcade.Body).setSize(40, 80);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setOffset(44, 48);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    
    this.hurtbox = this.scene.add.rectangle(x, y, 40, 80, 0xffffff, 0);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    if (!this.isAlive) return;

    // Sync hurtbox visibility with debug mode
    if (this.hurtbox) {
      const debugAlpha = (this.scene as any).debugMode ? 0.2 : 0;
      (this.hurtbox as Phaser.GameObjects.Rectangle).setFillStyle(0xffffff, debugAlpha);
    }

    this.runAI(delta);
  }

  runAI(delta: number) {
    // If in hitstun, don't reset velocity - let the knockback play out
    if (this.isHitstun) return;

    // Don't act if attacking or blocking
    if (this.isAttacking || this.isBlocking) {
      if (this.sprite.body) (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
      return;
    }

    const player = (this.scene as any).players.find((p: any) => p.team === 'player');
    if (!player) return;

    const dx = player.sprite.x - this.sprite.x;
    const dist = Math.abs(dx);
    const attackRange = 90;
    const stopRange = 75;

    if (dist > stopRange) {
      // Move toward player
      const dir = dx > 0 ? 1 : -1;
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(220 * dir);
      this.sprite.setFlipX(dir === -1);
      
      const onGround = (this.sprite.body as Phaser.Physics.Arcade.Body).blocked.down;
      if (onGround) {
        this.sprite.play(`${this.sprite.texture.key}_walk`, true);
      }
    } else {
      // Within range: Stop and attack
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
      this.sprite.setFlipX(dx < 0);

      this.aiTimer += delta;
      if (this.aiTimer > 800) { // Attack every 800ms when in range
        this.aiTimer = 0;
        this.performAttack(Math.random() > 0.3 ? 'light' : 'heavy');
      } else {
        const onGround = (this.sprite.body as Phaser.Physics.Arcade.Body).blocked.down;
        if (onGround) {
          this.sprite.play(`${this.sprite.texture.key}_idle`, true);
        }
      }
    }
  }
}
