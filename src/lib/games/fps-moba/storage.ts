import { FPS_MOBA_HEROES } from './data/heroes';
import type { FpsHeroDef } from './types';

const HERO_STORAGE_KEY = 'fps_moba_selected_hero_id';
const SENSITIVITY_KEY = 'fps_moba_mouse_sensitivity';
const MAP_STORAGE_KEY = 'fps_moba_selected_map_id';
const HAND_DISTANCE_KEY = 'fps_moba_hand_distance_offset';
const AI_ATTACKING_KEY = 'fps_moba_ai_attacking_enabled';

export type MobaMapId = 'arena' | 'orlando';

export interface MobaMapInfo {
  id: MobaMapId;
  name: string;
  subtitle: string;
  description: string;
  accentColor: string;
}

export const MOBA_MAPS: MobaMapInfo[] = [
  {
    id: 'arena',
    name: 'Cyber Shibuya',
    subtitle: 'TOKYO COMBAT ARENA',
    description: 'High-visibility tactical arena with elevated sniper bridges, energy grids, and perimeter barriers.',
    accentColor: '#38bdf8'
  },
  {
    id: 'orlando',
    name: 'Orlando',
    subtitle: 'INTERNATIONAL DRIVE // FLORIDA',
    description: 'Sunny Florida daylight, lush palm groves, and the iconic WhirlyDome entertainment arena centerpiece.',
    accentColor: '#f59e0b'
  }
];

export function getSelectedFpsHero(): FpsHeroDef {
  if (typeof window === 'undefined') return FPS_MOBA_HEROES[0];
  const savedId = localStorage.getItem(HERO_STORAGE_KEY);
  return FPS_MOBA_HEROES.find((h) => h.id === savedId) ?? FPS_MOBA_HEROES[0];
}

export function setSelectedFpsHero(heroId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HERO_STORAGE_KEY, heroId);
}

export function getSelectedFpsMap(): MobaMapId {
  if (typeof window === 'undefined') return 'arena';
  const saved = localStorage.getItem(MAP_STORAGE_KEY) as MobaMapId;
  return saved === 'orlando' ? 'orlando' : 'arena';
}

export function setSelectedFpsMap(mapId: MobaMapId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MAP_STORAGE_KEY, mapId);
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

export function getHandDistanceOffset(): number {
  if (typeof window === 'undefined') return 0;
  const val = parseFloat(localStorage.getItem(HAND_DISTANCE_KEY) || '0');
  if (Number.isNaN(val)) return 0;
  return Math.max(-0.16, Math.min(0.35, val));
}

export function setHandDistanceOffset(offsetMeters: number): void {
  if (typeof window === 'undefined') return;
  const clamped = Math.max(-0.16, Math.min(0.35, offsetMeters));
  localStorage.setItem(HAND_DISTANCE_KEY, String(clamped));
}

export function getAiAttackingEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(AI_ATTACKING_KEY);
  return raw === null ? true : raw === 'true';
}

export function setAiAttackingEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AI_ATTACKING_KEY, String(enabled));
}

