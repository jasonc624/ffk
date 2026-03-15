import Phaser from 'phaser';

export class BackgroundFactory {
  scene: Phaser.Scene;
  bgGroup: Phaser.GameObjects.Group;
  baseOverlay: Phaser.GameObjects.Rectangle | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bgGroup = scene.add.group();
  }

  activate(profile: any, onComplete: () => void) {
    const domainProfile = profile.onDomainExpansion;
    if (!domainProfile) return;

    // Fade out current background (simulated by a black fade)
    const fadeRect = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, 0x000000)
      .setOrigin(0)
      .setDepth(-100)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: fadeRect,
      alpha: 1,
      duration: 400,
      onComplete: () => {
        // Clear previous background elements if any
        this.bgGroup.clear(true, true);

        // Fill with base color
        const baseColor = parseInt(domainProfile.background.base.replace('#', ''), 16);
        this.baseOverlay = this.scene.add.rectangle(0, 0, this.scene.scale.width, this.scene.scale.height, baseColor)
          .setOrigin(0)
          .setDepth(-101);
        this.bgGroup.add(this.baseOverlay);

        // Render each layer
        domainProfile.background.layers.forEach((layer: any) => {
          this.createLayer(layer);
        });

        fadeRect.destroy();
        if (onComplete) onComplete();
      }
    });
  }

  createLayer(layer: any) {
    const color = parseInt(layer.color.replace('#', ''), 16);
    const { width, height } = this.scene.scale;

    switch (layer.type) {
      case 'CIRCUIT_LAVA': {
        // Generate a simple circuit texture
        const g = this.scene.make.graphics({ x: 0, y: 0 });
        g.lineStyle(2, 0xffffff, 0.5);
        g.strokeRect(0, 0, 64, 64);
        g.moveTo(32, 0).lineTo(32, 64);
        g.moveTo(0, 32).lineTo(64, 32);
        g.generateTexture('tex_circuit', 64, 64);
        g.destroy();

        const ts = this.scene.add.tileSprite(0, 0, width, height, 'tex_circuit')
          .setOrigin(0)
          .setDepth(-90)
          .setAlpha(layer.opacity)
          .setTint(color);
        
        this.scene.events.on('update', () => {
          if (ts.active) {
            ts.tilePositionX += layer.speed * 10;
            ts.tilePositionY += layer.speed * 5;
          }
        });
        this.bgGroup.add(ts);
        break;
      }
      case 'CODE_RAIN': {
        const emitter = this.scene.add.particles(0, 0, 'tex_glyph', {
          x: { min: 0, max: width },
          y: -20,
          speedY: { min: 100, max: 300 },
          speedX: { min: -10, max: 10 },
          lifespan: 2000,
          alpha: layer.opacity,
          tint: color,
          frequency: 50,
          scale: { min: 0.5, max: 1 }
        }).setDepth(-90);
        this.bgGroup.add(emitter);
        break;
      }
      case 'VOID_GRID': {
        const g = this.scene.add.graphics().setDepth(-90);
        const vanishingPoint = { x: width / 2, y: height * 0.3 };
        this.scene.events.on('update', () => {
          if (!g.active) return;
          g.clear();
          const pulse = (Math.sin(this.scene.time.now / 500) + 1) / 2;
          g.lineStyle(2, color, layer.opacity * pulse);
          
          // Draw grid
          for (let i = 0; i <= 10; i++) {
            const x = (width / 10) * i;
            g.moveTo(x, height).lineTo(vanishingPoint.x, vanishingPoint.y);
          }
          for (let i = 0; i <= 5; i++) {
            const y = vanishingPoint.y + (height - vanishingPoint.y) * (i / 5);
            g.moveTo(0, y).lineTo(width, y);
          }
        });
        this.bgGroup.add(g);
        break;
      }
      case 'BONE_FIELD': {
        for (let i = 0; i < 50; i++) {
          const x = Phaser.Math.Between(0, width);
          const y = Phaser.Math.Between(height - 100, height);
          const shard = this.scene.add.image(x, y, 'tex_shard')
            .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
            .setAlpha(layer.opacity)
            .setTint(color)
            .setDepth(-90);
          this.bgGroup.add(shard);
        }
        break;
      }
      case 'WATER_MIRROR': {
        const g = this.scene.add.graphics().setDepth(-90);
        this.scene.events.on('update', () => {
          if (!g.active) return;
          g.clear();
          const wave = Math.sin(this.scene.time.now / 1000) * 10;
          g.fillStyle(color, layer.opacity);
          g.fillRect(0, height - 80 + wave, width, 80);
        });
        this.bgGroup.add(g);
        break;
      }
      case 'STAR_COLLAPSE': {
        const emitter = this.scene.add.particles(width / 2, height / 2, 'tex_orb', {
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 0, width, height) } as any,
          speed: -200,
          lifespan: 1000,
          alpha: layer.opacity,
          tint: color,
          scale: { start: 1, end: 0 }
        }).setDepth(-90).setPosition(width / 2, height / 2);
        // Important: manually move particles to center
        this.bgGroup.add(emitter);
        break;
      }
      case 'FOREST_DARK': {
        const g = this.scene.add.graphics().setDepth(-90);
        g.fillStyle(color, layer.opacity);
        for (let i = 0; i < 15; i++) {
          const x = (width / 15) * i;
          const h = Phaser.Math.Between(100, 300);
          g.fillRect(x, height - h, 30, h);
          g.fillTriangle(x - 20, height - h, x + 50, height - h, x + 15, height - h - 50);
        }
        this.bgGroup.add(g);
        break;
      }
      case 'SAND_STORM': {
        const emitter = this.scene.add.particles(0, 0, 'tex_spark', {
          x: { min: 0, max: width },
          y: height + 20,
          speedY: { min: -100, max: -300 },
          speedX: { min: -50, max: 50 },
          lifespan: 1500,
          alpha: layer.opacity,
          tint: color,
          frequency: 20
        }).setDepth(-90);
        this.bgGroup.add(emitter);
        break;
      }
    }
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
