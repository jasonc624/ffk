import Phaser from 'phaser';

export type Team = 'player' | 'opponent' | 'neutral' | 'unbound';

export abstract class GameEntity {
  id: string;
  name: string;
  team: Team;
  sprite!: Phaser.Physics.Arcade.Sprite;
  hurtbox!: Phaser.GameObjects.Rectangle;
  maxHp: number;
  currentHp: number;
  isAlive: boolean = true;
  statusEffects: Map<string, { duration: number; appliedAt: number }> = new Map();
  immunities: Set<string> = new Set();
  /** Generic debuff stack counts — keyed by `${casterId}:${abilitySlot}` */
  debuffStacks: Map<string, number> = new Map();
  visualProfile: any;
  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, config: { id: string; name: string; team: Team; maxHp: number; visualProfile?: any }) {
    this.scene = scene;
    this.id = config.id;
    this.name = config.name;
    this.team = config.team;
    this.maxHp = config.maxHp;
    this.currentHp = config.maxHp;
    this.visualProfile = config.visualProfile;
  }

  abstract spawn(x: number, y: number): void;

  update(time: number, delta: number) {
    if (!this.isAlive) return;
    this.tickStatusEffects(delta);
    this.syncHurtbox();
  }

  destroy() {
    this.isAlive = false;
    if (this.sprite) this.sprite.destroy();
    if (this.hurtbox) this.hurtbox.destroy();
    this.onDestroyed();
  }

  receiveDamage(amount: number, archetype: string, source: GameEntity): number {
    if (this.immunities.has(archetype)) {
      this.onImmune(archetype);
      return 0;
    }

    const reduction = this.computeDamageReduction(archetype);
    const actualDamage = Math.max(0, amount * (1 - reduction));
    
    this.currentHp -= actualDamage;
    this.onDamageReceived(actualDamage, archetype, source);

    if (this.currentHp <= 0) {
      this.currentHp = 0;
      this.onDeath(source);
    }

    return actualDamage;
  }

  computeDamageReduction(archetype: string): number {
    return 0;
  }

  applyStatus(key: string, duration: number) {
    this.statusEffects.set(key, { duration, appliedAt: this.scene.time.now });
    this.onStatusApplied(key, duration);
  }

  hasStatus(key: string): boolean {
    return this.statusEffects.has(key);
  }

  tickStatusEffects(delta: number) {
    for (const [key, effect] of this.statusEffects.entries()) {
      effect.duration -= delta;
      if (effect.duration <= 0) {
        this.statusEffects.delete(key);
        this.onStatusExpired(key);
      }
    }
  }

  gainImmunity(archetype: string) {
    this.immunities.add(archetype);
    this.onImmunityGained(archetype);
  }

  syncHurtbox() {
    if (this.sprite && this.hurtbox) {
      this.hurtbox.setPosition(this.sprite.x, this.sprite.y);
    }
  }

  // Hooks
  onDestroyed() {}
  onDamageReceived(amount: number, archetype: string, source: GameEntity) {}
  onDeath(source: GameEntity) {
    this.destroy();
  }
  onImmune(archetype: string) {}
  onStatusApplied(key: string, duration: number) {}
  onStatusExpired(key: string) {}
  onImmunityGained(archetype: string) {}
}
