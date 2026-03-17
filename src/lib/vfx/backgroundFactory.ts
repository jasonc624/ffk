import type { DomainConfig, UnifiedDomain } from '$lib/types';
import Phaser from 'phaser';

export class BackgroundFactory {
  scene: Phaser.Scene;
  bgGroup: Phaser.GameObjects.Group;
  baseOverlay: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bgGroup = scene.add.group();
  }

  activate(profile: any, x: number, y: number, onComplete?: () => void) {
    // Support both new direct domain and legacy onDomainExpansion structures
    const domain = (profile.domain || profile.onDomainExpansion?.domain || profile.onDomainExpansion) as any;
    if (!domain) return;
    const { width, height } = this.scene.scale;

    // Mask setup — unchanged
    const maskGraphics = this.scene.add.graphics().setDepth(-50);
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillCircle(x, y, 0);
    const mask = maskGraphics.createGeometryMask();
    const transitionGroup = this.scene.add.group();

    // Black base — unchanged
    const blackBase = this.scene.add.rectangle(0, 0, width, height, 0x000000)
      .setOrigin(0).setDepth(-6).setScrollFactor(0).setMask(mask);
    transitionGroup.add(blackBase);

    // ── BACKGROUND SELECTION ──
    if (domain?.scene_html && this.scene.textures.exists('domain_bg_canvas')) {
      // Preloader already snapshotted it — use as static image
      const bg = this.scene.add.image(0, 0, 'domain_bg_canvas')
        .setOrigin(0)
        .setDepth(-5)
        .setScrollFactor(0)
        .setDisplaySize(width, height)
        .setMask(mask);
      transitionGroup.add(bg);

      // Overlay particles + rays driven by domain.config
      if (domain.config) {
        this.addDomainOverlay(domain.config, mask, transitionGroup);
      }

      // Darkening overlay — same as video path
      const overlay = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.35)
        .setOrigin(0).setDepth(-4).setScrollFactor(0).setMask(mask);
      transitionGroup.add(overlay);

    } else if (profile.videoUrl) {
      // Existing video path — unchanged
      const video = this.scene.add.video(-550, 50, 'domain_bg_video');
      video.setOrigin(0).setDepth(-5).setDisplaySize(480, 270)
        .setScrollFactor(0).setMute(true).setMask(mask).setLoop(true).play();
      transitionGroup.add(video);

      const overlay = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.4)
        .setOrigin(0).setDepth(-4).setScrollFactor(0).setMask(mask);
      transitionGroup.add(overlay);

    } else if (domain.background?.base) {
      // Existing base color fallback — unchanged
      const baseColor = parseInt(domain.background.base.replace('#', ''), 16);
      const base = this.scene.add.rectangle(0, 0, width, height, baseColor)
        .setOrigin(0).setDepth(-5).setScrollFactor(0).setMask(mask);
      transitionGroup.add(base);
    }

    // Existing layers — unchanged
    domain.background?.layers?.forEach((layer: any) => {
      const color = parseInt(layer.color.replace('#', ''), 16);
      const layerElement = this.createLayerElement(layer, color);
      if (layerElement) { layerElement.setMask(mask); transitionGroup.add(layerElement); }
    });

    // Mask expansion tween — unchanged
    const maxRadius = Math.sqrt(width * width + height * height);
    this.scene.tweens.add({
      targets: { radius: 0 },
      radius: maxRadius,
      duration: 1200,
      ease: 'Cubic.easeInOut',
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        const radius = tween.getValue() as number;
        maskGraphics.clear();
        maskGraphics.fillStyle(0xffffff);
        maskGraphics.fillCircle(x, y, radius);
      },
      onComplete: () => {
        this.bgGroup.clear(true, true);
        transitionGroup.getChildren().forEach((child: any) => {
          child.clearMask();
          this.bgGroup.add(child);
        });
        transitionGroup.destroy();
        maskGraphics.destroy();
        if (onComplete) onComplete();
      }
    });
  }

  private addDomainOverlay(
    config: DomainConfig,
    mask: Phaser.Display.Masks.GeometryMask,
    group: Phaser.GameObjects.Group
  ) {
    const { width, height } = this.scene.scale;

    // ── PARTICLES ──
    const p = config.particles;
    const particleColor = Phaser.Display.Color.HSLToColor(
      p.hue / 360, p.saturation / 100, 0.6
    ).color;

    // Map particle type to existing textures
    const textureMap: Record<string, string> = {
      dust: 'tex_spark',
      ember: 'tex_orb',
      ash: 'tex_spark',
      petals: 'tex_shard',
      shards: 'tex_shard',
      snow: 'tex_orb',
      sparks: 'tex_spark'
    };
    const tex = textureMap[p.type] ?? 'tex_spark';

    const speedConfig = {
      up: { speedY: { min: -p.speed * 80000, max: -p.speed * 20000 }, speedX: { min: -20, max: 20 } },
      down: { speedY: { min: p.speed * 20000, max: p.speed * 80000 }, speedX: { min: -20, max: 20 } },
      radial: { speed: { min: p.speed * 20000, max: p.speed * 60000 } }
    }[p.riseDirection];

    const emitter = this.scene.add.particles(0, 0, tex, {
      x: { min: 0, max: width },
      y: p.riseDirection === 'up' ? height + 20 : -20,
      ...speedConfig,
      lifespan: 3000,
      alpha: { start: p.opacity, end: 0 },
      tint: particleColor,
      scale: { min: p.size * 0.1, max: p.size * 0.3 },
      frequency: Math.round(3000 / p.count),
      blendMode: Phaser.BlendModes.ADD
    })
      .setDepth(-3)
      .setScrollFactor(0)
      .setMask(mask);
    group.add(emitter);

    // ── GOD RAYS ──
    if (config.rays.enabled) {
      const r = config.rays;
      const rayColor = parseInt(r.color.replace('#', ''), 16);
      const rayGraphics = this.scene.add.graphics()
        .setDepth(-3).setScrollFactor(0).setMask(mask);

      let rayT = 0;
      this.scene.events.on('update', (_time: number, delta: number) => {
        if (!rayGraphics.active) return;
        rayT += delta * 0.001;

        rayGraphics.clear();

        const baseX = width * r.xPosition + Math.sin(rayT * 0.3) * width * r.sway;
        const spreadW = width * r.width;
        const angle = r.angle ?? 0;

        for (let i = 0; i < r.count; i++) {
          const offset = (i - (r.count - 1) / 2) * spreadW * 0.5;
          const rx = baseX + offset;
          const intensity = r.intensity * (0.6 + Math.sin(rayT * 0.8 + i * 1.3) * 0.4);

          // Draw ray as a thin tapered triangle
          const topX = rx + Math.sin(angle) * 10;
          const bottomLeftX = rx - spreadW * 0.5 + Math.sin(angle) * height;
          const bottomRightX = rx + spreadW * 0.5 + Math.sin(angle) * height;

          // Fade from top (transparent) to mid (peak) — use layered rects for gradient fake
          for (let s = 0; s < 8; s++) {
            const sy = (s / 8) * height;
            const sw = spreadW * (s / 8);
            const sa = intensity * (s < 4
              ? s / 4
              : 1 - (s - 4) / 4
            ) * 0.15;
            rayGraphics.fillStyle(rayColor, sa);
            rayGraphics.fillTriangle(
              topX, 0,
              rx - sw * 0.5, sy,
              rx + sw * 0.5, sy
            );
          }
        }
      });
      group.add(rayGraphics);
    }
  }

  // Helper to create layer elements (refactored from createLayer)
  private createLayerElement(layer: any, color: number): any {
    const { width, height } = this.scene.scale;
    switch (layer.type) {
      case 'CIRCUIT_LAVA': {
        const ts = this.scene.add.tileSprite(0, 0, width, height, 'tex_circuit')
          .setOrigin(0).setDepth(-90).setAlpha(layer.opacity).setTint(color).setScrollFactor(0);
        this.scene.events.on('update', () => { if (ts.active) { ts.tilePositionX += (layer.speed ?? 0) * 10; ts.tilePositionY += (layer.speed ?? 0) * 5; } });
        return ts;
      }
      case 'CODE_RAIN': {
        return this.scene.add.particles(0, 0, 'tex_glyph', {
          x: { min: 0, max: width }, y: -20, speedY: { min: 100, max: 300 }, speedX: { min: -10, max: 10 },
          lifespan: 2000, alpha: layer.opacity, tint: color, frequency: 50, scale: { min: 0.5, max: 1 }
        }).setDepth(-90).setScrollFactor(0);
      }
      case 'VOID_GRID': {
        const g = this.scene.add.graphics().setDepth(-90).setScrollFactor(0);
        const vanishingPoint = { x: width / 2, y: height * 0.3 };
        this.scene.events.on('update', () => {
          if (!g.active) return;
          g.clear();
          const pulse = (Math.sin(this.scene.time.now / 500) + 1) / 2;
          g.lineStyle(2, color, layer.opacity * pulse);
          for (let i = 0; i <= 10; i++) g.moveTo((width / 10) * i, height).lineTo(vanishingPoint.x, vanishingPoint.y);
          for (let i = 0; i <= 5; i++) g.moveTo(0, vanishingPoint.y + (height - vanishingPoint.y) * (i / 5)).lineTo(width, vanishingPoint.y + (height - vanishingPoint.y) * (i / 5));
        });
        return g;
      }
      case 'BONE_FIELD': {
        const container = this.scene.add.container(0, 0).setDepth(-90).setScrollFactor(0);
        for (let i = 0; i < 50; i++) {
          const x = Phaser.Math.Between(0, width);
          const y = Phaser.Math.Between(height - 100, height);
          const shard = this.scene.add.image(x, y, 'tex_shard')
            .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
            .setAlpha(layer.opacity)
            .setTint(color);
          container.add(shard);
        }
        return container;
      }
      case 'WATER_MIRROR': {
        const g = this.scene.add.graphics().setDepth(-90).setScrollFactor(0);
        this.scene.events.on('update', () => {
          if (!g.active) return;
          g.clear();
          const wave = Math.sin(this.scene.time.now / 1000) * 10;
          g.fillStyle(color, layer.opacity);
          g.fillRect(0, height - 80 + wave, width, 80);
        });
        return g;
      }
      case 'STAR_COLLAPSE': {
        return this.scene.add.particles(width / 2, height / 2, 'tex_orb', {
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, width, height) } as any,
          speed: -200, lifespan: 1000, alpha: layer.opacity, tint: color, scale: { start: 1, end: 0 }
        }).setDepth(-90).setScrollFactor(0);
      }
      case 'FOREST_DARK': {
        const g = this.scene.add.graphics().setDepth(-90).setScrollFactor(0);
        g.fillStyle(color, layer.opacity);
        for (let i = 0; i < 15; i++) {
          const x = (width / 15) * i;
          const h = Phaser.Math.Between(100, 300);
          g.fillRect(x, height - h, 30, h);
          g.fillTriangle(x - 20, height - h, x + 50, height - h, x + 15, height - h - 50);
        }
        return g;
      }
      case 'SAND_STORM': {
        return this.scene.add.particles(0, 0, 'tex_spark', {
          x: { min: 0, max: width }, y: height + 20, speedY: { min: -100, max: -300 }, speedX: { min: -50, max: 50 },
          lifespan: 1500, alpha: layer.opacity, tint: color, frequency: 20
        }).setDepth(-90).setScrollFactor(0);
      }
      default: return null;
    }
  }

  createLayer(layer: any) {
    const color = parseInt(layer.color.replace('#', ''), 16);
    const element = this.createLayerElement(layer, color);
    if (element) this.bgGroup.add(element);
  }

  deactivate(onComplete: () => void) {
    this.scene.tweens.add({
      targets: Array.from(this.bgGroup.getChildren()),
      alpha: 0,
      duration: 600,
      onComplete: () => {
        this.bgGroup.clear(true, true);
        if (onComplete) onComplete();
      }
    });
  }
}
