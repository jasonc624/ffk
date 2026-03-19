import Phaser from 'phaser';
import { getCharacter } from '../storage';
import type { CharacterData } from '../types/character';
import { SUMMON_REGISTRY } from '../entities/registry';
import { preloadTextures } from '../vfx/textureFactory';
import { DomainSceneCapture } from '../vfx/DomainSceneCapture';
import type { UnifiedDomain } from '../types/domain';

export default class PreloaderScene extends Phaser.Scene {
  private characterData: CharacterData | null = null;
  private loadingText!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressBox!: Phaser.GameObjects.Graphics;

  private currentPhaseIndex = 0;
  private phases = [
    { id: 'ASSETS', label: 'Harmonizing Cursed Energy' },
    { id: 'TECHNIQUE', label: 'Imprinting Innate Technique' },
    { id: 'DOMAIN', label: 'Constructing Inner Domain' },
    { id: 'READY', label: 'Ready to Manifest' }
  ];

  constructor() {
    super('PreloaderScene');
  }

  init() {
    // Prefer character chosen in CharacterSelectScene (game registry).
    // Fall back to localStorage for the existing character-creator flow.
    const fromSelect = this.game.registry.get('selectedCharacter');
    this.characterData = fromSelect ?? getCharacter();
  }

  preload() {
    const { width, height } = this.scale;

    // Create Loading UI
    this.createLoadingUI(width, height);

    // Phaser Load Events
    this.load.on('progress', (value: number) => {
      this.updateProgressBar(value);
    });

    this.load.on('fileprogress', (file: any) => {
      // Could show individual file names if needed
    });

    this.load.on('complete', () => {
      this.advancePhase();
    });

    // START LOADING ASSETS
    this.updatePhaseLabel();
    
    // Core Textures
    preloadTextures(this);

    // Core Players
    this.load.spritesheet('character', '/assets/sprites.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('rival_sprite', '/assets/smallpox_deity.png', { frameWidth: 128, frameHeight: 128 });

    // Summons from Registry
    Object.values(SUMMON_REGISTRY).forEach(config => {
      this.load.spritesheet(config.texture, config.assetPath, config.frameConfig);
    });

    this.load.image('shibuya_bg', '/assets/shibuya_station.jpg');

    // Load Sounds
    this.load.audio('sukuna_domain', '/assets/sounds/sukuna_domain_theme.mp3');
    this.load.audio('sukuna_domain_voice', '/assets/sounds/domain_expansion_sukuna.mp3');
    this.load.audio('blackflash', '/assets/sounds/blackflash.mp3');
    this.load.audio('energy', '/assets/sounds/energy.mp3');
    this.load.audio('transition', '/assets/sounds/transition.mp3');

    // Domain background handling
    if (this.characterData) {
      this.preloadDomainBackground(this.characterData);
    }
  }

  async preloadDomainBackground(profile: any) {
    const domain = profile.onDomainExpansion?.domain as UnifiedDomain | undefined;
    
    // Fallback if the profile structure is different (some characters have domain at top level)
    const activeDomain = domain || profile.domain as UnifiedDomain | undefined;
    
    if (!activeDomain) return;

    if (activeDomain.scene_html) {
      console.log('[Preloader] Snapshotting HTML domain scene...');
      // Snapshot the HTML scene to a texture before the game scene loads
      await DomainSceneCapture.capture(this, activeDomain.scene_html, 'domain_bg_canvas');
    } else if (activeDomain.video_url) {
      console.log('[Preloader] Preloading domain video:', activeDomain.video_url);
      this.load.video('domain_bg_video', activeDomain.video_url, true);
    }
  }

  create() {
    // If we reach here, 'complete' event fired, so we are at least at phase 1
    // We can simulate some delay for "flavor" phases if we want, 
    // or just transition when our custom logic is done.
    
    // For now, since most loading is done via Phaser's loader, 
    // we'll wait for a small delay to show the last phase and then start.
    this.time.delayedCall(800, () => {
        this.scene.start('MainScene');
    });
  }

  private createLoadingUI(width: number, height: number) {
    const ceColor = this.characterData?.color ? parseInt(this.characterData.color.replace('#', ''), 16) : 0x10b981;

    this.progressBox = this.add.graphics();
    this.progressBar = this.add.graphics();

    this.progressBox.fillStyle(0x222222, 0.8);
    this.progressBox.fillRect(width / 2 - 160, height / 2 + 50, 320, 10);

    this.loadingText = this.make.text({
      x: width / 2,
      y: height / 2 - 50,
      text: 'AWAKENING',
      style: {
        font: '32px "Cinzel Decorative"',
        color: '#ffffff'
      }
    }).setOrigin(0.5, 0.5);

    this.phaseText = this.make.text({
      x: width / 2,
      y: height / 2 + 80,
      text: 'Initializing...',
      style: {
        font: '14px monospace',
        color: '#888888'
      }
    }).setOrigin(0.5, 0.5);

    // Decorative elements
    this.add.circle(width / 2, height / 2, 100, ceColor, 0.05).setStrokeStyle(1, ceColor, 0.2);
  }

  private updateProgressBar(value: number) {
    const { width, height } = this.scale;
    const ceColor = this.characterData?.color ? parseInt(this.characterData.color.replace('#', ''), 16) : 0x10b981;
    
    this.progressBar.clear();
    this.progressBar.fillStyle(ceColor, 1);
    this.progressBar.fillRect(width / 2 - 160, height / 2 + 50, 320 * value, 10);
  }

  private advancePhase() {
    if (this.currentPhaseIndex < this.phases.length - 1) {
      this.currentPhaseIndex++;
      this.updatePhaseLabel();
    }
  }

  private updatePhaseLabel() {
    const phase = this.phases[this.currentPhaseIndex];
    if (this.phaseText) {
      this.phaseText.setText(phase.label.toUpperCase());
    }
  }
}
