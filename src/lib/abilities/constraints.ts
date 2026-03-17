export const ABILITY_CONSTRAINTS = {
    // Shared
    cost: {
        cursedEnergy: { min: 0, max: 100 },
        throatStrain: { min: 0, max: 100 },
        hp: { min: 0, max: 50 }
    },
    cooldown: { min: 1000, max: 30000 },
    castTime: { min: 0, max: 2000 },
    selfDamage: { min: 0, max: 50 },

    // Payload specific
    payload: {
        damage: { min: 5, max: 120 },
        speed: { min: 100, max: 2000 },
        width: { min: 8, max: 400 },
        height: { min: 8, max: 400 },
        count: { min: 1, max: 20 },
        range: { min: 30, max: 800 },
        radius: { min: 20, max: 500 },
        hitbox: { min: 20, max: 500 },
        duration: { min: 500, max: 15000 },
        invincible: { min: 0, max: 1500 }
    },

    // Status
    status: {
        chance: { min: 0, max: 1 },
        duration: { min: 500, max: 10000 },
        stacks: { min: 1, max: 10 }
    },

    // Stats
    characterStats: { min: 0, max: 100 },

    // Domain
    domain: {
        cost: { min: 0, max: 200 },
        damage: { min: 0, max: 100 }
    }
} as const;
