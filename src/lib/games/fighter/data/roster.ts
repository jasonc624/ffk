import type { CharacterData } from '../types/character';

/**
 * Hardcoded character roster.
 * Each entry is a full CharacterData object — the same shape the LLM generates.
 * Abilities use generic types (MOVEMENT, DEBUFF, EXECUTION, SUMMON, etc.) that
 * AbilityExecutor knows how to run without any character-specific code.
 *
 * Eventually these come from a DB; for now they live here.
 */
export const ROSTER: CharacterData[] = [
  // ─────────────────────────────────────────────
  //  JASON CARDENAS — Null Vector
  // ─────────────────────────────────────────────
  {
    id: 'jason',
    name: 'Jason Cardenas',
    perceived_grade: 'Special Grade',
    grade: 4,
    maxGrade: 4,
    epithet: 'The Null Vector',
    color: '#10b981',
    archetype: 'VOID',
    technique: {
      name: 'Null Vector',
      description: 'Pre-calculated void trajectories that guarantee positional dominance.',
      mechanic: 'Trajectory mapping with stack detonation.',
      visualProfile: { color: '#10b981', particleKey: 'void' }
    },
    domain: {
      id: 'null_arena',
      name: 'Null Vector Arena',
      cost: 80,
      cooldownTurns: 3,
      clashPower: 8,
      clashProfile: { clashBonus: 3 },
      visualProfile: { color: '#10b981' }
    } as any,
    extensions: [],
    stats: {
      cursedEnergy: 120,
      technicalSkill: 9,
      speed: 8,
      strength: 7,
      adaptability: 9,
      domainRefinement: 8
    },
    abilities: [
      {
        slot: 'Ability1', key: 'L',
        name: 'Fast Break',
        description: 'Surge forward along a pre-calculated void trajectory, closing distance in an instant.',
        type: 'MOVEMENT',
        cost: { cursedEnergy: 12 },
        cooldown: 2800,
        castTime: 150,
        damage: 23,
        archetype: 'VOID',
        payload: { movementSubtype: 'TARGET_RELATIVE', range: 420, invincibleDuration: 300 },
        statusEffects: [{ statusId: 'EXPOSED', chance: 0.45, duration: 2000 }]
      },
      {
        slot: 'Ability2', key: 'E',
        name: 'Null Vector — Set Play',
        description: 'Brand the target with up to 3 Null Vector trajectory stacks. At max stacks: void collapse.',
        type: 'DEBUFF',
        cost: { cursedEnergy: 45 },
        cooldown: 9000,
        castTime: 600,
        damage: 43,
        archetype: 'VOID',
        payload: { duration: 6000, stackable: true, maxStacks: 3, onMaxStacks: { burstDamage: 55 } },
        statusEffects: [
          { statusId: 'BLEEDING_CURSED', chance: 1, duration: 6000 },
          { statusId: 'CURSED', chance: 0.75, duration: 4000 }
        ]
      },
      {
        slot: 'Ability3', key: 'F',
        name: 'Full Court Erasure',
        description: 'Detonate all Null Vector stacks in a cascading void collapse. Backfires if no stacks exist.',
        type: 'EXECUTION',
        cost: { cursedEnergy: 80, hp: 20 },
        cooldown: 20000,
        castTime: 1200,
        damage: 59,
        archetype: 'VOID',
        payload: { hpThreshold: 0.28 },
        statusEffects: [
          { statusId: 'CE_NULLIFIED', chance: 1, duration: 5000 },
          { statusId: 'STUNNED', chance: 0.6, duration: 1200 }
        ]
      }
    ]
  },

  // ─────────────────────────────────────────────
  //  MEGUMI FUSHIGURO — Ten Shadows Technique
  // ─────────────────────────────────────────────
  {
    id: 'megumi',
    name: 'Megumi Fushiguro',
    perceived_grade: 'Grade 1',
    grade: 3,
    maxGrade: 4,
    epithet: 'The Ten Shadows',
    color: '#6366f1',
    archetype: 'SHADOW',
    technique: {
      name: 'Ten Shadows Technique',
      description: 'Summons up to ten divine shikigami from shadows using cursed energy-infused paper effigies.',
      mechanic: 'Shikigami summoning with persistent battlefield presence.',
      visualProfile: { color: '#6366f1', particleKey: 'shadow' }
    },
    domain: {
      id: 'chimera_shadow_garden',
      name: 'Chimera Shadow Garden',
      cost: 90,
      cooldownTurns: 4,
      clashPower: 9,
      clashProfile: { clashBonus: 4 },
      visualProfile: { color: '#1e1b4b' }
    } as any,
    extensions: [],
    stats: {
      cursedEnergy: 140,
      technicalSkill: 10,
      speed: 7,
      strength: 6,
      adaptability: 8,
      domainRefinement: 9
    },
    abilities: [
      {
        slot: 'Ability1', key: 'L',
        name: 'Divine Dogs',
        description: 'Summon the twin divine dogs — Totality and White — to chase and maul the target.',
        type: 'SUMMON',
        cost: { cursedEnergy: 20 },
        cooldown: 5000,
        castTime: 300,
        damage: 28,
        archetype: 'SHADOW',
        payload: {
          summonType: 'CHASE',
          count: 2,
          duration: 4000,
          speed: 320,
          hitboxWidth: 30,
          hitboxHeight: 30
        },
        statusEffects: [{ statusId: 'BLEEDING_CURSED', chance: 0.6, duration: 3000 }]
      },
      {
        slot: 'Ability2', key: 'E',
        name: 'Nue — Thunderstrike',
        description: 'Summon Nue to dive-bomb the opponent with a crackling lightning strike from above.',
        type: 'SUMMON',
        cost: { cursedEnergy: 35 },
        cooldown: 8000,
        castTime: 500,
        damage: 42,
        archetype: 'LIGHTNING',
        payload: {
          summonType: 'DIVE',
          duration: 2000,
          hitboxWidth: 60,
          hitboxHeight: 80,
          knockback: { x: 300, y: -450 }
        },
        statusEffects: [{ statusId: 'STUNNED', chance: 0.5, duration: 800 }]
      },
      {
        slot: 'Ability3', key: 'F',
        name: 'Eight-Handled Sword Divergent Sila — Mahoraga',
        description: 'Summon the unkillable Mahoraga. Sets Megumi into a prolonged cast. Mahoraga arrives and adapts to all attacks.',
        type: 'SUMMON',
        cost: { cursedEnergy: 100, hp: 30 },
        cooldown: 25000,
        castTime: 2000,
        damage: 85,
        archetype: 'SHADOW',
        payload: {
          summonType: 'BOSS',
          texture: 'mahoraga',
          duration: 8000,
          hitboxWidth: 80,
          hitboxHeight: 100,
          knockback: { x: 700, y: -600 },
          adaptation: true
        },
        statusEffects: [
          { statusId: 'CE_NULLIFIED', chance: 0.7, duration: 4000 },
          { statusId: 'STUNNED', chance: 0.8, duration: 1500 }
        ]
      }
    ]
  }
];

export type RosterEntry = typeof ROSTER[number];

/** Look up a character by id */
export function getRosterEntry(id: string): CharacterData | undefined {
  return ROSTER.find(c => c.id === id);
}
