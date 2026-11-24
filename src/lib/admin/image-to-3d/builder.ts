import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Img2ThreeSpec, LocalReliefOptions, MeshStats, PartDef } from './schema';

/**
 * Computes geometry & bounding-box stats for any THREE.Object3D hierarchy.
 */
export function computeMeshStats(root: THREE.Object3D): MeshStats {
  let meshes = 0;
  let vertices = 0;
  let triangles = 0;

  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const geo = mesh.geometry;
      if (!geo) return;
      meshes += 1;
      const pos = geo.attributes.position;
      if (pos) {
        vertices += pos.count;
        if (geo.index) {
          triangles += Math.floor(geo.index.count / 3);
        } else {
          triangles += Math.floor(pos.count / 3);
        }
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
  }

  return {
    meshes,
    vertices,
    triangles,
    width: Number(size.x.toFixed(2)),
    height: Number(size.y.toFixed(2)),
    depth: Number(size.z.toFixed(2))
  };
}

/**
 * Normalizes a generated THREE.Group so it sits flush on y = 0, centered on X/Z,
 * and scaled cleanly to targetMaxHeight meters.
 */
export function normalizeGroupToGround(group: THREE.Group, targetMaxExtent = 2.2): THREE.Group {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return group;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetMaxExtent / maxDim;

  const wrapper = new THREE.Group();
  wrapper.name = group.name || 'reconstructed_model';

  group.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  group.scale.setScalar(scale);
  wrapper.add(group);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

function createGeometryForPart(part: PartDef): THREE.BufferGeometry {
  switch (part.shape) {
    case 'box': {
      const [w, h, d] = part.size ?? [0.5, 0.5, 0.5];
      return new THREE.BoxGeometry(Math.max(0.01, w), Math.max(0.01, h), Math.max(0.01, d));
    }
    case 'sphere': {
      const r = Math.max(0.01, part.radius ?? 0.3);
      return new THREE.SphereGeometry(r, 24, 18);
    }
    case 'cylinder': {
      const rt = Math.max(0, part.radiusTop ?? part.radius ?? 0.2);
      const rb = Math.max(0, part.radiusBottom ?? part.radius ?? 0.2);
      const h = Math.max(0.01, part.height ?? 0.6);
      return new THREE.CylinderGeometry(rt, rb, h, 24);
    }
    case 'cone': {
      const r = Math.max(0.01, part.radius ?? 0.25);
      const h = Math.max(0.01, part.height ?? 0.55);
      return new THREE.ConeGeometry(r, h, 24);
    }
    case 'capsule': {
      const r = Math.max(0.01, part.radius ?? 0.18);
      const h = Math.max(0.01, part.height ?? 0.45);
      return new THREE.CapsuleGeometry(r, h, 10, 20);
    }
    case 'torus': {
      const r = Math.max(0.02, part.radius ?? 0.3);
      const tube = Math.max(0.005, part.tube ?? 0.06);
      const arc = part.arc ?? Math.PI * 2;
      return new THREE.TorusGeometry(r, tube, 14, 32, arc);
    }
    case 'lathe': {
      const pts =
        part.lathePoints && part.lathePoints.length >= 3
          ? part.lathePoints.map(([rx, py]) => new THREE.Vector2(Math.max(0.002, rx), py))
          : [
              new THREE.Vector2(0.01, 0),
              new THREE.Vector2(0.25, 0.25),
              new THREE.Vector2(0.18, 0.6),
              new THREE.Vector2(0.01, 0.75)
            ];
      return new THREE.LatheGeometry(pts, 28);
    }
    case 'octahedron': {
      const r = Math.max(0.01, part.radius ?? 0.25);
      return new THREE.OctahedronGeometry(r, 0);
    }
    case 'dodecahedron': {
      const r = Math.max(0.01, part.radius ?? 0.25);
      return new THREE.DodecahedronGeometry(r, 0);
    }
    default:
      return new THREE.BoxGeometry(0.4, 0.4, 0.4);
  }
}

/**
 * Reconstructs a full Three.js scene graph from an img2threejs procedural sculpt spec.
 */
export function buildGroupFromSpec(spec: Img2ThreeSpec): THREE.Group {
  const inner = new THREE.Group();
  inner.name = spec.suggestedFilename || 'img2threejs_model';

  const matMap = new Map<string, THREE.MeshStandardMaterial>();
  for (const m of spec.materials) {
    const isTransparent = m.opacity !== undefined && m.opacity < 0.99;
    const mat = new THREE.MeshStandardMaterial({
      name: m.id,
      color: new THREE.Color(m.color),
      roughness: m.roughness ?? 0.5,
      metalness: m.metalness ?? 0.1,
      emissive: m.emissive ? new THREE.Color(m.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: m.emissive ? (m.emissiveIntensity ?? 0.65) : 0,
      transparent: isTransparent,
      opacity: m.opacity ?? 1
    });
    matMap.set(m.id, mat);
  }

  const fallbackMat = new THREE.MeshStandardMaterial({
    name: 'default_mat',
    color: 0x94a3b8,
    roughness: 0.55,
    metalness: 0.15
  });

  const addPartMesh = (part: PartDef, mirrored: boolean) => {
    const geo = createGeometryForPart(part);
    const mat = matMap.get(part.materialId) ?? fallbackMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = mirrored ? `${part.name}_mirror` : part.name;
    mesh.position.set(
      mirrored ? -part.position[0] : part.position[0],
      part.position[1],
      part.position[2]
    );
    mesh.rotation.set(
      part.rotation[0],
      mirrored ? -part.rotation[1] : part.rotation[1],
      mirrored ? -part.rotation[2] : part.rotation[2]
    );
    mesh.scale.set(
      Math.max(0.01, part.scale[0]),
      Math.max(0.01, part.scale[1]),
      Math.max(0.01, part.scale[2])
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    inner.add(mesh);
  };

  for (const part of spec.parts) {
    addPartMesh(part, false);
    if (part.mirrorX && Math.abs(part.position[0]) > 0.005) {
      addPartMesh(part, true);
    }
  }

  return normalizeGroupToGround(inner, 2.2);
}

/**
 * Generates clean, copy-ready TypeScript Three.js factory code from an Img2ThreeSpec
 * (matching the img2threejs code-only procedural model workflow).
 */
export function generateThreeJsCode(spec: Img2ThreeSpec): string {
  const fnName =
    'create' +
    (spec.suggestedFilename || 'Model')
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('') +
    'Model';

  const matLines = spec.materials
    .map(
      (m) =>
        `  materials['${m.id}'] = new THREE.MeshStandardMaterial({ color: '${m.color}', roughness: ${m.roughness}, metalness: ${m.metalness}${
          m.emissive ? `, emissive: '${m.emissive}', emissiveIntensity: ${m.emissiveIntensity ?? 0.65}` : ''
        }${m.opacity !== undefined && m.opacity < 0.99 ? `, transparent: true, opacity: ${m.opacity}` : ''} });`
    )
    .join('\n');

  const partLines = spec.parts
    .map((p) => {
      const geoExpr =
        p.shape === 'box'
          ? `new THREE.BoxGeometry(${(p.size ?? [0.5, 0.5, 0.5]).join(', ')})`
          : p.shape === 'sphere'
            ? `new THREE.SphereGeometry(${p.radius ?? 0.3}, 24, 18)`
            : p.shape === 'cylinder'
              ? `new THREE.CylinderGeometry(${p.radiusTop ?? p.radius ?? 0.2}, ${p.radiusBottom ?? p.radius ?? 0.2}, ${p.height ?? 0.6}, 24)`
              : p.shape === 'cone'
                ? `new THREE.ConeGeometry(${p.radius ?? 0.25}, ${p.height ?? 0.55}, 24)`
                : p.shape === 'capsule'
                  ? `new THREE.CapsuleGeometry(${p.radius ?? 0.18}, ${p.height ?? 0.45}, 10, 20)`
                  : p.shape === 'torus'
                    ? `new THREE.TorusGeometry(${p.radius ?? 0.3}, ${p.tube ?? 0.06}, 14, 32, ${p.arc ?? 'Math.PI * 2'})`
                    : p.shape === 'lathe'
                      ? `new THREE.LatheGeometry([${(p.lathePoints ?? [[0.01, 0], [0.25, 0.3], [0.01, 0.6]])
                          .map(([r, y]) => `new THREE.Vector2(${r}, ${y})`)
                          .join(', ')}], 28)`
                      : p.shape === 'octahedron'
                        ? `new THREE.OctahedronGeometry(${p.radius ?? 0.25}, 0)`
                        : `new THREE.DodecahedronGeometry(${p.radius ?? 0.25}, 0)`;

      const block = `  addPart('${p.name}', ${geoExpr}, '${p.materialId}', [${p.position.join(', ')}], [${p.rotation.join(', ')}], [${p.scale.join(', ')}]);`;
      if (p.mirrorX && Math.abs(p.position[0]) > 0.005) {
        return (
          block +
          `\n  addPart('${p.name}_mirror', ${geoExpr}, '${p.materialId}', [${-p.position[0]}, ${p.position[1]}, ${p.position[2]}], [${p.rotation[0]}, ${-p.rotation[1]}, ${-p.rotation[2]}], [${p.scale.join(', ')}]);`
        );
      }
      return block;
    })
    .join('\n');

  return `import * as THREE from 'three';

/**
 * ${spec.title} (${spec.subjectType})
 * ${spec.summary}
 */
export function ${fnName}(): THREE.Group {
  const root = new THREE.Group();
  root.name = '${spec.suggestedFilename}';

  const materials: Record<string, THREE.MeshStandardMaterial> = {};
${matLines}

  const addPart = (
    name: string,
    geo: THREE.BufferGeometry,
    matId: string,
    pos: [number, number, number],
    rot: [number, number, number],
    scl: [number, number, number]
  ) => {
    const mesh = new THREE.Mesh(geo, materials[matId]);
    mesh.name = name;
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scl);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  };

${partLines}

  return root;
}
`;
}

/**
 * Instant 100% browser-side Image -> Sculpted 3D Relief GLB generator:
 * 1. Samples corner colors and runs border flood-fill matting (respecting existing PNG alpha).
 * 2. Computes a Euclidean distance-transform "pillow" volume + luminance detail heightmap.
 * 3. Builds a watertight, textured, double-sided 3D mesh (front relief, back relief, stitched perimeter rim)
 *    with crisp UVs mapped directly to the source image.
 */
export function buildLocalReliefMesh(
  img: HTMLImageElement,
  options: LocalReliefOptions
): { group: THREE.Group; previewDataUrl: string } {
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  const maxRes = Math.max(24, Math.min(148, Math.round(options.resolution)));
  const cols = aspect >= 1 ? maxRes : Math.max(16, Math.round(maxRes * aspect));
  const rows = aspect >= 1 ? Math.max(16, Math.round(maxRes / aspect)) : maxRes;

  // 1. Rasterize image to analysis grid
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = cols;
  sampleCanvas.height = rows;
  const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, cols, rows);
  const imgData = sctx.getImageData(0, 0, cols, rows).data;

  // 2. Build foreground mask (supports transparent PNGs AND automatic border flood-fill BG removal)
  const total = cols * rows;
  const mask = new Uint8Array(total);
  mask.fill(1);

  let hasNativeAlpha = false;
  for (let i = 0; i < total; i++) {
    if (imgData[i * 4 + 3] < 220) {
      hasNativeAlpha = true;
      break;
    }
  }

  if (hasNativeAlpha) {
    for (let i = 0; i < total; i++) {
      if (imgData[i * 4 + 3] < 80) mask[i] = 0;
    }
  }

  if (options.removeBg && !hasNativeAlpha) {
    // Sample 4 corners to estimate background color(s)
    const cornerIndices = [
      0,
      cols - 1,
      (rows - 1) * cols,
      (rows - 1) * cols + (cols - 1)
    ];
    const seeds = cornerIndices.map((idx) => [
      imgData[idx * 4],
      imgData[idx * 4 + 1],
      imgData[idx * 4 + 2]
    ]);
    const threshSq = options.bgThreshold * options.bgThreshold * 3;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let qHead = 0;
    let qTail = 0;

    const isBgPixel = (idx: number) => {
      const r = imgData[idx * 4];
      const g = imgData[idx * 4 + 1];
      const b = imgData[idx * 4 + 2];
      for (const s of seeds) {
        const dr = r - s[0];
        const dg = g - s[1];
        const db = b - s[2];
        if (dr * dr + dg * dg + db * db <= threshSq) return true;
      }
      return false;
    };

    // Seed all border pixels matching background
    for (let x = 0; x < cols; x++) {
      for (const idx of [x, (rows - 1) * cols + x]) {
        if (!visited[idx] && isBgPixel(idx)) {
          visited[idx] = 1;
          mask[idx] = 0;
          queue[qTail++] = idx;
        }
      }
    }
    for (let y = 1; y < rows - 1; y++) {
      for (const idx of [y * cols, y * cols + (cols - 1)]) {
        if (!visited[idx] && isBgPixel(idx)) {
          visited[idx] = 1;
          mask[idx] = 0;
          queue[qTail++] = idx;
        }
      }
    }

    // BFS flood fill inward from edges
    while (qHead < qTail) {
      const cur = queue[qHead++];
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      const neighbors = [
        cx > 0 ? cur - 1 : -1,
        cx < cols - 1 ? cur + 1 : -1,
        cy > 0 ? cur - cols : -1,
        cy < rows - 1 ? cur + cols : -1
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited[n] && isBgPixel(n)) {
          visited[n] = 1;
          mask[n] = 0;
          queue[qTail++] = n;
        }
      }
    }
  }

  // Guard: if aggressive threshold erased almost everything, fall back to full mask
  let fgCount = 0;
  for (let i = 0; i < total; i++) fgCount += mask[i];
  if (fgCount < total * 0.02) {
    mask.fill(1);
  }

  // 3. Two-pass Chamfer distance transform from silhouette boundary for smooth 3D pillow inflation
  const dist = new Float32Array(total);
  const INF = 1e6;
  for (let i = 0; i < total; i++) {
    if (mask[i] === 0) {
      dist[i] = 0;
    } else {
      const x = i % cols;
      const y = Math.floor(i / cols);
      dist[i] = x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? 0.5 : INF;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) d = Math.min(d, dist[i - cols] + 1);
      if (x > 0 && y > 0) d = Math.min(d, dist[i - cols - 1] + 1.414);
      if (x < cols - 1 && y > 0) d = Math.min(d, dist[i - cols + 1] + 1.414);
      dist[i] = d;
    }
  }
  let maxDist = 1;
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x < cols - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < rows - 1) d = Math.min(d, dist[i + cols] + 1);
      if (x < cols - 1 && y < rows - 1) d = Math.min(d, dist[i + cols + 1] + 1.414);
      if (x > 0 && y < rows - 1) d = Math.min(d, dist[i + cols - 1] + 1.414);
      dist[i] = d;
      if (d > maxDist) maxDist = d;
    }
  }

  // Combine pillow dome (sqrt curve) + subtle luminance relief detail
  let heightMap = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    if (mask[i] === 0) {
      heightMap[i] = 0;
      continue;
    }
    const normD = Math.min(1, dist[i] / maxDist);
    const pillow = Math.pow(normD, 0.55);
    const r = imgData[i * 4] / 255;
    const g = imgData[i * 4 + 1] / 255;
    const b = imgData[i * 4 + 2] / 255;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    heightMap[i] = Math.max(0.06, pillow * 0.78 + luma * 0.22 * Math.sqrt(normD));
  }

  // Optional Gaussian-like box smoothing passes to eliminate stair-stepping
  const passes = Math.max(0, Math.min(6, Math.round(options.smoothPasses)));
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(total);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (mask[i] === 0) continue;
        let sum = heightMap[i] * 2;
        let w = 2;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
              const ni = ny * cols + nx;
              if (mask[ni] === 1) {
                sum += heightMap[ni];
                w += 1;
              }
            }
          }
        }
        next[i] = sum / w;
      }
    }
    heightMap = next;
  }

  // 4. Build high-resolution diffuse texture (with clean matted edges)
  const texW = Math.min(1024, Math.max(256, img.naturalWidth));
  const texH = Math.min(1024, Math.max(256, img.naturalHeight));
  const texCanvas = document.createElement('canvas');
  texCanvas.width = texW;
  texCanvas.height = texH;
  const tctx = texCanvas.getContext('2d')!;
  tctx.drawImage(img, 0, 0, texW, texH);

  // Also generate a small matte preview image so the user sees what background removal cut out
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = cols;
  previewCanvas.height = rows;
  const pctx = previewCanvas.getContext('2d')!;
  const prevImgData = pctx.createImageData(cols, rows);
  for (let i = 0; i < total; i++) {
    prevImgData.data[i * 4] = imgData[i * 4];
    prevImgData.data[i * 4 + 1] = imgData[i * 4 + 1];
    prevImgData.data[i * 4 + 2] = imgData[i * 4 + 2];
    prevImgData.data[i * 4 + 3] = mask[i] ? 255 : 0;
  }
  pctx.putImageData(prevImgData, 0, 0);

  const texture = new THREE.CanvasTexture(texCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  // 5. Construct watertight front + back + perimeter rim BufferGeometry
  const worldW = aspect >= 1 ? 2.0 : 2.0 * aspect;
  const worldH = aspect >= 1 ? 2.0 / aspect : 2.0;
  const halfDepth = Math.max(0.04, options.depth * 0.5);

  const frontIdx = new Int32Array(total).fill(-1);
  const backIdx = new Int32Array(total).fill(-1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (mask[i] === 0) continue;
      const u = x / Math.max(1, cols - 1);
      const v = 1 - y / Math.max(1, rows - 1);
      const wx = (u - 0.5) * worldW;
      const wy = v * worldH;
      const zVal = heightMap[i] * halfDepth;

      frontIdx[i] = positions.length / 3;
      positions.push(wx, wy, zVal);
      uvs.push(u, v);

      backIdx[i] = positions.length / 3;
      positions.push(wx, wy, options.doubleSidedRelief ? -zVal : -halfDepth * 0.12);
      uvs.push(u, v);
    }
  }

  const isCellActive = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < cols - 1 &&
    y < rows - 1 &&
    mask[y * cols + x] === 1 &&
    mask[y * cols + x + 1] === 1 &&
    mask[(y + 1) * cols + x] === 1 &&
    mask[(y + 1) * cols + x + 1] === 1;

  for (let y = 0; y < rows - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      if (!isCellActive(x, y)) continue;
      const a = y * cols + x;
      const b = a + 1;
      const c = (y + 1) * cols + x;
      const d = c + 1;

      // Front face (+Z)
      indices.push(frontIdx[a], frontIdx[c], frontIdx[b]);
      indices.push(frontIdx[b], frontIdx[c], frontIdx[d]);

      // Back face (-Z)
      indices.push(backIdx[a], backIdx[b], backIdx[c]);
      indices.push(backIdx[b], backIdx[d], backIdx[c]);

      // Stitch perimeter side walls wherever an adjacent cell is empty
      if (!isCellActive(x, y - 1)) {
        // Top edge (a -> b)
        indices.push(frontIdx[a], frontIdx[b], backIdx[b]);
        indices.push(frontIdx[a], backIdx[b], backIdx[a]);
      }
      if (!isCellActive(x, y + 1)) {
        // Bottom edge (c -> d)
        indices.push(frontIdx[d], frontIdx[c], backIdx[c]);
        indices.push(frontIdx[d], backIdx[c], backIdx[d]);
      }
      if (!isCellActive(x - 1, y)) {
        // Left edge (a -> c)
        indices.push(frontIdx[c], frontIdx[a], backIdx[a]);
        indices.push(frontIdx[c], backIdx[a], backIdx[c]);
      }
      if (!isCellActive(x + 1, y)) {
        // Right edge (b -> d)
        indices.push(frontIdx[b], frontIdx[d], backIdx[d]);
        indices.push(frontIdx[b], backIdx[d], backIdx[b]);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    name: 'sculpted_surface',
    map: texture,
    roughness: options.roughness,
    metalness: options.metalness,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'relief_sculpt_mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const inner = new THREE.Group();
  inner.name = 'local_relief_model';
  inner.add(mesh);

  return {
    group: normalizeGroupToGround(inner, 2.2),
    previewDataUrl: previewCanvas.toDataURL('image/png')
  };
}

/**
 * Exports any THREE.Object3D to a binary GLB ArrayBuffer using Three.js GLTFExporter.
 */
export function exportGroupToGlb(group: THREE.Object3D): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          reject(new Error('GLTFExporter did not return binary ArrayBuffer output.'));
        }
      },
      (err) => {
        reject(err instanceof Error ? err : new Error(String(err)));
      },
      { binary: true }
    );
  });
}

/**
 * Cleanly disposes geometries and materials of a generated group when replacing preview models.
 */
export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (!mat) continue;
        const std = mat as THREE.MeshStandardMaterial;
        std.map?.dispose();
        mat.dispose();
      }
    }
  });
}
