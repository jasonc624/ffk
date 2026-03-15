import Phaser from 'phaser';
import { EMITTERS } from './vocabulary';

export class VisualEffectCompiler {
  scene: Phaser.Scene;
  hudScene: any;
  emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  constructor(scene: Phaser.Scene, hudScene: any) {
    this.scene = scene;
    this.hudScene = hudScene;
    
    // Cleanup on scene shutdown
    this.scene.events.on('shutdown', this.cleanup, this);
  }

  cleanup() {
    this.emitters.forEach(e => e.destroy());
    this.emitters = [];
  }

  execute(eventKey: string, profile: any, context: { caster: any, target?: any, x?: number, y?: number }) {
    if (!profile || !profile[eventKey]) return;

    const event = profile[eventKey];

    // Caster Effects
    if (event.caster) {
      event.caster.forEach((fx: any) => this.applyEmitter(fx, context.caster));
    }

    // Target Effects
    if (event.target && context.target) {
      event.target.forEach((fx: any) => {
        if (fx.emitter) this.applyEmitter(fx, context.target);
        if (fx.fx) this.applyTargetFx(fx, context.target);
      });
    }

    // Screen Effects
    if (event.screen) {
      event.screen.forEach((fx: any) => this.applyScreenFx(fx, context.x || context.caster.x, context.y || context.caster.y));
    }

    // HUD Effects
    if (event.hud) {
      event.hud.forEach((fx: any) => this.applyHudFx(fx, context));
    }
  }

  applyEmitter(fx: any, sprite: Phaser.GameObjects.Sprite) {
    const config = EMITTERS[fx.emitter as keyof typeof EMITTERS];
    if (!config) return;

    const texture = `tex_${fx.particle.toLowerCase()}`;
    const color = parseInt(fx.color.replace('#', ''), 16);

    const emitter = this.scene.add.particles(0, 0, texture, {
      ...(config as any),
      tint: color,
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD'
    });

    if ((config as any).follow) {
      emitter.startFollow(sprite);
    } else {
      emitter.setPosition(sprite.x, sprite.y);
      emitter.explode(fx.count || 20);
      this.scene.time.delayedCall(fx.lifespan || 1000, () => emitter.destroy());
    }

    this.emitters.push(emitter);
  }

  applyTargetFx(fx: any, sprite: Phaser.GameObjects.Sprite) {
    const color = fx.color ? parseInt(fx.color.replace('#', ''), 16) : 0xffffff;

    switch (fx.fx) {
      case 'TINT_PULSE':
        this.scene.tweens.add({
          targets: sprite,
          tint: color,
          duration: (fx.duration as number) / 2,
          yoyo: true,
          onComplete: () => sprite.clearTint()
        });
        break;
      case 'CHROMATIC': {
        // Simple Chromatic approximation using a flash of color
        this.scene.tweens.addCounter({
          from: 0,
          to: 10,
          duration: fx.duration,
          onUpdate: (tween: any) => {
            const offset = Math.sin(tween.getValue() || 0) * 5;
            sprite.setTint(color);
            sprite.x += offset;
          },
          onComplete: () => {
            sprite.clearTint();
          }
        });
        break;
      }
      case 'GLITCH':
        this.scene.tweens.add({
          targets: sprite,
          x: sprite.x + 4,
          duration: 50,
          yoyo: true,
          repeat: fx.duration / 100,
          onUpdate: () => {
             sprite.setAlpha(Math.random() > 0.5 ? 1 : 0.7);
          },
          onComplete: () => {
            sprite.setAlpha(1);
          }
        });
        break;
      case 'HEAT_HAZE': {
        const g = this.scene.add.graphics();
        this.scene.events.on('update', () => {
          if (!g.active) return;
          g.clear();
          g.lineStyle(2, color, 0.3);
          const t = this.scene.time.now / 100;
          for (let i = 0; i < 5; i++) {
             const dx = Math.sin(t + i) * 10;
             g.strokeEllipse(sprite.x + dx, sprite.y + i * 10 - 20, 50, 20);
          }
        });
        this.scene.time.delayedCall(fx.duration, () => g.destroy());
        break;
      }
      case 'FLICKER':
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0.2,
          duration: 50,
          yoyo: true,
          repeat: (fx.duration as number) / 100,
          onComplete: () => sprite.setAlpha(1)
        });
        break;
      case 'FREEZE':
        sprite.setTint(0xaaddff);
        sprite.anims.pause();
        this.scene.time.delayedCall(fx.duration, () => {
          sprite.clearTint();
          sprite.anims.resume();
        });
        break;
      case 'INVERT': {
        const g = this.scene.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRect(sprite.x - sprite.width / 2, sprite.y - sprite.height / 2, sprite.width, sprite.height);
        g.setBlendMode(Phaser.BlendModes.DIFFERENCE);
        this.scene.time.delayedCall(fx.duration, () => g.destroy());
        break;
      }
    }
  }

  applyScreenFx(fx: any, x: number, y: number) {
    switch (fx.fx) {
      case 'VIGNETTE': {
        const g = this.scene.add.graphics().setScrollFactor(0).setDepth(1000);
        g.fillStyle(0x000000, 0);
        const { width, height } = this.scene.scale;
        this.scene.tweens.addCounter({
          from: 0,
          to: 0.7,
          duration: fx.duration / 2,
          yoyo: true,
          onUpdate: (t: any) => {
            g.clear();
            g.fillStyle(0x000000, t.getValue() || 0);
            // Draw a frame-like rectangle
             g.fillRect(0, 0, width, 40);
             g.fillRect(0, height - 40, width, 40);
          },
          onComplete: () => g.destroy()
        });
        break;
      }
      case 'SHOCKWAVE':
        const emitter = this.scene.add.particles(x as number, y as number, 'tex_ring', {
          speed: 120,
          scale: { start: 0.1, end: 3.0 },
          alpha: { start: 1, end: 0 },
          lifespan: 500
        } as any);
        emitter.explode(1);
        this.scene.time.delayedCall(500, () => emitter.destroy());
        break;
      case 'SLOWMO': {
        const originalScale = this.scene.physics.world.timeScale;
        this.scene.physics.world.timeScale = fx.factor || 0.2;
        this.scene.tweens.addCounter({
          from: fx.factor || 0.2,
          to: 1.0,
          duration: fx.duration as number,
          onUpdate: (tween: any) => {
            this.scene.physics.world.timeScale = tween.getValue() || 1;
          },
          onComplete: () => {
            this.scene.physics.world.timeScale = originalScale;
          }
        });
        break;
      }
      case 'FLASH': {
        const color = fx.color ? parseInt(fx.color.replace('#', ''), 16) : 0xffffff;
        const rect = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, color)
          .setOrigin(0)
          .setScrollFactor(0)
          .setDepth(2000)
          .setAlpha(0.8);
        this.scene.tweens.add({
          targets: rect,
          alpha: 0,
          duration: fx.duration,
          onComplete: () => rect.destroy()
        });
        break;
      }
      case 'SCREENSHAKE':
        this.scene.cameras.main.shake(fx.duration as number, (fx.intensity || 5) / 1000);
        break;
    }
  }

  applyHudFx(fx: any, context: any) {
    if (!this.hudScene) return;

    switch (fx.fx) {
      case 'STACK_TICK':
        this.hudScene.tickStack(fx.barId, fx.color);
        break;
      case 'BAR_DRAIN':
        this.hudScene.drainBar(fx.barId, fx.amount);
        break;
      case 'STATUS_ICON':
        this.hudScene.showStatusIcon(fx.iconKey, fx.duration);
        break;
      case 'TEXT_POP':
        this.hudScene.spawnFloatingText(fx.text, fx.color, context.target.x, context.target.y - 60);
        break;
    }
  }
}
