// src/lib/abilities/statusEffects.ts

export const STATUS_EFFECTS = [

    // ── Damage over time ──────────────────────────────────────────
    {
        id: 'POISONED',
        name: 'Poisoned',
        category: 'DOT',
        description: 'Takes fixed damage every tick regardless of action.',
        defaultDuration: 4000,
        tickRate: 500,          // ms between damage ticks
        damagePerTick: 5,
        stackable: false,
        clearedBy: [],
        visual: { color: '#7b2d8b', icon: 'status_poison' }
    },
    {
        id: 'BURNING',
        name: 'Burning',
        category: 'DOT',
        description: 'Takes fire damage every tick. Damage increases with each stack.',
        defaultDuration: 3000,
        tickRate: 300,
        damagePerTick: 8,
        stackable: true,
        maxStacks: 3,
        clearedBy: ['FROZEN'],   // freeze cancels burn
        visual: { color: '#ff4500', icon: 'status_burn' }
    },
    {
        id: 'BLEEDING',
        name: 'Bleeding',
        category: 'DOT',
        description: 'Damage scales with movement speed. Stand still to slow it.',
        defaultDuration: 5000,
        tickRate: 200,
        damagePerTick: 0,        // calculated dynamically from velocity
        movementScaling: 0.08,   // damage = velocity * this factor per tick
        stackable: false,
        clearedBy: [],
        visual: { color: '#cc0000', icon: 'status_bleed' }
    },

    // ── Crowd control ─────────────────────────────────────────────
    {
        id: 'PARALYZED',
        name: 'Paralyzed',
        category: 'CC',
        description: 'Movement inputs scrambled. Can still act but with degraded control.',
        defaultDuration: 2000,
        inputOverride: {
            type: 'SCRAMBLE',
            scrambleMap: { LEFT: 'RIGHT', RIGHT: 'LEFT' }
        },
        stackable: false,
        clearedBy: [],
        visual: { color: '#f0e040', icon: 'status_paralyzed' }
    },
    {
        id: 'FROZEN',
        name: 'Frozen',
        category: 'CC',
        description: 'Completely immobile and unable to act. Shatters on heavy hit.',
        defaultDuration: 2500,
        inputOverride: { type: 'FULL_DISABLE' },
        breakCondition: 'HEAVY_HIT',   // heavy attack instantly clears this
        stackable: false,
        clearedBy: ['BURNING'],
        visual: { color: '#00bfff', icon: 'status_frozen' }
    },
    {
        id: 'SLEEP',
        name: 'Sleep',
        category: 'CC',
        description: 'Completely disabled. Any damage immediately wakes the target.',
        defaultDuration: 3000,
        inputOverride: { type: 'FULL_DISABLE' },
        breakCondition: 'ANY_DAMAGE',
        stackable: false,
        clearedBy: [],
        visual: { color: '#9b9bcc', icon: 'status_sleep' }
    },
    {
        id: 'STUNNED',
        name: 'Stunned',
        category: 'CC',
        description: 'Brief complete stop. Short duration, not clearable.',
        defaultDuration: 600,
        inputOverride: { type: 'FULL_DISABLE' },
        breakCondition: null,          // cannot be broken early
        stackable: false,
        clearedBy: [],
        visual: { color: '#ffff00', icon: 'status_stunned' }
    },
    {
        id: 'CONFUSED',
        name: 'Confused',
        category: 'CC',
        description: 'All directional inputs reversed. Randomly fires abilities at wrong targets.',
        defaultDuration: 3000,
        inputOverride: {
            type: 'SCRAMBLE',
            scrambleMap: {
                LEFT: 'RIGHT',
                RIGHT: 'LEFT',
                JUMP: 'FAST_FALL',
                FAST_FALL: 'JUMP'
            }
        },
        randomAbilityMisfire: {
            chance: 0.25,              // 25% chance per ability press to fire at self
            interval: 1000
        },
        stackable: false,
        clearedBy: [],
        visual: { color: '#ff69b4', icon: 'status_confused' }
    },
    {
        id: 'IN_LOVE',
        name: 'Smitten',
        category: 'CC',
        description: 'Cannot attack the source of this status. Will move toward them instead.',
        defaultDuration: 4000,
        inputOverride: { type: 'NONE' },  // movement works, attacks against source blocked
        attackBlockSource: true,           // blocks attacks specifically targeting the applier
        moveTowardSource: true,
        stackable: false,
        clearedBy: [],
        visual: { color: '#ff1493', icon: 'status_love' }
    },

    // ── Stat modifiers ────────────────────────────────────────────
    {
        id: 'CURSED',
        name: 'Cursed',
        category: 'DEBUFF',
        description: 'All incoming damage amplified. Spiritually marked.',
        defaultDuration: 5000,
        damageAmplification: 1.35,    // take 35% more damage from all sources
        stackable: false,
        clearedBy: [],
        visual: { color: '#8b0000', icon: 'status_cursed' }
    },
    {
        id: 'EXPOSED',
        name: 'Exposed',
        category: 'DEBUFF',
        description: 'Defense reduced. Technique efficiency reduced.',
        defaultDuration: 4000,
        statModifiers: {
            damageReduction: -0.3,     // lose 30% damage reduction
            technicalSkill: 0.7
        },
        stackable: false,
        clearedBy: [],
        visual: { color: '#ff8c00', icon: 'status_exposed' }
    },
    {
        id: 'BLEEDING_CURSED',
        name: 'Cursed Bleeding',
        category: 'DEBUFF',
        description: 'CE leaks with every movement. Moving drains cursed energy.',
        defaultDuration: 5000,
        ceLeakOnMove: 0.05,           // CE drain = velocity * this factor per tick
        tickRate: 100,
        stackable: false,
        clearedBy: [],
        visual: { color: '#9b0000', icon: 'status_ce_bleed' }
    },

    // ── Resource ──────────────────────────────────────────────────
    {
        id: 'CE_NULLIFIED',
        name: 'CE Nullified',
        category: 'RESOURCE',
        description: 'Cursed energy drops to zero. Regen suppressed. All techniques locked.',
        defaultDuration: 8000,
        ceSetToZero: true,
        ceRegenSuppressed: true,
        techniqueLocked: true,
        domainLocked: true,
        stackable: false,
        clearedBy: [],
        visual: { color: '#ffffff', icon: 'status_nullified' }
    },
    {
        id: 'SILENCED',
        name: 'Silenced',
        category: 'RESOURCE',
        description: 'Technique inputs disabled. Movement unaffected.',
        defaultDuration: 3000,
        techniqueLocked: true,
        domainLocked: true,
        stackable: false,
        clearedBy: [],
        visual: { color: '#666666', icon: 'status_silenced' }
    },
    {
        id: 'HOARSE',
        name: 'Hoarse',
        category: 'RESOURCE',
        description: 'Voice weakened. Command range reduced.',
        defaultDuration: 0,            // 0 = persists until throat strain drops
        hearingRangeMultiplier: 0.7,
        stackable: false,
        clearedBy: [],
        visual: { color: '#8b7355', icon: 'status_hoarse' }
    },

    // ── Chance-based ──────────────────────────────────────────────
    {
        id: 'CRITICAL',
        name: 'Critical',
        category: 'CHANCE',
        description: 'Next attack has a chance to deal double damage.',
        defaultDuration: 0,            // consumed on next attack
        consumedOnAttack: true,
        critChance: 0.5,               // 50% chance on next hit
        critMultiplier: 2.0,
        stackable: true,
        maxStacks: 3,                  // each stack adds +critChance
        stackCritChanceBonus: 0.15,
        clearedBy: [],
        visual: { color: '#ffd700', icon: 'status_crit' }
    },

    // ── Protective ────────────────────────────────────────────────
    {
        id: 'INVINCIBLE',
        name: 'Invincible',
        category: 'PROTECTIVE',
        description: 'Untargetable. All hitbox checks against this entity return false.',
        defaultDuration: 600,
        untargetable: true,
        stackable: false,
        clearedBy: [],
        visual: { color: '#ffffff', icon: 'status_invincible' }
    },
    {
        id: 'ADAPTED',
        name: 'Adapted',
        category: 'PROTECTIVE',
        description: 'Immune to a specific technique archetype. Mahoraga only.',
        defaultDuration: 0,            // permanent this battle
        permanent: true,
        stackable: true,               // each stack = new archetype immunity
        clearedBy: [],
        visual: { color: '#f0f0f0', icon: 'status_adapted' }
    },

] as const

export type StatusEffectId = typeof STATUS_EFFECTS[number]['id']

// Quick lookup map for the engine
export const STATUS_REGISTRY = Object.fromEntries(
    STATUS_EFFECTS.map(s => [s.id, s])
) as Record<StatusEffectId, typeof STATUS_EFFECTS[number]>