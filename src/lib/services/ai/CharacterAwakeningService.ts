import { generateText, Output } from 'ai';
import { ai } from './ai';
import { z } from 'zod';
import { CHARACTER_AWAKENING_SYSTEM } from '../../prompts';

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
      })
    })
  }),
  domain: z.object({
    name: z.string(),
    description: z.string(),
    mechanic: z.string(),
    image_url: z.string().optional(),
    video_url: z.string().optional(),
    scene_html: z.string().optional(),
    config: z.object({
      name: z.string(),
      subtitle: z.string(),
      lore: z.string(),
      lawText: z.string(),
      stats: z.array(z.object({ label: z.string(), value: z.string() })),
      particles: z.object({
        type: z.enum(['dust', 'ember', 'ash', 'petals', 'shards', 'snow', 'sparks']),
        count: z.number(),
        speed: z.number(),
        size: z.number(),
        hue: z.number(),
        saturation: z.number(),
        opacity: z.number(),
        riseDirection: z.enum(['up', 'down', 'radial'])
      }),
      rays: z.object({
        enabled: z.boolean(),
        count: z.number(),
        color: z.string(),
        intensity: z.number(),
        xPosition: z.number(),
        width: z.number(),
        sway: z.number(),
        angle: z.number().optional()
      }),
      vignette: z.number(),
      fogColor: z.string(),
      fogDensity: z.number(),
      palette: z.object({
        primary: z.string(),
        accent: z.string(),
        glow: z.string()
      }),
      uiOpacity: z.number(),
      uiGlowColor: z.string()
    })
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
    const systemInstruction = CHARACTER_AWAKENING_SYSTEM;

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
