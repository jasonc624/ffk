// src/lib/abilities/schema.ts

import { z } from 'zod'
import { ABILITY_TYPES } from './types'
import { STATUS_EFFECTS } from './statusEffects'

import { ABILITY_CONSTRAINTS } from './constraints'

const AbilityTypeEnum = z.enum(ABILITY_TYPES)
export const TargetTypeEnum = z.enum(['SELF', 'OPPONENT', 'AREA', 'DIRECTED'])
const StatusIdEnum = z.enum(
    STATUS_EFFECTS.map(s => s.id) as [string, ...string[]]
)

// Status effect application — probability factored by Claude
const StatusApplicationSchema = z.object({
    statusId: StatusIdEnum,
    chance: z.number().min(ABILITY_CONSTRAINTS.status.chance.min).max(ABILITY_CONSTRAINTS.status.chance.max)
        .describe('Probability this status applies on hit. 1.0 = guaranteed. 0.1 = rare.'),
    duration: z.number()
        .describe('Duration override in ms. Use status default if omitted.')
        .optional(),
    stacks: z.number().min(ABILITY_CONSTRAINTS.status.stacks.min).max(ABILITY_CONSTRAINTS.status.stacks.max).optional()
        .describe('How many stacks to apply if stackable.')
})

// Generated ability — one of three slots
const GeneratedAbilitySchema = z.object({
    slot: z.enum(['Ability1', 'Ability2', 'Ability3']),
    key: z.enum(['L', 'E', 'F']),
    name: z.string()
        .describe('Flavor name derived from the technique. e.g. "Syntax Purge" not "Heavy Attack"'),
    description: z.string()
        .describe('One sentence. What it does narratively.'),

    // Mechanical identity
    type: AbilityTypeEnum,
    targetTypes: z.array(TargetTypeEnum).min(1)
        .describe('All target types this ability affects simultaneously.'),

    // Cost and timing
    cost: z.object({
        cursedEnergy: z.number().min(ABILITY_CONSTRAINTS.cost.cursedEnergy.min).max(ABILITY_CONSTRAINTS.cost.cursedEnergy.max).optional(),
        throatStrain: z.number().min(ABILITY_CONSTRAINTS.cost.throatStrain.min).max(ABILITY_CONSTRAINTS.cost.throatStrain.max).optional(),
        hp: z.number().min(ABILITY_CONSTRAINTS.cost.hp.min).max(ABILITY_CONSTRAINTS.cost.hp.max).optional()
    }),
    cooldown: z.number().min(ABILITY_CONSTRAINTS.cooldown.min).max(ABILITY_CONSTRAINTS.cooldown.max)
        .describe('Cooldown in ms. Light utility: 3000-6000. Heavy: 8000-15000. Ultimate-tier: 18000-25000.'),
    castTime: z.number().min(ABILITY_CONSTRAINTS.castTime.min).max(ABILITY_CONSTRAINTS.castTime.max)
        .describe('Startup delay in ms before effect fires. Fast: 0-200. Telegraphed: 400-800.'),
    selfDamageOnUse: z.number().min(ABILITY_CONSTRAINTS.selfDamage.min).max(ABILITY_CONSTRAINTS.selfDamage.max).optional()
        .describe('HP cost to caster on activation. Only for high-power abilities.'),

    // Mechanical payload — fields vary by type
    payload: z.object({

        // PROJECTILE
        damage: z.number().min(ABILITY_CONSTRAINTS.payload.damage.min).max(ABILITY_CONSTRAINTS.payload.damage.max).optional(),
        speed: z.number().min(ABILITY_CONSTRAINTS.payload.speed.min).max(ABILITY_CONSTRAINTS.payload.speed.max).optional(),
        width: z.number().min(ABILITY_CONSTRAINTS.payload.width.min).max(ABILITY_CONSTRAINTS.payload.width.max).optional(),
        height: z.number().min(ABILITY_CONSTRAINTS.payload.height.min).max(ABILITY_CONSTRAINTS.payload.height.max).optional(),
        piercing: z.boolean().optional(),
        homing: z.boolean().optional(),
        count: z.number().min(ABILITY_CONSTRAINTS.payload.count.min).max(ABILITY_CONSTRAINTS.payload.count.max).optional(),

        // MOVEMENT
        movementSubtype: z.enum(['FREE', 'FIXED', 'TARGET_RELATIVE']).optional(),
        range: z.number().min(ABILITY_CONSTRAINTS.payload.range.min).max(ABILITY_CONSTRAINTS.payload.range.max).optional(),
        invincibleDuration: z.number().min(ABILITY_CONSTRAINTS.payload.invincible.min).max(ABILITY_CONSTRAINTS.payload.invincible.max).optional(),
        canTargetAlly: z.boolean().optional(),
        canTargetOpponent: z.boolean().optional(),
        relativePosition: z.enum(['BEHIND', 'INFRONT', 'ABOVE', 'EXACT']).optional(),

        // MELEE
        hitboxWidth: z.number().min(ABILITY_CONSTRAINTS.payload.hitbox.min).max(ABILITY_CONSTRAINTS.payload.hitbox.max).optional(),
        hitboxHeight: z.number().min(ABILITY_CONSTRAINTS.payload.hitbox.min).max(ABILITY_CONSTRAINTS.payload.hitbox.max).optional(),
        hitboxOffsetX: z.number().min(20).max(200).optional(),
        knockback: z.object({ x: z.number(), y: z.number() }).optional(),

        // BARRIER
        toggle: z.boolean().optional(),
        duration: z.number().optional(),
        radius: z.number().min(ABILITY_CONSTRAINTS.payload.radius.min).max(ABILITY_CONSTRAINTS.payload.radius.max).optional(),
        damageReduction: z.number().min(0).max(1).optional(),
        reflectProjectiles: z.boolean().optional(),
        ceDrainPerSecond: z.number().optional(),
        slowIncoming: z.number().min(0).max(1).optional(),

        // SUMMON
        summonId: z.string().optional(),
        maxActive: z.number().min(1).max(5).optional(),
        recallable: z.boolean().optional(),
        spawnPosition: z.enum(['NEAR_CASTER', 'NEAR_TARGET', 'DIRECTED']).optional(),

        // AREA_DENIAL
        shape: z.enum(['CIRCLE', 'RECTANGLE', 'CONE']).optional(),
        tickRate: z.number().optional(),
        persistent: z.boolean().optional(),
        blocksMovement: z.boolean().optional(),

        // BUFF
        statModifiers: z.object({
            speed: z.number().optional(),
            strength: z.number().optional(),
            damageReduction: z.number().optional(),
            cursedEnergyRegen: z.number().optional()
        }).optional(),
        healAmount: z.number().optional(),
        stackable: z.boolean().optional(),

        // RESOURCE_DRAIN
        resource: z.enum(['cursedEnergy', 'hp', 'throatStrain']).optional(),
        amount: z.number().optional(),
        transferToSelf: z.boolean().optional(),
        suppressRegenDuration: z.number().optional(),

        windowDuration: z.number().optional(),
        triggerOn: z.enum(['ANY_HIT', 'PROJECTILE', 'MELEE', 'TECHNIQUE']).optional(),
        onTrigger: z.object({
            damageMultiplier: z.number().optional(),
            forcedVelocity: z.object({ x: z.number(), y: z.number() }).optional(),
            ceSteal: z.number().optional()
        }).optional(),

        modification: z.enum(['DESTROY_PLATFORM', 'CREATE_PLATFORM', 'RESHAPE', 'HAZARD_ZONE']).optional(),

        abilityOverrides: z.object({
            Ability1: z.string().optional(),
            Ability2: z.string().optional(),
            Ability3: z.string().optional()
        }).optional(),
        formName: z.string().optional(),

        hpThreshold: z.number().optional(),
        onThresholdMet: z.object({
            type: z.enum(['INSTANT_DEFEAT', 'MASSIVE_DAMAGE']),
            damage: z.number().optional()
        }).optional(),
        onThresholdNotMet: z.object({
            type: z.enum(['REDUCED_DAMAGE', 'NO_EFFECT']),
            damage: z.number().optional()
        }).optional(),

        maxRange: z.number().optional(),
        tetherEffect: z.object({
            damageTransfer: z.number().optional(),
            pullForce: z.number().optional(),
            ceLeech: z.number().optional(),
            moveRestriction: z.number().optional()
        }).optional(),
        breakConditions: z.array(z.enum(['MAX_RANGE', 'TARGET_BLOCKS', 'TIMER'])).optional(),

        hearingRange: z.number().optional(),
        penetration: z.number().min(0).max(150).optional(),
        inputOverride: z.object({
            type: z.enum(['IMMOBILIZE', 'SCRAMBLE', 'FULL_DISABLE', 'FORCED_VELOCITY']),
            duration: z.number(),
            velocity: z.object({ x: z.number(), y: z.number() }).optional()
        }).optional(),

        archetype: z.string().optional()
            .describe('Damage archetype for immunity checks. e.g. PHYSICAL, ACCUMULATION, BINDING')

    }),

    // Status effects — Claude assigns probability based on thematic fit
    statusEffects: z.array(StatusApplicationSchema).max(2)
        .describe(`
      Optional. Max 2 status effects per ability.
      Assign statusChance based on how central the status is to the technique:
      - Core identity (technique is about this): 0.7-1.0
      - Thematic side effect: 0.3-0.6  
      - Rare/situational: 0.05-0.2
      Leave empty if no status makes thematic sense.
    `)
})

// Full abilities section of CharacterSchema
export const AbilitiesSchema = z.object({
    abilities: z.array(GeneratedAbilitySchema)
        .length(3)
        .describe(`
      Generate exactly 3 abilities for slots Ability1 (L), Ability2 (E), Ability3 (F).
      
      Rules:
      - Ability1 should be the most frequently usable (lowest cooldown, lowest cost)
      - Ability2 should be the signature move (medium cooldown, defines the character)
      - Ability3 should be the high-risk high-reward option (long cooldown or self-damage)
      - All 3 must feel like natural expressions of the same innate technique
      - Each should use a DIFFERENT ability type where possible
      - Status effects must be thematically justified — do not assign statuses randomly
      
      Available ability types: ${ABILITY_TYPES.join(', ')}
      Available target types: SELF, OPPONENT, AREA, DIRECTED
      Available status effects: ${STATUS_EFFECTS.map(s => s.id).join(', ')}
    `)
})


