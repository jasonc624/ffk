import { Summon } from './Summon';
import type { GameEntity } from './GameEntity';

export class AutonomousSummon extends Summon {
  jurisdiction?: { canCharge: (entity: GameEntity) => boolean };

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.jurisdiction = config.jurisdiction;
  }

  spawn(x: number, y: number) {
    const texture = (this as any).config?.texture || 'judgeman';
    this.sprite = this.scene.physics.add.sprite(x, y, texture);
    this.sprite.setScale(0.9);
    this.sprite.setAlpha(0.8);
    
    this.hurtbox = this.scene.add.rectangle(x, y, 40, 80, 0xffffff, 0);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as any).setAllowGravity(false);
  }

  canExerciseJurisdictionOver(entity: GameEntity): boolean {
    return this.jurisdiction ? this.jurisdiction.canCharge(entity) : false;
  }

  onDeath(source: GameEntity) {
    super.onDeath(source);
    // If this summon dying should collapse an active domain, notify scene
    this.scene.events.emit('autonomousSummonDeath', this);
  }
}
