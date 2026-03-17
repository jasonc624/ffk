export const STORAGE_KEYS = {
  CHARACTER: 'jjk_character',
  OPTIONS: 'jjk_options'
};

export const GRADE_NAMES = [
  'Grade 4',
  'Grade 3',
  'Grade 2',
  'Grade 1',
  'Special Grade'
];

export function getGradeName(grade: number): string {
  return GRADE_NAMES[Math.min(Math.max(0, Math.floor(grade)), GRADE_NAMES.length - 1)];
}

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

export interface CharacterData {
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
  domain: {
    name: string;
    description: string;
    mechanic: string;
    videoUrl?: string;
  };
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

export interface Options {
  volume: number;
  keybindings: Record<string, string>;
  version: string;
}

const isBrowser = typeof window !== 'undefined';

export const getCharacter = (): CharacterData | null => {
  if (!isBrowser) return null;
  const data = localStorage.getItem(STORAGE_KEYS.CHARACTER);
  return data ? JSON.parse(data) : null;
};

export const saveCharacter = (character: CharacterData) => {
  if (isBrowser) {
    localStorage.setItem(STORAGE_KEYS.CHARACTER, JSON.stringify(character));
  }
};

export const getOptions = (): Options => {
  const defaultOptions: Options = {
    volume: 0.5,
    keybindings: {
      light: 'J',
      heavy: 'K',
      special: 'L',
      block: 'S'
    },
    version: '1.0.0-MVP'
  };
  if (!isBrowser) return defaultOptions;
  const data = localStorage.getItem(STORAGE_KEYS.OPTIONS);
  return data ? { ...defaultOptions, ...JSON.parse(data) } : defaultOptions;
};

export const saveOptions = (options: Options) => {
  if (isBrowser) {
    localStorage.setItem(STORAGE_KEYS.OPTIONS, JSON.stringify(options));
  }
};

export const clearAll = () => {
  if (isBrowser) {
    localStorage.removeItem(STORAGE_KEYS.CHARACTER);
    localStorage.removeItem(STORAGE_KEYS.OPTIONS);
  }
};
