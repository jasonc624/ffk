import { FPS_MOBA_HEROES } from './data/heroes';
import type { FpsHeroDef } from './types';

const HERO_STORAGE_KEY = 'fps_moba_selected_hero_id';
const SENSITIVITY_KEY = 'fps_moba_mouse_sensitivity';

export function getSelectedFpsHero(): FpsHeroDef {
  if (typeof window === 'undefined') return FPS_MOBA_HEROES[0];
  const savedId = localStorage.getItem(HERO_STORAGE_KEY);
  return FPS_MOBA_HEROES.find((h) => h.id === savedId) ?? FPS_MOBA_HEROES[0];
}

export function setSelectedFpsHero(heroId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HERO_STORAGE_KEY, heroId);
}

export function getMouseSensitivity(): number {
  if (typeof window === 'undefined') return 1.0;
  const val = parseFloat(localStorage.getItem(SENSITIVITY_KEY) || '1.0');
  return Number.isNaN(val) ? 1.0 : val;
}

export function setMouseSensitivity(sens: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SENSITIVITY_KEY, String(sens));
}

