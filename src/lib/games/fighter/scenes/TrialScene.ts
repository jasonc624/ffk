import Phaser from 'phaser';

export default class TrialScene extends Phaser.Scene {
  constructor() {
    super('TrialScene');
  }

  create(data: any) {
    const { attacker, target, config } = data;
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);
    this.add.text(width / 2, height / 2 - 100, 'COURT IS IN SESSION', { fontSize: '48px', color: '#c9a84c' }).setOrigin(0.5);
    
    this.add.text(width / 2, height / 2, `DEFENDANT: ${target.name}`, { fontSize: '24px' }).setOrigin(0.5);
    
    this.time.delayedCall(2000, () => {
      this.add.text(width / 2, height / 2 + 50, 'VERDICT: GUILTY', { fontSize: '32px', color: '#ff0000' }).setOrigin(0.5);
      
      this.time.delayedCall(1000, () => {
        this.add.text(width / 2, height / 2 + 100, 'SENTENCE: CONFISCATION', { fontSize: '32px', color: '#ff0000' }).setOrigin(0.5);
        
        this.time.delayedCall(1000, () => {
          target.applyStatus('CONFISCATED', 10000);
          this.scene.stop();
        });
      });
    });
  }
}
