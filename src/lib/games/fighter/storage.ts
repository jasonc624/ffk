import type { CharacterData } from './types/character';
import type { Options } from './types/options';
export type { CharacterData, Options };

export const STORAGE_KEYS = {
  CHARACTER: 'jjk_character',
  OPTIONS: 'jjk_options',
  DOMAIN_PREFIX: 'jjk_domain_'
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

const isBrowser = typeof window !== 'undefined';

export const getCharacter = (): CharacterData | null => {
  if (!isBrowser) return null;
  const data = localStorage.getItem(STORAGE_KEYS.CHARACTER);
  if (!data) return null;

  const character = JSON.parse(data) as CharacterData;
  if (!character.id) character.id = 'active_sorcerer';

  // Retrieve separate domain data
  const domainData = localStorage.getItem(`${STORAGE_KEYS.DOMAIN_PREFIX}${character.id}`);
  if (domainData) {
    character.domain = {
      ...character.domain,
      ...JSON.parse(domainData)
    };
  }

  return character;
};

export const saveCharacter = (character: CharacterData) => {
  if (!isBrowser) return;

  if (!character.id) character.id = 'active_sorcerer';

  const fullDomain = character.domain ? { ...character.domain } : null;

  // 1. Create a metadata-only character for the main character key
  // This keeps the character object small by removing large fields like scene_html
  const characterMetadata = { ...character };
  if (characterMetadata.domain) {
    // We clear out the heavy fields in the metadata copy
    characterMetadata.domain = {
      ...characterMetadata.domain,
      scene_html: undefined,
      video_url: undefined,
    };
  }

  // 2. Save the metadata
  localStorage.setItem(STORAGE_KEYS.CHARACTER, JSON.stringify(characterMetadata));

  // 3. Save heavy domain assets separately
  if (fullDomain) {
    localStorage.setItem(
      `${STORAGE_KEYS.DOMAIN_PREFIX}${character.id}`,
      JSON.stringify(fullDomain)
    );
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
    // Attempt to clear specific character domains
    const charData = localStorage.getItem(STORAGE_KEYS.CHARACTER);
    if (charData) {
      try {
        const char = JSON.parse(charData) as CharacterData;
        if (char?.id) {
          localStorage.removeItem(`${STORAGE_KEYS.DOMAIN_PREFIX}${char.id}`);
        }
      } catch (e) {
        console.error('Failed to parse character during clearAll', e);
      }
    }
    // Also clear the default key
    localStorage.removeItem(`${STORAGE_KEYS.DOMAIN_PREFIX}active_sorcerer`);
    localStorage.removeItem(STORAGE_KEYS.CHARACTER);
    localStorage.removeItem(STORAGE_KEYS.OPTIONS);
  }
};
