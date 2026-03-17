import Phaser from 'phaser';
import { getCharacter } from '../storage';
import type { CharacterData } from '../types/character';
import { preloadTextures } from '../vfx/textureFactory';
import { VisualEffectCompiler } from '../vfx/VisualEffectCompiler';
import { BackgroundFactory } from '../vfx/backgroundFactory';
import { PlayerCharacter } from '../entities/PlayerCharacter';
import { CPUCharacter } from '../entities/CPUCharacter';
import { GameEntity } from '../entities/GameEntity';
import { StandardDomain } from '../domains/StandardDomain';
import { SUMMON_REGISTRY } from '../entities/registry';
import { AbilityManager } from '../entities/AbilityManager';
import type { AbilityConfig } from '../types/ability';
import { FRAME_DATA } from '$lib/constants';

export default class MainScene extends Phaser.Scene {
  entities: GameEntity[] = [];
  players: (PlayerCharacter | CPUCharacter)[] = [];
  hitboxes!: Phaser.Physics.Arcade.Group;
  platforms!: Phaser.Physics.Arcade.StaticGroup;

  characterData: CharacterData | null = null;
  vfx!: VisualEffectCompiler;
  bgFactory!: BackgroundFactory;
  ceVignette?: Phaser.GameObjects.Graphics;

  constructor() {
    super('MainScene');
  }

  init() {
    this.characterData = getCharacter();
    this.entities = [];
    this.players = [];
  }

  preload() {
    // Assets are now pre-loaded in PreloaderScene
  }

  create() {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.image(width / 2, height / 2, 'shibuya_bg');
    bg.setDisplaySize(width, height);
    bg.setDepth(-10).setAlpha(0.7);

    // Play start transition sound
    this.sound.play('transition', { volume: 0.6 });

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    this.createPlatform(width / 2, height - 50, width, 40);

    // Animations
    this.createAnimations('character');
    this.createAnimations('rival_sprite');
    Object.values(SUMMON_REGISTRY).forEach(config => {
      this.createAnimationsFromRegistry(config);
    });

    // Controls
    const keys = this.input.keyboard!.addKeys('W,A,S,D,J,K,L,U,Q,E,F,SHIFT,SPACE,ENTER,NUMPAD_ONE,NUMPAD_TWO,NUMPAD_THREE,NUMPAD_ZERO') as any;
    const cursors = this.input.keyboard!.createCursorKeys();

    // Create Sorcerers
    const p1 = new PlayerCharacter(this, {
      id: 'p1',
      name: this.characterData?.name || 'Sorcerer',
      team: 'player',
      data: this.characterData!,
      controls: {
        left: keys.A,
        right: keys.D,
        up: keys.W,
        down: keys.S,
        jump: keys.SPACE,
        light: keys.J,
        heavy: keys.K,
        special: keys.L,
        ability2: keys.E,
        ability3: keys.F,
        ce: keys.SHIFT,
        domain: keys.Q
      }
    });
    p1.spawn(200, height - 200);

    // Default abilities for testing
    const defaultAbilities: AbilityConfig[] = [
      { slot: 'Ability1', name: 'Black Flash', key: 'L', cost: { cursedEnergy: 15 }, cooldown: 4000 },
      { slot: 'Ability2', name: 'Cursed Speech', key: 'E', cost: { throatStrain: 30 }, cooldown: 8000 },
      { slot: 'Ability3', name: 'Divergent Fist', key: 'F', cost: { cursedEnergy: 10 }, cooldown: 20000 }
    ];

    p1.abilityManager = new AbilityManager(p1, this.characterData?.abilities || defaultAbilities);

    p1.activeDomain = new StandardDomain(this, {
      id: 'p1_domain',
      name: this.characterData?.domain.name || 'Domain',
      ownerId: 'p1',
      cost: 0, // Unblocked for testing
      cooldownTurns: 0, // Unblocked for testing
      visualProfile: p1.visualProfile,
      clashProfile: {}
    });

    const p2 = new CPUCharacter(this, {
      id: 'p2',
      name: 'Rival Sorcerer',
      team: 'opponent',
      data: {
        ...this.characterData!,
        name: 'Rival Sorcerer',
        color: '#ff4a4a',
        stats: {
          cursedEnergy: 120,
          domainRefinement: 8, // Higher refinement for testing
          physicalStrength: 12,
          cursedEnergyControl: 10
        }
      } as any
    });
    p2.spawn(width - 200, height - 200);
    p2.sprite.setFlipX(true);

    p2.activeDomain = new StandardDomain(this, {
      id: 'p2_domain',
      name: 'Malevolent Workspace',
      ownerId: 'p2',
      cost: 0, // 0 for easy testing
      cooldownTurns: 0,
      visualProfile: {
        ...this.characterData!.technique.visualProfile,
        color: '#ff4a4a'
      },
      clashProfile: {
        clashBonus: 2
      }
    });

    this.players = [p1, p2];
    this.entities = [p1, p2];

    // Hitboxes
    this.hitboxes = this.physics.add.group({ allowGravity: false });

    // Collisions
    this.physics.add.collider(this.players.map(p => p.sprite), this.platforms);
    // Add player-to-player collision
    this.physics.add.collider(this.players[0].sprite, this.players[1].sprite);

    // Overlap for attacks
    const playerSprites = this.players.map(p => p.sprite);
    playerSprites.forEach(sprite => {
      this.physics.add.overlap(
        this.hitboxes,
        sprite,
        (hb, targetSprite) => this.handleHitOverlap(hb as any, targetSprite as Phaser.Physics.Arcade.Sprite),
        undefined,
        this
      );
    });

    // Initial Systems
    this.vfx = new VisualEffectCompiler(this, this.scene.get('HUDScene'));
    this.bgFactory = new BackgroundFactory(this);
    this.scene.launch('HUDScene', { players: this.players });

    // Clash listener
    this.events.on('clashResolved', this.onClashResolved, this);
  }

  createAnimations(texture: string) {
    if (texture === 'character') {
      const rowWidth = 16; // 16 frames per row
      const config = [
        { key: 'walk', start: 0, end: 15, rate: 12, repeat: -1 },
        { key: 'punch', start: rowWidth * 1, end: rowWidth * 1 + 31, rate: 24 }, // Full extension + recoil
        { key: 'jump', start: rowWidth * 2, end: rowWidth * 2 + 15, rate: 12 },
        { key: 'descend', start: rowWidth * 3, end: rowWidth * 3 + 15, rate: 12 },
        { key: 'domain', start: rowWidth * 4, end: rowWidth * 4 + 31, rate: 12 },
        { key: 'idle', start: rowWidth * 5, end: rowWidth * 5 + 15, rate: 12, repeat: -1 },
        { key: 'kick', start: rowWidth * 6, end: rowWidth * 6, rate: 1 },
        { key: 'hurt', start: rowWidth * 7, end: rowWidth * 7, rate: 1 },
        { key: 'special', start: rowWidth * 4, end: rowWidth * 4 + 31, rate: 18 }
      ];

      config.forEach(anim => {
        const animKey = `${texture}_${anim.key}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(texture, { start: anim.start, end: anim.end }),
            frameRate: anim.rate,
            repeat: anim.repeat || 0
          });
        }
      });
    } else {
      // Legacy/Rival fallback
      const keys = ['idle', 'kick', 'punch', 'special', 'domain', 'jump', 'descend'];
      const frames = [0, 1, 4, 5, 9, 8, 12];
      keys.forEach((key, i) => {
        const animKey = `${texture}_${key}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: [{ key: texture, frame: frames[i] }],
            frameRate: 1
          });
        }
      });
    }
  }

  createAnimationsFromRegistry(config: any) {
    Object.entries(config.animations).forEach(([key, anim]: [string, any]) => {
      const animKey = `${config.texture}_${key}`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(config.texture, { frames: anim.frames }),
          frameRate: anim.frameRate || 1,
          repeat: anim.repeat !== undefined ? anim.repeat : 0
        });
      }
    });
  }

  createPlatform(x: number, y: number, w: number, h: number) {
    const p = this.platforms.create(x, y, 'shibuya_bg');
    p.setDisplaySize(w, h).setAlpha(0).refreshBody();
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.05).fillRect(x - w / 2, y - h / 2, w, h);
    g.lineStyle(2, 0xffffff, 0.1).strokeRect(x - w / 2, y - h / 2, w, h);
  }

  update(time: number, delta: number) {
    this.entities.forEach(e => e.update(time, delta));

    // Sync HUD
    this.events.emit('updateHUD', {
      players: this.players.map(p => ({
        id: p.id,
        hp: p.currentHp,
        ce: p.cursedEnergy.current,
        name: p.name,
        color: p.visualProfile?.color || '#ffffff',
        isUsingCE: (p as any).isUsingCE,
        canExpandDomain: p.cursedEnergy.current >= 100,
        throatStrain: p.throatStrain,
        abilities: p.abilityManager ? Array.from(p.abilityManager.slots.values()).map(s => ({
          slot: s.config.slot,
          key: s.config.key,
          name: s.config.name,
          cooldownFraction: p.abilityManager!.getCooldownFraction(s.config.slot),
          remainingCooldown: s.remainingCooldown
        })) : []
      }))
    });
  }

  handleHitOverlap(objA: any, objB: any) {
    // Phaser may swap arguments — find which is the hitbox and which is the target
    const hb = objA.owner !== undefined ? objA
      : objB.owner !== undefined ? objB
        : null;

    const targetSprite = objA.owner !== undefined ? objB : objA;

    console.log('[OVERLAP DEBUG]', {
      hbOwner: hb?.owner?.id,
      hbDamage: hb?.damage,
      targetSprite: !!targetSprite
    });

    if (!hb || !hb.owner) return;
    if (!hb.hitTargets) hb.hitTargets = new Set();
    if (hb.hitTargets.has(targetSprite)) return;
    hb.hitTargets.add(targetSprite);

    const target = this.entities.find(e => e.sprite === targetSprite);
    const owner = hb.owner;

    if (!target || !owner) return;
    if (target === owner) return;
    if (target.team === owner.team) return;

    const actualDamage = target.receiveDamage(hb.damage || 5, hb.archetype || 'PHYSICAL', owner);

    if (actualDamage > 0) {
      owner.onDamageDealt?.(actualDamage);
      const dir = owner.sprite.x < target.sprite.x ? 1 : -1;
      const body = target.sprite.body as Phaser.Physics.Arcade.Body;
      body?.setVelocity(400 * dir, -300);
      console.log(`[Hit] ${owner.id} → ${target.id} | DMG: ${actualDamage} | HP: ${target.currentHp}`);
    }
  }
  getEntityById(id: string) {
    return this.entities.find(e => e.id === id);
  }

  getOpponentOf(entity: GameEntity) {
    return this.entities.find(e => e.team !== entity.team && (e instanceof PlayerCharacter || e instanceof CPUCharacter));
  }

  getAllEntities() {
    return this.entities;
  }

  createJumpBurst(x: number, y: number) {
    const burst = this.add.circle(x, y + 40, 20, 0xffffff, 0.3);
    this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 200, onComplete: () => burst.destroy() });
  }

  activateCEAura(sorcerer: any) {
    const { sprite } = sorcerer;
    const ceColor = sorcerer.visualProfile?.color ? parseInt(sorcerer.visualProfile.color.replace('#', ''), 16) : 0x4a9eff;

    sorcerer.ceInkOutline = this.add.image(sprite.x, sprite.y, sprite.texture.key).setFrame(sprite.frame.name).setTint(0x000000).setScale(sprite.scaleX * 1.18, sprite.scaleY * 1.22).setAlpha(0.85).setDepth(sprite.depth - 2);
    sorcerer.ceGlowBody = this.add.image(sprite.x, sprite.y, sprite.texture.key).setFrame(sprite.frame.name).setTint(ceColor).setScale(sprite.scaleX * 1.10, sprite.scaleY * 1.12).setAlpha(0.7).setDepth(sprite.depth - 1).setBlendMode(Phaser.BlendModes.ADD);

    sorcerer.ceGlowTween = this.tweens.add({
      targets: [sorcerer.ceGlowBody, sorcerer.ceInkOutline],
      alpha: { from: 0.6, to: 0.9 },
      duration: 400,
      yoyo: true,
      repeat: -1
    });

    sorcerer.ceGroundGlow = this.add.graphics().setDepth(sprite.depth - 4).fillStyle(ceColor, 0.3).fillEllipse(0, 0, 80, 16);
    this.updateVignette();
  }

  updateCEAura(sorcerer: any) {
    const { sprite } = sorcerer;
    if (sorcerer.ceInkOutline) sorcerer.ceInkOutline.setPosition(sprite.x, sprite.y).setFrame(sprite.frame.name).setFlipX(sprite.flipX);
    if (sorcerer.ceGlowBody) sorcerer.ceGlowBody.setPosition(sprite.x, sprite.y).setFrame(sprite.frame.name).setFlipX(sprite.flipX);
    if (sorcerer.ceGroundGlow) sorcerer.ceGroundGlow.setPosition(sprite.x, sprite.y + 58);
  }

  deactivateCEAura(sorcerer: any) {
    if (sorcerer.ceGlowBody) sorcerer.ceGlowBody.destroy();
    if (sorcerer.ceInkOutline) sorcerer.ceInkOutline.destroy();
    if (sorcerer.ceGroundGlow) sorcerer.ceGroundGlow.destroy();
    if (sorcerer.ceGlowTween) sorcerer.ceGlowTween.stop();
    this.updateVignette();
  }

  updateVignette() {
    const isAnyUsingCE = this.players.some(p => (p as any).isUsingCE);
    if (isAnyUsingCE && !this.ceVignette) {
      this.ceVignette = this.add.graphics().setScrollFactor(0).setDepth(1).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.ceVignette.fillStyle(0x4a9eff, 0.1).fillRect(0, 0, this.scale.width, this.scale.height);
    } else if (!isAnyUsingCE && this.ceVignette) {
      this.ceVignette.destroy();
      this.ceVignette = undefined;
    }
  }

  performBurst(sorcerer: any) {
    const burst = this.add.circle(sorcerer.sprite.x, sorcerer.sprite.y, 100, 0x4a9eff, 0.2);
    this.physics.add.existing(burst);
    (burst.body as any).setAllowGravity(false);
    (burst as any).owner = sorcerer;
    (burst as any).damage = 25;
    (burst as any).attackType = 'special';
    this.hitboxes.add(burst);
    this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
  }

  onClashResolved(data: any) {
    const { outcome, winner, loser } = data;
    console.log(`Clash Resolved: ${outcome}`);

    if (outcome === 'CRUSHED_WIN' || outcome === 'WIN') {
      loser.activeDomain.collapse('LOST_CLASH');
      winner.activeDomain.status = 'ACTIVE';
      this.bgFactory.activate(winner.activeDomain.visualProfile, winner.sprite.x, winner.sprite.y, () => { });
      winner.activeDomain.executeSureHit(loser);
    } else if (outcome === 'CONTESTED') {
      winner.activeDomain.collapse('SHATTERED');
      loser.activeDomain.collapse('SHATTERED');
    } else {
      winner.activeDomain.collapse('LOST_CLASH');
      loser.activeDomain.status = 'ACTIVE';
      this.bgFactory.activate(loser.activeDomain.visualProfile, loser.sprite.x, loser.sprite.y, () => { });
      loser.activeDomain.executeSureHit(winner);
    }
  }
}
