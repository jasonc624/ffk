import Phaser from 'phaser';

export default class HUDScene extends Phaser.Scene {
  playerHPBars: Phaser.GameObjects.Graphics[] = [];
  playerCEBars: Phaser.GameObjects.Graphics[] = [];
  playerNames: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('HUDScene');
  }

  create(data: any) {
    const { players } = data;
    
    // Cleanup old elements
    this.playerHPBars = [];
    this.playerCEBars = [];
    this.playerNames = [];

    // Listen to MainScene updates
    const mainScene = this.scene.get('MainScene');
    mainScene.events.on('updateHUD', (stats: any) => {
      this.drawPlayersHUD(stats.players);
    });
  }

  drawPlayersHUD(players: any[]) {
    // Clear graphics if they exist
    this.playerHPBars.forEach(b => b.clear());
    this.playerCEBars.forEach(b => b.clear());

    players.forEach((p, i) => {
      // Create if doesn't exist
      if (!this.playerHPBars[i]) {
        this.playerHPBars[i] = this.add.graphics();
        this.playerCEBars[i] = this.add.graphics();
        
        const isRightAligned = i % 2 !== 0;
        const x = isRightAligned ? this.scale.width - 220 : 20;
        const y = 30;

        this.playerNames[i] = this.add.text(x, y, p.name || 'Sorcerer', {
          fontFamily: 'Share Tech Mono',
          fontSize: '20px',
          color: '#ffffff'
        });
        if (isRightAligned) this.playerNames[i].setOrigin(1, 0).setX(this.scale.width - 20);
      }

      const isRightAligned = i % 2 !== 0;
      const x = isRightAligned ? this.scale.width - 220 : 20;
      const y = 60;
      const color = p.color ? parseInt(p.color.replace('#', ''), 16) : 0x4a9eff;

      // Draw Bars
      this.drawFramedBar(this.playerHPBars[i], x, y, 200, 12, p.hp * 2, color);
      this.drawFramedBar(this.playerCEBars[i], x, y + 18, 180, 6, p.ce * 1.8, 0x7ab8ff, 0.2);
    });
  }

  drawFramedBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fillW: number, color: number, bgAlpha = 0.2) {
    // Background
    g.fillStyle(0x000000, 0.5);
    g.fillRect(x, y, w, h);
    
    // Fill
    g.fillStyle(color, 1);
    g.fillRect(x, y, fillW, h);

    // Frame
    g.lineStyle(1, color, 0.5);
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);

    // Scanlines
    g.lineStyle(1, 0x000000, 0.2);
    for(let i = 0; i < w; i += 4) {
      g.lineBetween(x + i, y, x + i, y + h);
    }
  }
}
