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
      idle: { frames: [0], frameRate: 15 },
      attack: { frames: [0], frameRate: 15 },
      special: { frames: [0], frameRate: 15 }
    }
  }
  // Add more summon entries here when their sprite sheets are available
};

