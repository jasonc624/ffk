import { json } from '@sveltejs/kit';
import { generateText, Output } from 'ai';
import { ai } from '$lib/games/fighter/services/ai/ai';
import { Img2ThreeSpecSchema } from '$lib/admin/image-to-3d/schema';
import type { RequestHandler } from './$types';

const IMG2THREEJS_SYSTEM_PROMPT = `You are the img2threejs 3D Procedural Reconstruction Engine.
Given a reference image, reconstruct the main subject as a rich, recognizable, solid 3D Three.js model composed of geometric primitives (box, sphere, cylinder, cone, capsule, torus, lathe, octahedron, dodecahedron) and physically-based materials.

Strict Reconstruction Guidelines:
1. COORDINATE SYSTEM: Right-handed Y-up (Three.js standard). Front faces +Z. Ground sits at y = 0. Keep total model height around 1.8 to 2.4 meters centered on x = 0, z = 0.
2. DETAIL-FIRST INVENTORY: First identify 6–12 defining visual features from the image (silhouette curves, primary body mass, clothing/armor trim, straps, eyes/visor, weapon blades, hilt guards, roof contours, glowing energy zones, metallic accents). Map EVERY detail in detailInventory to actual 3D parts.
3. PROPORTIONS & SOLIDITY: Every part must connect solidly to adjacent parts (no floating disconnected pieces unless genuinely floating in the reference). Use overlapping joints (spheres/cylinders/capsules) for clean transitions.
4. USE RICH SHAPES:
   - Use 'lathe' for curved vases, helmets, domes, coats, robes, tapered torsos, pillars, or sword pommels.
   - Use 'capsule' and 'cylinder' for limbs, handles, shafts, barrels, and hair locks.
   - Use 'torus' for collars, belts, rings, halos, wheel rims, and curved guards.
   - Use 'box' with rotation/scale for blades, armor plates, architectural facades, trim bands, and flat details.
   - Set mirrorX: true for symmetric left/right components (arms, legs, pauldrons, ears, eyes, wings, wheels) so the left/right pair is perfectly balanced while keeping the part list rich!
5. COLORS & MATERIALS: Sample authentic hex colors directly from the image. Differentiate matte fabric/skin (roughness 0.72–0.9, metalness 0.0–0.05) from brushed metal/blades (roughness 0.2–0.38, metalness 0.75–0.95) and glowing energy/eyes (emissive hex + emissiveIntensity 0.8–2.0).
6. PART COUNT: Aim for 22–52 well-crafted parts (plus mirrored twins) so the silhouette is immediately recognizable from front, side, and 3/4 angles.`;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      hint?: string;
      detailLevel?: 'balanced' | 'high';
    };

    const imageDataUrl = body.imageDataUrl?.trim();
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
      return json({ error: 'Please provide a valid base64 image data URL.' }, { status: 400 });
    }

    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
    if (!match) {
      return json({ error: 'Malformed image data URL.' }, { status: 400 });
    }
    const mediaType = match[1];
    const base64Data = match[2];

    const detailInstruction =
      body.detailLevel === 'high'
        ? 'Target HIGH DETAIL: 36–64 carefully layered parts with fine trim, secondary accents, beveled layers, and nuanced multi-tone materials.'
        : 'Target BALANCED DETAIL: 22–40 clean, well-proportioned parts capturing the unmistakable silhouette and core details.';

    const userHint = body.hint?.trim()
      ? `Additional guidance from user: "${body.hint.trim()}"`
      : 'Reconstruct the main focal subject cleanly, ignoring plain studio backgrounds.';

    const result = await generateText({
      model: ai('anthropic/claude-sonnet-4.6'),
      system: IMG2THREEJS_SYSTEM_PROMPT,
      temperature: 0.35,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: base64Data,
              mediaType
            },
            {
              type: 'text',
              text: `Analyze this reference image and produce an accurate, animation-friendly Three.js procedural 3D reconstruction spec.\n${detailInstruction}\n${userHint}`
            }
          ]
        }
      ],
      output: Output.object({ schema: Img2ThreeSpecSchema })
    });

    return json({ spec: result.output });
  } catch (err) {
    console.error('[admin/image-to-3d] Reconstruction failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to reconstruct 3D model from image.';
    return json({ error: message }, { status: 500 });
  }
};
