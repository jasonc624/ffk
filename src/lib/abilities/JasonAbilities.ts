import type { AbilityConfig } from '../types/ability';

/**
 * Jason's three Null Vector abilities.
 * These are loaded at game start and passed into AbilityManager.
 */
export const JASON_ABILITIES: AbilityConfig[] = [
  {
    slot: 'Ability1',
    key: 'L',
    name: 'Fast Break',
    description:
      "Jason surges forward along a pre-calculated void trajectory, closing distance in an instant and delivering a void-laced strike.",
    type: 'MOVEMENT',
    cost: { cursedEnergy: 12 },
    cooldown: 2800,
    castTime: 150,
    damage: 23,
    archetype: 'VOID',
    payload: {
      movementSubtype: 'TARGET_RELATIVE',
      range: 420,
      invincibleDuration: 300,
    },
    statusEffects: [
      { statusId: 'EXPOSED', chance: 0.45, duration: 2000 }
    ]
  },
  {
    slot: 'Ability2',
    key: 'E',
    name: 'Null Vector — Set Play',
    description:
      "Jason brands the target with Null Vector trajectories — invisible cursed lines mapped to their most likely movement paths. Max 3 stacks. At max stacks: void collapse + CE nullification.",
    type: 'DEBUFF',
    cost: { cursedEnergy: 45 },
    cooldown: 9000,
    castTime: 600,
    damage: 43,
    archetype: 'VOID',
    payload: {
      duration: 6000,
      stackable: true,
      maxStacks: 3,
      onMaxStacks: { burstDamage: 55, statusToApply: 'CE_NULLIFIED' }
    },
    statusEffects: [
      { statusId: 'BLEEDING_CURSED', chance: 1, duration: 6000, stacks: 1 },
      { statusId: 'CURSED', chance: 0.75, duration: 4000, stacks: 1 }
    ]
  },
  {
    slot: 'Ability3',
    key: 'F',
    name: 'Full Court Erasure',
    description:
      "Detonates every active Null Vector stack in a cascading void collapse. If no stacks exist, backfires — draining 40% of Jason's CE bar.",
    type: 'EXECUTION',
    cost: { cursedEnergy: 80, hp: 20 },
    cooldown: 20000,
    castTime: 1200,
    damage: 59,
    archetype: 'VOID',
    payload: {
      hpThreshold: 0.28,
      onThresholdMet: 110,
      onThresholdNotMet: 45
    },
    statusEffects: [
      { statusId: 'CE_NULLIFIED', chance: 1, duration: 5000 },
      { statusId: 'STUNNED', chance: 0.6, duration: 1200 }
    ]
  }
];
