import { json } from '@sveltejs/kit';
import { Client } from '@gradio/client';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

type TrellisSpaceId = 'microsoft/TRELLIS.2' | 'trellis-community/TRELLIS';

interface GradioFileLike {
  url?: string;
  path?: string;
}

function extractFileUrl(item: unknown, spaceBaseUrl: string): string | null {
  if (!item) return null;
  if (typeof item === 'string') {
    if (item.startsWith('http://') || item.startsWith('https://')) return item;
    if (item.startsWith('/')) return `${spaceBaseUrl.replace(/\/$/, '')}${item}`;
    return null;
  }
  if (typeof item === 'object') {
    const obj = item as GradioFileLike & { value?: unknown };
    if (typeof obj.url === 'string' && obj.url.length > 0) return obj.url;
    if (obj.value) return extractFileUrl(obj.value, spaceBaseUrl);
    if (typeof obj.path === 'string' && obj.path.startsWith('http')) return obj.path;
  }
  return null;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image');
    if (!(imageFile instanceof File)) {
      return json({ error: 'Please upload an image file.' }, { status: 400 });
    }

    const rawSpace = String(formData.get('space') ?? 'microsoft/TRELLIS.2');
    const spaceId: TrellisSpaceId =
      rawSpace === 'trellis-community/TRELLIS'
        ? 'trellis-community/TRELLIS'
        : 'microsoft/TRELLIS.2';

    const resolution = String(formData.get('resolution') ?? '1024');
    const validRes = resolution === '512' || resolution === '1536' ? resolution : '1024';
    const textureSize = Math.min(2048, Math.max(512, Number(formData.get('textureSize') ?? 1024) || 1024));
    const decimationTarget = Math.min(
      500000,
      Math.max(100000, Number(formData.get('decimationTarget') ?? 150000) || 150000)
    );
    const meshSimplify = Math.min(0.98, Math.max(0.9, Number(formData.get('meshSimplify') ?? 0.95) || 0.95));
    const rawSeed = Number(formData.get('seed'));
    const seed = Number.isFinite(rawSeed) && rawSeed >= 0 ? Math.floor(rawSeed) : Math.floor(Math.random() * 1_000_000);

    const userToken = String(formData.get('hfToken') ?? '').trim();
    const token = (userToken || env.HF_TOKEN || '').trim();
    const connectOpts = token ? { token: token as `hf_${string}` } : undefined;

    const imageBytes = await imageFile.arrayBuffer();
    const imageBlob = new Blob([imageBytes], { type: imageFile.type || 'image/png' });

    const client = await Client.connect(spaceId, connectOpts);
    const spaceBaseUrl = client.config?.root ?? `https://${spaceId.replace('/', '-').replace(/\./g, '-')}.hf.space`;

    // 1. Initialize remote Gradio session state
    try {
      await client.predict('/start_session', []);
    } catch {
      // Some spaces lazily initialize state on first call
    }

    let glbUrl: string | null = null;

    if (spaceId === 'microsoft/TRELLIS.2') {
      // 2. Background removal & framing via TRELLIS.2's /preprocess_image
      const prepRes = await client.predict('/preprocess_image', { input: imageBlob });
      const preprocessed = Array.isArray(prepRes.data) && prepRes.data[0] ? prepRes.data[0] : imageBlob;

      // 3. Neural 3D structured-latent generation
      await client.predict('/image_to_3d', {
        image: preprocessed,
        seed,
        resolution: validRes,
        ss_guidance_strength: 7.5,
        ss_guidance_rescale: 0.7,
        ss_sampling_steps: 12,
        ss_rescale_t: 5,
        shape_slat_guidance_strength: 7.5,
        shape_slat_guidance_rescale: 0.5,
        shape_slat_sampling_steps: 12,
        shape_slat_rescale_t: 3,
        tex_slat_guidance_strength: 1,
        tex_slat_guidance_rescale: 0,
        tex_slat_sampling_steps: 12,
        tex_slat_rescale_t: 3
      });

      // 4. Extract textured GLB mesh from the session state
      const extRes = await client.predict('/extract_glb', {
        decimation_target: decimationTarget,
        texture_size: Math.max(1024, textureSize)
      });
      const extData = Array.isArray(extRes.data) ? extRes.data : [];
      glbUrl =
        extractFileUrl(extData[1], spaceBaseUrl) ?? extractFileUrl(extData[0], spaceBaseUrl);
    } else {
      // trellis-community/TRELLIS single-call generate & extract
      const prepRes = await client.predict('/preprocess_image', { image: imageBlob });
      const preprocessed = Array.isArray(prepRes.data) && prepRes.data[0] ? prepRes.data[0] : imageBlob;

      const genRes = await client.predict('/generate_and_extract_glb', {
        image: preprocessed,
        multiimages: [],
        seed,
        ss_guidance_strength: 7.5,
        ss_sampling_steps: 12,
        slat_guidance_strength: 3,
        slat_sampling_steps: 12,
        multiimage_algo: 'stochastic',
        mesh_simplify: meshSimplify,
        texture_size: textureSize
      });
      const genData = Array.isArray(genRes.data) ? genRes.data : [];
      glbUrl =
        extractFileUrl(genData[2], spaceBaseUrl) ?? extractFileUrl(genData[1], spaceBaseUrl);
    }

    if (!glbUrl) {
      return json(
        { error: `TRELLIS (${spaceId}) finished without returning a downloadable GLB URL.` },
        { status: 502 }
      );
    }

    // 5. Fetch the generated binary GLB server-side so client avoids CORS & temp URL expiration
    const fetchHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const glbRes = await fetch(glbUrl, { headers: fetchHeaders });
    if (!glbRes.ok) {
      return json(
        { error: `Failed to download generated GLB from TRELLIS (HTTP ${glbRes.status}).` },
        { status: 502 }
      );
    }

    const glbBuffer = await glbRes.arrayBuffer();
    const header = new TextDecoder().decode(new Uint8Array(glbBuffer.slice(0, 4)));
    if (glbBuffer.byteLength < 12 || header !== 'glTF') {
      return json(
        { error: 'Remote Space returned a non-GLB file payload.' },
        { status: 502 }
      );
    }

    return new Response(glbBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': String(glbBuffer.byteLength),
        'X-Trellis-Space': spaceId,
        'X-Trellis-Seed': String(seed)
      }
    });
  } catch (err) {
    console.error('[admin/trellis] Generation failed:', err);
    const rawMsg = err instanceof Error ? err.message : String(err);
    const lower = rawMsg.toLowerCase();
    let friendly = rawMsg;
    if (lower.includes('zerogpu') || lower.includes('quota') || lower.includes('exceeded')) {
      friendly =
        'Hugging Face free ZeroGPU quota was reached on this Space. Try switching to the alternate TRELLIS Space, waiting a minute, or supplying a free Hugging Face token (HF_TOKEN).';
    } else if (lower.includes('503') || lower.includes('sleeping') || lower.includes('loading')) {
      friendly =
        'That Hugging Face TRELLIS Space is currently waking up or busy (HTTP 503). Try again in a moment or switch to the other TRELLIS Space.';
    }
    return json({ error: friendly }, { status: 500 });
  }
};
