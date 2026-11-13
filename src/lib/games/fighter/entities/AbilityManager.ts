import type { Character } from './Character';
import type { AbilityConfig } from '../types/ability';

export interface AbilityState {
  config: AbilityConfig;
  remainingCooldown: number;
  isReady: boolean;
  isActive: boolean;
  activeDuration: number;
}

export class AbilityManager {
  character: Character;
  slots: Map<string, AbilityState>;

  constructor(character: Character, abilityConfigs: AbilityConfig[]) {
    this.character = character;
    this.slots = new Map();

    abilityConfigs.forEach(config => {
      this.slots.set(config.slot, {
        config,
        remainingCooldown: 0,
        isReady: true,
        isActive: false,
        activeDuration: 0
      });
    });
  }

  update(delta: number) {
    for (const [slot, state] of this.slots) {
      if (!state.isReady) {
        state.remainingCooldown -= delta;
        if (state.remainingCooldown <= 0) {
          state.remainingCooldown = 0;
          state.isReady = true;
          this.onAbilityReady(slot);
        }
      }

      if (state.isActive) {
        state.activeDuration -= delta;
        if (state.activeDuration <= 0) {
          state.isActive = false;
          state.activeDuration = 0;
        }
      }
    }
  }

  canActivate(slot: string): boolean {
    const state = this.slots.get(slot);
    if (!state) return false;
    if (!state.isReady) return false;
    if (this.character.hasStatus('SILENCED')) return false;
    if (this.character.hasStatus('CE_NULLIFIED')) return false;

    const cost = state.config.cost;
    if (cost.cursedEnergy && this.character.cursedEnergy.current < cost.cursedEnergy) return false;
    if (cost.throatStrain && (this.character as any).throatStrain + cost.throatStrain > 100) return false;

    return true;
  }

  activate(slot: string): boolean {
    if (!this.canActivate(slot)) return false;

    const state = this.slots.get(slot)!;
    const config = state.config;

    // Deduct costs
    if (config.cost.cursedEnergy) {
      this.character.spendCE(config.cost.cursedEnergy);
    }
    
    if (config.cost.throatStrain) {
      (this.character as any).throatStrain += config.cost.throatStrain;
    }

    if (config.cost.hp) {
      this.character.receiveDamage(config.cost.hp, 'SELF', this.character);
    }

    if ((config as any).selfDamage) {
      this.character.receiveDamage((config as any).selfDamage, 'SELF', this.character);
    }

    // Start cooldown immediately on activation
    state.isReady = false;
    state.remainingCooldown = config.cooldown;
    state.isActive = true;
    state.activeDuration = config.activeDuration || 0;

    // Trigger VFX or actual ability logic here if needed
    // For now we assume the entity handling input calls this then does the sprite play/attack
    
    return true;
  }

  getCooldownFraction(slot: string): number {
    const state = this.slots.get(slot);
    if (!state || state.isReady) return 1;
    return 1 - (state.remainingCooldown / state.config.cooldown);
  }

  onAbilityReady(slot: string) {
    // Notify HUD to flash the slot icon
    (this.character.scene as any).events.emit('abilityReady', { characterId: this.character.id, slot });
  }

  getAbilityState(slot: string): AbilityState | undefined {
    return this.slots.get(slot);
  }
}
