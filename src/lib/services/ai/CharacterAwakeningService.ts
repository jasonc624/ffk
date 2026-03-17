import { generateText, Output } from 'ai';
import { ai } from './ai';
import { z } from 'zod';

export const CharacterSchema = z.object({
  perceived_grade: z.string().describe("The AI's estimation of the sorcerer's potential (e.g. Special Grade Potential)"),
  epithet: z.string(),
  archetype: z.enum(['ACCUMULATION', 'STACK_DEBUFF', 'PROJECTILE']),
  technique: z.object({
    name: z.string(),
    description: z.string(),
    mechanic: z.string(),
    visualProfile: z.object({
      casterColor: z.string(),
      accentColor: z.string(),
      onActivation: z.object({
        caster: z.array(z.any()),
        screen: z.array(z.any())
      }),
      onHit: z.object({
        target: z.array(z.any()),
        screen: z.array(z.any()),
        hud: z.array(z.any())
      }),
      onMaxStacks: z.object({
        target: z.array(z.any()),
        screen: z.array(z.any()),
        hud: z.array(z.any())
      }),
      onDomainExpansion: z.object({
        background: z.object({
          base: z.string(),
          layers: z.array(z.object({
            type: z.string(),
            color: z.string(),
            speed: z.number(),
            opacity: z.number()
          }))
        }),
        ambient: z.array(z.any()),
        caster: z.array(z.any())
      })
    })
  }),
  domain: z.object({
    name: z.string(),
    description: z.string(),
    mechanic: z.string(),
    videoUrl: z.string().optional()
  }),
  extensions: z.array(z.object({
    name: z.string(),
    description: z.string()
  })),
  stats: z.object({
    cursedEnergy: z.number().min(0).max(100),
    technicalSkill: z.number().min(0).max(100),
    speed: z.number().min(0).max(100),
    strength: z.number().min(0).max(100),
    adaptability: z.number().min(0).max(100),
    domainRefinement: z.number().min(0).max(100)
  }),
  color: z.string().regex(/^#[0-9A-F]{6}$/i)
});

export type CharacterResult = z.infer<typeof CharacterSchema>;

export class CharacterAwakeningService {
  constructor() {}

  async awaken(sorcererName: string, answers: Record<string, string>): Promise<CharacterResult> {
    const systemInstruction = `You are a Jujutsu Kaisen lore master and game designer. Your goal is to generate unique, lore-accurate cursed techniques and domains for sorcerers based on their personality and interests.

The character JSON must also include a visualProfile field on the technique object.
You must describe ALL visual effects using ONLY the following token vocabularies.
Do not invent new token type names — only combine existing ones creatively.

EMITTER types: DRIFT_UP, BURST_RADIAL, TRAIL, PULSE_RING, RAIN_DOWN, CONVERGE
PARTICLE types: GLYPH, ORB, SHARD, VAPOR, SPARK, RING
TARGET_FX types: TINT_PULSE, CHROMATIC, GLITCH, HEAT_HAZE, FLICKER, FREEZE, INVERT
SCREEN_FX types: VIGNETTE, SHOCKWAVE, SLOWMO, FLASH, SCREENSHAKE
HUD_FX types: STACK_TICK, BAR_DRAIN, STATUS_ICON, TEXT_POP
BACKGROUND_LAYER types: CIRCUIT_LAVA, CODE_RAIN, VOID_GRID, BONE_FIELD, WATER_MIRROR, STAR_COLLAPSE, FOREST_DARK, SAND_STORM

DESIGN RULES:
- The technique MUST feel like a direct metaphorical extension of their actual hobbies and personality.
- Use JJK's logic: techniques have precise rules, costs, and limitations.
- The domain expansion should feel like a personal hell or paradise warped by their psyche.
- Archetype: MUST be one of: ACCUMULATION, STACK_DEBUFF, or PROJECTILE.
- Color: Return a valid hex color code.`;

    const userPrompt = `Generate a cursed profile for:
Name: ${sorcererName}
Combat instinct: ${answers.q1}
Core drive: ${answers.q2}
Hobbies/interests: ${answers.q3}
Mind type: ${answers.q4}
Fear/weakness: ${answers.q5}
Winning definition: ${answers.q6}
Cursed energy aesthetic: ${answers.q7}`;

    const result = await generateText({
      model: ai("google/gemini-3-flash"),
      system: systemInstruction,
      prompt: userPrompt,
      temperature: 1,
      output: Output.object({ schema: CharacterSchema }),
      providerOptions: {
        gateway: {
          models: [
            "anthropic/claude-sonnet-4.6",
            "alibaba/qwen3.5-flash"
          ],
        } as any,
      },
    });

    return result.output;
  }
}
