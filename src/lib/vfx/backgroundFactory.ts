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
    const domainProfile = profile.onDomainExpansion;
    if (!domainProfile) return;

    const { width, height } = this.scene.scale;

    // 1. Create a Graphics object for the mask
    const maskGraphics = this.scene.add.graphics().setDepth(-50); // Temporary depth
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillCircle(x, y, 0);
    const mask = maskGraphics.createGeometryMask();

    // 2. Create a temporary group for the transition elements
    const transitionGroup = this.scene.add.group();

    // 3. Setup New Background (Video or Base)
    // Always add a solid black bottom layer to prevent any transparency bleed
    const blackBase = this.scene.add.rectangle(0, 0, width, height, 0x000000)
      .setOrigin(0)
      .setDepth(-6)
      .setScrollFactor(0)
      .setMask(mask);
    transitionGroup.add(blackBase);

    if (profile.videoUrl) {
      const video = this.scene.add.video(-550, 50, 'domain_bg_video');
      video.setOrigin(0);
      video.setDepth(-5); // Forward of default BG (-10)
      video.setDisplaySize(480, 270);
      video.setScrollFactor(0);
      video.setMute(true);
      video.setMask(mask);

      video.setLoop(true);
      video.setMute(true);
      video.setMask(mask);
      video.play();
      transitionGroup.add(video);

      const overlay = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0.4)
        .setOrigin(0)
        .setDepth(-4)
        .setScrollFactor(0)
        .setMask(mask);
      transitionGroup.add(overlay);
    } else {
      const baseColor = parseInt(domainProfile.background.base.replace('#', ''), 16);
      const base = this.scene.add.rectangle(0, 0, width, height, baseColor)
        .setOrigin(0)
        .setDepth(-5)
        .setScrollFactor(0)
        .setMask(mask);
      transitionGroup.add(base);
    }

    // 4. Create additional layers
    domainProfile.background.layers.forEach((layer: any) => {
      // Logic from createLayer but localized to transitionGroup with mask
      const color = parseInt(layer.color.replace('#', ''), 16);
      const layerElement = this.createLayerElement(layer, color);
      if (layerElement) {
        layerElement.setMask(mask);
        transitionGroup.add(layerElement);
      }
    });

    // 5. Animate the Mask Expansion
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
        // Clear OLD background
        this.bgGroup.clear(true, true);

        // Transfer new elements to the stable bgGroup
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
