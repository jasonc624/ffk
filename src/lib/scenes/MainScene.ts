import Phaser from 'phaser';
import { getCharacter, type CharacterData } from '../storage';
import { FRAME_DATA } from '../constants';
import { preloadTextures } from '../vfx/textureFactory';
import { VisualEffectCompiler } from '../vfx/VisualEffectCompiler';
import { BackgroundFactory } from '../vfx/backgroundFactory';

interface Sorcerer {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  hp: number;
  ce: number;
  isUsingCE: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  canDoubleJump: boolean;
  data: CharacterData | null;
  effects: {
    ceInkOutline?: Phaser.GameObjects.Image;
    ceGlowBody?: Phaser.GameObjects.Image;
    ceWisps?: Phaser.GameObjects.Particles.ParticleEmitter;
    ceCrackle?: Phaser.GameObjects.Particles.ParticleEmitter;
    ceGroundMist?: Phaser.GameObjects.Particles.ParticleEmitter;
    ceGroundGlow?: Phaser.GameObjects.Graphics;
    ceGlowTween?: Phaser.Tweens.Tween;
    ceGroundGlowTween?: Phaser.Tweens.Tween;
  };
}

export default class MainScene extends Phaser.Scene {
  players: Sorcerer[] = [];
  hitboxes!: Phaser.Physics.Arcade.Group;
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: any;
  characterData: CharacterData | null = null;

  stackCount = 0;
  vfx!: VisualEffectCompiler;
  bgFactory!: BackgroundFactory;
  ceVignette?: Phaser.GameObjects.Graphics;

  constructor() {
    super('MainScene');
  }

  init() {
    this.characterData = getCharacter();
    this.players = [];
    this.stackCount = 0;
  }

  preload() {
    preloadTextures(this);
    this.load.spritesheet('character', '/assets/character_sprite.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('rival_sprite', '/assets/smallpox_deity.png', { frameWidth: 128, frameHeight: 128 });
    this.load.image('shibuya_bg', '/assets/shibuya_station.jpg');
  }

  create() {
    const { width, height } = this.scale;

    // Background
    const bg = this.add.image(width / 2, height / 2, 'shibuya_bg');
    bg.setDisplaySize(width, height);
    bg.setDepth(-10);
    bg.setAlpha(0.7);

    // Platforms
    this.platforms = this.physics.add.staticGroup();
    this.createPlatform(width / 2, height - 50, width, 40);
    this.createPlatform(width * 0.25, height * 0.6, 200, 20);
    this.createPlatform(width * 0.75, height * 0.6, 200, 20);

    // Animations
    this.createAnimations('character');
    this.createAnimations('rival_sprite');

    // Create Sorcerers
    this.players.push(this.createSorcerer(200, height - 200, 'character', this.characterData));
    
    // Player 2 - The Rival (Smallpox Deity)
    const rivalData = {
      ...this.characterData,
      name: 'Rival',
      color: '#ff4a4a',
      technique: { ...this.characterData?.technique, visualProfile: { ...this.characterData?.technique.visualProfile, color: '#ff4a4a' } }
    } as any;
    this.players.push(this.createSorcerer(width - 200, height - 200, 'rival_sprite', rivalData));
    this.players[1].sprite.setFlipX(true);

    // Hitboxes
    this.hitboxes = this.physics.add.group({ allowGravity: false });

    // Collisions
    this.physics.add.collider(this.players.map(p => p.sprite), this.platforms);
    this.physics.add.overlap(this.hitboxes, this.players.map(p => p.sprite), this.handleHit as any, undefined, this);

    // Controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,J,K,L,U,SHIFT,SPACE,ENTER,NUMPAD_ONE,NUMPAD_TWO,NUMPAD_THREE,NUMPAD_ZERO');

    // VFX
    this.vfx = new VisualEffectCompiler(this, this.scene.get('HUDScene'));
    this.bgFactory = new BackgroundFactory(this);

    // Start HUD
    this.scene.launch('HUDScene', { players: this.players });

    this.createCEParticles();
  }

  createAnimations(texture: string) {
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

  createSorcerer(x: number, y: number, texture: string, data: CharacterData | null): Sorcerer {
    const sprite = this.physics.add.sprite(x, y, texture);
    sprite.setScale(0.8);
    sprite.setDepth(2);
    sprite.body.setSize(40, 80);
    sprite.body.setOffset(44, 48);
    sprite.body.setCollideWorldBounds(true);
    sprite.play(`${texture}_idle`);

    return {
      sprite,
      hp: 100,
      ce: 100,
      isUsingCE: false,
      isAttacking: false,
      isBlocking: false,
      canDoubleJump: true,
      data,
      effects: {}
    };
  }

  createPlatform(x: number, y: number, w: number, h: number) {
    const p = this.platforms.create(x, y, 'shibuya_bg'); // Dummy texture
    p.setDisplaySize(w, h);
    p.setAlpha(0); // Invisible collideable area
    p.refreshBody();

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.05);
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.lineStyle(2, 0xffffff, 0.1);
    g.strokeRect(x - w / 2, y - h / 2, w, h);
  }

  createCEParticles() {
    this.add.particles(0, 0, 'tex_orb_soft', {
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, this.scale.width, this.scale.height) } as any,
      speedX: { min: -10, max: 10 },
      speedY: { min: -20, max: -5 },
      scale: { start: 0.1, end: 0.3 },
      alpha: { start: 0.1, end: 0 },
      lifespan: 3000,
      tint: 0x4a9eff,
      frequency: 200,
      quantity: 1,
    }).setDepth(-5);
  }

  update() {
    if (this.players.length === 0) return;

    // Player 1 Controls (WASD)
    this.handleSorcererInput(this.players[0], {
      left: this.keys.A,
      right: this.keys.D,
      up: this.keys.W,
      down: this.keys.S,
      jump: this.keys.SPACE,
      light: this.keys.J,
      heavy: this.keys.K,
      special: this.keys.L,
      ce: this.keys.SHIFT,
      domain: this.keys.U
    });

    // Player 2 Controls (Arrows)
    if (this.players.length > 1) {
      this.handleSorcererInput(this.players[1], {
        left: this.cursors.left,
        right: this.cursors.right,
        up: this.cursors.up,
        down: this.cursors.down,
        jump: this.cursors.up,
        light: this.keys.NUMPAD_ONE,
        heavy: this.keys.NUMPAD_TWO,
        special: this.keys.NUMPAD_THREE,
        ce: this.keys.ENTER,
        domain: this.keys.NUMPAD_ZERO
      });
    }

    // Sync HUD
    this.events.emit('updateHUD', {
      players: this.players.map(p => ({
        hp: p.hp,
        ce: p.ce,
        name: p.data?.name,
        color: p.data?.color,
        isUsingCE: p.isUsingCE,
        canExpandDomain: p.ce >= 100
      }))
    });
  }

  handleSorcererInput(sorcerer: Sorcerer, controls: any) {
    const { sprite } = sorcerer;
    const speed = 300;
    const jumpVelocity = -600;

    if (sorcerer.isAttacking) return;

    // Movement
    if (controls.left.isDown) {
      sprite.body.setVelocityX(-speed);
      sprite.setFlipX(true);
    } else if (controls.right.isDown) {
      sprite.body.setVelocityX(speed);
      sprite.setFlipX(false);
    } else {
      sprite.body.setVelocityX(0);
    }

    // Jump
    const onGround = sprite.body.blocked.down;
    if (Phaser.Input.Keyboard.JustDown(controls.jump)) {
      if (onGround) {
        sprite.body.setVelocityY(jumpVelocity);
      } else if (sorcerer.canDoubleJump) {
        sprite.body.setVelocityY(jumpVelocity * 0.8);
        sorcerer.canDoubleJump = false;
        this.createJumpBurst(sprite.x, sprite.y);
      }
    }
    if (onGround) sorcerer.canDoubleJump = true;

    // Fast Fall / Block
    if (controls.down.isDown) {
      if (!onGround) sprite.body.setVelocityY(800);
      else {
        sorcerer.isBlocking = true;
        sprite.setAlpha(0.6);
        sprite.body.setVelocityX(0);
      }
    } else {
      sorcerer.isBlocking = false;
      sprite.setAlpha(1);
    }

    // Anim
    if (!onGround) {
      if (sprite.body.velocity.y > 0) sprite.play('descend', true);
      else sprite.play('jump', true);
    } else if (sprite.body.velocity.x !== 0) {
      sprite.play('kick', true);
    } else {
      sprite.play('idle', true);
    }

    // Attack triggers
    if (Phaser.Input.Keyboard.JustDown(controls.light)) this.performAttack(sorcerer, 'light');
    if (Phaser.Input.Keyboard.JustDown(controls.heavy)) this.performAttack(sorcerer, 'heavy');
    if (Phaser.Input.Keyboard.JustDown(controls.special)) this.performSpecial(sorcerer);
    if (Phaser.Input.Keyboard.JustDown(controls.domain)) this.expandDomain(sorcerer);

    // CE Focus
    if (Phaser.Input.Keyboard.JustDown(controls.ce) && sorcerer.ce > 0) {
      this.activateCEAura(sorcerer);
    }
    if (sorcerer.isUsingCE) {
      sorcerer.ce -= 15 / 60;
      if (sorcerer.ce <= 0) {
        sorcerer.ce = 0;
        this.deactivateCEAura(sorcerer);
      }
      this.updateCEAura(sorcerer);
    } else if (sorcerer.ce < 100) {
      sorcerer.ce += 8 / 60;
    }
    if (Phaser.Input.Keyboard.JustUp(controls.ce)) {
      this.deactivateCEAura(sorcerer);
    }
  }

  createJumpBurst(x: number, y: number) {
    const burst = this.add.circle(x, y + 40, 20, 0xffffff, 0.3);
    this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 200, onComplete: () => burst.destroy() });
  }

  activateCEAura(sorcerer: Sorcerer) {
    if (sorcerer.isUsingCE) return;
    sorcerer.isUsingCE = true;
    const { sprite } = sorcerer;
    const ceColor = sorcerer.data?.color ? parseInt(sorcerer.data.color.replace('#', ''), 16) : 0x4a9eff;

    sorcerer.effects.ceInkOutline = this.add.image(sprite.x, sprite.y, sprite.texture.key).setFrame(sprite.frame.name).setTint(0x000000).setScale(sprite.scaleX * 1.18, sprite.scaleY * 1.22).setAlpha(0.85).setDepth(sprite.depth - 2);
    sorcerer.effects.ceGlowBody = this.add.image(sprite.x, sprite.y, sprite.texture.key).setFrame(sprite.frame.name).setTint(ceColor).setScale(sprite.scaleX * 1.10, sprite.scaleY * 1.12).setAlpha(0.7).setDepth(sprite.depth - 1).setBlendMode(Phaser.BlendModes.ADD);

    sorcerer.effects.ceGlowTween = this.tweens.add({
      targets: [sorcerer.effects.ceGlowBody, sorcerer.effects.ceInkOutline],
      alpha: { from: 0.6, to: 0.9 },
      duration: 400,
      yoyo: true,
      repeat: -1
    });

    sorcerer.effects.ceWisps = this.add.particles(0, 0, 'tex_wisp', {
      follow: sprite,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-20, -64, 40, 128) } as any,
      speedY: { min: -160, max: -60 },
      scale: { start: 0.5, end: 0.05 },
      alpha: { start: 0.55, end: 0 },
      lifespan: 700,
      tint: ceColor,
      blendMode: 'ADD',
      quantity: 2,
    }).setDepth(sprite.depth + 2);

    sorcerer.effects.ceGroundGlow = this.add.graphics().setDepth(sprite.depth - 4).fillStyle(ceColor, 0.3).fillEllipse(0, 0, 80, 16);
    this.updateVignette();
  }

  updateCEAura(sorcerer: Sorcerer) {
    const { sprite, effects } = sorcerer;
    if (effects.ceInkOutline) effects.ceInkOutline.setPosition(sprite.x, sprite.y).setFrame(sprite.frame.name).setFlipX(sprite.flipX);
    if (effects.ceGlowBody) effects.ceGlowBody.setPosition(sprite.x, sprite.y).setFrame(sprite.frame.name).setFlipX(sprite.flipX);
    if (effects.ceGroundGlow) effects.ceGroundGlow.setPosition(sprite.x, sprite.y + 58);
  }

  deactivateCEAura(sorcerer: Sorcerer) {
    if (!sorcerer.isUsingCE) return;
    sorcerer.isUsingCE = false;
    const { effects } = sorcerer;

    if (effects.ceGlowBody) effects.ceGlowBody.destroy();
    if (effects.ceInkOutline) effects.ceInkOutline.destroy();
    if (effects.ceWisps) effects.ceWisps.destroy();
    if (effects.ceGroundGlow) effects.ceGroundGlow.destroy();
    effects.ceGlowTween?.stop();
    this.updateVignette();
  }

  updateVignette() {
    const isAnyUsingCE = this.players.some(p => p.isUsingCE);
    if (isAnyUsingCE && !this.ceVignette) {
      this.ceVignette = this.add.graphics().setScrollFactor(0).setDepth(1).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.ceVignette.fillStyle(0x4a9eff, 0.1).fillRect(0, 0, this.scale.width, this.scale.height);
    } else if (!isAnyUsingCE && this.ceVignette) {
      this.ceVignette.destroy();
      this.ceVignette = undefined;
    }
  }

  performAttack(sorcerer: Sorcerer, type: 'light' | 'heavy') {
    if (sorcerer.isAttacking || sorcerer.isBlocking) return;
    sorcerer.isAttacking = true;
    const data = FRAME_DATA[type];
    sorcerer.sprite.play(type === 'light' ? 'punch' : 'kick', true);

    this.time.delayedCall(data.startup * 16.6, () => {
      const dir = sorcerer.sprite.flipX ? -1 : 1;
      const hb = this.add.rectangle(sorcerer.sprite.x + (50 * dir), sorcerer.sprite.y, 60, 40, 0xffffff, 0);
      this.hitboxes.add(hb);
      (hb.body as any).setAllowGravity(false);
      (hb as any).owner = sorcerer;
      (hb as any).damage = data.damage;
      this.time.delayedCall(data.active * 16.6, () => hb.destroy());
      this.time.delayedCall(data.recovery * 16.6, () => sorcerer.isAttacking = false);
    });
  }

  performSpecial(sorcerer: Sorcerer) {
    if (sorcerer.ce < FRAME_DATA.special.cost) return;
    sorcerer.ce -= FRAME_DATA.special.cost;
    sorcerer.isAttacking = true;
    sorcerer.sprite.play('special', true);
    this.time.delayedCall(FRAME_DATA.special.startup * 16.6, () => {
      const burst = this.add.circle(sorcerer.sprite.x, sorcerer.sprite.y, 100, 0x4a9eff, 0.2);
      this.physics.add.existing(burst);
      (burst.body as any).setAllowGravity(false);
      (burst as any).owner = sorcerer;
      (burst as any).damage = FRAME_DATA.special.damage;
      this.hitboxes.add(burst);
      this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
      this.time.delayedCall(FRAME_DATA.special.recovery * 16.6, () => sorcerer.isAttacking = false);
    });
  }

  expandDomain(sorcerer: Sorcerer) {
    if (sorcerer.ce < 100) return;
    sorcerer.ce -= 100;
    sorcerer.isAttacking = true;
    sorcerer.sprite.play('domain', true);
    this.bgFactory.activate(sorcerer.data?.technique.visualProfile, () => {
      this.time.delayedCall(1000, () => sorcerer.isAttacking = false);
    });
  }

  handleHit(hb: any, targetSprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody) {
    const target = this.players.find(p => p.sprite === targetSprite);
    const owner = hb.owner as Sorcerer;
    if (!target || !owner || target === owner) return;
    if (target.isBlocking) { hb.destroy(); return; }

    target.hp -= hb.damage || 5;
    target.sprite.setTint(0xffffff);
    this.time.delayedCall(50, () => { if (target.sprite.active) target.sprite.clearTint(); });
    
    const dir = owner.sprite.x < target.sprite.x ? 1 : -1;
    target.sprite.body.setVelocity(400 * dir, -200);
    hb.destroy();

    if (target.hp <= 0) this.respawnSorcerer(target);
  }

  respawnSorcerer(sorcerer: Sorcerer) {
    sorcerer.hp = 100;
    sorcerer.ce = 100;
    const x = sorcerer === this.players[0] ? 200 : this.scale.width - 200;
    sorcerer.sprite.setPosition(x, this.scale.height - 200);
    sorcerer.sprite.play('idle', true);
  }
}
