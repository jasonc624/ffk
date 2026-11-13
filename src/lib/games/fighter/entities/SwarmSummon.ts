import Phaser from 'phaser';
import { Summon } from './Summon';
import type { Character } from './Character';

export class SwarmSummon extends Summon {
  count: number;
  instances: Phaser.Physics.Arcade.Sprite[] = [];

  constructor(scene: Phaser.Scene, config: any) {
    super(scene, config);
    this.count = config.count || 20;
  }

  spawn(x: number, y: number) {
    // Swarm doesn't have a single sprite/hurtbox in the inheritance sense
    // We override summon and destroy to handle multiple instances
    const texture = (this as any).config?.texture || 'rabbit';
    for (let i = 0; i < this.count; i++) {
      const s = this.scene.physics.add.sprite(
        x + Phaser.Math.Between(-50, 50),
        y + Phaser.Math.Between(-50, 50),
        texture
      );
      s.setScale(0.3);
      s.setVelocity(Phaser.Math.Between(-200, 200), Phaser.Math.Between(-200, 200));
      s.setCollideWorldBounds(true);
      this.instances.push(s);
    }
    
    // Create a dummy hurtbox to satisfy super.destroy/sync
    this.hurtbox = this.scene.add.rectangle(x, y, 1, 1, 0x000, 0);
  }

  summon(x: number, y: number, summoner: Character) {
    if (this.status !== 'AVAILABLE') return;
    if (!summoner.spendCE(this.cost.cursedEnergy)) return;

    this.team = summoner.team;
    this.status = 'ACTIVE';
    this.spawn(x, y);
    this.onSummoned();
  }

  onDeath() {
    this.status = 'RECOVERY';
    this.despawn();
  }

  despawn() {
    this.instances.forEach(s => s.destroy());
    this.instances = [];
    if (this.hurtbox) this.hurtbox.destroy();
  }

  update(time: number, delta: number) {
    // Swarm AI is just random scurrying
    this.instances.forEach(s => {
      if (Math.random() > 0.95) {
        s.setVelocity(Phaser.Math.Between(-300, 300), Phaser.Math.Between(-300, 300));
      }
    });
  }
}
