export interface AbilityConfig {
  slot: string;
  name: string;
  key: string;
  cost: {
    cursedEnergy?: number;
    throatStrain?: number;
  };
  cooldown: number; // ms
  activeDuration?: number;
  selfDamage?: number;
  description?: string;
  archetype?: string;
}
