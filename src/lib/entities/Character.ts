import Phaser from 'phaser';
import { GameEntity, type Team } from './GameEntity';
import type { CharacterData } from '../types/character';
import { RosterManager } from './RosterManager';
import type { Domain } from '../domains/Domain';
// import type { Summon } from './Summon'; // Removed to break circular dependency
import { AbilityManager } from './AbilityManager';
import type { AbilityConfig } from '../types/ability';
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
  domain: CharacterData['domain'];
  abilities: CharacterData['abilities'] = [];
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
        domain: config.data.domain,
        videoUrl: config.data.domain?.video_url,
        color: config.data.color
      }
    });

    this.stats = config.data.stats;
    this.technique = config.data.technique;
    this.domain = config.data.domain;
    this.abilities = config.data.abilities || [];

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
    if (this.isAttacking || this.isBlocking || this.isHitstun) return;

    const now = this.scene.time.now;
    if (now - this.lastAttackTime < this.attackDebounce) return;

    this.lastAttackTime = now;
    this.isAttacking = true;

    if (this.sprite.body) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
    }

    const data = FRAME_DATA[type];
    const texture = this.sprite.texture.key;

    const hurtAnim = type === 'light' ? `${texture}_punch` : `${texture}_kick`;
    if (this.scene.anims.exists(hurtAnim)) {
      this.sprite.play(hurtAnim, true);
    }

    this.scene.time.delayedCall(data.startup * 16.6, () => {
      if (!this.isAlive) return;

      const dir = this.sprite.flipX ? -1 : 1;
      const hbX = this.sprite.x + (55 * dir);
      const hbY = this.sprite.y + 10;

      // Let the group handle body creation — don't call physics.add.existing separately
      const hb = (this.scene as any).hitboxes.create(hbX, hbY, undefined) as Phaser.Physics.Arcade.Sprite;
      hb.setVisible((this.scene as any).debugMode);
      if ((this.scene as any).debugMode) {
        hb.setTint(0xff0000).setAlpha(0.6);
      }
      hb.setDisplaySize(110, 70);

      const hbBody = hb.body as Phaser.Physics.Arcade.Body;
      hbBody.setAllowGravity(false);
      hbBody.setImmovable(true);
      hbBody.setSize(110, 70);

      (hb as any).owner = this;
      (hb as any).damage = data.damage || 10;
      (hb as any).archetype = 'PHYSICAL';
      (hb as any).attackType = type;

      this.scene.time.delayedCall(data.active * 16.6, () => {
        if (hb?.active) hb.destroy();
      });

      this.scene.time.delayedCall(data.recovery * 16.6, () => {
        this.isAttacking = false;
      });
    });
  }

  performSpecial() {
    const domainCost = this.domain?.cost || (FRAME_DATA as any).special.cost || 50;
    if (this.spendCE(domainCost) || this.team === 'unbound') {
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
    console.log('damage received')
    if (amount > 0 && this.sprite) {
      const texture = this.sprite.texture.key;
      this.sprite.play(`${texture}_hurt`, true);

      // Visual feedback
      this.sprite.setTint(0xff0000);
      this.scene.time.delayedCall(150, () => {
        if (this.sprite) this.sprite.clearTint();
      });

      // Reset state and apply hitstun
      this.isAttacking = false;
      this.isHitstun = true;
      this.scene.time.delayedCall(600, () => {
        this.isHitstun = false;
      });
    }
  }
}
