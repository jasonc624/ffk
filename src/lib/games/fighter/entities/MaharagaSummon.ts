import Phaser from 'phaser';
import { AutonomousSummon } from './AutonomousSummon';
import type { GameEntity } from './GameEntity';
import type { Character } from './Character';

/**
 * MaharagaSummon — The Eight-Handled Sword Divergent Sila Divine General.
 *
 * Autonomous summon that targets ALL entities on the field — including the
 * summoner. Adapts over time (increasing speed after each hit). Has its own
 * attack cycle with cooldowns and spawns hitboxes into scene.hitboxes.
 */
export class MaharagaSummon extends AutonomousSummon {
  private attackCooldown: number = 0;
  private attackInterval: number = 2200; // ms between attacks
  private moveSpeed: number = 110;
  private adaptationCount: number = 0; // speeds up each time it lands a hit
  private contemplateCooldown: number = 0; // pause before switching target
  private summoner: Character | null = null;

  constructor(scene: Phaser.Scene, summoner: Character) {
    super(scene, {
      id: `mahoraga_${Date.now()}`,
      name: 'Mahoraga',
      summonerId: summoner.id,
      cost: 0, // CE cost already paid via ability
      behavior: 'MAHORAGA',
      visualProfile: { color: '#6366f1' }
    });
    this.summoner = summoner;
    this.maxHp = 220;
    this.currentHp = 220;
    // Mahoraga is on its own team — attacks everyone
    this.team = 'neutral';
  }

  spawn(x: number, y: number) {
    // Sprite
    this.sprite = this.scene.physics.add.sprite(x, y - 400, 'mahoraga');
    this.sprite.setScale(0.55);
    this.sprite.setDepth(3);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setSize(55, 80);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setOffset(68, 55);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // Hurtbox
    this.hurtbox = this.scene.add.rectangle(x, y, 55, 80, 0xffffff, 0);
    this.scene.physics.add.existing(this.hurtbox);
    (this.hurtbox.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // Play idle anim
    if (this.scene.anims.exists('mahoraga_idle')) {
      this.sprite.play('mahoraga_idle', true);
    }

    // Drop-in from above
    const targetY = y;
    this.scene.tweens.add({
      targets: this.sprite,
      y: targetY,
      duration: 420,
      ease: 'Power4',
      onComplete: () => {
        this.scene.cameras.main.shake(450, 0.018);
        this._vfxBurst(this.sprite.x, this.sprite.y, 0x4f46e5, 100);
        this._floatText(this.sprite.x, this.sprite.y - 80, 'MAHORAGA', '#818cf8');
      }
    });

    this.status = 'ACTIVE';
    this.isAlive = true;
  }

  /** Override: Mahoraga ignores recall */
  canBeRecalled(): boolean {
    return false;
  }

  override runAI(delta: number) {
    if (!this.isAlive || !this.sprite?.active) return;

    // Sync hurtbox to sprite
    this.hurtbox?.setPosition(this.sprite.x, this.sprite.y);

    // Tick cooldowns
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.contemplateCooldown = Math.max(0, this.contemplateCooldown - delta);

    // Pick or switch target
    if (!this.target || !this.target.isAlive || this.contemplateCooldown > 0) {
      if (this.contemplateCooldown <= 0) {
        this.target = this._pickTarget();
        this.contemplateCooldown = 3000 + Math.random() * 2000;
      }
    }

    if (!this.target?.sprite) return;

    // Move toward target
    const dx = this.target.sprite.x - this.sprite.x;
    const dir = dx > 0 ? 1 : -1;

    if (Math.abs(dx) > 60) {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(this.moveSpeed * dir);
      this.sprite.setFlipX(dir === -1);
    } else {
      (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocityX(0);
      // In range — swing if cooldown is up
      if (this.attackCooldown <= 0) {
        this._swingAttack(dir);
        this.attackCooldown = this.attackInterval;
      }
    }
  }

  /** Called by MainScene.handleHitOverlap when Mahoraga RECEIVES a hit */
  override receiveDamage(amount: number, archetype: string, source: GameEntity): number {
    const actual = super.receiveDamage(amount, archetype, source);
    if (actual > 0 && this.isAlive) {
      this._adapt();
    }
    return actual;
  }

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  /** Pick a target — weighted random between all living entities except self */
  private _pickTarget(): GameEntity | null {
    const scene = this.scene as any;
    const all: GameEntity[] = scene.entities?.filter(
      (e: GameEntity) => e !== this && e.isAlive && e.sprite?.active
    ) ?? [];

    if (all.length === 0) return null;

    // 65% chance to target whoever isn't the summoner (the opponent)
    // 35% chance to turn on the summoner — Mahoraga doesn't discriminate
    const nonSummoner = all.filter(e => e.id !== this.summoner?.id);
    const roll = Math.random();

    if (nonSummoner.length > 0 && roll < 0.65) {
      return nonSummoner[Math.floor(Math.random() * nonSummoner.length)];
    }
    return all[Math.floor(Math.random() * all.length)];
  }

  /** Spawn an attack hitbox in the shared hitboxes group */
  private _swingAttack(dir: number) {
    const scene = this.scene as any;
    if (!scene.hitboxes) return;

    const hbX = this.sprite.x + dir * 50;
    const hbY = this.sprite.y;
    const hb = scene.hitboxes.create(hbX, hbY, undefined) as Phaser.Physics.Arcade.Sprite;
    hb.setVisible(false).setDisplaySize(50, 60);

    const body = hb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setSize(50, 60);

    (hb as any).owner = this; // Mahoraga owns the hitbox — damage applies to any target
    (hb as any).damage = 18 + this.adaptationCount * 4; // grows with adaptation
    (hb as any).archetype = 'SHADOW';
    (hb as any).facingDir = dir;

    this._vfxBurst(hbX, hbY, 0x4338ca, 28);

    scene.time.delayedCall(180, () => { if (hb?.active) hb.destroy(); });
  }

  /** Each time Mahoraga is hit, it adapts — increases speed and attack rate */
  private _adapt() {
    this.adaptationCount++;
    this.moveSpeed = Math.min(320, 110 + this.adaptationCount * 30);
    this.attackInterval = Math.max(900, 2200 - this.adaptationCount * 180);

    this._vfxBurst(this.sprite.x, this.sprite.y, 0x7c3aed, 45 + this.adaptationCount * 8);
    this._floatText(
      this.sprite.x, this.sprite.y - 70,
      `ADAPT ×${this.adaptationCount}  SPD ${this.moveSpeed.toFixed(0)}`,
      '#a78bfa'
    );
    console.log(`[Mahoraga] Adapted ×${this.adaptationCount} — speed: ${this.moveSpeed}, interval: ${this.attackInterval}ms`);
  }

  private _vfxBurst(x: number, y: number, color: number, radius: number) {
    const scene = this.scene as any;
    const ring = scene.add.circle(x, y, radius, color, 0.2).setDepth(50);
    const outline = scene.add.circle(x, y, radius, color, 0).setDepth(51);
    outline.setStrokeStyle(3, color, 0.9);
    scene.tweens.add({
      targets: [ring, outline], scaleX: 2.4, scaleY: 2.4, alpha: 0,
      duration: 360, ease: 'Power2',
      onComplete: () => { ring.destroy(); outline.destroy(); }
    });
  }

  private _floatText(x: number, y: number, text: string, color: string) {
    const scene = this.scene as any;
    const txt = scene.add.text(x, y, text, {
      fontFamily: 'Share Tech Mono', fontSize: '15px', color,
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(80);
    scene.tweens.add({
      targets: txt, y: y - 50, alpha: 0, duration: 1000,
      onComplete: () => txt.destroy()
    });
  }
}
