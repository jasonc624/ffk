import type { UnifiedDomain } from './domain';
import type { AbilityConfig } from './ability';

export interface CharacterData {
  id?: string;
  name: string;
  perceived_grade: string;
  grade: number; // Rank progression: 0 = Grade 4, 1 = Grade 3, ..., 4 = Special Grade
  maxGrade: number;
  epithet: string;
  technique: {
    name: string;
    description: string;
    mechanic: string;
    visualProfile?: any;
  };
  domain: UnifiedDomain;
  extensions: Array<{
    name: string;
    description: string;
  }>;
  stats: {
    cursedEnergy: number;
    technicalSkill: number;
    speed: number;
    strength: number;
    adaptability: number;
    domainRefinement: number;
  };
  abilities?: AbilityConfig[];
  color?: string;
  archetype?: string;
}
