export const EMITTERS = {
  DRIFT_UP:     { speedY: -60, speedX: { min: -20, max: 20 }, gravityY: -40, lifespan: 800 },
  BURST_RADIAL: { speed: { min: 80, max: 200 }, angle: { min: 0, max: 360 }, lifespan: 600 },
  TRAIL:        { follow: true, frequency: 30, lifespan: 400 },
  PULSE_RING:   { speed: 120, angle: { min: 0, max: 360 }, scaleStart: 0.2, scaleEnd: 1.5, lifespan: 500 },
  RAIN_DOWN:    { speedY: { min: 100, max: 300 }, speedX: { min: -10, max: 10 }, lifespan: 1200 },
  CONVERGE:     { speed: -100, angle: { min: 0, max: 360 }, lifespan: 600 },
}

export const PARTICLES = ['GLYPH', 'ORB', 'SHARD', 'VAPOR', 'SPARK', 'RING'];

export const TARGET_FX = ['TINT_PULSE', 'CHROMATIC', 'GLITCH', 'HEAT_HAZE', 'FLICKER', 'FREEZE', 'INVERT'];

export const SCREEN_FX = ['VIGNETTE', 'SHOCKWAVE', 'SLOWMO', 'FLASH', 'SCREENSHAKE'];

export const HUD_FX = ['STACK_TICK', 'BAR_DRAIN', 'STATUS_ICON', 'TEXT_POP'];

export const BACKGROUND_LAYERS = ['CIRCUIT_LAVA', 'CODE_RAIN', 'VOID_GRID', 'BONE_FIELD', 'WATER_MIRROR', 'STAR_COLLAPSE', 'FOREST_DARK', 'SAND_STORM'];
