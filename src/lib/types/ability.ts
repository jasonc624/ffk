export interface AbilityStatusEffect {
  statusId: string;
  chance: number;
  duration?: number;
  stacks?: number;
}

export interface AbilityConfig {
  slot: string;
  name: string;
  key: string;
  type?: string;
  cost: {
    cursedEnergy?: number;
    throatStrain?: number;
    hp?: number;
  };
  cooldown: number; // ms
  castTime?: number;
  activeDuration?: number;
  damage?: number;
  description?: string;
  archetype?: string;
  statusEffects?: AbilityStatusEffect[];
  payload?: Record<string, any>;
}
