import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from './$types';

const MODELS_DIR = path.resolve(process.cwd(), 'static', 'models');

function sanitizeFilename(raw: string): string {
  const base = raw
    .replace(/\.glb$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return base || `model_${Date.now()}`;
}

export const GET: RequestHandler = async () => {
  try {
    await fs.mkdir(MODELS_DIR, { recursive: true });
    const entries = await fs.readdir(MODELS_DIR, { withFileTypes: true });
    const models = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.glb'))
        .map(async (e) => {
          const stat = await fs.stat(path.join(MODELS_DIR, e.name));
          return {
            name: e.name,
            url: `/models/${e.name}`,
            bytes: stat.size,
            modifiedAt: stat.mtime.toISOString()
          };
        })
    );
    models.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return json({ models });
  } catch (err) {
    console.error('[admin/save-glb] GET failed:', err);
    return json({ models: [], error: 'Failed to list static/models' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const requestedName = String(formData.get('filename') ?? 'generated_model');

    if (!(file instanceof File)) {
      return json({ error: 'Missing GLB file payload.' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.byteLength < 12) {
      return json({ error: 'GLB payload is too small or empty.' }, { status: 400 });
    }

    // Validate binary glTF ("glTF") magic header
    const magic = buf.subarray(0, 4).toString('ascii');
    if (magic !== 'glTF') {
      return json({ error: 'Invalid GLB binary header.' }, { status: 400 });
    }

    await fs.mkdir(MODELS_DIR, { recursive: true });
    const safeName = `${sanitizeFilename(requestedName)}.glb`;
    const targetPath = path.join(MODELS_DIR, safeName);

    // Ensure resolved path stays strictly inside static/models
    if (!targetPath.startsWith(MODELS_DIR + path.sep)) {
      return json({ error: 'Invalid target filename.' }, { status: 400 });
    }

    await fs.writeFile(targetPath, buf);

    return json({
      ok: true,
      filename: safeName,
      publicUrl: `/models/${safeName}`,
      bytes: buf.byteLength
    });
  } catch (err) {
    console.error('[admin/save-glb] POST failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to save GLB file.';
    return json({ error: message }, { status: 500 });
  }
};
