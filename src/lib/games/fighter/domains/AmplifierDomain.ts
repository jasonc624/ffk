import { Domain } from './Domain';
import type { Character } from '../entities/Character';

export class AmplifierDomain extends Domain {
  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
  }

  executeSureHit(target: Character) {
    // Applies shadow clone effect to all active summons in roster
    const owner = (this.scene as any).getEntityById(this.ownerId) as Character;
    if (owner && owner.rosterManager) {
      owner.rosterManager.activeSlots.forEach(id => {
        const summon = owner.rosterManager!.slots.get(id);
        if (summon) {
          // Visual/Power clones
          (this.scene as any).vfx.execute('onClone', this.visualProfile, { caster: summon.sprite });
        }
      });
    }
  }

  onExpanded(owner: Character) {
    if (owner.rosterManager) {
      owner.rosterManager.activeSlots.forEach(id => {
        const summon = owner.rosterManager!.slots.get(id);
        if (summon) summon.applyStatus('DOMAIN_AMP', 10000);
      });
      // Unlock special slot e.g. Mahoraga while active
      owner.rosterManager.unlock('entity_mahoraga');
    }
  }
}
