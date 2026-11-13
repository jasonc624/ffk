export type MobaTeam = 'blue' | 'red';
export type MobaUnitType = 'HERO' | 'MINION' | 'TOWER' | 'CORE';
export type FpsAbilityKey = 'Q' | 'E' | 'F' | 'R';

export type PrimaryFireMode = 'AUTO' | 'BURST' | 'SHOTGUN' | 'MELEE_CLEAVE' | 'HAND_CANNON';

export interface SecondaryFireConfig {
  name: string;
  kind: 'BARRIER_SHIELD' | 'CHARGED_PUNCH' | 'HELIX_ROCKET';
  description: string;
  // For BARRIER_SHIELD (Reinhardt / Brigitte)
  barrierMaxHp?: number;
  barrierRegenPerSec?: number;
  // For CHARGED_PUNCH (Doomfist)
  minDamage?: number;
  maxDamage?: number;
  wallSlamBonusDamage?: number;
  maxChargeMs?: number;
  cooldownMs?: number;
  color: string;
}

export interface FpsWeaponConfig {
  name: string;
  fireMode: PrimaryFireMode;
  viewModelType: 'RIFLE' | 'HAMMER' | 'FLAIL' | 'DOOM_GAUNTLET';
  damage: number;
  fireRateMs: number;
  range: number;
  cleaveArcDeg?: number; // For MELEE_CLEAVE (e.g. 115 degrees in front)
  knockback?: number;
  pellets?: number;
  spread?: number;
  magazineSize: number; // 0 = infinite melee swings
  reloadTimeMs: number;
  autoRegenAmmo?: boolean; // Doomfist style knuckle ammo regen
  projectileColor: string;
}

export type FpsAbilityKind =
  | 'BLINK_DASH'
  | 'GRAVITY_ORB'
  | 'BARRIER_WALL'
  | 'DOMAIN_ULT'
  | 'METEOR_LEAP'
  | 'SOLAR_PILLAR'
  | 'SIPHON_BEAM'
  | 'HOUND_SUMMON'
  | 'TESLA_TURRET'
  | 'OVERCHARGE'
  | 'CRUSADER_CHARGE'
  | 'FLAME_STRIKE'
  | 'EARTHSHATTER'
  | 'SHIELD_BASH'
  | 'WHIP_SHOT'
  | 'RALLY_ULT'
  | 'SEISMIC_SLAM'
  | 'RISING_UPPERCUT'
  | 'POWER_BLOCK'
  | 'METEOR_STRIKE_ULT';

export interface FpsAbilityDef {
  key: FpsAbilityKey;
  name: string;
  description: string;
  cooldownMs: number;
  manaCost: number;
  kind: FpsAbilityKind;
  damage: number;
  radius: number;
  durationMs: number;
  color: string;
}

export interface FpsHeroDef {
  id: string;
  name: string;
  role: 'TANK' | 'BRAWLER' | 'SUPPORT_BRIG' | 'STRIKER' | 'MAGE';
  archetypeLabel: string;
  epithet: string;
  passiveName: string;
  passiveDesc: string;
  color: string;
  accentColor: string;
  maxHp: number;
  maxMana: number;
  moveSpeed: number;
  weapon: FpsWeaponConfig;
  secondaryFire: SecondaryFireConfig;
  abilities: Record<FpsAbilityKey, FpsAbilityDef>;
}

export interface KillFeedEntry {
  id: string;
  killer: string;
  killerTeam: MobaTeam;
  victim: string;
  victimTeam: MobaTeam;
  weaponOrAbility: string;
  timestamp: number;
}

export interface DamagePopup {
  id: number;
  x: number;
  y: number;
  amount: number;
  label?: string;
  isCrit: boolean;
  color: string;
}

export interface MinimapBlip {
  id: string;
  x: number;
  z: number;
  team: MobaTeam;
  type: MobaUnitType;
  hpRatio: number;
}

export interface FpsHudState {
  hero: FpsHeroDef;
  hp: number;
  maxHp: number;
  shield: number;
  mana: number;
  maxMana: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  // Secondary fire state (Barrier Shield or Charged Rocket Punch)
  isUsingSecondary: boolean;
  barrierHp: number;
  barrierMaxHp: number;
  punchChargeRatio: number; // 0..1 when holding M2 on Doomfist
  secondaryCooldownMs: number;
  isPowerEmpowered: boolean; // Doomfist Power Block empowered punch
  inspireTimerSec: number; // Brigitte Inspire active timer
  level: number;
  xp: number;
  nextLevelXp: number;
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  minionKills: number;
  matchTimeSec: number;
  pointerLocked: boolean;
  hitMarkerAlpha: number;
  hitMarkerCrit: boolean;
  activeDomainName: string | null;
  blueCoreHp: number;
  blueCoreMaxHp: number;
  redCoreHp: number;
  redCoreMaxHp: number;
  winner: MobaTeam | null;
  cooldowns: Record<FpsAbilityKey, { remainingMs: number; totalMs: number }>;
  killFeed: KillFeedEntry[];
  damagePopups: DamagePopup[];
  minimapBlips: MinimapBlip[];
  playerPos: { x: number; z: number; yaw: number };
}
