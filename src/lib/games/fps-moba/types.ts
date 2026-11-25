export type MobaTeam = 'blue' | 'red';
export type MobaUnitType = 'HERO' | 'MINION' | 'SHIKIGAMI' | 'CONSTRUCT' | 'TOWER' | 'CORE';
export type FpsAbilityKey = 'SHIFT' | 'E' | 'Q';
export type MobaMapId = 'arena' | 'orlando';

export const STANDARD_CE_REGEN_PER_SEC = 4.0;
export const CE_EXHAUSTION_LOCKOUT_SEC = 10.0;

export type PrimaryFireMode =
  | 'AUTO'
  | 'BURST'
  | 'SHOTGUN'
  | 'MELEE_CLEAVE'
  | 'HAND_CANNON'
  | 'EMBER_INSECTS'
  | 'HYBRID_SHADOW';

export interface SecondaryFireConfig {
  name: string;
  kind:
    | 'BARRIER_SHIELD'
    | 'SKY_DEFLECT'
    | 'REALITY_WIPE'
    | 'CHARGED_PUNCH'
    | 'HELIX_ROCKET'
    | 'LAPSE_BLUE_ORB'
    | 'DIVINE_DOGS'
    | 'RABBIT_ESCAPE'
    | 'NONE';
  description: string;
  manaCost?: number;
  manaDrainPerSec?: number;
  // For BARRIER_SHIELD (Reinhardt / Brigitte / Gojo Infinity)
  barrierMaxHp?: number;
  barrierDrainPerSec?: number;
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
  viewModelType: 'RIFLE' | 'HAMMER' | 'FLAIL' | 'DOOM_GAUNTLET' | 'JOGO_HANDS' | 'MEGUMI_SHADOW' | 'URO_SKY_HANDS';
  damage: number;
  maxDamage?: number; // For chargeable primary fire (Gojo Reversal Red)
  manaCost?: number;
  maxManaCost?: number;
  fireRateMs: number;
  range: number;
  cleaveArcDeg?: number; // For MELEE_CLEAVE (e.g. 115 degrees in front)
  knockback?: number;
  maxKnockback?: number; // For chargeable primary fire
  chargeable?: boolean;
  maxChargeMs?: number;
  isProjectileOrb?: boolean;
  pellets?: number;
  spread?: number;
  magazineSize: number; // 0 = infinite melee swings
  reloadTimeMs: number;
  autoRegenAmmo?: boolean; // Doomfist style knuckle ammo regen
  projectileColor: string;
}

export type FpsAbilityKind =
  | 'BLINK_DASH'
  | 'LIMITLESS_TELEPORT'
  | 'GRAVITY_ORB'
  | 'INFINITY_SHIELD'
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
  | 'METEOR_STRIKE_ULT'
  | 'FLAME_DASH'
  | 'MINI_VOLCANO'
  | 'SHADOW_STEP'
  | 'NUE_TOAD'
  | 'RABBIT_ESCAPE_NUE'
  | 'SKY_PULL'
  | 'THIN_ICE_BREAKER';

export interface FpsAbilityDef {
  key: FpsAbilityKey;
  name: string;
  description: string;
  cooldownMs: number;
  maxCharges?: number;
  manaCost: number;
  manaDrainPerSec?: number;
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
  ceRegenMultiplier: number;
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
  ageSec?: number;
  opacity?: number;
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
  ceRegenPerSec: number;
  manaExhaustedTimerSec: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  // Secondary fire state (Barrier Shield or Charged Rocket Punch)
  isUsingSecondary: boolean;
  barrierHp: number;
  barrierMaxHp: number;
  primaryChargeRatio: number; // 0..1 when holding M1 on Gojo Reversal Red
  punchChargeRatio: number; // 0..1 when holding M2 on Doomfist
  blueChargeRatio?: number; // 0..1 when holding M2 to charge Gojo Lapse Blue
  teleportPhase?: 'NONE' | 'AIMING' | 'CASTING'; // Gojo Limitless Teleport
  teleportCastRatio?: number; // 0..1 during the teleport cast time
  hasActiveBlueOrb?: boolean; // Gojo 2-stage Lapse Blue active in flight
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
  domainBarrierHp?: number;
  domainBarrierMaxHp?: number;
  canCastHollowPurple?: boolean;
  canCastMeteor?: boolean;
  meteorAiming?: boolean;
  canSummonMahoraga?: boolean;
  canCastShatteredSky?: boolean;
  isSkyHovering?: boolean;
  isUroFlying?: boolean;
  isRealityWiping?: boolean;
  activeRealityWipes?: number;
  isShadowStepping?: boolean;
  shadowStepRemainingSec?: number;
  canNueCarry?: boolean;
  nueCarryRemainingSec?: number;
  nueToadPreview?: 'TOAD' | 'NUE';
  mahoragaRogue?: boolean;
  blueCoreHp: number;
  blueCoreMaxHp: number;
  redCoreHp: number;
  redCoreMaxHp: number;
  winner: MobaTeam | null;
  cooldowns: Record<
    FpsAbilityKey,
    { remainingMs: number; totalMs: number; charges?: number; maxCharges?: number }
  >;
  killFeed: KillFeedEntry[];
  damagePopups: DamagePopup[];
  minimapBlips: MinimapBlip[];
  playerPos: { x: number; z: number; yaw: number };
  mapId?: MobaMapId;
  mapName?: string;
}
