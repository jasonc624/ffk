import { generateText, Output } from 'ai';
import { ai } from './ai';
import { z } from 'zod';
import { 
  BASE_PROFILE_SYSTEM, 
  CALIBRATION_SYSTEM, 
  buildBaseProfilePrompt, 
  buildCalibrationPrompt 
} from '../../prompts/character-awakening';
import { CharacterSchema, BaseProfileSchema, CalibrationSchema, type Character } from '$lib/character/types';


export class CharacterAwakeningService {
  constructor() { }

  async awaken(sorcererName: string, answers: Record<string, string>): Promise<Character> {
    // ── STEP 1: LORE & STRATEGY ───────────────────────────────────────────
    const baseProfileResult = await generateText({
      model: ai("anthropic/claude-sonnet-4.6"),
      system: BASE_PROFILE_SYSTEM,
      prompt: buildBaseProfilePrompt({
        name: sorcererName,
        combatInstinct: answers.q1,
        coreDrive: answers.q2,
        hobbies: answers.q3,
        mindType: answers.q4,
        fear: answers.q5,
        winDefinition: answers.q6,
        ceAesthetic: answers.q7
      }),
      temperature: 0.8,
      output: Output.object({ schema: BaseProfileSchema })
    });

    const baseProfile = baseProfileResult.output;

    // ── STEP 2: MECHANICAL CALIBRATION ────────────────────────────────────
    const calibrationResult = await generateText({
      model: ai("anthropic/claude-sonnet-4.6"),
      system: CALIBRATION_SYSTEM,
      prompt: buildCalibrationPrompt(baseProfile),
      temperature: 0.2, // Low temperature for consistent numbers
      output: Output.object({ schema: CalibrationSchema })
    });

    const calibration = calibrationResult.output;

    // ── STEP 3: MERGE RESULTS ─────────────────────────────────────────────
    const finalCharacter: Character = {
      ...baseProfile,
      domain: {
        ...baseProfile.domain,
        cost: calibration.domain.cost,
        damage: calibration.domain.damage
      },
      abilities: baseProfile.abilities.map(abilityLore => {
        const cal = calibration.abilities.find(a => a.slot === abilityLore.slot);
        return {
          ...abilityLore,
          cost: cal?.cost || { cursedEnergy: 0 },
          cooldown: cal?.cooldown || 5000,
          castTime: cal?.castTime || 0,
          selfDamageOnUse: cal?.selfDamageOnUse,
          payload: cal?.payload || {},
          statusEffects: cal?.statusEffects || []
        };
      })
    };

    return finalCharacter;
  }
}
