// FINAL LOCKED — src/lib/abilities/types.ts

export const ABILITY_TYPES = [
    'PROJECTILE',
    'MOVEMENT',
    'MELEE',
    'BARRIER',
    'SUMMON',
    'AREA_DENIAL',
    'BUFF',
    'DEBUFF',
    'RESOURCE_DRAIN',
    'COUNTER',
    'TERRAIN',
    'TRANSFORMATION',
    'EXECUTION',
    'TETHER',
    'COMMAND',
] as const

export type AbilityType = typeof ABILITY_TYPES[number]

export type TargetType = 'SELF' | 'OPPONENT' | 'AREA' | 'DIRECTED'

export type MovementSubtype = 'FREE' | 'FIXED' | 'TARGET_RELATIVE'

// Resolution order when multiple target types present
// Each step fires after the previous resolves
// impactPoint is passed forward — area effects originate from where OPPONENT was hit
export type ResolutionStep = {
    targetType: TargetType
    delayMs: number          // delay after previous step
    originatesFromImpact: boolean  // true = use impact point, false = use caster position
}

export interface AbilityBase {
    id: string
    slot: 'Ability1' | 'Ability2' | 'Ability3'
    key: string
    name: string
    description: string
    type: AbilityType

    // Single or multi-target — always an array, always resolves sequentially
    resolution: ResolutionStep[]

    cost: {
        cursedEnergy?: number
        throatStrain?: number
        hp?: number
    }
    cooldown: number
    castTime: number
    selfDamageOnUse?: number

    // Gating conditions
    requiresStatus?: string
    requiresActiveEntity?: string
    requiresTargetHpBelow?: number   // for EXECUTION threshold checks

    // Flavor — comes from Claude, not registry
    flavorName?: string
    flavorDescription?: string
}