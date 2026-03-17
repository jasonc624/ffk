import type { Character } from '../entities/Character';

export type DomainStatus = 'READY' | 'ACTIVE' | 'COOLDOWN' | 'SHATTERED' | 'CLASHING';

export abstract class Domain {
  id: string;
  name: string;
  ownerId: string;
  cost: number;
  cooldownTurns: number;
  cooldownRemaining: number = 0;
  status: DomainStatus = 'READY';
  visualProfile: any;
  clashProfile: {
    clashStat: string;
    clashBonus: number;
    pulseFrequency: number;
    onCrushedWin?: string;
    onCrushedLoss?: string;
    onContested?: string;
  };
  themeMusic: Phaser.Sound.BaseSound | null = null;
  scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, config: {
    id: string;
    name: string;
    ownerId: string;
    cost: number;
    cooldownTurns: number;
    visualProfile: any;
    clashProfile: any;
  }) {
    this.scene = scene;
    this.id = config.id;
    this.name = config.name;
    this.ownerId = config.ownerId;
    this.cost = config.cost;
    this.cooldownTurns = config.cooldownTurns;
    this.visualProfile = config.visualProfile;
    this.clashProfile = {
      clashStat: 'domainRefinement',
      clashBonus: 0,
      pulseFrequency: 1500,
      ...config.clashProfile
    };
  }

  activate(owner: Character) {
    if (!this.canActivate(owner)) return;

    owner.spendCE(this.cost);

    // Check for clash
    const opponent = (this.scene as any).getOpponentOf(owner) as Character;
    if (opponent && opponent.activeDomain && opponent.activeDomain.status === 'ACTIVE') {
      this.status = 'CLASHING';
      this.scene.scene.launch('ClashScene', {
        domains: [this, opponent.activeDomain],
        characters: [owner, opponent]
      });
    } else {
      this.status = 'ACTIVE';

      // Play Sukuna Domain Voice + Theme
      if (this.scene.cache.audio.exists('sukuna_domain_voice')) {
        const voice = this.scene.sound.add('sukuna_domain_voice', { volume: 1 });
        voice.play();
        voice.once('complete', () => {
          if (this.scene.cache.audio.exists('sukuna_domain')) {
            this.themeMusic = this.scene.sound.add('sukuna_domain', { volume: 0, loop: false });
            this.themeMusic.play();
            this.scene.tweens.add({
              targets: this.themeMusic,
              volume: 0.8,
              duration: 1000
            });
          }
        });
      } else if (this.scene.cache.audio.exists('sukuna_domain')) {
        this.themeMusic = this.scene.sound.add('sukuna_domain', { volume: 0, loop: false });
        this.themeMusic.play();
        this.scene.tweens.add({
          targets: this.themeMusic,
          volume: 0.8,
          duration: 1000
        });
      }

      // Play domain expansion animation
      const texture = owner.sprite.texture.key;
      const animKey = `${texture}_domain`;
      owner.sprite.play(animKey, true);
      owner.isAttacking = true;

      // Handle the "Linger" effect: Wait for both background and animation
      let bgReady = false;
      let animDone = false;

      const checkReady = () => {
        if (bgReady && animDone) {
          // Linger on the last frame for 1 second after everything is set
          this.scene.time.delayedCall(1000, () => {
            owner.isAttacking = false;
            this.onExpanded(owner);
          });
        }
      };

      owner.sprite.once(`animationcomplete-${animKey}`, () => {
        animDone = true;
        checkReady();
      });

      (this.scene as any).bgFactory.activate(this.visualProfile, owner.sprite.x, owner.sprite.y, () => {
        bgReady = true;
        checkReady();
      });
    }
  }

  canActivate(owner: Character): boolean {
    if (this.status === 'SHATTERED' || this.status === 'COOLDOWN' || this.status === 'ACTIVE') return false;
    if (owner.cursedEnergy.current < this.cost) return false;
    return true;
  }

  collapse(reason: 'SHATTERED' | 'TIMEOUT' | 'LOST_CLASH') {
    this.status = reason === 'SHATTERED' || reason === 'LOST_CLASH' ? 'SHATTERED' : 'COOLDOWN';
    this.cooldownRemaining = this.cooldownTurns;
    if (reason === 'LOST_CLASH') this.cooldownRemaining *= 2;

    (this.scene as any).bgFactory.deactivate();

    // Stop Music
    if (this.themeMusic) {
      this.scene.tweens.add({
        targets: this.themeMusic,
        volume: 0,
        duration: 5000,
        onComplete: () => {
          this.themeMusic?.stop();
          this.themeMusic = null;
        }
      });
    }

    this.onCollapsed(reason);
  }

  tickCooldown(delta: number) {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= delta / 1000;
      if (this.cooldownRemaining <= 0) {
        this.cooldownRemaining = 0;
        this.status = 'READY';
      }
    }
  }

  abstract executeSureHit(target: Character): void;

  // Hooks
  onExpanded(owner: Character) { }
  onCollapsed(reason: string) { }
  onClashWon(losingDomain: Domain) { }
  onClashLost(winningDomain: Domain) { }
  getSureHitEffects(): any[] {
    return [];
  }
}
