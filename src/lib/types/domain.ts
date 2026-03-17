/**
 * Detailed configuration for the domain expansion visual environment.
 * Used for both HTML/Canvas rendering and overlay systems.
 */
export interface DomainConfig {
  // Identity
  name: string;
  subtitle: string;
  lore: string;
  lawText: string;
  stats: Array<{ label: string; value: string }>;

  // Overlay particles — same renderer for every scene
  particles: {
    type: 'dust' | 'ember' | 'ash' | 'petals' | 'shards' | 'snow' | 'sparks';
    count: number;
    speed: number;
    size: number;
    hue: number;
    saturation: number;
    opacity: number;
    riseDirection: 'up' | 'down' | 'radial';
  };

  // God rays — same renderer, different values
  rays: {
    enabled: boolean;
    count: number;
    color: string;
    intensity: number;
    xPosition: number;    // 0–1
    width: number;
    sway: number;
    angle?: number;       // for diagonal rays
  };

  // Vignette + atmosphere
  vignette: number;       // 0–1
  fogColor: string;
  fogDensity: number;

  // Color palette — used by overlay renderer for tinting
  palette: {
    primary: string;
    accent: string;
    glow: string;
  };

  // UI text colors
  uiOpacity: number;
  uiGlowColor: string;
}

/**
 * Unified Domain type that aggregates assets from different AI services.
 * Handling animated backgrounds via Video, HTML/Canvas, or Static Images.
 */
export interface UnifiedDomain {
  name: string;
  description: string;
  mechanic: string;
  image_url?: string;
  video_url?: string;
  scene_html?: string;
  config?: DomainConfig;
}
