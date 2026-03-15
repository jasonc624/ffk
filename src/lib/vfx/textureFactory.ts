import Phaser from 'phaser';

export function preloadTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 });

  // tex_glyph
  const glyphs = ['✗', '//', '0x', '??', ';;'];
  const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
  
  // Glyph creation using canvas for text
  const canvasGlyph = document.createElement('canvas');
  canvasGlyph.width = 32;
  canvasGlyph.height = 32;
  const ctx = canvasGlyph.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 16, 16);
    scene.textures.addCanvas('tex_glyph', canvasGlyph);
  }

  // tex_orb
  g.clear();
  // Simplified radial-like gradient using concentric circles
  for (let r = 8; r > 0; r--) {
    g.fillStyle(0xffffff, r / 8);
    g.fillCircle(8, 8, r);
  }
  g.generateTexture('tex_orb', 16, 16);

  // tex_shard
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(6, 0, 0, 20, 12, 20);
  g.generateTexture('tex_shard', 12, 20);

  // tex_vapor
  g.clear();
  for (let r = 12; r > 0; r--) {
    g.fillStyle(0xffffff, (r / 12) * 0.3);
    g.fillCircle(12, 12, r);
  }
  g.generateTexture('tex_vapor', 24, 24);

  // tex_spark
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 2, 12);
  g.generateTexture('tex_spark', 2, 12);

  // tex_ring
  g.clear();
  g.lineStyle(2, 0xffffff, 1);
  g.strokeCircle(10, 10, 8);
  g.generateTexture('tex_ring', 20, 20);

  // tex_orb_soft — true circle with gaussian-style falloff
  g.clear();
  for (let r = 16; r >= 1; r--) {
    const alpha = (1 - r / 16) * 0.9;
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(16, 16, r);
  }
  g.generateTexture('tex_orb_soft', 32, 32);

  // tex_wisp — tall oval, not square
  g.clear();
  for (let i = 8; i >= 1; i--) {
    const alpha = (1 - i / 8) * 0.85;
    g.fillStyle(0xffffff, alpha);
    g.fillEllipse(10, 20, i * 2, i * 3.5);
  }
  g.generateTexture('tex_wisp', 20, 40);

  // tex_spark_line — thin diagonal line, not a rectangle
  g.clear();
  g.lineStyle(1.5, 0xffffff, 1);
  g.beginPath();
  g.moveTo(3, 0);
  g.lineTo(0, 14);
  g.strokePath();
  g.generateTexture('tex_spark_line', 6, 14);

  g.destroy();
}
