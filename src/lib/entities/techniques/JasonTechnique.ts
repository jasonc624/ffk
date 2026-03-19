import Phaser from 'phaser';
import type { PlayerCharacter } from '../PlayerCharacter';

/**
 * JasonTechnique — Null Vector fighting system.
 *
 * Tracks the Null Vector stack state independently on the character and
 * exposes three methods that PlayerCharacter calls directly.
 *
 * Null Vector stacks (applied by Ability2) sit on the *target*.
 * Full Court Erasure (Ability3) detonates them.
 */
export class JasonTechnique {
  owner: PlayerCharacter;

  constructor(owner: PlayerCharacter) {
    this.owner = owner;
  }

  // ─────────────────────────────────────────────
  //  Ability 1 — Fast Break
  //  Dash toward nearest opponent, then slam a void hitbox.
  // ─────────────────────────────────────────────
  performFastBreak() {
    const scene = this.owner.scene as any;
    const owner = this.owner;
    const config = owner.abilityManager?.slots.get('Ability1')?.config;
    const range = config?.payload?.range ?? 420;
    const damage = config?.damage ?? 23;
    const castTime = config?.castTime ?? 150;
    const invDuration = config?.payload?.invincibleDuration ?? 300;

    // Find nearest opponent
    const target = scene.getOpponentOf(owner);
    if (!target) return;

    const dx = target.sprite.x - owner.sprite.x;
    const dist = Math.abs(dx);
    if (dist > range) return; // Target out of range — fizzle silently

    owner.isAttacking = true;

    // Flash purple-ish void trail on caster during invincibility window
    this._spawnVoidTrail(owner.sprite.x, owner.sprite.y);

    // Snap position to just in front of the target after castTime
    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) return;

      const dir = dx > 0 ? 1 : -1;
      const landX = target.sprite.x - dir * 35; // land one step in front
      owner.sprite.setPosition(landX, owner.sprite.y);
      owner.sprite.setFlipX(dir === -1);

      // Briefly invincible
      owner.gainImmunity('PHYSICAL');
      scene.time.delayedCall(invDuration, () => {
        owner.immunities.delete('PHYSICAL');
      });

      // Spawn the void-laced hitbox on arrival
      this._spawnVoidHitbox(landX + dir * 20, owner.sprite.y, dir, damage, 200);

      // Small visual landing burst
      this._spawnVoidBurst(landX, owner.sprite.y, 0x7c3aed, 30);

      scene.time.delayedCall(300, () => {
        owner.isAttacking = false;
      });
    });
  }

  // ─────────────────────────────────────────────
  //  Ability 2 — Null Vector: Set Play
  //  Apply a NullVector stack to the target (max 3).
  //  At max stacks: burst damage + CE_NULLIFIED.
  // ─────────────────────────────────────────────
  performNullVectorSetPlay() {
    const scene = this.owner.scene as any;
    const owner = this.owner;
    const config = owner.abilityManager?.slots.get('Ability2')?.config;
    const castTime = config?.castTime ?? 600;
    const stackDamage = config?.damage ?? 43;
    const burstDamage = config?.payload?.onMaxStacks?.burstDamage ?? 55;
    const maxStacks = config?.payload?.maxStacks ?? 3;
    const stackDuration = config?.payload?.duration ?? 6000;

    const target = scene.getOpponentOf(owner);
    if (!target) return;

    owner.isAttacking = true;

    // Cast wind-up: flash tether line between players
    this._drawTetherLine(owner.sprite, target.sprite, castTime);

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive || !target.isAlive) {
        owner.isAttacking = false;
        return;
      }

      // Read or initialise Null Vector stacks on the target
      if ((target as any).nullVectorStacks === undefined) {
        (target as any).nullVectorStacks = 0;
      }

      const currentStacks: number = (target as any).nullVectorStacks;

      if (currentStacks >= maxStacks) {
        // Already at cap — detonate immediately (free bonus)
        this._detonateNullVector(target, burstDamage);
        return;
      }

      // Add a stack
      (target as any).nullVectorStacks = currentStacks + 1;
      const newStacks: number = (target as any).nullVectorStacks;

      console.log(`[NullVector] ${target.id} stacks: ${newStacks}/${maxStacks}`);

      // Visual: purple ring pulse on target
      this._spawnVoidBurst(target.sprite.x, target.sprite.y, 0x6d28d9, 40 + newStacks * 10);

      // Floating stack counter above target
      this._spawnFloatingText(target.sprite.x, target.sprite.y - 50, `NULL ×${newStacks}`, '#a78bfa');

      // Apply initial stack hit damage
      const dir = owner.sprite.x < target.sprite.x ? 1 : -1;
      target.receiveDamage(stackDamage, 'VOID', owner);
      (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(200 * dir, -150);
      owner.onDamageDealt?.(stackDamage);

      // Auto-expire stacks after duration
      scene.time.delayedCall(stackDuration, () => {
        if ((target as any).nullVectorStacks > 0) {
          (target as any).nullVectorStacks = Math.max(0, (target as any).nullVectorStacks - 1);
        }
      });

      // Detonate automatically at max stacks
      if (newStacks >= maxStacks) {
        scene.time.delayedCall(400, () => {
          this._detonateNullVector(target, burstDamage);
        });
      }

      owner.isAttacking = false;
    });
  }

  // ─────────────────────────────────────────────
  //  Ability 3 — Full Court Erasure
  //  Detonate ALL stacks in a massive AoE collapse.
  //  If no stacks exist, backfires (-40% CE).
  // ─────────────────────────────────────────────
  performFullCourtErasure() {
    const scene = this.owner.scene as any;
    const owner = this.owner;
    const config = owner.abilityManager?.slots.get('Ability3')?.config;
    const castTime = config?.castTime ?? 1200;
    const baseDamage = config?.damage ?? 59;

    const target = scene.getOpponentOf(owner);
    owner.isAttacking = true;

    // Long cast: full-screen white flash build-up
    this._spawnVoidBurst(owner.sprite.x, owner.sprite.y, 0x4c1d95, 80);

    scene.time.delayedCall(castTime / 3, () => {
      this._spawnVoidBurst(owner.sprite.x, owner.sprite.y, 0x7c3aed, 120);
    });

    scene.time.delayedCall(castTime, () => {
      if (!owner.isAlive) return;

      const stacks: number = target ? ((target as any).nullVectorStacks ?? 0) : 0;

      if (!target || stacks === 0) {
        // ── BACKFIRE ──
        console.log('[FullCourtErasure] BACKFIRE — no stacks active');
        const penalty = owner.cursedEnergy.current * 0.4;
        owner.cursedEnergy.current = Math.max(0, owner.cursedEnergy.current - penalty);
        this._spawnFloatingText(owner.sprite.x, owner.sprite.y - 60, 'BACKFIRE!', '#ef4444');
        this._spawnVoidBurst(owner.sprite.x, owner.sprite.y, 0xff0000, 60);
      } else {
        // ── DETONATE ALL STACKS ──
        const totalDamage = baseDamage + stacks * 18; // bonus per stack
        (target as any).nullVectorStacks = 0;

        console.log(`[FullCourtErasure] DETONATED ${stacks} stacks → ${totalDamage} dmg`);

        // Giant purple void collapse ring
        this._spawnVoidCollapse(target.sprite.x, target.sprite.y, stacks);

        // Deliver damage
        const actualDmg = target.receiveDamage(totalDamage, 'VOID', owner);
        if (actualDmg > 0) {
          owner.onDamageDealt?.(actualDmg);
          // Massive knockback
          (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(
            owner.sprite.x < target.sprite.x ? 600 : -600,
            -500
          );
        }

        // CE Nullified (guaranteed) + STUN (60%)
        target.applyStatus('CE_NULLIFIED', 5000);
        if (Math.random() < 0.6) target.applyStatus('STUNNED', 1200);

        this._spawnFloatingText(target.sprite.x, target.sprite.y - 80, `ERASURE ×${stacks}`, '#a78bfa');
      }

      scene.time.delayedCall(400, () => {
        owner.isAttacking = false;
      });
    });
  }

  // ─────────────────────────────────────────────
  //  Private Helpers
  // ─────────────────────────────────────────────

  /** Detonate existing NullVector stacks on a target (internal helper). */
  private _detonateNullVector(target: any, burstDamage: number) {
    const scene = this.owner.scene as any;
    const stacks = (target as any).nullVectorStacks ?? 0;
    const total = burstDamage + stacks * 10;

    (target as any).nullVectorStacks = 0;
    this._spawnVoidCollapse(target.sprite.x, target.sprite.y, stacks);

    const actualDmg = target.receiveDamage(total, 'VOID', this.owner);
    if (actualDmg > 0) {
      this.owner.onDamageDealt?.(actualDmg);
      target.applyStatus?.('CE_NULLIFIED', 3000);
      (target.sprite.body as Phaser.Physics.Arcade.Body)?.setVelocity(
        this.owner.sprite.x < target.sprite.x ? 500 : -500,
        -400
      );
    }

    this._spawnFloatingText(target.sprite.x, target.sprite.y - 60, `COLLAPSE ×${stacks}`, '#7c3aed');
  }

  /** Spawns a void hitbox in the physics group — used by Fast Break. */
  private _spawnVoidHitbox(x: number, y: number, dir: number, damage: number, duration: number) {
    const scene = this.owner.scene as any;
    const hbW = 50;
    const hbH = 70;

    const hb = scene.hitboxes.create(x + dir * hbW / 2, y, undefined) as Phaser.Physics.Arcade.Sprite;
    hb.setVisible(false);
    hb.setDisplaySize(hbW, hbH);

    const body = hb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(hbW, hbH);

    (hb as any).owner = this.owner;
    (hb as any).damage = damage;
    (hb as any).archetype = 'VOID';
    (hb as any).facingDir = dir;

    scene.time.delayedCall(duration, () => { if (hb?.active) hb.destroy(); });
  }

  /** Expanding ring burst — void colour VFX. */
  private _spawnVoidBurst(x: number, y: number, color: number, radius: number) {
    const scene = this.owner.scene as any;
    const ring = scene.add.circle(x, y, radius, color, 0.25).setDepth(50);
    const outline = scene.add.circle(x, y, radius, color, 0).setDepth(51);
    outline.setStrokeStyle(3, color, 0.9);

    scene.tweens.add({
      targets: [ring, outline],
      scaleX: 2.5,
      scaleY: 2.5,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => { ring.destroy(); outline.destroy(); }
    });
  }

  /** Full collapse — multiple expanding rings for Ability 3. */
  private _spawnVoidCollapse(x: number, y: number, stacks: number) {
    const scene = this.owner.scene as any;
    const delays = [0, 80, 160, 240];
    const colors = [0x4c1d95, 0x6d28d9, 0x7c3aed, 0xa78bfa];

    delays.slice(0, Math.max(1, stacks)).forEach((delay, i) => {
      scene.time.delayedCall(delay, () => {
        this._spawnVoidBurst(
          x + Phaser.Math.Between(-20, 20),
          y + Phaser.Math.Between(-20, 20),
          colors[i % colors.length],
          60 + i * 20
        );
      });
    });

    // Screen shake
    scene.cameras.main.shake(300, 0.012);
  }

  /** Draw a brief tether line between two sprites (cast wind-up). */
  private _drawTetherLine(a: Phaser.Physics.Arcade.Sprite, b: Phaser.Physics.Arcade.Sprite, duration: number) {
    const scene = this.owner.scene as any;
    const g = scene.add.graphics().setDepth(60);
    g.lineStyle(2, 0xa78bfa, 0.7);
    g.lineBetween(a.x, a.y, b.x, b.y);

    scene.tweens.add({
      targets: g,
      alpha: 0,
      duration,
      onComplete: () => g.destroy()
    });
  }

  /** Spawn a void trail particle at position. */
  private _spawnVoidTrail(x: number, y: number) {
    const scene = this.owner.scene as any;
    for (let i = 0; i < 5; i++) {
      scene.time.delayedCall(i * 20, () => {
        const dot = scene.add.circle(
          x + Phaser.Math.Between(-8, 8),
          y + Phaser.Math.Between(-20, 20),
          Phaser.Math.Between(3, 7),
          0x7c3aed,
          0.8
        ).setDepth(50);
        scene.tweens.add({ targets: dot, alpha: 0, y: dot.y - 30, duration: 250, onComplete: () => dot.destroy() });
      });
    }
  }

  /** Floating damage / status text above a position. */
  private _spawnFloatingText(x: number, y: number, text: string, color: string) {
    const scene = this.owner.scene as any;
    const txt = scene.add.text(x, y, text, {
      fontFamily: 'Share Tech Mono',
      fontSize: '18px',
      color,
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(80);

    scene.tweens.add({
      targets: txt,
      y: y - 60,
      alpha: 0,
      duration: 1200,
      onComplete: () => txt.destroy()
    });
  }
}
