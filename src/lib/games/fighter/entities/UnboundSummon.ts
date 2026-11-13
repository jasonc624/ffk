import { Summon } from './Summon';
import type { GameEntity } from './GameEntity';
import type { Character } from './Character';

export class UnboundSummon extends Summon {
  pendingAdaptation: string | null = null;

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.team = 'unbound';
  }

  spawn(x: number, y: number) {
    this.sprite = this.scene.physics.add.sprite(x, y, (this as any).config.texture || 'mahoraga');
    this.sprite.setScale(1.2);
    this.sprite.setTint(0xffffff);
    
    this.hurtbox = this.scene.add.rectangle(x, y, 60, 120, 0xffffff, 0);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as any).setAllowGravity(false);
  }

  canBeRecalled(): boolean {
    return false;
  }

  summon(x: number, y: number, summoner: Character) {
    super.summon(x, y, summoner);
    if (summoner.rosterManager) {
      summoner.rosterManager.lockAllSlots(); // Mahoraga locks everything else
    }
  }

  computeDamageReduction(archetype: string): number {
    if (archetype === 'PHYSICAL' || archetype === 'BURST') return 0.4;
    return 0;
  }

  onDamageReceived(amount: number, archetype: string, source: GameEntity) {
    this.pendingAdaptation = archetype;
    this.scene.time.delayedCall(100, () => {
      if (this.pendingAdaptation) {
         this.gainImmunity(this.pendingAdaptation);
         this.pendingAdaptation = null;
      }
    });
  }

  onImmunityGained(archetype: string) {
    // WHEEL TURNS
    (this.scene as any).spawnFloatingText('WHEEL TURNS', '#ffffff', this.sprite.x, this.sprite.y - 100);
    // Fires adaptation VFX
    (this.scene as any).vfx.execute('onAdapt', this.visualProfile, { caster: this.sprite });
  }

  runAI(delta: number) {
    // Targets highest threat
    const entities = (this.scene as any).getAllEntities() as GameEntity[];
    const sorted = entities
      .filter(e => e !== this && e.isAlive)
      .sort((a, b) => {
        const threatA = (a as any).threatValue || 0;
        const threatB = (b as any).threatValue || 0;
        return threatB - threatA;
      });
    
    if (sorted.length > 0) {
      this.target = sorted[0];
      this.aiAggressiveChase();
    }
  }
}
