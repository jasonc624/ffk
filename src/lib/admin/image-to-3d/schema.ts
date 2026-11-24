import { z } from 'zod';

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const MaterialDefSchema = z.object({
  id: z.string().describe('Unique short identifier for this material, e.g. "armor_dark", "blade_steel"'),
  color: z.string().describe('Hex color string sampled from the reference image, e.g. "#2a3548"'),
  roughness: z.number().min(0).max(1).default(0.5),
  metalness: z.number().min(0).max(1).default(0.1),
  emissive: z.string().optional().describe('Optional emissive hex color for glowing zones'),
  emissiveIntensity: z.number().min(0).max(3).optional(),
  opacity: z.number().min(0.05).max(1).optional()
});

export const LathePointSchema = z.tuple([
  z.number().min(0.001).describe('Radius >= 0.001'),
  z.number().describe('Y height coordinate')
]);

export const PartSchema = z.object({
  name: z.string().describe('Descriptive component name, e.g. "torso_core", "left_pauldron", "hilt_guard"'),
  shape: z.enum([
    'box',
    'sphere',
    'cylinder',
    'cone',
    'capsule',
    'torus',
    'lathe',
    'octahedron',
    'dodecahedron'
  ]),
  materialId: z.string().describe('References one of the materials[].id entries'),
  position: Vec3Schema.describe('[x, y, z] center position in meters (Y-up, ground at y = 0)'),
  rotation: Vec3Schema.default([0, 0, 0]).describe('[rx, ry, rz] Euler rotation in radians'),
  scale: Vec3Schema.default([1, 1, 1]).describe('[sx, sy, sz] non-uniform scale factors'),
  // Shape-specific dimensions (all optional so the model only populates what the shape needs)
  size: Vec3Schema.optional().describe('For box: [width, height, depth]'),
  radius: z.number().positive().optional().describe('For sphere, cone, capsule, torus, octahedron, dodecahedron'),
  radiusTop: z.number().min(0).optional().describe('For cylinder'),
  radiusBottom: z.number().min(0).optional().describe('For cylinder'),
  height: z.number().positive().optional().describe('For cylinder, cone, capsule'),
  tube: z.number().positive().optional().describe('For torus tube thickness'),
  arc: z.number().positive().optional().describe('For torus arc angle in radians (default 2*PI)'),
  lathePoints: z
    .array(LathePointSchema)
    .min(3)
    .max(20)
    .optional()
    .describe('For lathe: ordered [radius, y] profile points from bottom to top'),
  mirrorX: z
    .boolean()
    .optional()
    .describe('If true, automatically creates a mirrored twin across X = 0 (negating position.x and rotation.y/z)')
});

export const Img2ThreeSpecSchema = z.object({
  title: z.string().describe('Short descriptive name for the reconstructed 3D object'),
  suggestedFilename: z
    .string()
    .describe('Lowercase snake_case filename without extension, e.g. "cursed_katana"'),
  subjectType: z.enum(['character', 'weapon', 'prop', 'building', 'vehicle', 'creature', 'other']),
  summary: z.string().describe('Brief architectural breakdown of the silhouette, proportions, and materials'),
  detailInventory: z
    .array(z.string())
    .min(3)
    .max(16)
    .describe('Identity-defining visual details extracted from the reference image'),
  materials: z.array(MaterialDefSchema).min(2).max(16),
  parts: z
    .array(PartSchema)
    .min(8)
    .max(96)
    .describe('Ordered list of 3D primitives assembling the full recognizable object with depth and volume')
});

export type MaterialDef = z.infer<typeof MaterialDefSchema>;
export type PartDef = z.infer<typeof PartSchema>;
export type Img2ThreeSpec = z.infer<typeof Img2ThreeSpecSchema>;

export interface LocalReliefOptions {
  depth: number; // Total thickness in meters (e.g. 0.25 .. 1.4)
  resolution: number; // Grid resolution along longest side (e.g. 48 .. 140)
  removeBg: boolean;
  bgThreshold: number; // Color distance threshold 0..120 for background flood-fill
  smoothPasses: number; // Heightmap smoothing passes (1..6)
  roughness: number; // 0..1
  metalness: number; // 0..1
  doubleSidedRelief: boolean; // Mirror relief onto back face for full 3D volume
}

export interface MeshStats {
  meshes: number;
  vertices: number;
  triangles: number;
  width: number;
  height: number;
  depth: number;
}
