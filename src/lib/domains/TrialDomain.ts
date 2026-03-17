import { Domain } from './Domain';
import type { Character } from '../entities/Character';

export class TrialDomain extends Domain {
  trialSystem: any;

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.trialSystem = config.trialSystem;
  }

  executeSureHit(target: Character) {
    // Launches TrialScene instead of applying effects directly
    this.scene.scene.launch('TrialScene', {
      attacker: (this.scene as any).getEntityById(this.ownerId),
      target: target,
      config: this.trialSystem
    });
  }

  onJudgemanDestroyed() {
    this.collapse('SHATTERED');
    this.status = 'SHATTERED'; // Permanent for some domains or special rules
  }
}
