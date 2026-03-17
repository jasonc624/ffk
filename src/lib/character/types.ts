import { AbilitiesSchema, TargetTypeEnum } from "$lib/abilities/schema"
import { ABILITY_TYPES } from "$lib/abilities/types"
import z from "zod"


export const CharacterSchema = z.object({

    perceived_grade: z.string(),
    epithet: z.string(),

    // Updated to full locked enum
    archetype: z.enum(ABILITY_TYPES),

    technique: z.object({
        name: z.string(),
        description: z.string(),
        mechanic: z.string(),
        visualProfile: z.object({
            casterColor: z.string(),
            accentColor: z.string(),
            onActivation: z.object({
                caster: z.array(z.any()),
                screen: z.array(z.any())
            }),
            onHit: z.object({
                target: z.array(z.any()),
                screen: z.array(z.any()),
                hud: z.array(z.any())
            }),
            onMaxStacks: z.object({
                target: z.array(z.any()),
                screen: z.array(z.any()),
                hud: z.array(z.any())
            }).optional()  // not every technique has stacks
        })
    }),

    domain: z.object({
        name: z.string(),
        description: z.string(),
        mechanic: z.string(),
        cost: z.number().default(100),
        damage: z.number().default(25),
        visualProfile: z.object({
            onDomainExpansion: z.object({
                background: z.object({
                    base: z.string(),
                    layers: z.array(z.any())
                }),
                ambient: z.array(z.any()),
                caster: z.array(z.any())
            })
        }).optional()
    }),

    // 3 generated abilities with full payload + status probability
    abilities: AbilitiesSchema.shape.abilities,

    // Extensions with unlock conditions and ability typing
    extensions: z.array(z.object({
        name: z.string(),
        description: z.string(),
        abilityType: z.enum(ABILITY_TYPES),
        targetTypes: z.array(TargetTypeEnum),
        unlockCondition: z.object({
            type: z.enum([
                'MILESTONE',
                'STORY_MOMENT',
                'ENTITY_ACTIVE',
                'DESPERATION',
                'DEFAULT_AVAILABLE'
            ]),
            description: z.string(),
            hpThreshold: z.number().optional(),
            requiredEntityId: z.string().optional(),
            milestoneCount: z.number().optional()
        })
    })),

    stats: z.object({
        cursedEnergy: z.number().min(0).max(100),
        technicalSkill: z.number().min(0).max(100),
        speed: z.number().min(0).max(100),
        strength: z.number().min(0).max(100),
        adaptability: z.number().min(0).max(100),
        domainRefinement: z.number().min(0).max(100)
    }),

    color: z.string()
})

// --- Intermediate Schemas for Split Generation ---

/**
 * Step 1: Creative/Lore pass
 * Generates the personality, technique identity, and ability names/descriptions
 */
export const BaseProfileSchema = z.object({
    perceived_grade: z.string(),
    epithet: z.string(),
    archetype: z.enum(ABILITY_TYPES),
    color: z.string(),
    stats: z.object({
        cursedEnergy: z.number(),
        technicalSkill: z.number(),
        speed: z.number(),
        strength: z.number(),
        adaptability: z.number(),
        domainRefinement: z.number()
    }),
    technique: z.object({
        name: z.string(),
        description: z.string(),
        mechanic: z.string(),
        visualProfile: z.object({
            casterColor: z.string(),
            accentColor: z.string(),
            onActivation: z.object({ caster: z.array(z.any()), screen: z.array(z.any()) }),
            onHit: z.object({ target: z.array(z.any()), screen: z.array(z.any()), hud: z.array(z.any()) }),
            onMaxStacks: z.object({ target: z.array(z.any()), screen: z.array(z.any()), hud: z.array(z.any()) }).optional()
        })
    }),
    domain: z.object({
        name: z.string(),
        description: z.string(),
        mechanic: z.string(),
        visualProfile: z.object({
            onDomainExpansion: z.object({
                background: z.object({ base: z.string(), layers: z.array(z.any()) }),
                ambient: z.array(z.any()),
                caster: z.array(z.any())
            })
        }).optional()
    }),
    abilities: z.array(z.object({
        slot: z.enum(['Ability1', 'Ability2', 'Ability3']),
        key: z.enum(['L', 'E', 'F']),
        name: z.string(),
        description: z.string(),
        type: z.enum(ABILITY_TYPES),
        targetTypes: z.array(TargetTypeEnum)
    })).length(3),
    extensions: z.array(z.object({
        name: z.string(),
        description: z.string(),
        abilityType: z.enum(ABILITY_TYPES),
        targetTypes: z.array(TargetTypeEnum),
        unlockCondition: z.object({
            type: z.enum(['MILESTONE', 'STORY_MOMENT', 'ENTITY_ACTIVE', 'DESPERATION', 'DEFAULT_AVAILABLE']),
            description: z.string(),
            hpThreshold: z.number().optional(),
            requiredEntityId: z.string().optional(),
            milestoneCount: z.number().optional()
        })
    }))
})

import { ABILITY_CONSTRAINTS } from "$lib/abilities/constraints"

// ... (BASE PROFILE SCHEMA REMAINS THE SAME) ...

/**
 * Step 2: Mechanical pass
 * Generates the hard numbers for the abilities and domain defined in Step 1
 */
export const CalibrationSchema = z.object({
    abilities: z.array(z.object({
        slot: z.enum(['Ability1', 'Ability2', 'Ability3']),
        cost: z.object({
            cursedEnergy: z.number().min(ABILITY_CONSTRAINTS.cost.cursedEnergy.min).max(ABILITY_CONSTRAINTS.cost.cursedEnergy.max).optional(),
            throatStrain: z.number().min(ABILITY_CONSTRAINTS.cost.throatStrain.min).max(ABILITY_CONSTRAINTS.cost.throatStrain.max).optional(),
            hp: z.number().min(ABILITY_CONSTRAINTS.cost.hp.min).max(ABILITY_CONSTRAINTS.cost.hp.max).optional()
        }),
        cooldown: z.number().min(ABILITY_CONSTRAINTS.cooldown.min).max(ABILITY_CONSTRAINTS.cooldown.max),
        castTime: z.number().min(ABILITY_CONSTRAINTS.castTime.min).max(ABILITY_CONSTRAINTS.castTime.max),
        selfDamageOnUse: z.number().min(ABILITY_CONSTRAINTS.selfDamage.min).max(ABILITY_CONSTRAINTS.selfDamage.max).optional(),
        payload: z.object({
            // Projectile / Area
            damage: z.number().min(ABILITY_CONSTRAINTS.payload.damage.min).max(ABILITY_CONSTRAINTS.payload.damage.max).optional(),
            speed: z.number().min(ABILITY_CONSTRAINTS.payload.speed.min).max(ABILITY_CONSTRAINTS.payload.speed.max).optional(),
            width: z.number().min(ABILITY_CONSTRAINTS.payload.width.min).max(ABILITY_CONSTRAINTS.payload.width.max).optional(),
            height: z.number().min(ABILITY_CONSTRAINTS.payload.height.min).max(ABILITY_CONSTRAINTS.payload.height.max).optional(),
            count: z.number().min(ABILITY_CONSTRAINTS.payload.count.min).max(ABILITY_CONSTRAINTS.payload.count.max).optional(),
            // Melee
            hitboxWidth: z.number().min(ABILITY_CONSTRAINTS.payload.hitbox.min).max(ABILITY_CONSTRAINTS.payload.hitbox.max).optional(),
            hitboxHeight: z.number().min(ABILITY_CONSTRAINTS.payload.hitbox.min).max(ABILITY_CONSTRAINTS.payload.hitbox.max).optional(),
            // Barrier/Area
            radius: z.number().min(ABILITY_CONSTRAINTS.payload.radius.min).max(ABILITY_CONSTRAINTS.payload.radius.max).optional(),
            duration: z.number().min(ABILITY_CONSTRAINTS.payload.duration.min).max(ABILITY_CONSTRAINTS.payload.duration.max).optional(),
            // Shared
            archetype: z.string().optional()
        }).passthrough(), // Allow other fields from the prompt but validate keys we care about
        statusEffects: z.array(z.object({
            statusId: z.string(),
            chance: z.number().min(ABILITY_CONSTRAINTS.status.chance.min).max(ABILITY_CONSTRAINTS.status.chance.max),
            duration: z.number().optional(),
            stacks: z.number().optional()
        }))
    })).length(3),
    domain: z.object({
        cost: z.number().min(ABILITY_CONSTRAINTS.domain.cost.min).max(ABILITY_CONSTRAINTS.domain.cost.max),
        damage: z.number().min(ABILITY_CONSTRAINTS.domain.damage.min).max(ABILITY_CONSTRAINTS.domain.damage.max)
    })
})

export type Character = z.infer<typeof CharacterSchema>
export type BaseProfile = z.infer<typeof BaseProfileSchema>
export type Calibration = z.infer<typeof CalibrationSchema>