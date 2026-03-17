import Phaser from 'phaser';
import { GameEntity, type Team } from './GameEntity';
import type { CharacterData } from '../storage';
import { RosterManager } from './RosterManager';
import type { Domain } from '../domains/Domain';
// import type { Summon } from './Summon'; // Removed to break circular dependency
import { AbilityManager, type AbilityConfig } from './AbilityManager';
import { FRAME_DATA } from '../constants';

export abstract class Character extends GameEntity {
  cursedEnergy: {
    max: number;
    current: number;
    regenRate: number;
    nullified: boolean;
  };
  stats: CharacterData['stats'];
  technique: CharacterData['technique'];
  activeDomain: Domain | null = null;
  rosterManager: RosterManager | null = null;
  abilityManager: AbilityManager | null = null;
  threatValue: number = 0;
  throatStrain: number = 0;

  isAttacking: boolean = false;
  isBlocking: boolean = false;
  isHitstun: boolean = false;
  lastAttackTime: number = 0;
  attackDebounce: number = 250; // Minimum ms between attack starts

  constructor(scene: Phaser.Scene, config: {
    id: string;
    name: string;
    team: Team;
    data: CharacterData;
  }) {
    super(scene, {
      id: config.id,
      name: config.name,
      team: config.team,
      maxHp: 100,
      visualProfile: {
        ...config.data.technique.visualProfile,
        videoUrl: config.data.domain.videoUrl,
        color: config.data.color
      }
    });

    this.stats = config.data.stats;
    this.technique = config.data.technique;

    this.cursedEnergy = {
      max: this.stats.cursedEnergy || 100,
      current: this.stats.cursedEnergy || 100,
      regenRate: 8, // 8 per second
      nullified: false
    };
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    this.ceRegen(delta);
    if (this.abilityManager) {
      this.abilityManager.update(delta);
    }

    // Recovery for throat strain
    if (this.throatStrain > 0) {
      this.throatStrain -= (2 * delta) / 1000;
      if (this.throatStrain < 0) this.throatStrain = 0;
    }
  }

  ceRegen(delta: number) {
    if (this.cursedEnergy.nullified) return;

    if (this.cursedEnergy.current < this.cursedEnergy.max) {
      this.cursedEnergy.current += (this.cursedEnergy.regenRate * delta) / 1000;
      if (this.cursedEnergy.current > this.cursedEnergy.max) {
        this.cursedEnergy.current = this.cursedEnergy.max;
      }
    }
  }

  spendCE(amount: number): boolean {
    if (this.cursedEnergy.current < amount) return false;
    this.cursedEnergy.current -= amount;
    return true;
  }

  onSummonDefeated(summon: any) {
    if (this.rosterManager) {
      this.rosterManager.onSummonDefeated(summon);
    }
  }

  onDamageDealt(amount: number) {
    this.threatValue += amount;
  }

  performAttack(type: 'light' | 'heavy') {
    if (this.isAttacking || this.isBlocking) return;
    
    // Attack debounce check
    const now = this.scene.time.now;
    if (now - this.lastAttackTime < this.attackDebounce) return;
    
    this.lastAttackTime = now;
    this.isAttacking = true;
    
    // Stop movement when attacking
    if (this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    }
    
    const data = FRAME_DATA[type];
    const texture = this.sprite.texture.key;
    this.sprite.play(type === 'light' ? `${texture}_punch` : `${texture}_kick`, true);

    this.scene.time.delayedCall(data.startup * 16.6, () => {
      const dir = this.sprite.flipX ? -1 : 1;
      // Offset Y by +20 to align with the character's chest/hitbox height
      const hb = this.scene.add.rectangle(this.sprite.x + (55 * dir), this.sprite.y + 20, 70, 45, 0xff0000, 0);
      
      this.scene.physics.add.existing(hb);
      (hb.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      
      (this.scene as any).hitboxes.add(hb);
      (hb as any).owner = this;
      (hb as any).damage = data.damage;
      
      this.scene.time.delayedCall(data.active * 16.6, () => {
        if (hb && hb.active) hb.destroy();
      });
      this.scene.time.delayedCall(data.recovery * 16.6, () => {
        this.isAttacking = false;
      });
    });
  }

  performSpecial() {
    const cost = (FRAME_DATA as any).special.cost;
    if (this.spendCE(cost) || this.team === 'unbound') {
      this.isAttacking = true;
      const texture = this.sprite.texture.key;
      this.sprite.play(`${texture}_special`, true);
      this.scene.time.delayedCall((FRAME_DATA as any).special.startup * 16.6, () => {
        (this.scene as any).performBurst(this);
        this.scene.time.delayedCall((FRAME_DATA as any).special.recovery * 16.6, () => this.isAttacking = false);
      });
    }
  }

  onDamageReceived(amount: number, archetype: string, source: GameEntity) {
    if (amount > 0 && this.sprite) {
      const texture = this.sprite.texture.key;
      this.sprite.play(`${texture}_hurt`, true);

      // Hitstun: lock actions but don't force stop velocity (allow knockback)
      this.isHitstun = true;
      this.scene.time.delayedCall(400, () => {
        this.isHitstun = false;
      });
    }
  }
}
