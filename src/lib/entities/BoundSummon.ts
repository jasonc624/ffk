import { Summon } from './Summon';
import type { GameEntity } from './GameEntity';
import type { Character } from './Character';

export class BoundSummon extends Summon {
  config: any;

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.config = config;
  }

  spawn(x: number, y: number) {
    this.sprite = this.scene.physics.add.sprite(x, y, this.config.texture || 'character');
    this.sprite.setScale(0.6);
    this.sprite.setTint(0x88ff88); // visual distinction
    
    this.hurtbox = this.scene.add.rectangle(x, y, 30, 60, 0xffffff, 0);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as any).setAllowGravity(false);
  }

  canBeRecalled(): boolean {
    return true;
  }

  onDeath(source: GameEntity) {
    super.onDeath(source);
    if (this.config.onDestroyed?.unlocks) {
      const summoner = (this.scene as any).getEntityById(this.summonerId) as Character;
      if (summoner && summoner.rosterManager) {
        summoner.rosterManager.unlock(this.config.onDestroyed.unlocks);
      }
    }
  }
}
