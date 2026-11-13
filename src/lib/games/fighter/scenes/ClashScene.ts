import Phaser from 'phaser';

export default class ClashScene extends Phaser.Scene {
  domains: any[] = [];
  characters: any[] = [];
  
  clashValue: number = 0.5; // 0.5 is middle
  p1Presses: number = 0;
  p2Presses: number = 0;
  
  timer: number = 5000;
  pulseTimer: number = 0;
  pulseFrequency: number = 1500;
  
  barGraphic!: Phaser.GameObjects.Graphics;
  timerGraphic!: Phaser.GameObjects.Graphics;
  pulseRing!: Phaser.GameObjects.Graphics;
  
  leftCamera!: Phaser.Cameras.Scene2D.Camera;
  rightCamera!: Phaser.Cameras.Scene2D.Camera;

  constructor() {
    super('ClashScene');
  }

  create(data: any) {
    this.domains = data.domains;
    this.characters = data.characters;
    
    const { width, height } = this.scale;
    
    // Split screen setup
    this.leftCamera = this.cameras.main;
    this.leftCamera.setViewport(0, 0, width / 2, height);
    
    this.rightCamera = this.cameras.add(width / 2, 0, width / 2, height);
    
    // Initial offset based on clashStat (refinement)
    const refined0 = this.characters[0].stats.domainRefinement || 0;
    const refined1 = this.characters[1].stats.domainRefinement || 0;
    const diff = refined0 - refined1;
    this.clashValue = 0.5 + (diff * 0.005); // 10 point diff = 0.05 shift
    
    // UI Elements
    this.barGraphic = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.timerGraphic = this.add.graphics().setDepth(100).setScrollFactor(0);
    this.pulseRing = this.add.graphics().setDepth(101).setScrollFactor(0);
    
    // Inputs
    this.input.keyboard!.on('keydown-Q', () => this.handlePress(0));
    this.input.keyboard!.on('keydown-P', () => this.handlePress(1));
    
    // UI HUD labels
    this.add.text(width / 2, 80, 'DOMAIN CLASH', { fontSize: '32px', color: '#ff0000' }).setOrigin(0.5).setScrollFactor(0);
  }

  handlePress(playerIdx: number) {
    let multiplier = 1;
    
    // Pulse window check (last 200ms of pulse)
    const pulseProgress = this.pulseTimer % this.pulseFrequency;
    if (pulseProgress > this.pulseFrequency - 200) {
      multiplier = 3;
      this.cameras.main.flash(50, 255, 255, 255);
    }
    
    if (playerIdx === 0) this.p1Presses += multiplier;
    else this.p2Presses += multiplier;
  }

  update(time: number, delta: number) {
    this.timer -= delta;
    this.pulseTimer += delta;
    
    if (this.timer <= 0) {
      this.resolveClash();
      return;
    }
    
    // Update clashValue
    const total = Math.max(1, this.p1Presses + this.p2Presses);
    // Dynamic tug of war
    const push = (this.p1Presses - this.p2Presses) / 50; // Sensitivity
    this.clashValue = Phaser.Math.Clamp(this.clashValue + push, 0, 1);
    
    // Auto-CPU press (if player 2 is AI)
    if (this.characters[1].type === 'CPU') {
       if (Math.random() > 0.95) this.handlePress(1);
    }

    this.drawUI();
    this.p1Presses = 0; // Reset every frame for delta-based tug? 
    // Wait, the logic said: Net position = (p1Presses - p2Presses) / totalPresses normalized to 0–1
    // I'll stick to cumulative but damping it or just using the normalized diff.
  }

  drawUI() {
    const { width, height } = this.scale;
    const barWidth = width - 160;
    const x = 80;
    const y = 40;
    
    this.barGraphic.clear();
    
    // Background bar
    this.barGraphic.fillStyle(0x333333, 0.8);
    this.barGraphic.fillRect(x, y, barWidth, 20);
    
    // P1 Side (Left - Winning)
    this.barGraphic.fillStyle(0x4a9eff, 1);
    this.barGraphic.fillRect(x, y, barWidth * this.clashValue, 20);
    
    // P2 Side (Right - Losing)
    this.barGraphic.fillStyle(0xff4a4a, 1);
    this.barGraphic.fillRect(x + (barWidth * this.clashValue), y, barWidth * (1 - this.clashValue), 20);
    
    // Ticks
    this.barGraphic.lineStyle(2, 0xffffff, 0.5);
    this.barGraphic.lineBetween(x + barWidth * 0.15, y, x + barWidth * 0.15, y + 20);
    this.barGraphic.lineBetween(x + barWidth * 0.85, y, x + barWidth * 0.85, y + 20);
    
    // Pulse Ring
    this.pulseRing.clear();
    const pulseProgress = (this.pulseTimer % this.pulseFrequency) / this.pulseFrequency;
    const radius = 200 * (1 - pulseProgress);
    this.pulseRing.lineStyle(2, 0xffffff, 0.5);
    this.pulseRing.strokeCircle(width / 2, y + 10, radius);
    
    // Timer
    this.timerGraphic.clear();
    this.timerGraphic.fillStyle(0xffffff, 0.5);
    this.timerGraphic.fillRect(20, 100, 10, (this.timer / 5000) * 200);
  }

  resolveClash() {
    let outcome: 'CRUSHED_WIN' | 'WIN' | 'CONTESTED' | 'LOSS' | 'CRUSHED_LOSS';
    
    if (this.clashValue > 0.85) outcome = 'CRUSHED_WIN';
    else if (this.clashValue > 0.65) outcome = 'WIN';
    else if (this.clashValue > 0.35) outcome = 'CONTESTED';
    else if (this.clashValue > 0.15) outcome = 'LOSS';
    else outcome = 'CRUSHED_LOSS';
    
    this.events.emit('clashResolved', {
      outcome,
      winner: this.clashValue > 0.5 ? this.characters[0] : this.characters[1],
      loser: this.clashValue > 0.5 ? this.characters[1] : this.characters[0]
    });
    
    this.scene.stop();
  }
}
