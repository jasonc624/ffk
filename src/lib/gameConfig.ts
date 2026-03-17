import Phaser from 'phaser';
import PreloaderScene from '$lib/scenes/PreloaderScene';
import MainScene from '$lib/scenes/MainScene';
import HUDScene from '$lib/scenes/HUDScene';

export const getGameConfig = (containerId: string): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: containerId,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 1200 },
      debug: false
    }
  },
  scene: [PreloaderScene, MainScene, HUDScene],
  transparent: true,
  backgroundColor: 'rgba(0,0,0,0)'
});
