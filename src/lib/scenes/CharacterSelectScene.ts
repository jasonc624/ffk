import Phaser from 'phaser';
import { ROSTER } from '../data/roster';
import type { CharacterData } from '../types/character';

/**
 * CharacterSelectScene — shown before PreloaderScene.
 * Renders a stylized fighter select grid from the hardcoded ROSTER.
 * On selection, stores the chosen CharacterData into scene's registry
 * (available to all scenes via this.registry.get('selectedCharacter')).
 */
export default class CharacterSelectScene extends Phaser.Scene {
  private selectedIndex: number = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private confirmText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private epithetText!: Phaser.GameObjects.Text;
  private techniqueText!: Phaser.GameObjects.Text;

  constructor() {
    super('CharacterSelectScene');
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────
    this.add.rectangle(0, 0, width, height, 0x050505).setOrigin(0);

    // Scanlines vibe
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(0, y, width, 1, 0x000000, 0.15).setOrigin(0);
    }

    // ── Header ──────────────────────────────────────────────────
    this.add.text(width / 2, 38, 'SELECT YOUR SORCERER', {
      fontFamily: 'Share Tech Mono',
      fontSize: '28px',
      color: '#10b981',
      letterSpacing: 8
    }).setOrigin(0.5);

    this.add.rectangle(width / 2, 70, 200, 1, 0x10b981, 0.4).setOrigin(0.5);

    // ── Character Cards ──────────────────────────────────────────
    const cardW = 220;
    const cardH = 300;
    const spacing = 280;
    const startX = width / 2 - ((ROSTER.length - 1) * spacing) / 2;
    const cardY = height / 2 - 20;

    ROSTER.forEach((char, i) => {
      const x = startX + i * spacing;
      const container = this.add.container(x, cardY);
      const colour = char.color ? parseInt(char.color.replace('#', ''), 16) : 0x10b981;

      // Card background
      const bg = this.add.rectangle(0, 0, cardW, cardH, 0x0a0a0a, 0.95)
        .setStrokeStyle(2, 0xffffff, 0.08);

      // Top coloured accent bar
      const accent = this.add.rectangle(0, -cardH / 2 + 4, cardW, 8, colour, 0.9).setOrigin(0.5, 0.5);

      // Sprite silhouette placeholder (tinted rectangle — will be replaced with actual sprite later)
      const silhouette = this.add.rectangle(0, -30, 80, 120, colour, 0.12)
        .setStrokeStyle(1, colour, 0.25);

      const initials = this.add.text(0, -30,
        char.name.split(' ').map((w: string) => w[0]).join(''), {
          fontFamily: 'Share Tech Mono',
          fontSize: '36px',
          color: char.color ?? '#10b981'
        }).setOrigin(0.5).setAlpha(0.6);

      // Name
      const nameTxt = this.add.text(0, 75, char.name.toUpperCase(), {
        fontFamily: 'Share Tech Mono',
        fontSize: '13px',
        color: '#ffffff'
      }).setOrigin(0.5);

      // Grade badge
      const gradeTxt = this.add.text(0, 98, char.perceived_grade.toUpperCase(), {
        fontFamily: 'Share Tech Mono',
        fontSize: '10px',
        color: char.color ?? '#10b981'
      }).setOrigin(0.5);

      // Technique name (small)
      const techTxt = this.add.text(0, 118, char.technique.name.toUpperCase(), {
        fontFamily: 'Share Tech Mono',
        fontSize: '9px',
        color: '#555'
      }).setOrigin(0.5);

      // Ability dots
      const abilitySlots = char.abilities ?? [];
      abilitySlots.forEach((ab, ai) => {
        const dotX = (ai - (abilitySlots.length - 1) / 2) * 22;
        const dot = this.add.circle(dotX, 140, 5, colour, 0.5)
          .setStrokeStyle(1, colour, 0.8);
        const kTxt = this.add.text(dotX, 140, ab.key, {
          fontFamily: 'Share Tech Mono', fontSize: '6px', color: '#888'
        }).setOrigin(0.5);
        container.add([dot, kTxt]);
      });

      container.add([bg, accent, silhouette, initials, nameTxt, gradeTxt, techTxt]);
      this.cards.push(container);

      // Click to select
      bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => this._hoverCard(i))
        .on('pointerout', () => this._unhoverCard(i))
        .on('pointerdown', () => {
          this.selectedIndex = i;
          this._updateSelection();
          this._selectCharacter(char);
        });
    });

    // ── Detail panel ─────────────────────────────────────────────
    const panelY = height - 145;

    this.nameText = this.add.text(width / 2, panelY, '', {
      fontFamily: 'Share Tech Mono', fontSize: '22px', color: '#ffffff'
    }).setOrigin(0.5);

    this.epithetText = this.add.text(width / 2, panelY + 28, '', {
      fontFamily: 'Share Tech Mono', fontSize: '13px', color: '#10b981'
    }).setOrigin(0.5);

    this.techniqueText = this.add.text(width / 2, panelY + 52, '', {
      fontFamily: 'Share Tech Mono', fontSize: '10px', color: '#555',
      wordWrap: { width: 600 }, align: 'center'
    }).setOrigin(0.5);

    this.confirmText = this.add.text(width / 2, height - 36, 'CLICK TO SELECT  /  PRESS ENTER TO CONFIRM', {
      fontFamily: 'Share Tech Mono', fontSize: '11px',
      color: '#333', letterSpacing: 3
    }).setOrigin(0.5);

    // ── Keyboard ─────────────────────────────────────────────────
    this.input.keyboard?.on('keydown-LEFT', () => {
      this.selectedIndex = (this.selectedIndex - 1 + ROSTER.length) % ROSTER.length;
      this._updateSelection();
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      this.selectedIndex = (this.selectedIndex + 1) % ROSTER.length;
      this._updateSelection();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      this._selectCharacter(ROSTER[this.selectedIndex]);
    });

    this._updateSelection();
  }

  private _updateSelection() {
    const char = ROSTER[this.selectedIndex];
    const colour = char.color ? parseInt(char.color.replace('#', ''), 16) : 0x10b981;

    this.cards.forEach((card, i) => {
      const isSelected = i === this.selectedIndex;
      card.setScale(isSelected ? 1.06 : 0.96);
      card.setAlpha(isSelected ? 1 : 0.5);
      // Update accent bar tint via first child (bg rect) border
      const bg = card.getAt(0) as Phaser.GameObjects.Rectangle;
      bg.setStrokeStyle(isSelected ? 2.5 : 1, isSelected ? colour : 0xffffff, isSelected ? 0.7 : 0.06);
    });

    const ceColour = char.color ?? '#10b981';
    this.nameText.setText(char.name.toUpperCase()).setColor('#ffffff');
    this.epithetText.setText(`"${char.epithet}"`).setColor(ceColour);
    this.techniqueText.setText(char.technique.description);

    // Pulse confirm text when selection changes
    this.tweens.add({
      targets: this.confirmText,
      alpha: { from: 0.3, to: 1 },
      duration: 300,
      ease: 'Power2'
    });
  }

  private _hoverCard(i: number) {
    if (i === this.selectedIndex) return;
    this.cards[i].setScale(1.02).setAlpha(0.75);
  }

  private _unhoverCard(i: number) {
    if (i === this.selectedIndex) return;
    this.cards[i].setScale(0.96).setAlpha(0.5);
  }

  private _selectCharacter(char: CharacterData) {
    // Store in Phaser's global registry — all scenes can read it
    this.game.registry.set('selectedCharacter', char);

    const colour = char.color ? parseInt(char.color.replace('#', ''), 16) : 0x10b981;

    // Flash transition
    const flash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, colour, 0)
      .setOrigin(0).setDepth(200);

    this.tweens.add({
      targets: flash,
      alpha: 0.6,
      duration: 180,
      yoyo: true,
      onComplete: () => {
        this.scene.start('PreloaderScene');
      }
    });
  }
}
