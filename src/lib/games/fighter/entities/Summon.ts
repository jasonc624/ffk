import Phaser from 'phaser';
import { GameEntity, type Team } from './GameEntity';
import type { Character } from './Character';

export type SummonStatus = 'AVAILABLE' | 'ACTIVE' | 'RECOVERY' | 'DESTROYED' | 'LOCKED' | 'CONFISCATED';

export abstract class Summon extends GameEntity {
  summonerId: string;
  cost: { cursedEnergy: number };
  behavior: string;
  status: SummonStatus = 'AVAILABLE';
  tethered: boolean = true;
  target: GameEntity | null = null;

  constructor(scene: Phaser.Scene, config: {
    id: string;
    name: string;
    summonerId: string;
    cost: number;
    behavior: string;
    visualProfile?: any;
  }) {
    super(scene, {
      id: config.id,
      name: config.name,
      team: 'neutral', // default
      maxHp: 50,
      visualProfile: config.visualProfile
    });
    this.summonerId = config.summonerId;
    this.cost = { cursedEnergy: config.cost };
    this.behavior = config.behavior;
  }

  summon(x: number, y: number, summoner: Character) {
    if (this.status !== 'AVAILABLE') return;
    if (!summoner.spendCE(this.cost.cursedEnergy)) return;

    this.team = summoner.team;
    this.status = 'ACTIVE';
    this.spawn(x, y);
    
    // VFX through compiler
    (this.scene as any).vfx.execute('onSummon', this.visualProfile, { caster: this.sprite, x, y });
    this.onSummoned();
  }

  recall(summoner: Character) {
    if (!this.canBeRecalled()) return;
    this.status = 'AVAILABLE';
    this.despawn();
    this.onRecalled();
  }

  canBeRecalled(): boolean {
    return true;
  }

  despawn() {
    this.isAlive = false;
    if (this.sprite) this.sprite.destroy();
    if (this.hurtbox) this.hurtbox.destroy();
  }

  onDeath(source: GameEntity) {
    this.status = 'RECOVERY';
    this.despawn();
    const summoner = (this.scene as any).getEntityById(this.summonerId) as Character;
    if (summoner) summoner.onSummonDefeated(this);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    if (this.status === 'ACTIVE') {
      this.runAI(delta);
    }
  }

  runAI(delta: number) {
    // Basic AI dispatch based on behavior
    switch (this.behavior) {
      case 'AGGRESSIVE_CHASE':
        this.aiAggressiveChase();
        break;
      // Add more cases
    }
  }

  aiAggressiveChase() {
    if (!this.target || !this.target.isAlive) {
      this.target = (this.scene as any).getOpponentOf((this.scene as any).getEntityById(this.summonerId));
      return;
    }
    const body = this.sprite?.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const dir = this.target.sprite.x > this.sprite.x ? 1 : -1;
    body.setVelocityX(200 * dir);
    this.sprite.setFlipX(dir === -1);
  }

  // Hooks
  onSummoned() {}
  onRecalled() {}
}
