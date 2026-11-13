// src/lib/techniques/registry.ts

export const TECHNIQUE_REGISTRY = {

    LIMITLESS: {
        id: 'LIMITLESS',
        name: 'Limitless',
        archetype: 'ENVIRONMENTAL',
        description: 'Manipulation of space at the atomic level using cursed energy.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Blue',
                description: 'Attract — creates a gravitational singularity that pulls opponents in.',
                cost: { cursedEnergy: 20 },
                cooldown: 4000,
                effect: { type: 'FORCED_VELOCITY', direction: 'TOWARD_CASTER', force: 500 }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Red',
                description: 'Repel — creates an inverse singularity that blasts opponents away.',
                cost: { cursedEnergy: 25 },
                cooldown: 5000,
                effect: { type: 'FORCED_VELOCITY', direction: 'AWAY_FROM_CASTER', force: 700 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Infinity',
                description: 'Toggle — all incoming attacks slow to near zero before contact.',
                cost: { cursedEnergy: 30 },
                cooldown: 12000,
                effect: { type: 'TOGGLE_BARRIER', damageReduction: 0.95, duration: 3000 }
            }
        ],
        extensions: [
            {
                id: 'ext_hollow_purple',
                name: 'Hollow Purple',
                unlockCondition: { type: 'MILESTONE', description: 'Land both Blue and Red in the same battle' },
                effect: { type: 'PROJECTILE', damage: 80, width: 200, archetype: 'BURST' }
            }
        ],
        domain: 'UNLIMITED_VOID'
    },

    TEN_SHADOWS: {
        id: 'TEN_SHADOWS',
        name: 'Ten Shadows Technique',
        archetype: 'SUMMON',
        description: 'Manifest shikigami from shadows using cursed energy as a medium.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Divine Dogs',
                description: 'Summon two aggressive shikigami that chase and bite the opponent.',
                cost: { cursedEnergy: 15 },
                cooldown: 8000,
                effect: { type: 'SUMMON', summonId: 'divine_dogs' }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Nue',
                description: 'Summon a flying shikigami that swoops and paralyzes with thunder.',
                cost: { cursedEnergy: 20 },
                cooldown: 10000,
                effect: { type: 'SUMMON', summonId: 'nue' }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Shadow Dive',
                description: 'Merge into your shadow briefly — untargetable, re-emerge anywhere in range.',
                cost: { cursedEnergy: 25 },
                cooldown: 12000,
                effect: { type: 'MOVEMENT', subtype: 'TELEPORT', range: 200, invincibleDuration: 600 }
            }
        ],
        extensions: [
            {
                id: 'ext_piercing_blood',
                name: 'Piercing Blood',
                unlockCondition: { type: 'ENTITY_ACTIVE', requiredId: 'nue' },
                effect: { type: 'COMBO_PROJECTILE', damage: 55, requiresActive: 'nue' }
            },
            {
                id: 'ext_mahoraga',
                name: 'Mahoraga Summoning',
                unlockCondition: { type: 'DESPERATION', hpThreshold: 0.2 },
                effect: { type: 'SACRIFICE_SUMMON', summonId: 'mahoraga' }
            }
        ],
        domain: 'CHIMERA_SHADOW_GARDEN'
    },

    CURSED_SPEECH: {
        id: 'CURSED_SPEECH',
        name: 'Cursed Speech',
        archetype: 'COMMAND',
        description: 'Words engraved with cursed energy that compel obedience.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Blast Away',
                description: 'A shouted command that launches the opponent with massive force.',
                cost: { cursedEnergy: 25, throatStrain: 20 },
                cooldown: 5000,
                effect: { type: 'FORCED_VELOCITY', direction: 'AWAY_FROM_CASTER', force: 800 }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Sleep',
                description: 'A command that forces the opponent into unconsciousness.',
                cost: { cursedEnergy: 35, throatStrain: 35 },
                selfDamage: 8,
                cooldown: 10000,
                effect: { type: 'INPUT_OVERRIDE', overrideType: 'FULL_DISABLE', duration: 3000 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Die',
                description: 'The most powerful command. Near-lethal if the opponent is weakened.',
                cost: { cursedEnergy: 60, throatStrain: 60 },
                selfDamage: 25,
                cooldown: 20000,
                effect: { type: 'THRESHOLD_EXECUTE', threshold: 0.2, damage: 60 }
            }
        ],
        extensions: [
            {
                id: 'ext_amplification',
                name: 'Amplification',
                unlockCondition: { type: 'MILESTONE', description: 'Land 3 commands without being resisted' },
                effect: { type: 'PASSIVE_BUFF', stat: 'resistancePenetration', perStack: 5, maxStacks: 4 }
            }
        ],
        domain: null
    },

    DEADLY_SENTENCING: {
        id: 'DEADLY_SENTENCING',
        name: 'Deadly Sentencing',
        archetype: 'BINDING',
        description: 'Cursed energy shaped by legal logic. Every interaction is a procedure with a verdict.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Confiscation',
                description: 'Lock one of the opponent\'s ability slots for the remainder of the battle.',
                cost: { cursedEnergy: 20 },
                cooldown: 15000,
                effect: { type: 'CONFISCATION', targetSlot: 'random' }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Penalty',
                description: 'A minor judgment — drains opponent CE.',
                cost: { cursedEnergy: 15 },
                cooldown: 6000,
                effect: { type: 'RESOURCE_DRAIN', stat: 'cursedEnergy', amount: 30 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Executioner\'s Sword',
                description: 'A massive cleaver that deals heavy damage when a confiscation is active.',
                cost: { cursedEnergy: 25 },
                cooldown: 8000,
                effect: { type: 'MELEE_STRIKE', damage: 65, requiresStatus: 'CONFISCATION_ACTIVE' }
            }
        ],
        extensions: [],
        domain: 'DEADLY_SENTENCING'
    },

    BLOOD_MANIPULATION: {
        id: 'BLOOD_MANIPULATION',
        name: 'Blood Manipulation',
        archetype: 'PROJECTILE',
        description: 'Complete control over one\'s own blood — shape, harden, accelerate.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Piercing Blood',
                description: 'A compressed blood bullet fired at extreme velocity.',
                cost: { cursedEnergy: 15 },
                cooldown: 3000,
                effect: { type: 'PROJECTILE', damage: 25, speed: 800, width: 8 }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Convergence',
                description: 'Compress all blood in the body to a single point — massive burst damage.',
                cost: { cursedEnergy: 35 },
                cooldown: 10000,
                effect: { type: 'BURST', damage: 50, radius: 80 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Flowing Red Scale',
                description: 'Accelerate blood flow to superhuman levels — speed and strength spike.',
                cost: { cursedEnergy: 20 },
                cooldown: 12000,
                effect: { type: 'SELF_BUFF', stats: { speed: 1.5, strength: 1.4 }, duration: 5000 }
            }
        ],
        extensions: [
            {
                id: 'ext_red_scale_stack',
                name: 'Flowing Red Scale: Stack',
                unlockCondition: { type: 'MILESTONE', description: 'Use Flowing Red Scale 3 times in one battle' },
                effect: { type: 'SELF_BUFF', stats: { speed: 2.0, strength: 1.8 }, selfDamage: 15, duration: 8000 }
            }
        ],
        domain: null
    },

    RATIO: {
        id: 'RATIO',
        name: '7:3 Ratio',
        archetype: 'ACCUMULATION',
        description: 'Divide anything into ten parts. The 7:3 point is always lethal.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Ratio Strike',
                description: 'A strike targeting the 7:3 point on the opponent\'s body.',
                cost: { cursedEnergy: 20 },
                cooldown: 4000,
                effect: { type: 'DAMAGE', damage: 35, archetype: 'PHYSICAL' }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Collapse',
                description: 'Destroy a targeted section of the environment or the opponent\'s guard.',
                cost: { cursedEnergy: 25 },
                cooldown: 7000,
                effect: { type: 'BREAK_BLOCK', damage: 20 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Miracle',
                description: 'A 1-in-a-million strike. Deals massive damage but requires perfect positioning.',
                cost: { cursedEnergy: 40 },
                cooldown: 15000,
                effect: { type: 'DAMAGE', damage: 80, requiresProximity: true, maxRange: 40 }
            }
        ],
        extensions: [],
        domain: 'IDLE_DEATH_GAMBLE'
    },

    PUPPETRY: {
        id: 'PUPPETRY',
        name: 'Puppet Manipulation',
        archetype: 'SUMMON',
        description: 'Animate objects and constructs with cursed energy, controlling them remotely.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Deploy Puppet',
                description: 'Send a cursed puppet toward the opponent that fights independently.',
                cost: { cursedEnergy: 20 },
                cooldown: 8000,
                effect: { type: 'SUMMON', summonId: 'puppet' }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Detonate',
                description: 'Explode an active puppet dealing area damage.',
                cost: { cursedEnergy: 15 },
                cooldown: 5000,
                effect: { type: 'DETONATE_SUMMON', damage: 40, radius: 100 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Body Swap',
                description: 'Switch positions with your active puppet, confusing the opponent.',
                cost: { cursedEnergy: 25 },
                cooldown: 12000,
                effect: { type: 'POSITION_SWAP', targetId: 'active_puppet' }
            }
        ],
        extensions: [],
        domain: null
    },

    ABSORPTION: {
        id: 'ABSORPTION',
        name: 'Cursed Technique Larceny',
        archetype: 'REVERSAL',
        description: 'Copy and temporarily use any cursed technique you are hit by.',
        baseAbilities: [
            {
                slot: 'Ability1',
                key: 'L',
                name: 'Replay',
                description: 'Activate the last technique you absorbed.',
                cost: { cursedEnergy: 25 },
                cooldown: 6000,
                effect: { type: 'REPLAY_ABSORBED', duration: 5000 }
            },
            {
                slot: 'Ability2',
                key: 'E',
                name: 'Erase',
                description: 'Nullify an incoming technique — absorb it without copying.',
                cost: { cursedEnergy: 20 },
                cooldown: 8000,
                effect: { type: 'NULLIFY_INCOMING', window: 400 }
            },
            {
                slot: 'Ability3',
                key: 'F',
                name: 'Overwrite',
                description: 'Force-copy the opponent\'s technique — use their own ability against them.',
                cost: { cursedEnergy: 40 },
                cooldown: 15000,
                effect: { type: 'STEAL_ABILITY', slot: 'random', duration: 8000 }
            }
        ],
        extensions: [],
        domain: null
    }
}