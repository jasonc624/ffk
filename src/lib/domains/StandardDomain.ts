import { Domain } from './Domain';
import type { Character } from '../entities/Character';

export class StandardDomain extends Domain {
  sureHitConfig: any;

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.sureHitConfig = config.sureHit;
  }

  executeSureHit(target: Character) {
    if (this.sureHitConfig && this.sureHitConfig.effects) {
      (this.scene as any).vfx.execute('onSureHit', this.visualProfile, {
        caster: (this.scene as any).getEntityById(this.ownerId).sprite,
        target: target.sprite,
        x: target.sprite.x,
        y: target.sprite.y
      });
      
      // Apply effects to target
      this.sureHitConfig.effects.forEach((eff: any) => {
        if (eff.type === 'DAMAGE') {
           target.receiveDamage(eff.amount, eff.archetype || 'BURST', (this.scene as any).getEntityById(this.ownerId));
        }
      });
    }
  }

  getSureHitEffects(): any[] {
    return this.sureHitConfig?.effects || [];
  }
}
