import Phaser from 'phaser';
import type { Character } from './Character';
import type { AbilityConfig } from '../types/ability';
import type { GameEntity } from './GameEntity';
import { MaharagaSummon } from './MaharagaSummon';

/**
 * AbilityExecutor — generic data-driven ability engine.
 *
 * Given any AbilityConfig (LLM-generated or hand-authored), reads `type` and
 * `payload` to decide what to do. No per-character subclasses needed.
 *
 * Stack convention: debuffStacks keyed by `${casterId}:${slot}` on the target.
 * DEBUFF abilities write stacks; EXECUTION abilities read + consume them.
 */
export class AbilityExecutor {
  character: Character;

  constructor(character: Character) {
    this.character = character;
  }

  /** Entry point — called from PlayerCharacter input handler after AbilityManager.activate(). */
  execute(slot: string) {
    const state = this.character.abilityManager?.slots.get(slot);
    if (!state) return;

    const config = state.config;
    const scene = this.character.scene as any;
    const target = scene.getOpponentOf?.(this.character) as GameEntity | undefined;

    switch (config.type) {
      case 'MOVEMENT':   this._executeMovement(config, target); break;
      case 'DEBUFF':     this._executeDebuff(config, target); break;
      case 'EXECUTION':  this._executeExecution(config, target); break;
      case 'MELEE':      this._executeMelee(config, target); break;
      case 'PROJECTILE': this._executeProjectile(config, target); break;
      case 'BUFF':       this._executeBuff(config); break;
      case 'SUMMON':     this._executeSummon(config, target); break;
      default:
        console.warn(`[AbilityExecutor] Unknown ability type: ${config.type} (slot: ${slot})`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  SUMMON — spawn a shikigami / summon entity as a hitbox actor
  //  subtypes: CHASE | DIVE | BOSS
  // ─────────────────────────────────────────────────────────────
  private _executeSummon(config: AbilityConfig, target: GameEntity | undefined) {
    const { payload = {}, damage = 0, castTime = 400, archetype = 'SHADOW' } = config;
    const subtype: string = payload.summonType ?? 'CHASE';
    const duration: number = payload.duration ?? 3000;
    const hbW: number = payload.hitboxWidth ?? 40;
    const hbH: number = payload.hitboxHeight ?? 40;
    const owner = this.character;
    const scene = owner.scene as any;

    owner.isAttacking = true;

    // Shadow portal wind-up VFX
    this._voidBurst(owner.sprite.x, owner.sprite.y, 0x1e1b4b, 50);
    this._floatingText(owner.sprite.x, owner.sprite.y - 55, config.name, '#818cf8');

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) { owner.isAttacking = false; return; }

      if (subtype === 'CHASE' && target) {
        // Spawn multiple chase dogs that home toward target
        const count: number = payload.count ?? 1;
        for (let i = 0; i < count; i++) {
          scene.time.delayedCall(i * 180, () => {
            this._spawnChaseSummon(target, hbW, hbH, damage, duration, config, archetype);
          });
        }
      } else if (subtype === 'DIVE' && target) {
        // Nue descends from above at the target's current X
        this._spawnDiveSummon(target, hbW, hbH, damage, duration, config, archetype, payload.knockback);
      } else if (subtype === 'BOSS') {
        // Mahoraga — massive delayed impact
        this._spawnBossSummon(target, hbW, hbH, damage, duration, config, archetype, payload.knockback);
      }

      scene.time.delayedCall(500, () => { owner.isAttacking = false; });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  MOVEMENT — dash toward target and land a strike
  // ─────────────────────────────────────────────────────────────
  private _executeMovement(config: AbilityConfig, target: GameEntity | undefined) {
    const { payload = {}, damage = 0, castTime = 150 } = config;
    const range: number = payload.range ?? 300;
    const invDuration: number = payload.invincibleDuration ?? 250;
    const owner = this.character;
    const scene = owner.scene as any;

    if (!target?.sprite) return;

    const dx = target.sprite.x - owner.sprite.x;
    if (Math.abs(dx) > range) {
      this._floatingText(owner.sprite.x, owner.sprite.y - 40, 'OUT OF RANGE', '#f87171');
      // Refund: cooldown is already started by AbilityManager — intentionally not refunded
      return;
    }

    owner.isAttacking = true;
    this._voidTrail(owner.sprite.x, owner.sprite.y);

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) { owner.isAttacking = false; return; }

      const dir = dx > 0 ? 1 : -1;
      const landX = target.sprite.x - dir * 36;
      owner.sprite.setPosition(landX, owner.sprite.y);
      owner.sprite.setFlipX(dir === -1);

      // Brief invincibility
      owner.immunities.add('PHYSICAL');
      scene.time.delayedCall(invDuration, () => owner.immunities.delete('PHYSICAL'));

      // Spawn arrival hitbox
      this._spawnHitbox(landX + dir * 22, owner.sprite.y, dir, 50, 60, damage, config);

      this._voidBurst(landX, owner.sprite.y, 0x7c3aed, 30);
      this._applyStatusEffects(config, target);

      scene.time.delayedCall(300, () => { owner.isAttacking = false; });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  DEBUFF — stackable cursed marks on the target
  // ─────────────────────────────────────────────────────────────
  private _executeDebuff(config: AbilityConfig, target: GameEntity | undefined) {
    const { slot, payload = {}, damage = 0, castTime = 400 } = config;
    const maxStacks: number = payload.maxStacks ?? 1;
    const stackDuration: number = payload.duration ?? 5000;
    const burstDamage: number = payload.onMaxStacks?.burstDamage ?? 0;
    const stackKey = `${this.character.id}:${slot}`;
    const owner = this.character;
    const scene = owner.scene as any;

    if (!target?.sprite) return;

    owner.isAttacking = true;
    this._tetherLine(owner.sprite, target.sprite, castTime);

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive || !target.isAlive) { owner.isAttacking = false; return; }

      const current = target.debuffStacks.get(stackKey) ?? 0;

      if (current >= maxStacks) {
        // Already capped — trigger detonation early
        this._detonateStacks(target, stackKey, burstDamage, config);
        owner.isAttacking = false;
        return;
      }

      const newCount = current + 1;
      target.debuffStacks.set(stackKey, newCount);

      this._voidBurst(target.sprite.x, target.sprite.y, 0x6d28d9, 38 + newCount * 10);
      this._floatingText(target.sprite.x, target.sprite.y - 50, `${config.name} ×${newCount}`, '#a78bfa');

      // Hit for stack damage
      if (damage > 0) {
        const dir = owner.sprite.x < target.sprite.x ? 1 : -1;
        const actualDmg = target.receiveDamage(damage, config.archetype ?? 'VOID', owner);
        if (actualDmg > 0) {
          owner.onDamageDealt?.(actualDmg);
          (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(200 * dir, -150);
        }
      }

      this._applyStatusEffects(config, target);

      // Stack expires after duration (decrements, doesn't wipe)
      scene.time.delayedCall(stackDuration, () => {
        const c = target.debuffStacks.get(stackKey) ?? 0;
        if (c > 0) target.debuffStacks.set(stackKey, c - 1);
      });

      // Auto-detonate at max stacks
      if (newCount >= maxStacks && burstDamage > 0) {
        scene.time.delayedCall(350, () => {
          this._detonateStacks(target, stackKey, burstDamage, config);
        });
      }

      owner.isAttacking = false;
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  EXECUTION — detonate all stacks; backfires if none exist
  // ─────────────────────────────────────────────────────────────
  private _executeExecution(config: AbilityConfig, target: GameEntity | undefined) {
    const { payload = {}, damage = 0, castTime = 800 } = config;
    const owner = this.character;
    const scene = owner.scene as any;

    owner.isAttacking = true;
    this._voidBurst(owner.sprite.x, owner.sprite.y, 0x4c1d95, 70);
    scene.time.delayedCall(castTime / 3, () => this._voidBurst(owner.sprite.x, owner.sprite.y, 0x7c3aed, 110));

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) { owner.isAttacking = false; return; }

      // Collect all stacks placed by this caster on any target
      const stackKey = this._findOwnedStackKey(target);
      const stacks = target ? (target.debuffStacks.get(stackKey) ?? 0) : 0;

      if (!target || stacks === 0) {
        // ── BACKFIRE ──
        const penalty = owner.cursedEnergy.current * 0.4;
        owner.cursedEnergy.current = Math.max(0, owner.cursedEnergy.current - penalty);
        this._floatingText(owner.sprite.x, owner.sprite.y - 60, 'BACKFIRE!', '#ef4444');
        this._voidBurst(owner.sprite.x, owner.sprite.y, 0xff4444, 55);
        console.log(`[Execution] BACKFIRE — no stacks, drained ${penalty.toFixed(1)} CE`);
      } else {
        // ── DETONATE ──
        const totalDmg = damage + stacks * Math.round(damage * 0.3); // +30% per stack
        target.debuffStacks.set(stackKey, 0);

        this._voidCollapse(target.sprite.x, target.sprite.y, stacks);

        const actualDmg = target.receiveDamage(totalDmg, config.archetype ?? 'VOID', owner);
        if (actualDmg > 0) {
          owner.onDamageDealt?.(actualDmg);
          (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(
            owner.sprite.x < target.sprite.x ? 600 : -600, -500
          );
        }

        this._applyStatusEffects(config, target);
        this._floatingText(target.sprite.x, target.sprite.y - 80, `ERASURE ×${stacks} / ${totalDmg}`, '#a78bfa');
        console.log(`[Execution] Detonated ${stacks} stacks → ${totalDmg} dmg`);
      }

      scene.time.delayedCall(350, () => { owner.isAttacking = false; });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  MELEE — spawn a directional hitbox
  // ─────────────────────────────────────────────────────────────
  private _executeMelee(config: AbilityConfig, target: GameEntity | undefined) {
    const { payload = {}, damage = 0, castTime = 100 } = config;
    const hbW: number = payload.hitboxWidth ?? 50;
    const hbH: number = payload.hitboxHeight ?? 60;
    const owner = this.character;
    const scene = owner.scene as any;

    owner.isAttacking = true;

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) { owner.isAttacking = false; return; }
      const dir = owner.sprite.flipX ? -1 : 1;
      this._spawnHitbox(owner.sprite.x + dir * (20 + hbW / 2), owner.sprite.y, dir, hbW, hbH, damage, config);
      if (target) this._applyStatusEffects(config, target);
      scene.time.delayedCall(300, () => { owner.isAttacking = false; });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  PROJECTILE — fire a moving physics body
  // ─────────────────────────────────────────────────────────────
  private _executeProjectile(config: AbilityConfig, target: GameEntity | undefined) {
    const { payload = {}, damage = 0, castTime = 100 } = config;
    const speed: number = payload.speed ?? 400;
    const owner = this.character;
    const scene = owner.scene as any;

    owner.isAttacking = true;

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) { owner.isAttacking = false; return; }

      const dir = owner.sprite.flipX ? -1 : 1;
      const proj = scene.hitboxes.create(
        owner.sprite.x + dir * 30, owner.sprite.y - 10, undefined
      ) as Phaser.Physics.Arcade.Sprite;

      proj.setVisible(false);
      proj.setDisplaySize(16, 16);
      const body = proj.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setSize(16, 16);
      body.setVelocityX(speed * dir);

      (proj as any).owner = owner;
      (proj as any).damage = damage;
      (proj as any).archetype = config.archetype ?? 'VOID';
      (proj as any).facingDir = dir;

      // Destroy after it travels off-screen or after 2s
      const lifetime = payload.range ? (payload.range / speed) * 1000 : 2000;
      scene.time.delayedCall(lifetime, () => { if (proj?.active) proj.destroy(); });

      scene.time.delayedCall(300, () => { owner.isAttacking = false; });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  BUFF — self stat modifier or heal
  // ─────────────────────────────────────────────────────────────
  private _executeBuff(config: AbilityConfig) {
    const { payload = {} } = config;
    const owner = this.character;
    const healAmount: number = payload.healAmount ?? 0;

    if (healAmount > 0) {
      owner.currentHp = Math.min(owner.maxHp, owner.currentHp + healAmount);
      this._floatingText(owner.sprite.x, owner.sprite.y - 50, `+${healAmount} HP`, '#4ade80');
    }

    this._voidBurst(owner.sprite.x, owner.sprite.y, 0x10b981, 40);
  }

  // ─────────────────────────────────────────────────────────────
  //  Internal helpers
  // ─────────────────────────────────────────────────────────────

  /** Detonates all stacks of a debuff on a target. */
  private _detonateStacks(target: GameEntity, stackKey: string, burstDamage: number, sourceConfig: AbilityConfig) {
    const stacks = target.debuffStacks.get(stackKey) ?? 0;
    const total = burstDamage + stacks * 8;
    target.debuffStacks.set(stackKey, 0);

    this._voidCollapse(target.sprite.x, target.sprite.y, stacks);
    const actualDmg = target.receiveDamage(total, sourceConfig.archetype ?? 'VOID', this.character);
    if (actualDmg > 0) {
      this.character.onDamageDealt?.(actualDmg);
      target.applyStatus?.('CE_NULLIFIED', 3000);
      (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(
        this.character.sprite.x < target.sprite.x ? 500 : -500, -400
      );
    }
    this._floatingText(target.sprite.x, target.sprite.y - 60, `COLLAPSE ×${stacks}`, '#7c3aed');
  }

  /** Find the debuff stack key this caster owns on the given target (searches Ability1-3). */
  private _findOwnedStackKey(target: GameEntity | undefined): string {
    if (!target) return `${this.character.id}:Ability2`; // fallback
    for (const slot of ['Ability1', 'Ability2', 'Ability3']) {
      const key = `${this.character.id}:${slot}`;
      if ((target.debuffStacks.get(key) ?? 0) > 0) return key;
    }
    return `${this.character.id}:Ability2`; // fallback if nothing found
  }

  /** Apply config.statusEffects to target with probability checks. */
  private _applyStatusEffects(config: AbilityConfig, target: GameEntity) {
    if (!config.statusEffects?.length) return;
    for (const se of config.statusEffects) {
      if (Math.random() <= se.chance) {
        target.applyStatus?.(se.statusId, se.duration ?? 3000);
        console.log(`[Status] Applied ${se.statusId} to ${target.id} (p=${se.chance})`);
      }
    }
  }

  /** Spawn a physics hitbox in the scene's hitboxes group. */
  private _spawnHitbox(x: number, y: number, dir: number, w: number, h: number, damage: number, config: AbilityConfig) {
    const scene = this.character.scene as any;
    const hb = scene.hitboxes.create(x, y, undefined) as Phaser.Physics.Arcade.Sprite;
    hb.setVisible(false).setDisplaySize(w, h);
    const body = hb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(w, h);
    (hb as any).owner = this.character;
    (hb as any).damage = damage;
    (hb as any).archetype = config.archetype ?? 'VOID';
    (hb as any).facingDir = dir;
    scene.time.delayedCall(200, () => { if (hb?.active) hb.destroy(); });
  }

  // ── VFX ─────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────
  //  Summon spawn implementations
  // ─────────────────────────────────────────────────────────────

  /** CHASE — hitbox that homes toward target; renders a visible sprite following it */
  private _spawnChaseSummon(
    target: GameEntity, w: number, h: number, damage: number,
    duration: number, config: AbilityConfig, archetype: string
  ) {
    const scene = this.character.scene as any;
    const dir = this.character.sprite.x < target.sprite.x ? 1 : -1;
    const startX = this.character.sprite.x + dir * 20;
    const startY = this.character.sprite.y;
    const texKey: string | null = config.payload?.texture ?? null;

    // Physics hitbox (invisible)
    const hb = scene.hitboxes.create(startX, startY, undefined) as Phaser.Physics.Arcade.Sprite;
    hb.setVisible(false).setDisplaySize(w, h);
    const body = hb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(false);
    body.setSize(w, h);
    (hb as any).owner = this.character;
    (hb as any).damage = damage;
    (hb as any).archetype = archetype;
    (hb as any).facingDir = dir;

    // Visual — sprite if texture is loaded, otherwise coloured circle
    let visual: Phaser.GameObjects.GameObject;
    if (texKey && scene.textures.exists(texKey)) {
      const spr = scene.add.sprite(startX, startY, texKey)
        .setScale(0.5).setDepth(3).setFlipX(dir === -1);
      spr.play?.(`${texKey}_idle`, true);
      visual = spr;
    } else {
      visual = scene.add.circle(startX, startY, w / 2, 0x4338ca, 0.85).setDepth(3);
    }

    const chaseTimer = scene.time.addEvent({
      delay: 32,
      loop: true,
      callback: () => {
        if (!hb.active || !target.isAlive || !target.sprite) { chaseTimer.remove(); return; }
        const dx = target.sprite.x - hb.x;
        const dy = target.sprite.y - hb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = config.payload?.speed ?? 300;
        if (dist > 5) body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        (visual as any).setPosition(hb.x, hb.y);
      }
    });

    scene.time.delayedCall(duration, () => {
      chaseTimer.remove();
      if (hb?.active) hb.destroy();
      (visual as any).destroy?.();
    });
  }

  /** DIVE — hitbox drops from above the target (Nue thunderstrike) */
  private _spawnDiveSummon(
    target: GameEntity, w: number, h: number, damage: number,
    duration: number, config: AbilityConfig, archetype: string,
    knockback?: { x: number; y: number }
  ) {
    const scene = this.character.scene as any;
    const landX = target.sprite.x;
    const startY = 0; // top of screen
    
    // Shadow + lightning VFX — warning telegraph
    const shadow = scene.add.ellipse(landX, target.sprite.y + 30, w * 1.5, 16, 0x000000, 0.5).setDepth(45);
    scene.tweens.add({ targets: shadow, alpha: 0, scaleX: 0.2, duration: 600, onComplete: () => shadow.destroy() });

    const hb = scene.hitboxes.create(landX, startY, undefined) as Phaser.Physics.Arcade.Sprite;
    hb.setVisible(false).setDisplaySize(w, h);
    const body = hb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(w, h);
    (hb as any).owner = this.character;
    (hb as any).damage = damage;
    (hb as any).archetype = archetype;
    (hb as any).facingDir = 0; // omni-directional

    // Lightning visual
    const bolt = scene.add.rectangle(landX, startY + h / 2, 8, 0, 0xa5b4fc, 0.9).setDepth(50);

    scene.tweens.add({
      targets: [hb, bolt],
      y: target.sprite.y,
      duration: 400,
      ease: 'Power3',
      onUpdate: () => { body.reset(hb.x, hb.y); bolt.setPosition(hb.x, hb.y); bolt.height = target.sprite.y - startY; },
      onComplete: () => {
        this._voidBurst(landX, target.sprite.y, 0x6366f1, 60);
        if (knockback) {
          (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(
            this.character.sprite.x < target.sprite.x ? knockback.x : -knockback.x,
            knockback.y
          );
        }
        scene.time.delayedCall(80, () => { if (hb?.active) hb.destroy(); bolt.destroy(); });
      }
    });
  }

  /** BOSS — Mahoraga: spawn a real AutonomousSummon entity that attacks everyone */
  private _spawnBossSummon(
    target: GameEntity | undefined, _w: number, _h: number, _damage: number,
    duration: number, _config: AbilityConfig, _archetype: string,
    _knockback?: { x: number; y: number }
  ) {
    const scene = this.character.scene as any;
    const { width } = scene.scale;
    const owner = this.character;
    const floorY = owner.sprite.y;
    const spawnX = target
      ? target.sprite.x + (owner.sprite.x < target.sprite.x ? 100 : -100)
      : width / 2;

    // Build-up rings
    [0, 250, 500, 900].forEach(delay => {
      scene.time.delayedCall(delay, () => {
        this._voidBurst(spawnX, floorY, 0x1e1b4b, 70 + delay / 10);
        scene.cameras.main.shake(55, 0.004);
      });
    });
    this._floatingText(width / 2, floorY - 120, 'MAHORAGA SUMMON', '#818cf8');

    scene.time.delayedCall(1600, () => {
      if (!owner.isAlive) return;

      const mahoraga = new MaharagaSummon(scene, owner);
      mahoraga.spawn(spawnX, floorY);

      // Register in scene entity list so it gets update() calls
      scene.entities?.push(mahoraga);

      // Add platform collision so it lands and walks on the floor
      if (scene.platforms) {
        scene.physics.add.collider(mahoraga.sprite, scene.platforms);
      }

      // Wire hitbox overlap so Mahoraga can be hit by attacks
      if (scene.hitboxes) {
        scene.physics.add.overlap(
          scene.hitboxes,
          mahoraga.sprite,
          (hb: any, _sprite: any) => {
            // Don't let Mahoraga's own hitboxes hurt itself
            if ((hb as any).owner === mahoraga) return;
            scene.handleHitOverlap?.(hb, mahoraga.sprite);
          },
          undefined,
          scene
        );
      }

      // Expire after duration
      scene.time.delayedCall(duration, () => {
        if (!mahoraga.isAlive) return;
        this._voidBurst(mahoraga.sprite?.x ?? spawnX, floorY, 0x4c1d95, 90);
        mahoraga.despawn();
        // Remove from entities array
        if (scene.entities) {
          const idx = scene.entities.indexOf(mahoraga);
          if (idx !== -1) scene.entities.splice(idx, 1);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  VFX helpers
  // ─────────────────────────────────────────────────────────────

  private _voidBurst(x: number, y: number, color: number, radius: number) {
    const scene = this.character.scene as any;
    const ring = scene.add.circle(x, y, radius, color, 0.22).setDepth(50);
    const outline = scene.add.circle(x, y, radius, color, 0).setDepth(51);
    outline.setStrokeStyle(3, color, 0.9);
    scene.tweens.add({
      targets: [ring, outline], scaleX: 2.5, scaleY: 2.5, alpha: 0,
      duration: 380, ease: 'Power2',
      onComplete: () => { ring.destroy(); outline.destroy(); }
    });
  }

  private _voidCollapse(x: number, y: number, stacks: number) {
    const scene = this.character.scene as any;
    const colors = [0x4c1d95, 0x6d28d9, 0x7c3aed, 0xa78bfa];
    [0, 80, 160, 220].slice(0, Math.max(1, stacks)).forEach((delay, i) => {
      scene.time.delayedCall(delay, () =>
        this._voidBurst(x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-18, 18),
          colors[i % colors.length], 55 + i * 18)
      );
    });
    scene.cameras.main.shake(280, 0.011);
  }

  private _tetherLine(a: Phaser.Physics.Arcade.Sprite, b: Phaser.Physics.Arcade.Sprite, duration: number) {
    const scene = this.character.scene as any;
    const g = scene.add.graphics().setDepth(60);
    g.lineStyle(2, 0xa78bfa, 0.75).lineBetween(a.x, a.y, b.x, b.y);
    scene.tweens.add({ targets: g, alpha: 0, duration, onComplete: () => g.destroy() });
  }

  private _voidTrail(x: number, y: number) {
    const scene = this.character.scene as any;
    for (let i = 0; i < 5; i++) {
      scene.time.delayedCall(i * 18, () => {
        const dot = scene.add.circle(
          x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-20, 20),
          Phaser.Math.Between(3, 6), 0x7c3aed, 0.8
        ).setDepth(50);
        scene.tweens.add({ targets: dot, alpha: 0, y: dot.y - 28, duration: 230, onComplete: () => dot.destroy() });
      });
    }
  }

  private _floatingText(x: number, y: number, text: string, color: string) {
    const scene = this.character.scene as any;
    const txt = scene.add.text(x, y, text, {
      fontFamily: 'Share Tech Mono', fontSize: '17px', color,
      stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(80);
    scene.tweens.add({ targets: txt, y: y - 55, alpha: 0, duration: 1100, onComplete: () => txt.destroy() });
  }
}
