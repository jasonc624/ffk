import type { Summon } from './Summon';
import type { Character } from './Character';

export class RosterManager {
  characterId: string;
  slots: Map<string, Summon> = new Map();
  maxActive: number;
  activeSlots: Set<string> = new Set();

  constructor(characterId: string, maxActive: number = 2) {
    this.characterId = characterId;
    this.maxActive = maxActive;
    this.load();
  }

  canSummon(id: string, summoner: Character): boolean {
    const summon = this.slots.get(id);
    if (!summon) return false;
    if (summon.status !== 'AVAILABLE') return false;
    if (this.activeSlots.size >= this.maxActive) return false;
    if (summoner.cursedEnergy.current < summon.cost.cursedEnergy) return false;
    return true;
  }

  summon(id: string, x: number, y: number, summoner: Character) {
    if (!this.canSummon(id, summoner)) return;
    const summon = this.slots.get(id)!;
    summon.summon(x, y, summoner);
    this.activeSlots.add(id);
    this.persist();
  }

  recall(id: string, summoner: Character) {
    const summon = this.slots.get(id);
    if (summon && this.activeSlots.has(id)) {
      summon.recall(summoner);
      this.activeSlots.delete(id);
      this.persist();
    }
  }

  unlock(id: string) {
    const summon = this.slots.get(id);
    if (summon && summon.status === 'LOCKED') {
      summon.status = 'AVAILABLE';
      this.persist();
    }
  }

  lockAllSlots() {
    for (const [id, summon] of this.slots.entries()) {
      if (!this.activeSlots.has(id)) {
        summon.status = 'LOCKED';
      }
    }
    this.persist();
  }

  onSummonDefeated(summon: Summon) {
    this.activeSlots.delete(summon.id);
    this.persist();
  }

  getAvailable(): string[] {
    return Array.from(this.slots.entries())
      .filter(([_, s]) => s.status === 'AVAILABLE')
      .map(([id, _]) => id);
  }

  load() {
    const data = localStorage.getItem(`jjk_roster_${this.characterId}`);
    if (data) {
      const statuses = JSON.parse(data);
      for (const [id, status] of Object.entries(statuses)) {
        const summon = this.slots.get(id);
        if (summon) summon.status = status as any;
      }
    }
  }

  persist() {
    const statuses: Record<string, string> = {};
    for (const [id, summon] of this.slots.entries()) {
      statuses[id] = summon.status;
    }
    localStorage.setItem(`jjk_roster_${this.characterId}`, JSON.stringify(statuses));
  }
}
