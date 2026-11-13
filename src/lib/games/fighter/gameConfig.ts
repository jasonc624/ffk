import Phaser from 'phaser';
import CharacterSelectScene from '$lib/games/fighter/scenes/CharacterSelectScene';
import PreloaderScene from '$lib/games/fighter/scenes/PreloaderScene';
import MainScene from '$lib/games/fighter/scenes/MainScene';
import HUDScene from '$lib/games/fighter/scenes/HUDScene';

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
  scene: [CharacterSelectScene, PreloaderScene, MainScene, HUDScene],
  transparent: true,
  backgroundColor: 'rgba(0,0,0,0)'
});

