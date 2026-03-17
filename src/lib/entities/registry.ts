export interface EntityVisualConfig {
  texture: string;
  assetPath: string;
  frameConfig: {
    frameWidth: number;
    frameHeight: number;
  };
  animations: Record<string, {
    frames: number[];
    frameRate?: number;
    repeat?: number;
  }>;
}

export const SUMMON_REGISTRY: Record<string, EntityVisualConfig> = {
  'entity_mahoraga': {
    texture: 'mahoraga',
    assetPath: '/assets/mahoraga_sprite.png',
    frameConfig: { frameWidth: 192, frameHeight: 192 },
    animations: {
      idle: { frames: [0], frameRate: 1 },
      attack: { frames: [1, 2, 3], frameRate: 8 },
      special: { frames: [4, 5], frameRate: 5 }
    }
  },
  'entity_rabbit_escape': {
    texture: 'rabbit',
    assetPath: '/assets/rabbit_sprite.png',
    frameConfig: { frameWidth: 64, frameHeight: 64 },
    animations: {
      idle: { frames: [0, 1], frameRate: 12, repeat: -1 },
      scurry: { frames: [2, 3, 4], frameRate: 15, repeat: -1 }
    }
  },
  'entity_judgeman': {
    texture: 'judgeman',
    assetPath: '/assets/judgeman.png',
    frameConfig: { frameWidth: 128, frameHeight: 128 },
    animations: {
      idle: { frames: [0], frameRate: 1 }
    }
  }
};
