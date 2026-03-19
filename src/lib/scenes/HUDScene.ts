import Phaser from 'phaser';

export default class HUDScene extends Phaser.Scene {
  playerHPBars: Phaser.GameObjects.Graphics[] = [];
  playerCEBars: Phaser.GameObjects.Graphics[] = [];
  playerNames: Phaser.GameObjects.Text[] = [];
  abilityIcons: Map<string, any> = new Map();

  constructor() {
    super('HUDScene');
  }

  create(data: any) {
    // Cleanup old elements
    this.playerHPBars = [];
    this.playerCEBars = [];
    this.playerNames = [];

    // Listen to MainScene updates
    const mainScene = this.scene.get('MainScene');
    mainScene.events.on('updateHUD', (stats: any) => {
      this.drawPlayersHUD(stats.players);
      const p1 = stats.players.find((p: any) => p.id === 'p1');
      if (p1) this.drawAbilityBar(p1);
    });
  }

  drawPlayersHUD(players: any[]) {
    this.playerHPBars.forEach(b => b.clear());
    this.playerCEBars.forEach(b => b.clear());

    players.forEach((p, i) => {
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

      this.drawFramedBar(this.playerHPBars[i], x, y, 200, 12, p.hp * 2, color);
      this.drawFramedBar(this.playerCEBars[i], x, y + 18, 180, 6, p.ce * 1.8, 0x7ab8ff, 0.2);
    });
  }

  drawAbilityBar(player: any) {
    const { width, height } = this.scale;
    const slotW = 48;
    const spacing = 58;
    const startX = 20 + slotW / 2;          // 20px margin from left edge
    const centerY = height - slotW / 2 - 20; // 20px margin from bottom edge

    const allAbilities = [
        { slot: 'Light', key: 'J', name: 'Light', cooldownFraction: 1, remainingCooldown: 0 },
        { slot: 'Heavy', key: 'K', name: 'Heavy', cooldownFraction: 1, remainingCooldown: 0 },
        ...player.abilities,
        { slot: 'Domain', key: 'Q', name: 'Domain', cooldownFraction: player.canExpandDomain ? 1 : 0, remainingCooldown: 0 }
    ];

    allAbilities.forEach((ability: any, i: number) => {
        const x = startX + i * spacing;
        let elements = this.abilityIcons.get(ability.slot);
        
        if (!elements) {
            const container = this.add.container(x, centerY);
            
            // BG Glass
            const bg = this.add.rectangle(0, 0, slotW, slotW, 0x000000, 0.5)
                .setStrokeStyle(2, 0xffffff, 0.12)
                .setDepth(10);
            
            // Fill Cooldown (sweeps up from bottom)
            const fill = this.add.rectangle(0, slotW / 2, slotW, 0, 0xffffff, 0.15)
                .setOrigin(0.5, 1)
                .setDepth(11);
            
            // Key badge (top-left corner of slot)
            const keyBg = this.add.rectangle(0, -slotW / 2 - 8, 20, 15, 0x000000, 0.85)
                .setStrokeStyle(1, 0xffcc00, 0.6)
                .setDepth(15);
            const keyTxt = this.add.text(0, -slotW / 2 - 8, ability.key, {
                fontSize: '10px', color: '#ffcc00', fontFamily: 'Share Tech Mono'
            }).setOrigin(0.5).setDepth(16);

            const nameTxt = this.add.text(0, slotW / 2 + 6, ability.name.toUpperCase(), {
                fontSize: '8px', color: '#666666', letterSpacing: 1, fontFamily: 'Share Tech Mono'
            }).setOrigin(0.5).setDepth(15);

            const cdTxt = this.add.text(0, 0, '', {
                fontSize: '18px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Share Tech Mono'
            }).setOrigin(0.5).setDepth(20);

            container.add([bg, fill, keyBg, keyTxt, nameTxt, cdTxt]);
            elements = { container, fill, cdTxt, bg };
            this.abilityIcons.set(ability.slot, elements);
        }

        // Update Cooldown Visuals
        const isDomainSlot = ability.slot === 'Domain' && !player.canExpandDomain;
        const isCooldown = ability.remainingCooldown > 0 || isDomainSlot;
        
        elements.fill.height = isCooldown ? slotW * (1 - ability.cooldownFraction) : 0;
        elements.container.alpha = isCooldown ? 0.55 : 1;
        
        if (ability.remainingCooldown > 0) {
            elements.cdTxt.setText(Math.ceil(ability.remainingCooldown / 1000).toString());
        } else if (ability.slot === 'Domain' && !player.canExpandDomain) {
            elements.cdTxt.setText('🔒');
        } else {
            elements.cdTxt.setText('');
        }

        // Border: green when ready, subtle when on cooldown
        if (ability.remainingCooldown <= 0 && !isDomainSlot) {
            elements.bg.setStrokeStyle(2, 0x10b981, 0.7);
        } else {
            elements.bg.setStrokeStyle(2, 0xffffff, 0.1);
        }
    });
  }

  drawFramedBar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fillW: number, color: number, bgAlpha = 0.2) {
    g.fillStyle(0x000000, 0.5);
    g.fillRect(x, y, w, h);
    g.fillStyle(color, 1);
    g.fillRect(x, y, fillW, h);
    g.lineStyle(1, color, 0.5);
    g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    g.lineStyle(1, 0x000000, 0.2);
    for(let i = 0; i < w; i += 4) {
      g.lineBetween(x + i, y, x + i, y + h);
    }
  }

  // Clash UI Methods
  showClashIndicator(winnerName: string) {
    const txt = this.add.text(this.scale.width / 2, 100, `CLASH WINNER: ${winnerName}`, {
      fontSize: '32px',
      color: '#ffcc00',
      fontFamily: 'Share Tech Mono'
    }).setOrigin(0.5);
    
    this.tweens.add({
      targets: txt,
      y: 150,
      alpha: 0,
      duration: 2000,
      onComplete: () => txt.destroy()
    });
  }

  tickStack(barId: string, color: string) {
    this.spawnFloatingText('+STACK', color, 120, 110);
  }

  drainBar(barId: string, amount: number) {
    const text = this.add.text(this.scale.width / 2, this.scale.height - 100, `-${amount} ${barId}`, {
      fontFamily: 'Share Tech Mono',
      fontSize: '20px',
      color: '#ff0000'
    }).setOrigin(0.5);
    
    this.tweens.add({
      targets: text,
      y: text.y - 50,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy()
    });
  }

  showStatusIcon(iconKey: string, duration: number) {
    // Basic icon pop
    const icon = this.add.text(this.scale.width - 50, 150, '⚠️', { fontSize: '32px' }).setOrigin(0.5);
    this.time.delayedCall(duration, () => icon.destroy());
  }

  spawnFloatingText(text: string, color: string, x: number, y: number) {
    const txt = this.add.text(x, y, text, {
      fontFamily: 'Share Tech Mono',
      fontSize: '24px',
      color: color || '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: txt.y - 80,
      alpha: 0,
      duration: 1500,
      onComplete: () => txt.destroy()
    });
  }
}
