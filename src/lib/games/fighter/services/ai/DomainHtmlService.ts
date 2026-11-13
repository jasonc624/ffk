import { generateText, Output } from 'ai';
import { z } from 'zod';
import { DOMAIN_HTML_SYSTEM } from '../../prompts';
import { ai } from './ai';

/**
 * Zod schema for the domain HTML generation result.
 * Updated to match the top-level structure requested in the prompt.
 */
export const DomainHtmlSchema = z.object({
  name: z.string(),
  description: z.string(),
  mechanic: z.string(),
  scene_html: z.string().describe("A complete HTML page with a fullscreen canvas that draws an animated domain expansion scene."),
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
});

export type DomainHtmlResult = z.infer<typeof DomainHtmlSchema>;

export class DomainHtmlService {
  constructor() { }

  /**
   * Generates a unique HTML-based domain expansion animation and its corresponding detailed environment config.
   * 
   * @param domainTitle - The name of the domain expansion.
   * @param domainDescription - A detailed description of the domain's concept and aesthetic.
   * @returns A promise resolving to the comprehensive UnifiedDomain structure.
   */
  async generateDomainHtml(domainTitle: string, domainDescription: string): Promise<DomainHtmlResult> {
    const systemPrompt = DOMAIN_HTML_SYSTEM;

    const userPrompt = `Generate a domain expansion for:
Name: ${domainTitle}
Description: ${domainDescription}

Return a single JSON object matching the requested schema.`;

    const result = await generateText({
      model: ai("anthropic/claude-sonnet-4.6"),
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 1,
      output: Output.object({ schema: DomainHtmlSchema }),
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
