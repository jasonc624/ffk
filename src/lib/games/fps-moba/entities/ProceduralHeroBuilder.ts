import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FpsHeroDef, MobaTeam } from '../types';

export type HeroAnimHint =
  | 'idle'
  | 'dance'
  | 'walk'
  | 'run'
  | 'reality_wipe'
  | 'thin_ice_breaker'
  | 'domain_expansion';

export interface ProceduralHeroBuildResult {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  hitMeshes: THREE.Object3D[];
  hpBarFill: THREE.Mesh;
  nameplateMesh: THREE.Mesh;
  animate: (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => void;
}

interface RiggedBoneRecord {
  bone: THREE.Bone;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  bindWorldQuat: THREE.Quaternion;
}

type BasicLocomotionHint = 'idle' | 'dance' | 'walk' | 'run';

interface BiomasterAnimController {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<BasicLocomotionHint, THREE.AnimationAction>;
  activeKey: BasicLocomotionHint | null;
  lastElapsed: number;
}

interface UroAnimController {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction;
  moveAction: THREE.AnimationAction;
  realityWipeAction: THREE.AnimationAction | null;
  thinIceAction: THREE.AnimationAction | null;
  domainAction: THREE.AnimationAction | null;
  activeKey: string;
  warpNormalTex: THREE.DataTexture;
  smokeTimeUniform: { value: number };
  lastElapsed: number;
}

interface DualClipAnimController {
  idleRoot: THREE.Group;
  idleMixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction;
  runRoot: THREE.Group;
  runMixer: THREE.AnimationMixer;
  runAction: THREE.AnimationAction;
  activeState: 'idle' | 'run';
  lastElapsed: number;
}

interface RiggedGojoHandle {
  root: THREE.Group;
  hitMeshes: THREE.Mesh[];
  bones: Map<string, RiggedBoneRecord>;
  mixer: THREE.AnimationMixer | null;
  isTposeBind?: boolean;
  biomasterAnim?: BiomasterAnimController;
  dualClipAnim?: DualClipAnimController;
  uroAnim?: UroAnimController;
}

let cachedToonGradient: THREE.DataTexture | null = null;
let cachedWoodTexture: THREE.CanvasTexture | null = null;
let cachedSkyWarpNormalTex: THREE.DataTexture | null = null;

const _tmpCharEuler = new THREE.Euler();
const _tmpCharQuat = new THREE.Quaternion();
const _tmpDeltaQuat = new THREE.Quaternion();
const _tmpHandWorld = new THREE.Vector3();

function resetRigBones(bones: Map<string, RiggedBoneRecord>): void {
  bones.forEach(({ bone, restPos, restQuat }) => {
    bone.position.copy(restPos);
    bone.quaternion.copy(restQuat);
  });
}

/** Rotates an FBX bone cleanly in character space (`+Y` up, `+Z` forward) relative to its bind pose. */
function poseRigBone(
  bones: Map<string, RiggedBoneRecord>,
  name: string,
  rx: number,
  ry: number,
  rz: number
): void {
  const rec = bones.get(name);
  if (!rec) return;
  _tmpCharEuler.set(rx, ry, rz, 'XYZ');
  _tmpCharQuat.setFromEuler(_tmpCharEuler);
  _tmpDeltaQuat.copy(rec.bindWorldQuat).invert().multiply(_tmpCharQuat).multiply(rec.bindWorldQuat);
  rec.bone.quaternion.copy(rec.restQuat).multiply(_tmpDeltaQuat);
}

/** Separates A-pose arm vertices from torso/pants cleft and collapses bridging triangles so arms never pull hips. */
function sanitizeGojoSkinnedMesh(mesh: THREE.SkinnedMesh): void {
  const geo = mesh.geometry;
  const posAttr = geo.attributes.position as THREE.BufferAttribute | undefined;
  const idxAttr = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const wAttr = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
  if (!posAttr || !idxAttr || !wAttr || !mesh.skeleton) return;

  const boneIndexMap = new Map<string, number>();
  mesh.skeleton.bones.forEach((b, idx) => boneIndexMap.set(b.name, idx));

  const rArm = boneIndexMap.get('RightArm');
  const rFore = boneIndexMap.get('RightForeArm');
  const rHand = boneIndexMap.get('RightHand');
  const lArm = boneIndexMap.get('LeftArm');
  const lFore = boneIndexMap.get('LeftForeArm');
  const lHand = boneIndexMap.get('LeftHand');
  const hips = boneIndexMap.get('Hips') ?? 0;
  const spine02 = boneIndexMap.get('Spine02') ?? hips;
  const spine01 = boneIndexMap.get('Spine01') ?? spine02;
  const rUpLeg = boneIndexMap.get('RightUpLeg') ?? hips;
  const lUpLeg = boneIndexMap.get('LeftUpLeg') ?? hips;

  if (
    rArm === undefined ||
    rFore === undefined ||
    rHand === undefined ||
    lArm === undefined ||
    lFore === undefined ||
    lHand === undefined
  ) {
    return;
  }

  const armBoneSet = new Set<number>([rArm, rFore, rHand, lArm, lFore, lHand]);
  for (const shoulderName of ['LeftShoulder', 'RightShoulder']) {
    const sIdx = boneIndexMap.get(shoulderName);
    if (sIdx !== undefined) armBoneSet.add(sIdx);
  }

  let maxY = 0;
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    if (y > maxY) maxY = y;
  }
  const posScale = maxY > 10 ? 100 : 1;

  const interpSep = (y: number): number => {
    const ys = [0.79, 0.86, 0.95, 1.05, 1.13, 1.235];
    const xs = [0.184, 0.176, 0.162, 0.142, 0.128, 0.122];
    if (y <= ys[0]) return xs[0];
    if (y >= ys[ys.length - 1]) return xs[xs.length - 1];
    for (let k = 0; k < ys.length - 1; k++) {
      if (y <= ys[k + 1]) {
        const t = (y - ys[k]) / (ys[k + 1] - ys[k]);
        return xs[k] + t * (xs[k + 1] - xs[k]);
      }
    }
    return xs[xs.length - 1];
  };

  const count = posAttr.count;
  const isArm = new Uint8Array(count);
  const normY = new Float32Array(count);
  const normX = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i) / posScale;
    const y = posAttr.getY(i) / posScale;
    const z = posAttr.getZ(i) / posScale;
    normX[i] = x;
    normY[i] = y;

    const inY = y >= 0.79 && y < 1.235;
    const inZ = y < 0.92 ? z > 0.015 : z > -0.095;
    const sep = interpSep(y);
    const isRArm = inY && inZ && x < -sep;
    const isLArm = inY && inZ && x > sep;

    if (isRArm || isLArm) {
      isArm[i] = 1;
      const upJ = isRArm ? rArm : lArm;
      const midJ = isRArm ? rFore : lFore;
      const loJ = isRArm ? rHand : lHand;
      if (y >= 1.13) {
        const t = Math.max(0, Math.min(1, (y - 1.13) / (1.235 - 1.13)));
        idxAttr.setXYZW(i, upJ, midJ, 0, 0);
        wAttr.setXYZW(i, t, 1 - t, 0, 0);
      } else {
        const t = Math.max(0, Math.min(1, (y - 0.93) / (1.03 - 0.93)));
        idxAttr.setXYZW(i, midJ, loJ, 0, 0);
        wAttr.setXYZW(i, t, 1 - t, 0, 0);
      }
    } else if (y < 1.235) {
      const j = [idxAttr.getX(i), idxAttr.getY(i), idxAttr.getZ(i), idxAttr.getW(i)];
      const w = [wAttr.getX(i), wAttr.getY(i), wAttr.getZ(i), wAttr.getW(i)];
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        if (armBoneSet.has(j[k])) {
          j[k] = 0;
          w[k] = 0;
        } else {
          sum += w[k];
        }
      }
      if (sum > 0.05) {
        idxAttr.setXYZW(i, j[0], j[1], j[2], j[3]);
        wAttr.setXYZW(i, w[0] / sum, w[1] / sum, w[2] / sum, w[3] / sum);
      } else {
        const fb =
          y >= 1.15 ? spine01 : y >= 1.05 ? spine02 : y >= 0.95 ? hips : x < 0 ? rUpLeg : lUpLeg;
        idxAttr.setXYZW(i, fb, 0, 0, 0);
        wAttr.setXYZW(i, 1, 0, 0, 0);
      }
    }
  }

  const index = geo.index;
  if (index) {
    for (let t = 0; t + 2 < index.count; t += 3) {
      const a = index.getX(t);
      const b = index.getX(t + 1);
      const c = index.getX(t + 2);
      const s = isArm[a] + isArm[b] + isArm[c];
      if (s === 1) {
        if (isArm[a]) index.setX(t, b);
        else if (isArm[b]) index.setX(t + 1, c);
        else index.setX(t + 2, a);
      } else if (s === 2) {
        if (!isArm[a]) index.setX(t, b);
        else if (!isArm[b]) index.setX(t + 1, c);
        else index.setX(t + 2, a);
      } else if (s >= 1) {
        const highTorsoA = !isArm[a] && normY[a] >= 1.235 && Math.abs(normX[a]) < 0.122;
        const highTorsoB = !isArm[b] && normY[b] >= 1.235 && Math.abs(normX[b]) < 0.122;
        const highTorsoC = !isArm[c] && normY[c] >= 1.235 && Math.abs(normX[c]) < 0.122;
        if (highTorsoA || highTorsoB || highTorsoC) {
          index.setX(t + 1, a);
          index.setX(t + 2, a);
        }
      }
    }
    index.needsUpdate = true;
  }

  idxAttr.needsUpdate = true;
  wAttr.needsUpdate = true;
}

/** Loads and rigs the textured Gojo GLB (`/models/gojo_animated.glb`, falling back to FBX) with cel-shading. */
async function loadRiggedGojoFbx(unitUserData?: unknown): Promise<RiggedGojoHandle | null> {
  if (typeof window === 'undefined') return null;
  try {
    let root: THREE.Group;
    let animations: THREE.AnimationClip[] = [];
    let isGlb = false;

    try {
      const gltf = await new GLTFLoader().loadAsync('/models/gojo_animated.glb');
      root = gltf.scene;
      animations = gltf.animations;
      // Armature node has scale [0.01, 0.01, 0.01] -> 1.70m height; scale to 2.22m arena hero height
      root.scale.setScalar(2.22 / 1.70);
      isGlb = true;
    } catch {
      const fbx = await new FBXLoader().loadAsync('/models/gojo_rigged.fbx');
      root = fbx;
      animations = fbx.animations ?? [];
      root.scale.setScalar(2.22 / 170);
    }

    root.updateMatrixWorld(true);

    const bones = new Map<string, RiggedBoneRecord>();
    const riggedMeshes: THREE.Mesh[] = [];
    const toonGrad = getAnimeToonGradient();

    root.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) {
        const bone = obj as THREE.Bone;
        bones.set(bone.name, {
          bone,
          restPos: bone.position.clone(),
          restQuat: bone.quaternion.clone(),
          bindWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion())
        });
      }

      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        sanitizeGojoSkinnedMesh(obj as THREE.SkinnedMesh);
      }

      if ((obj as THREE.Mesh).isMesh || (obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = obj as THREE.Mesh;
        const origMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const map = origMat && 'map' in origMat ? ((origMat as THREE.MeshStandardMaterial).map ?? null) : null;
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 4;
          map.needsUpdate = true;
        }
        mesh.material = new THREE.MeshToonMaterial({
          color: 0xffffff,
          map,
          gradientMap: toonGrad,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: map,
          emissiveIntensity: map ? 0.26 : 0
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        if (mesh.geometry) {
          mesh.geometry.computeBoundingSphere();
          if (mesh.geometry.boundingSphere) {
            // char1 vertices are [0, 1.70] under Armature scale 0.01; expand sphere for Three.js SkinnedMesh raycast
            mesh.geometry.boundingSphere.radius *= isGlb ? 150 : 1.45;
          }
        }
        if (unitUserData !== undefined) {
          mesh.userData.unit = unitUserData;
        }
        riggedMeshes.push(mesh);
      }
    });

    let mixer: THREE.AnimationMixer | null = null;
    if (animations.length > 0) {
      const clip = animations.find((c) => c.duration > 0.2);
      if (clip) {
        mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      }
    }

    return { root, hitMeshes: riggedMeshes, bones, mixer };
  } catch {
    return null;
  }
}

/** Auto-rigs an unskinned 2.22m T-pose mesh (arms along ±X, facing +Z) with a 20-bone humanoid skeleton. */
function rigTposeMeshToHumanoid(
  mesh: THREE.Mesh,
  root: THREE.Group,
  toonGrad: THREE.DataTexture,
  unitUserData?: unknown
): { skinned: THREE.SkinnedMesh; bones: Map<string, RiggedBoneRecord> } {
  const boneSpecs: Array<[string, string | null, [number, number, number]]> = [
    ['Hips', null, [0, 1.18, 0]],
    ['Spine02', 'Hips', [0, 1.32, 0]],
    ['Spine01', 'Spine02', [0, 1.48, 0]],
    ['Spine', 'Spine01', [0, 1.63, -0.015]],
    ['neck', 'Spine', [0, 1.82, 0]],
    ['Head', 'neck', [0, 1.95, 0.02]],
    ['LeftShoulder', 'Spine', [0.14, 1.64, -0.04]],
    ['LeftArm', 'LeftShoulder', [0.25, 1.64, -0.056]],
    ['LeftForeArm', 'LeftArm', [0.52, 1.65, -0.095]],
    ['LeftHand', 'LeftForeArm', [0.76, 1.66, -0.063]],
    ['RightShoulder', 'Spine', [-0.14, 1.64, -0.04]],
    ['RightArm', 'RightShoulder', [-0.25, 1.64, -0.056]],
    ['RightForeArm', 'RightArm', [-0.52, 1.65, -0.095]],
    ['RightHand', 'RightForeArm', [-0.76, 1.66, -0.063]],
    ['LeftUpLeg', 'Hips', [0.145, 1.12, -0.005]],
    ['LeftLeg', 'LeftUpLeg', [0.165, 0.62, -0.018]],
    ['LeftFoot', 'LeftLeg', [0.21, 0.16, -0.065]],
    ['RightUpLeg', 'Hips', [-0.145, 1.12, -0.005]],
    ['RightLeg', 'RightUpLeg', [-0.165, 0.62, -0.018]],
    ['RightFoot', 'RightLeg', [-0.21, 0.16, -0.065]]
  ];

  const boneList: THREE.Bone[] = [];
  const boneMap = new Map<string, THREE.Bone>();
  const worldPosMap = new Map<string, [number, number, number]>();
  const indexMap = new Map<string, number>();

  for (const [name, parentName, worldPos] of boneSpecs) {
    const bone = new THREE.Bone();
    bone.name = name;
    worldPosMap.set(name, worldPos);
    if (parentName && boneMap.has(parentName)) {
      const parentPos = worldPosMap.get(parentName)!;
      bone.position.set(
        worldPos[0] - parentPos[0],
        worldPos[1] - parentPos[1],
        worldPos[2] - parentPos[2]
      );
      boneMap.get(parentName)!.add(bone);
    } else {
      bone.position.set(worldPos[0], worldPos[1], worldPos[2]);
      root.add(bone);
    }
    indexMap.set(name, boneList.length);
    boneList.push(bone);
    boneMap.set(name, bone);
  }

  root.updateMatrixWorld(true);

  const bones = new Map<string, RiggedBoneRecord>();
  for (const bone of boneList) {
    bones.set(bone.name, {
      bone,
      restPos: bone.position.clone(),
      restQuat: bone.quaternion.clone(),
      bindWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion())
    });
  }

  const geo = mesh.geometry.clone();
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const bIdx = (name: string) => indexMap.get(name) ?? 0;
  const setBlend = (v: number, j0: number, j1: number, w0: number) => {
    const clampW0 = Math.max(0, Math.min(1, w0));
    const base = v * 4;
    skinIndices[base] = j0;
    skinIndices[base + 1] = j1;
    skinWeights[base] = clampW0;
    skinWeights[base + 1] = 1 - clampW0;
  };

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const ax = Math.abs(x);

    if (y >= 1.40 && y <= 1.85 && ax > 0.22) {
      const isLeft = x > 0;
      const sh = bIdx(isLeft ? 'LeftShoulder' : 'RightShoulder');
      const arm = bIdx(isLeft ? 'LeftArm' : 'RightArm');
      const fore = bIdx(isLeft ? 'LeftForeArm' : 'RightForeArm');
      const hand = bIdx(isLeft ? 'LeftHand' : 'RightHand');

      if (ax < 0.30) {
        setBlend(i, sh, arm, (0.30 - ax) / (0.30 - 0.22));
      } else if (ax < 0.48) {
        setBlend(i, arm, fore, 1.0);
      } else if (ax < 0.56) {
        setBlend(i, arm, fore, (0.56 - ax) / (0.56 - 0.48));
      } else if (ax < 0.72) {
        setBlend(i, fore, hand, 1.0);
      } else if (ax < 0.80) {
        setBlend(i, fore, hand, (0.80 - ax) / (0.80 - 0.72));
      } else {
        setBlend(i, hand, fore, 1.0);
      }
    } else if (y < 1.16) {
      const isLeft = x >= 0;
      const up = bIdx(isLeft ? 'LeftUpLeg' : 'RightUpLeg');
      const leg = bIdx(isLeft ? 'LeftLeg' : 'RightLeg');
      const foot = bIdx(isLeft ? 'LeftFoot' : 'RightFoot');
      const hips = bIdx('Hips');

      if (y > 1.08) {
        setBlend(i, hips, up, (y - 1.08) / (1.16 - 1.08));
      } else if (y > 0.67) {
        setBlend(i, up, leg, 1.0);
      } else if (y > 0.57) {
        setBlend(i, up, leg, (y - 0.57) / (0.67 - 0.57));
      } else if (y > 0.21) {
        setBlend(i, leg, foot, 1.0);
      } else if (y > 0.12) {
        setBlend(i, leg, foot, (y - 0.12) / (0.21 - 0.12));
      } else {
        setBlend(i, foot, leg, 1.0);
      }
    } else {
      const hips = bIdx('Hips');
      const s02 = bIdx('Spine02');
      const s01 = bIdx('Spine01');
      const spine = bIdx('Spine');
      const neck = bIdx('neck');
      const head = bIdx('Head');

      if (y >= 1.90) {
        setBlend(i, head, neck, 1.0);
      } else if (y >= 1.84) {
        setBlend(i, head, neck, (y - 1.84) / (1.90 - 1.84));
      } else if (y >= 1.74) {
        setBlend(i, neck, spine, (y - 1.74) / (1.84 - 1.74));
      } else if (y >= 1.56) {
        setBlend(i, spine, s01, (y - 1.56) / (1.74 - 1.56));
      } else if (y >= 1.40) {
        setBlend(i, s01, s02, (y - 1.40) / (1.56 - 1.40));
      } else {
        setBlend(i, s02, hips, (y - 1.16) / (1.40 - 1.16));
      }
    }
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.computeBoundingSphere();
  if (geo.boundingSphere) {
    geo.boundingSphere.radius *= 1.45;
  }

  const origMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const map = origMat && 'map' in origMat ? ((origMat as THREE.MeshStandardMaterial).map ?? null) : null;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }

  const toonMat = new THREE.MeshToonMaterial({
    color: 0xffffff,
    map,
    gradientMap: toonGrad,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: map,
    emissiveIntensity: map ? 0.24 : 0
  });

  const skinned = new THREE.SkinnedMesh(geo, toonMat);
  skinned.name = mesh.name;
  skinned.castShadow = true;
  skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  if (unitUserData !== undefined) {
    skinned.userData.unit = unitUserData;
  }

  const skeleton = new THREE.Skeleton(boneList);
  skinned.bind(skeleton);

  return { skinned, bones };
}

const cachedBiomasterClipGltfs = new Map<
  string,
  Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>
>();

export function loadCachedGlb(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  let pending = cachedBiomasterClipGltfs.get(url);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url);
    cachedBiomasterClipGltfs.set(url, pending);
  }
  return pending;
}

export function applyAnimeToonToScene(
  sceneRoot: THREE.Object3D,
  toonGrad: THREE.DataTexture,
  sharedMap?: THREE.Texture | null
): THREE.Texture | null {
  let extractedMap: THREE.Texture | null = sharedMap ?? null;
  sceneRoot.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      const origMat = Array.isArray(m.material) ? m.material[0] : m.material;
      const rawMap =
        sharedMap ??
        (origMat && 'map' in origMat ? ((origMat as THREE.MeshStandardMaterial).map ?? null) : null);
      if (rawMap) {
        rawMap.colorSpace = THREE.SRGBColorSpace;
        rawMap.anisotropy = 4;
        if (!extractedMap) extractedMap = rawMap;
      }
      m.material = new THREE.MeshToonMaterial({
        color: 0xffffff,
        map: rawMap,
        gradientMap: toonGrad,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: rawMap,
        emissiveIntensity: rawMap ? 0.24 : 0
      });
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.raycast = () => {};
    }
  });
  return extractedMap;
}

/** Loads Gojo's idle (`gojo_idle.glb`) and running (`gojo_running.glb`) rigs onto a shared handle. */
async function loadRiggedGojoGlbs(unitUserData?: unknown): Promise<RiggedGojoHandle | null> {
  if (typeof window === 'undefined') return null;
  try {
    const [idleGltf, runGltf] = await Promise.all([
      loadCachedGlb('/models/gojo_idle.glb'),
      loadCachedGlb('/models/gojo_running.glb')
    ]);
    const idleClip = idleGltf.animations.find((c) => c.duration > 0.2);
    const runClip = runGltf.animations.find((c) => c.duration > 0.2);
    if (!idleClip || !runClip) {
      return loadRiggedGojoFbx(unitUserData);
    }

    const toonGrad = getAnimeToonGradient();
    const root = new THREE.Group();

    const idleRoot = cloneSkeleton(idleGltf.scene) as THREE.Group;
    idleRoot.scale.setScalar(2.22 / 1.7);
    const sharedMap = applyAnimeToonToScene(idleRoot, toonGrad);

    const runRoot = cloneSkeleton(runGltf.scene) as THREE.Group;
    runRoot.scale.setScalar(2.22 / 1.7);
    applyAnimeToonToScene(runRoot, toonGrad, sharedMap);
    runRoot.visible = false;

    const idleMixer = new THREE.AnimationMixer(idleRoot);
    const idleAction = idleMixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.play();

    const runMixer = new THREE.AnimationMixer(runRoot);
    const runAction = runMixer.clipAction(runClip);
    runAction.setLoop(THREE.LoopRepeat, Infinity);
    runAction.play();

    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const bodyHit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 1.55, 8), hitboxMat);
    bodyHit.position.y = 0.9;
    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), hitboxMat);
    headHit.position.y = 1.98;
    headHit.userData.isHead = true;
    if (unitUserData !== undefined) {
      bodyHit.userData.unit = unitUserData;
      headHit.userData.unit = unitUserData;
    }

    root.add(idleRoot, runRoot, bodyHit, headHit);

    return {
      root,
      hitMeshes: [bodyHit, headHit],
      bones: new Map(),
      mixer: null,
      dualClipAnim: {
        idleRoot,
        idleMixer,
        idleAction,
        runRoot,
        runMixer,
        runAction,
        activeState: 'idle',
        lastElapsed: -1
      }
    };
  } catch {
    return loadRiggedGojoFbx(unitUserData);
  }
}

/** Loads Mr. Biomaster's 24-bone rig once and binds idle, dance, walk, and running clips onto one mixer. */
async function loadBiomasterAnimController(
  toonGrad: THREE.DataTexture
): Promise<BiomasterAnimController | null> {
  try {
    const [runGltf, idleGltf, danceGltf, walkGltf] = await Promise.all([
      loadCachedGlb('/models/mr_biomaster_run.glb'),
      loadCachedGlb('/models/mr_biomaster_idle.glb'),
      loadCachedGlb('/models/mr_biomaster_dance.glb'),
      loadCachedGlb('/models/mr_biomaster_walk.glb')
    ]);

    const runClip = runGltf.animations.find((c) => c.duration > 0.2);
    const idleClip = idleGltf.animations.find((c) => c.duration > 0.2);
    const danceClip = danceGltf.animations.find((c) => c.duration > 0.2);
    const walkClip = walkGltf.animations.find((c) => c.duration > 0.2);
    if (!runClip || !idleClip || !danceClip || !walkClip) return null;

    const animRoot = cloneSkeleton(runGltf.scene) as THREE.Group;
    // Armature node scale 0.01 -> 1.70m; scale to 2.22m hero height
    animRoot.scale.setScalar(2.22 / 1.7);
    applyAnimeToonToScene(animRoot, toonGrad);

    const mixer = new THREE.AnimationMixer(animRoot);
    const makeAction = (clip: THREE.AnimationClip) => {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      return action;
    };

    const actions: Record<BasicLocomotionHint, THREE.AnimationAction> = {
      idle: makeAction(idleClip),
      dance: makeAction(danceClip),
      walk: makeAction(walkClip),
      run: makeAction(runClip)
    };
    actions.idle.play();

    return {
      root: animRoot,
      mixer,
      actions,
      activeKey: 'idle',
      lastElapsed: -1
    };
  } catch {
    return null;
  }
}

/** Loads and auto-rigs `/models/mr_biomaster.glb` with cel-shading for the FPS-MOBA arena. */
async function loadRiggedBiomasterGlb(unitUserData?: unknown): Promise<RiggedGojoHandle | null> {
  if (typeof window === 'undefined') return null;
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/mr_biomaster.glb');
    const srcMeshes: THREE.Mesh[] = [];
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        srcMeshes.push(obj as THREE.Mesh);
      }
    });
    if (srcMeshes.length === 0) return null;

    const root = new THREE.Group();
    const toonGrad = getAnimeToonGradient();
    const { skinned, bones } = rigTposeMeshToHumanoid(srcMeshes[0], root, toonGrad, unitUserData);
    root.add(skinned);

    const handle: RiggedGojoHandle = {
      root,
      hitMeshes: [skinned],
      bones,
      mixer: null,
      isTposeBind: true
    };

    const biomasterAnim = await loadBiomasterAnimController(toonGrad);
    if (biomasterAnim) {
      root.add(biomasterAnim.root);
      handle.biomasterAnim = biomasterAnim;
    }

    return handle;
  } catch {
    return null;
  }
}

/** Smooth tiling tangent-space wave normal map that bends refracted background rays through Uro's sky bikini. */
function getSkyWarpNormalTexture(): THREE.DataTexture {
  if (cachedSkyWarpNormalTex) return cachedSkyWarpNormalTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = (y / size) * Math.PI * 2;
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const nx = Math.sin(u * 2.0 + Math.cos(v * 2.0) * 0.8) * 0.45 + Math.cos(u * 3.0 - v * 2.0) * 0.25;
      const ny = Math.cos(v * 2.0 + Math.sin(u * 2.0) * 0.8) * 0.45 + Math.sin(v * 3.0 + u * 2.0) * 0.25;
      const nz = Math.sqrt(Math.max(0.15, 1.0 - nx * nx - ny * ny));
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  cachedSkyWarpNormalTex = tex;
  return tex;
}

/**
 * Creates Uro's smoky, cloud-like reality-warping cover over her chest and hip regions:
 * 1. Cuts an organic, noise-feathered see-through window out of her opaque body mesh.
 * 2. Binds a hazy transmissive lens layer (`transmission: 1.0`, smoky slate-sky tint) so you see
 *    through her body with a soft warped view of the background.
 * 3. Binds an outer billowing smoky sky-vapor shroud (`SkinnedMesh` with animated 3D fbm wisps &
 *    soft feathered edges) so it reads as living warped-space smoke/mist rather than clothing.
 */
function applyUroRealityWarpBikini(
  uroRoot: THREE.Group,
  warpNormalTex: THREE.DataTexture,
  _smokeTimeUniform: { value: number }
): void {
  const allowedTorsoBones = new Set([
    'Hips',
    'Spine02',
    'Spine01',
    'Spine',
    'LeftUpLeg',
    'RightUpLeg',
    'LeftLeg',
    'RightLeg',
    'LeftShoulder',
    'RightShoulder'
  ]);

  const skinnedMeshes: THREE.SkinnedMesh[] = [];
  uroRoot.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMeshes.push(obj as THREE.SkinnedMesh);
    }
  });

  for (const sm of skinnedMeshes) {
    const geo = sm.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
    const skinIdx = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const skinW = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
    const indexAttr = geo.index;
    const skeleton = sm.skeleton;

    if (!pos || !skinIdx || !skinW || !indexAttr || !skeleton) continue;

    // Render FrontSide on opaque body so inner backfaces never block the see-through core
    const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
    for (const m of mats) {
      if (m) m.side = THREE.FrontSide;
    }

    const vertCount = pos.count;
    // coreZone: 1 = chest see-through warp band, 2 = lower skirt-style hip/upper-thigh see-through warp band
    const coreZone = new Uint8Array(vertCount);

    for (let i = 0; i < vertCount; i++) {
      let torsoWeight = 0;
      for (let k = 0; k < 4; k++) {
        const bIdx = skinIdx.getComponent(i, k);
        const w = skinW.getComponent(i, k);
        const bName = skeleton.bones[bIdx]?.name ?? '';
        if (allowedTorsoBones.has(bName)) torsoWeight += w;
      }
      if (torsoWeight < 0.62) continue;

      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(x) > 0.185) continue;

      // Subtle organic boundary wave so the spatial warp edge feels natural
      const wisp =
        Math.sin(x * 29.0 + z * 23.0) * 0.012 + Math.cos(x * 43.0 - y * 31.0) * 0.008;

      // 1. Chest reality-warping band around Spine01 (y = 0.875 .. 0.965)
      const chestTopCore = (z >= 0.085 ? 0.964 + 0.14 * Math.min(1, Math.abs(x) / 0.07) : 0.95) + wisp;
      const chestBotCore = (z >= 0.085 ? 0.876 : 0.892) - wisp * 0.7;
      if (y >= chestBotCore && y <= chestTopCore && Math.abs(x) <= 0.162) {
        coreZone[i] = 1;
        continue;
      }

      // 2. Lower skirt-like hip & upper-thigh reality-warping cover (y = 0.505 .. 0.730)
      // Covers across the hips, pelvis, and upper thighs like a wrap skirt instead of a high-cut bikini
      const skirtBottomCore = 0.505 + 0.14 * Math.max(0, Math.abs(x) - 0.06) - wisp * 0.7;
      const skirtTopCore = 0.728 + 0.04 * Math.abs(x) + wisp;
      if (y >= skirtBottomCore && y <= skirtTopCore && Math.abs(x) <= 0.18) {
        coreZone[i] = 2;
      }
    }

    const srcIndices = indexAttr.array;
    const bodyIndices: number[] = [];
    const coreIndices: number[] = [];

    for (let t = 0; t < srcIndices.length; t += 3) {
      const a = srcIndices[t];
      const b = srcIndices[t + 1];
      const c = srcIndices[t + 2];

      const ca = coreZone[a];
      const cb = coreZone[b];
      const cc = coreZone[c];
      if ((ca === 1 && cb === 1 && cc === 1) || (ca === 2 && cb === 2 && cc === 2)) {
        coreIndices.push(a, b, c);
      } else {
        bodyIndices.push(a, b, c);
      }
    }

    if (coreIndices.length === 0) continue;

    // 1. Cut core triangles out of Uro's opaque body so the scene behind her renders straight through
    const IndexArrayCtor = vertCount > 65535 ? Uint32Array : Uint16Array;
    const bodyGeo = geo.clone();
    bodyGeo.setIndex(new THREE.BufferAttribute(new IndexArrayCtor(bodyIndices), 1));
    sm.geometry = bodyGeo;

    const buildExtractedSkinnedGeo = (
      triIndices: number[],
      normalInflate: number
    ): THREE.BufferGeometry => {
      const remap = new Int32Array(vertCount).fill(-1);
      const bPos: number[] = [];
      const bNorm: number[] = [];
      const bUv: number[] = [];
      const bSkinI: number[] = [];
      const bSkinW: number[] = [];
      const remapped: number[] = [];

      for (let idx = 0; idx < triIndices.length; idx++) {
        const oldV = triIndices[idx];
        let newV = remap[oldV];
        if (newV === -1) {
          newV = bPos.length / 3;
          remap[oldV] = newV;
          const nx = norm ? norm.getX(oldV) : 0;
          const ny = norm ? norm.getY(oldV) : 0;
          const nz = norm ? norm.getZ(oldV) : 1;
          const ox = pos.getX(oldV);
          const oy = pos.getY(oldV);
          const oz = pos.getZ(oldV);
          const px = ox + nx * normalInflate;
          const py = oy + ny * normalInflate;
          const pz = oz + nz * normalInflate;
          bPos.push(px, py, pz);
          bNorm.push(nx, ny, nz);
          bUv.push(px * 4.2 + 0.5, py * 4.2);
          bSkinI.push(
            skinIdx.getX(oldV),
            skinIdx.getY(oldV),
            skinIdx.getZ(oldV),
            skinIdx.getW(oldV)
          );
          bSkinW.push(
            skinW.getX(oldV),
            skinW.getY(oldV),
            skinW.getZ(oldV),
            skinW.getW(oldV)
          );
        }
        remapped.push(newV);
      }

      const outGeo = new THREE.BufferGeometry();
      outGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
      outGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bNorm, 3));
      outGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bUv, 2));
      outGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bSkinI, 4));
      outGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bSkinW, 4));
      outGeo.setIndex(remapped);
      outGeo.computeTangents();
      return outGeo;
    };

    // 2. Pure view-dependent reality-warping lens: crystal-clear refraction of what's behind her based on viewer angle
    const coreGeo = buildExtractedSkinnedGeo(coreIndices, 0.008);
    const warpCoreMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      transmission: 1.0,
      ior: 1.38,
      thickness: 1.15,
      roughness: 0.02,
      metalness: 0.0,
      reflectivity: 0.12,
      envMapIntensity: 0.18,
      attenuationColor: new THREE.Color(0xffffff),
      attenuationDistance: 100.0,
      normalMap: warpNormalTex,
      normalScale: new THREE.Vector2(0.58, 0.58),
      transparent: false,
      side: THREE.FrontSide
    });
    const coreMesh = new THREE.SkinnedMesh(coreGeo, warpCoreMat);
    coreMesh.name = 'uro_reality_warp_core';
    coreMesh.frustumCulled = false;
    coreMesh.bind(skeleton, sm.bindMatrix);

    const parentObj = sm.parent ?? uroRoot;
    parentObj.add(coreMesh);
  }
}

/** Loads `/models/uro_takaka.glb`, applies the see-through reality-warping bikini, and binds all 5 animations. */
async function loadRiggedUroGlb(unitUserData?: unknown): Promise<RiggedGojoHandle | null> {
  if (typeof window === 'undefined') return null;
  try {
    const gltf = await loadCachedGlb('/models/uro_takaka.glb');
    const toonGrad = getAnimeToonGradient();
    const root = new THREE.Group();

    const animRoot = cloneSkeleton(gltf.scene) as THREE.Group;
    animRoot.scale.setScalar(2.22 / 1.7);
    applyAnimeToonToScene(animRoot, toonGrad);

    // Instance-specific clone of the scrolling wave normal map & smoke time uniform
    const warpNormalTex = getSkyWarpNormalTexture().clone();
    warpNormalTex.needsUpdate = true;
    const smokeTimeUniform = { value: 0 };
    applyUroRealityWarpBikini(animRoot, warpNormalTex, smokeTimeUniform);

    const mixer = new THREE.AnimationMixer(animRoot);
    const findClip = (substr: string) =>
      gltf.animations.find((c) => c.name.toLowerCase().includes(substr.toLowerCase())) ?? null;

    const idleClip = findClip('Idle_7_original') ?? gltf.animations[0];
    const baseIdleClip = findClip('baselayer') ?? idleClip;
    const realityWipeClip = findClip('RealityWipe');
    const thinIceClip = findClip('ThinIceBreaker');
    const domainClip = findClip('DomainExpansion');

    if (!idleClip) return null;

    const idleAction = mixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.play();

    const moveAction = mixer.clipAction(baseIdleClip ?? idleClip);
    moveAction.setLoop(THREE.LoopRepeat, Infinity);

    const makeAbilityAction = (clip: THREE.AnimationClip | null) => {
      if (!clip) return null;
      const act = mixer.clipAction(clip);
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
      return act;
    };

    const realityWipeAction = makeAbilityAction(realityWipeClip);
    const thinIceAction = makeAbilityAction(thinIceClip);
    const domainAction = makeAbilityAction(domainClip);

    // Low-poly invisible hit capsules so raycasting never touches 209k skinned triangles
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const bodyHit = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 1.55, 8), hitboxMat);
    bodyHit.position.y = 0.9;
    const headHit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), hitboxMat);
    headHit.position.y = 1.96;
    headHit.userData.isHead = true;
    if (unitUserData !== undefined) {
      bodyHit.userData.unit = unitUserData;
      headHit.userData.unit = unitUserData;
    }

    root.add(animRoot, bodyHit, headHit);

    return {
      root,
      hitMeshes: [bodyHit, headHit],
      bones: new Map(),
      mixer: null,
      uroAnim: {
        root: animRoot,
        mixer,
        idleAction,
        moveAction,
        realityWipeAction,
        thinIceAction,
        domainAction,
        activeKey: 'idle',
        warpNormalTex,
        smokeTimeUniform,
        lastElapsed: -1
      }
    };
  } catch (err) {
    console.warn('Failed to load uro_takaka.glb:', err);
    return null;
  }
}

export function getAnimeToonGradient(): THREE.DataTexture {
  if (cachedToonGradient) return cachedToonGradient;
  // 4-step cel-shading ramp in RGBA format for guaranteed WebGL2 compatibility
  const tones = [88, 146, 212, 255];
  const data = new Uint8Array(tones.length * 4);
  for (let i = 0; i < tones.length; i++) {
    const v = tones[i];
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, tones.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cachedToonGradient = tex;
  return tex;
}

export function getMahoganyWoodTexture(): THREE.CanvasTexture {
  if (cachedWoodTexture) return cachedWoodTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#5a2810');
    grad.addColorStop(0.5, '#6e3215');
    grad.addColorStop(1, '#4d200c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Rich directional mahogany grain fibers and subtle knots
    for (let i = 0; i < 160; i++) {
      const y = (i / 160) * 512;
      const dark = i % 3 === 0;
      ctx.strokeStyle = dark ? 'rgba(32, 11, 4, 0.42)' : 'rgba(138, 72, 34, 0.25)';
      ctx.lineWidth = 1 + (i % 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        const wave = Math.sin(x * 0.018 + i * 0.65) * 4.5 + Math.cos(x * 0.045 - i) * 1.8;
        ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  cachedWoodTexture = tex;
  return tex;
}

function createSwirlingVortexTexture(innerHex: string, outerHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = 256;
    const cy = 256;
    ctx.clearRect(0, 0, 512, 512);

    // Radial glow halo
    const radGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 240);
    radGrad.addColorStop(0, 'rgba(255,255,255,0.98)');
    radGrad.addColorStop(0.18, innerHex);
    radGrad.addColorStop(0.58, outerHex);
    radGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radGrad;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, 245, 0, Math.PI * 2);
    ctx.fill();

    // 7 Logarithmic spiral energy arms
    for (let arm = 0; arm < 7; arm++) {
      const baseAngle = (arm / 7) * Math.PI * 2;
      ctx.beginPath();
      for (let step = 0; step <= 64; step++) {
        const t = step / 64;
        const r = 18 + t * 215;
        const theta = baseAngle + t * Math.PI * 1.65;
        const px = cx + Math.cos(theta) * r;
        const py = cy + Math.sin(theta) * r;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = arm % 2 === 0 ? '#ffffff' : innerHex;
      ctx.globalAlpha = arm % 2 === 0 ? 0.72 : 0.85;
      ctx.lineWidth = arm % 2 === 0 ? 5 : 11;
      ctx.lineCap = 'round';
      ctx.shadowColor = innerHex;
      ctx.shadowBlur = 18;
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createToonMaterial(
  color: THREE.ColorRepresentation,
  emissive: THREE.ColorRepresentation = 0x000000,
  emissiveIntensity = 0.08
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getAnimeToonGradient(),
    emissive,
    emissiveIntensity
  });
}

function addOutline(
  target: THREE.Mesh,
  outlineMat: THREE.Material,
  scaleX = 1.036,
  scaleY = 1.022,
  scaleZ = 1.036
) {
  const outline = new THREE.Mesh(target.geometry, outlineMat);
  outline.scale.set(scaleX, scaleY, scaleZ);
  outline.raycast = () => {};
  target.add(outline);
}

/**
 * Generates a high-polygon spline-interpolated elliptical mesh from a 2D profile [radius, y],
 * with multi-harmonic cloth fold wrinkles and smooth recomputed vertex normals.
 */
function createEllipticalLathe(
  profile: [number, number][],
  scaleX: number,
  scaleZ: number,
  radialSegments = 44,
  foldCount = 0,
  foldAmp = 0,
  verticalDivisions = 34,
  wrinkleFreqY = 5.0,
  creaseAmp = 0
): THREE.LatheGeometry {
  const controlPts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.002, r), y));
  const curve = new THREE.SplineCurve(controlPts);
  const smoothPts = curve
    .getPoints(verticalDivisions)
    .map((p) => new THREE.Vector2(Math.max(0.002, p.x), p.y));

  const geo = new THREE.LatheGeometry(smoothPts, radialSegments);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    let nx = x * scaleX;
    let nz = z * scaleZ;

    if (r > 0.015) {
      const theta = Math.atan2(z, x);
      let mod = 1.0;
      if (foldCount > 0 && foldAmp > 0) {
        // Stronger pleating near lower hem/bottom skirt where y < 0
        const hemWeight = y < 0 ? 1.0 + Math.min(1.6, Math.abs(y) * 5.2) : 0.45;
        mod += foldAmp * hemWeight * Math.sin(theta * foldCount + y * wrinkleFreqY);
      }
      if (creaseAmp > 0) {
        mod += creaseAmp * Math.sin(y * 28.0 + Math.cos(theta * 2.0) * 1.4);
      }
      nx *= mod;
      nz *= mod;
    }
    pos.setXYZ(i, nx, y, nz);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Extracts a half-body wireframe lattice (triangles where centroid x >= -0.004)
 * to recreate the high-detail wireframe half-coat overlay motif.
 */
function createHalfWireframeOverlay(
  sourceGeo: THREE.BufferGeometry,
  colorHex: number,
  opacity = 0.36
): THREE.LineSegments {
  const pos = sourceGeo.attributes.position;
  const idx = sourceGeo.index;
  const positions: number[] = [];

  const pushTri = (a: number, b: number, c: number) => {
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    if (cx < -0.004) return;
    positions.push(
      pos.getX(a) * 1.012,
      pos.getY(a),
      pos.getZ(a) * 1.012,
      pos.getX(b) * 1.012,
      pos.getY(b),
      pos.getZ(b) * 1.012,
      pos.getX(c) * 1.012,
      pos.getY(c),
      pos.getZ(c) * 1.012
    );
  };

  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      pushTri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      pushTri(i, i + 1, i + 2);
    }
  }

  const halfGeo = new THREE.BufferGeometry();
  halfGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const wireGeo = new THREE.WireframeGeometry(halfGeo);
  const wireMat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity
  });
  const lines = new THREE.LineSegments(wireGeo, wireMat);
  lines.raycast = () => {};
  return lines;
}

/**
 * Mathematically sculpts a high-resolution (64x48) anime head with crisp V-jaw,
 * cheekbones, eye socket recesses, brow ridge, sculpted nose bridge/tip, and lip plane.
 */
function createSculptedHeadGeometry(): THREE.BufferGeometry {
  const radius = 0.232;
  const geo = new THREE.SphereGeometry(radius, 64, 48);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = x / radius;
    const ny = y / radius;
    const nz = z / radius;

    // Oval anime vertical head + narrow temples
    y *= 1.15;
    x *= 0.87;

    // Taper jawline & pointed anime chin (ny < 0.08)
    if (ny < 0.08) {
      const lower = Math.max(0, (0.08 - ny) / 1.08);
      const jawTaper = 1.0 - 0.42 * Math.pow(lower, 1.28);
      x *= jawTaper;
      if (nz > 0) {
        z *= 0.90 + 0.08 * (1 - lower);
        // Pull V-chin slightly forward & downward
        const chinCenter = Math.exp(-(nx * nx) / 0.16);
        y -= 0.032 * Math.pow(lower, 1.45) * Math.max(0, nz) * (0.5 + 0.5 * chinCenter);
      } else {
        z *= jawTaper * 0.96;
      }
    }

    // Subtle upper eye-socket & cheek flatten plane (+Z)
    if (nz > 0.42 && ny > -0.42 && ny < 0.22) {
      const faceMask = Math.max(0, 1 - Math.abs(nx) * 1.12);
      z -= 0.014 * faceMask * (1 - Math.abs(ny + 0.08) * 1.35);
    }

    // Brow ridge overhang above eyes
    if (nz > 0.55) {
      const brow = Math.exp(-Math.pow((ny - 0.16) / 0.12, 2)) * Math.max(0, 1 - Math.abs(nx) * 0.9);
      z += 0.016 * brow;
    }

    // Sculpted anime nose bridge & pointed apex (+Z center)
    if (nz > 0.65 && ny > -0.35 && ny < 0.12) {
      const noseX = Math.exp(-(nx * nx) / 0.011);
      const noseBridge = Math.exp(-Math.pow((ny + 0.12) / 0.15, 2));
      const noseTip = Math.exp(-Math.pow((ny + 0.22) / 0.06, 2));
      z += (0.032 * noseBridge + 0.018 * noseTip) * noseX;
    }

    // Subtle philtrum & lip protrusion just below nose
    if (nz > 0.68 && ny > -0.62 && ny < -0.34) {
      const lipX = Math.exp(-(nx * nx) / 0.045);
      const lipY = Math.exp(-Math.pow((ny + 0.47) / 0.08, 2));
      z += 0.010 * lipX * lipY;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a high-polygon curved ribbon-like anime hair spike with subtle center ridge.
 */
function createCurvedHairSpikeGeometry(
  baseRadius: number,
  length: number,
  bendZ: number,
  bendX = 0
): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(baseRadius, length, 10, 9);
  geo.translate(0, length * 0.5, 0);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, y / length);
    const bendFactor = t * t;
    const tipPinch = 1.0 - 0.25 * t;
    pos.setXYZ(
      i,
      x * 1.18 * tipPinch + bendX * bendFactor,
      y,
      z * 0.62 * tipPinch + bendZ * bendFactor
    );
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an articulated 5-finger sculpted anime hand (palm + thumb + 4 curled fingers).
 */
function buildSculptedHand(
  skinMat: THREE.Material,
  outlineMat: THREE.Material,
  sideSign: number, // -1 for character's right (-X side), +1 for character's left (+X side)
  isOpenCup: boolean
): { handGroup: THREE.Group; meshes: THREE.Mesh[] } {
  const handGroup = new THREE.Group();
  const meshes: THREE.Mesh[] = [];

  // Sculpted Palm
  const palmGeo = new THREE.BoxGeometry(0.086, 0.092, 0.036, 4, 4, 2);
  const palmPos = palmGeo.attributes.position;
  for (let i = 0; i < palmPos.count; i++) {
    const px = palmPos.getX(i);
    const py = palmPos.getY(i);
    const pz = palmPos.getZ(i);
    // Slightly narrow wrist (py > 0) and round edges
    const wristTaper = py > 0 ? 0.85 : 1.0;
    palmPos.setXYZ(i, px * wristTaper, py, pz * (1 - Math.abs(px) * 1.8));
  }
  palmGeo.computeVertexNormals();

  const palmMesh = new THREE.Mesh(palmGeo, skinMat);
  palmMesh.position.y = -0.045;
  palmMesh.castShadow = true;
  addOutline(palmMesh, outlineMat, 1.06, 1.04, 1.08);
  handGroup.add(palmMesh);
  meshes.push(palmMesh);

  // Fingers: Index, Middle, Ring, Pinky
  const fingerSpecs = [
    { xOff: -0.028 * sideSign, len: 0.068, r: 0.010, spread: -0.14 * sideSign },
    { xOff: -0.009 * sideSign, len: 0.076, r: 0.0105, spread: -0.04 * sideSign },
    { xOff: 0.010 * sideSign, len: 0.071, r: 0.010, spread: 0.05 * sideSign },
    { xOff: 0.029 * sideSign, len: 0.058, r: 0.009, spread: 0.16 * sideSign }
  ];

  fingerSpecs.forEach((f) => {
    const fRoot = new THREE.Group();
    fRoot.position.set(f.xOff, -0.088, 0.004);
    fRoot.rotation.z = f.spread;
    fRoot.rotation.x = isOpenCup ? -0.45 : -0.85;

    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.9, f.r, f.len * 0.55, 10), skinMat);
    seg1.position.y = -f.len * 0.275;
    addOutline(seg1, outlineMat, 1.12, 1.02, 1.12);
    fRoot.add(seg1);
    meshes.push(seg1);

    const tipGroup = new THREE.Group();
    tipGroup.position.y = -f.len * 0.55;
    tipGroup.rotation.x = isOpenCup ? -0.52 : -0.95;
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.65, f.r * 0.9, f.len * 0.48, 10), skinMat);
    seg2.position.y = -f.len * 0.24;
    addOutline(seg2, outlineMat, 1.12, 1.02, 1.12);
    tipGroup.add(seg2);
    meshes.push(seg2);

    fRoot.add(tipGroup);
    handGroup.add(fRoot);
  });

  // Opposable Thumb
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-0.044 * sideSign, -0.045, 0.018);
  thumbRoot.rotation.z = 0.55 * sideSign;
  thumbRoot.rotation.x = isOpenCup ? -0.35 : -0.7;
  const thumbMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.058, 10), skinMat);
  thumbMesh.position.y = -0.029;
  addOutline(thumbMesh, outlineMat, 1.12, 1.02, 1.12);
  thumbRoot.add(thumbMesh);
  meshes.push(thumbMesh);
  handGroup.add(thumbRoot);

  return { handGroup, meshes };
}

function buildArticulatedLimb(
  upperProfile: [number, number][],
  lowerProfile: [number, number][],
  scaleX: number,
  scaleZ: number,
  upperMat: THREE.Material,
  lowerMat: THREE.Material,
  handOrFootMat: THREE.Material,
  outlineMat: THREE.Material,
  isLeg: boolean,
  sideSign = 1,
  openCupHand = false
): {
  pivot: THREE.Group;
  lowerPivot: THREE.Group;
  lowerMesh: THREE.Mesh;
  handGroup?: THREE.Group;
  meshes: THREE.Mesh[];
} {
  const pivot = new THREE.Group();
  const meshes: THREE.Mesh[] = [];

  const upperGeo = createEllipticalLathe(upperProfile, scaleX, scaleZ, 32, 4, 0.015, 22, 6.0, 0.014);
  const upperMesh = new THREE.Mesh(upperGeo, upperMat);
  upperMesh.castShadow = true;
  addOutline(upperMesh, outlineMat, 1.045, 1.015, 1.045);
  pivot.add(upperMesh);
  meshes.push(upperMesh);

  const lowerPivot = new THREE.Group();
  lowerPivot.position.y = isLeg ? -0.41 : -0.31;
  pivot.add(lowerPivot);

  const lowerGeo = createEllipticalLathe(lowerProfile, scaleX * 0.94, scaleZ * 0.94, 32, 4, 0.012, 22, 6.0, 0.012);
  const lowerMesh = new THREE.Mesh(lowerGeo, lowerMat);
  lowerMesh.castShadow = true;
  addOutline(lowerMesh, outlineMat, 1.045, 1.015, 1.045);
  lowerPivot.add(lowerMesh);
  meshes.push(lowerMesh);

  let handGroup: THREE.Group | undefined;
  if (isLeg) {
    const bootGeo = createEllipticalLathe(
      [
        [0.01, -0.44],
        [0.094, -0.43],
        [0.090, -0.36],
        [0.072, -0.32],
        [0.01, -0.31]
      ],
      0.95,
      1.7,
      28
    );
    const boot = new THREE.Mesh(bootGeo, handOrFootMat);
    boot.position.set(0, 0, 0.055);
    boot.castShadow = true;
    addOutline(boot, outlineMat, 1.04, 1.04, 1.035);
    lowerPivot.add(boot);
    meshes.push(boot);
  } else {
    const builtHand = buildSculptedHand(handOrFootMat, outlineMat, sideSign, openCupHand);
    handGroup = builtHand.handGroup;
    handGroup.position.y = -0.28;
    lowerPivot.add(handGroup);
    meshes.push(...builtHand.meshes);
  }

  return { pivot, lowerPivot, lowerMesh, handGroup, meshes };
}

/**
 * Adds Gojo Satoru's high-poly blindfold with fabric wrinkles, downward bangs, spiky crown hair,
 * flared pleated jujutsu coat + half wireframe motif, and swirling Red/Blue Limitless vortices.
 */
function addGojoFeatures(
  headGroup: THREE.Group,
  upperBodyGroup: THREE.Group,
  bodyMesh: THREE.Mesh,
  rightArm: ReturnType<typeof buildArticulatedLimb>,
  hairMat: THREE.Material,
  coatMat: THREE.Material,
  outlineMat: THREE.Material,
  hitMeshes: THREE.Object3D[]
): void {
  // 1. Tall Flared Jujutsu Uniform Funnel Collar (wrapping neck up past chin)
  const collarGeo = createEllipticalLathe(
    [
      [0.185, -0.02],
      [0.175, 0.04],
      [0.195, 0.12],
      [0.215, 0.20],
      [0.202, 0.25],
      [0.175, 0.255]
    ],
    1.03,
    0.96,
    44,
    0,
    0,
    24,
    0,
    0.012
  );
  const collar = new THREE.Mesh(collarGeo, coatMat);
  collar.position.set(0, 0.45, 0.01);
  addOutline(collar, outlineMat, 1.035, 1.02, 1.035);
  upperBodyGroup.add(collar);
  hitMeshes.push(collar);

  // Center front uniform placket seam & golden spiral button
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.46, 0.018), outlineMat);
  seam.position.set(0, 0.26, 0.172);
  upperBodyGroup.add(seam);

  const buttonMat = createToonMaterial(0xfbbf24, 0xd97706, 0.3);
  const collarButton = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 18), buttonMat);
  collarButton.rotation.x = Math.PI / 2;
  collarButton.position.set(0.072, 0.56, 0.192);
  upperBodyGroup.add(collarButton);

  // Subtle half-wireframe mesh motif on Gojo's +X half of coat & +X sleeve
  upperBodyGroup.add(createHalfWireframeOverlay(bodyMesh.geometry, 0xcffafe, 0.34));
  const sleeveWire = new THREE.WireframeGeometry(rightArm.lowerMesh.geometry);
  const sleeveLines = new THREE.LineSegments(
    sleeveWire,
    new THREE.LineBasicMaterial({ color: 0xcffafe, transparent: true, opacity: 0.26 })
  );
  sleeveLines.scale.setScalar(1.015);
  sleeveLines.raycast = () => {};
  rightArm.lowerMesh.add(sleeveLines);

  // 2. Sculpted Wrinkled Black Cloth Blindfold Wrapping Eyes & Temples
  const blindfoldMat = createToonMaterial(0x090d16, 0x020617, 0.08);
  const blindfoldGeo = createEllipticalLathe(
    [
      [0.236, -0.048],
      [0.244, -0.020],
      [0.242, 0.015],
      [0.246, 0.048],
      [0.236, 0.078]
    ],
    0.91,
    1.03,
    64,
    0,
    0,
    24,
    0,
    0.016
  );
  // Subtle nose-bridge dip + temple wrinkle folds on the blindfold
  const bfPos = blindfoldGeo.attributes.position;
  for (let i = 0; i < bfPos.count; i++) {
    const bx = bfPos.getX(i);
    let by = bfPos.getY(i);
    let bz = bfPos.getZ(i);
    const theta = Math.atan2(bz, bx);
    if (bz > 0.12) {
      const noseDip = Math.exp(-(bx * bx) / 0.0025);
      by -= 0.018 * noseDip * (by < 0 ? 1.2 : 0.4);
      bz += 0.008 * noseDip;
    }
    bz += Math.sin(theta * 5 + by * 42) * 0.004;
    bfPos.setXYZ(i, bx, by, bz);
  }
  blindfoldGeo.computeVertexNormals();

  const blindfold = new THREE.Mesh(blindfoldGeo, blindfoldMat);
  blindfold.position.set(0, 0.036, 0.010);
  addOutline(blindfold, outlineMat, 1.028, 1.03, 1.028);
  headGroup.add(blindfold);
  hitMeshes.push(blindfold);

  // Subtle Six-Eyes cyan glow beneath the blindfold + Anime Mouth & Nose accent
  const sixEyeGlint = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.009, 0.025),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })
  );
  sixEyeGlint.position.set(0.065, -0.008, 0.228);
  headGroup.add(sixEyeGlint);

  const mouthLine = new THREE.Mesh(
    new THREE.TorusGeometry(0.042, 0.0055, 8, 18, Math.PI * 0.68),
    new THREE.MeshBasicMaterial({ color: 0x1e293b })
  );
  mouthLine.position.set(0, -0.145, 0.194);
  mouthLine.rotation.z = Math.PI * 1.16;
  mouthLine.rotation.x = -0.35;
  const chinShade = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.005, 0.01),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
  );
  chinShade.position.set(0, -0.168, 0.190);
  headGroup.add(mouthLine, chinShade);

  // 3. Gojo's Two-Layer High-Poly White Spiky Hair (Crown Spikes + Forehead Fringe Bangs)
  const hairCapGeo = new THREE.SphereGeometry(0.244, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairCapGeo.scale(0.90, 1.15, 1.02);
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.024, -0.01);
  headGroup.add(hairCap);
  hitMeshes.push(hairCap);

  // A. Downward jagged bangs overlapping the top edge of the blindfold
  const bangCount = 11;
  for (let i = 0; i < bangCount; i++) {
    const frac = (i / (bangCount - 1)) * 2 - 1; // -1..+1 across forehead
    const angle = frac * 1.15;
    const bangLen = 0.14 + (i % 3) * 0.025;
    const bangGeo = createCurvedHairSpikeGeometry(0.032, bangLen, 0.024, frac * 0.012);
    const bang = new THREE.Mesh(bangGeo, hairMat);
    bang.position.set(Math.sin(angle) * 0.195, 0.145, Math.cos(angle) * 0.215);
    bang.rotation.y = angle;
    bang.rotation.x = 2.68; // Pointing downward over blindfold
    bang.rotation.z = -frac * 0.22;
    addOutline(bang, outlineMat, 1.07, 1.02, 1.07);
    headGroup.add(bang);
  }

  // B. 4 Concentric Tiers of Upward-Swept White Spikes (57 high-res curved locks)
  const spikeRings: { count: number; yBase: number; rOut: number; tiltOut: number; len: number; rad: number }[] = [
    { count: 18, yBase: 0.07, rOut: 0.195, tiltOut: 0.92, len: 0.26, rad: 0.048 },
    { count: 16, yBase: 0.13, rOut: 0.165, tiltOut: 0.68, len: 0.29, rad: 0.052 },
    { count: 14, yBase: 0.19, rOut: 0.115, tiltOut: 0.42, len: 0.31, rad: 0.050 },
    { count: 9, yBase: 0.23, rOut: 0.055, tiltOut: 0.18, len: 0.30, rad: 0.044 }
  ];

  spikeRings.forEach((ring, rIdx) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + rIdx * 0.24;
      const lenVar = ring.len * (0.86 + ((i * 37 + rIdx * 13) % 10) * 0.032);
      const spikeGeo = createCurvedHairSpikeGeometry(ring.rad, lenVar, -0.065, Math.sin(angle) * 0.022);
      const spike = new THREE.Mesh(spikeGeo, hairMat);
      spike.position.set(Math.cos(angle) * ring.rOut, ring.yBase, Math.sin(angle) * ring.rOut);
      spike.rotation.y = -angle + Math.PI / 2;
      spike.rotation.x = -ring.tiltOut * 0.56;
      spike.rotation.z = Math.cos(angle) * -ring.tiltOut * 0.42;
      addOutline(spike, outlineMat, 1.07, 1.025, 1.07);
      headGroup.add(spike);
    }
  });

  // Back nape spiky locks
  for (let i = -3; i <= 3; i++) {
    const napeSpike = new THREE.Mesh(createCurvedHairSpikeGeometry(0.042, 0.21, -0.05), hairMat);
    napeSpike.position.set(i * 0.052, -0.01, -0.175);
    napeSpike.rotation.x = -2.42;
    napeSpike.rotation.z = i * 0.15;
    addOutline(napeSpike, outlineMat, 1.07, 1.025, 1.07);
    headGroup.add(napeSpike);
  }
}

function addHigurumaFeatures(
  headGroup: THREE.Group,
  upperBodyGroup: THREE.Group,
  rightArmPivot: THREE.Group,
  hairMat: THREE.Material,
  shirtMat: THREE.Material,
  outlineMat: THREE.Material,
  hitMeshes: THREE.Object3D[]
) {
  // 1. Crisp White Dress Shirt V-Neck + Golden Silk Necktie + Attorney Lapel Pin
  const shirtV = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.30, 4), shirtMat);
  shirtV.rotation.x = Math.PI;
  shirtV.rotation.y = Math.PI / 4;
  shirtV.scale.set(1.0, 1.0, 0.22);
  shirtV.position.set(0, 0.36, 0.155);
  upperBodyGroup.add(shirtV);

  const goldMat = createToonMaterial(0xf59e0b, 0x92400e, 0.22);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.33, 0.025), goldMat);
  tie.position.set(0, 0.24, 0.178);
  upperBodyGroup.add(tie);

  const lapelMat = createToonMaterial(0x0f172a, 0x020617, 0.1);
  [-1, 1].forEach((side) => {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.30, 0.032), lapelMat);
    lapel.position.set(side * 0.088, 0.33, 0.168);
    lapel.rotation.z = side * 0.28;
    upperBodyGroup.add(lapel);
  });

  const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), goldMat);
  badge.position.set(0.14, 0.36, 0.178);
  upperBodyGroup.add(badge);

  // 2. Sculpted Facial Details (Serious Brow, Sharp Eyes, Calm Mouth)
  const browMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), eyeWhiteMat);
    eye.scale.set(1.3, 0.65, 0.4);
    eye.position.set(side * 0.072, 0.022, 0.205);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 10), pupilMat);
    pupil.position.set(side * 0.072, 0.022, 0.214);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.012, 0.02), browMat);
    brow.position.set(side * 0.074, 0.06, 0.215);
    brow.rotation.z = side * -0.14;
    headGroup.add(eye, pupil, brow);
  });

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.015), browMat);
  mouth.position.set(0, -0.13, 0.198);
  headGroup.add(mouth);

  // 3. Swept-Back High-Poly Wavy Dark Hair + Forehead Strands
  const hairCapGeo = new THREE.SphereGeometry(0.242, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
  hairCapGeo.scale(0.92, 1.14, 1.03);
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.025, -0.012);
  headGroup.add(hairCap);
  hitMeshes.push(hairCap);

  for (let i = -4; i <= 4; i++) {
    const wave = new THREE.Mesh(createCurvedHairSpikeGeometry(0.044, 0.31, -0.09, i * 0.010), hairMat);
    wave.position.set(i * 0.046, 0.17 - Math.abs(i) * 0.016, 0.09);
    wave.rotation.x = -1.32;
    wave.rotation.z = -i * 0.07;
    addOutline(wave, outlineMat, 1.06, 1.02, 1.06);
    headGroup.add(wave);
  }
  [-0.06, 0.08].forEach((ox, idx) => {
    const bang = new THREE.Mesh(createCurvedHairSpikeGeometry(0.025, 0.18, 0.025), hairMat);
    bang.position.set(ox, 0.16, 0.19);
    bang.rotation.x = 2.45;
    bang.rotation.z = idx === 0 ? 0.18 : -0.22;
    headGroup.add(bang);
  });

  // 4. High-Poly Mahogany & Brass Judge's Gavel with Rivets
  const gavelGroup = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    map: getMahoganyWoodTexture(),
    roughness: 0.42,
    metalness: 0.15
  });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 1.68, 28), woodMat);
  shaft.position.set(0.02, 0.35, 0.15);
  shaft.rotation.x = 0.72;
  addOutline(shaft, outlineMat, 1.06, 1.01, 1.06);
  gavelGroup.add(shaft);

  const headCylGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.64, 36);
  headCylGeo.rotateZ(Math.PI / 2);
  const gavelBarrel = new THREE.Mesh(headCylGeo, woodMat);
  gavelBarrel.position.set(0.02, 0.88, 0.68);
  addOutline(gavelBarrel, outlineMat, 1.04, 1.04, 1.04);
  gavelGroup.add(gavelBarrel);

  const bandGeo = new THREE.CylinderGeometry(0.202, 0.202, 0.075, 36);
  bandGeo.rotateZ(Math.PI / 2);
  const rivetGeo = new THREE.SphereGeometry(0.012, 8, 8);
  [-0.25, 0, 0.25].forEach((bx) => {
    const band = new THREE.Mesh(bandGeo, goldMat);
    band.position.set(0.02 + bx, 0.88, 0.68);
    gavelGroup.add(band);
    for (let r = 0; r < 6; r++) {
      const a = (r / 6) * Math.PI * 2;
      const rivet = new THREE.Mesh(rivetGeo, goldMat);
      rivet.position.set(0.02 + bx, 0.88 + Math.cos(a) * 0.205, 0.68 + Math.sin(a) * 0.205);
      gavelGroup.add(rivet);
    }
  });

  gavelGroup.position.set(0.08, -0.52, 0.12);
  rightArmPivot.add(gavelGroup);
}

/**
 * Builds a high-polygon, articulated, cel-shaded 3D Hero Model with anime ink outlines
 * and procedural idle/walk/stun animation rig.
 */
export function buildProceduralHeroModel(
  hero: FpsHeroDef,
  bannerText: string,
  createFloatingHpBar: (parent: THREE.Group, y: number, width: number, team: MobaTeam) => THREE.Mesh,
  createHeroNameplate: (parent: THREE.Group, y: number, text: string, accentHex: string) => THREE.Mesh
): ProceduralHeroBuildResult {
  const group = new THREE.Group();
  const hitMeshes: THREE.Object3D[] = [];

  const primaryCol = new THREE.Color(hero.color);
  const accentCol = new THREE.Color(hero.accentColor);

  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x050811,
    side: THREE.BackSide
  });

  const jacketColorMap: Record<string, number> = {
    gojo: 0x161e2e,
    higuruma: 0x1e293b,
    doom: 0x450a0a,
    jogo: 0x261d17,
    megumi: 0x0f172a,
    brigid: 0x422006,
    vex: 0x0f172a,
    kael: 0x3b0764,
    mr_biomaster: 0x14532d,
    uro: 0x38bdf8
  };
  const pantsColorMap: Record<string, number> = {
    gojo: 0x111827,
    higuruma: 0x111827,
    doom: 0x1c1917,
    jogo: 0x1a1410,
    megumi: 0x0b1120,
    brigid: 0x292524,
    vex: 0x1e293b,
    kael: 0x1e1b4b,
    mr_biomaster: 0x052e16,
    uro: 0x0ea5e9
  };
  const skinColorMap: Record<string, number> = {
    gojo: 0xffe0d0,
    higuruma: 0xf7d7c4,
    doom: 0x7c4a32,
    jogo: 0x6b645c,
    megumi: 0xf7dac6,
    brigid: 0xfde2d0,
    vex: 0xf5d0ba,
    kael: 0xe9d5ff,
    mr_biomaster: 0x4ade80,
    uro: 0xffe8dd
  };

  const jacketMat = createToonMaterial(jacketColorMap[hero.id] ?? 0x1e293b, primaryCol, hero.id === 'uro' ? 0.34 : 0.06);
  const pantsMat = createToonMaterial(pantsColorMap[hero.id] ?? 0x0f172a, hero.id === 'uro' ? primaryCol : 0x000000, hero.id === 'uro' ? 0.25 : 0.04);
  const skinMat = createToonMaterial(skinColorMap[hero.id] ?? 0xfde2d0, 0x000000, 0.03);
  const accentMat = createToonMaterial(primaryCol, primaryCol, 0.25);
  const bootMat = createToonMaterial(hero.id === 'uro' ? 0xe0f2fe : 0x090d16, hero.id === 'uro' ? 0x67e8f9 : 0x000000, hero.id === 'uro' ? 0.18 : 0.05);
  const hairMat = createToonMaterial(
    hero.id === 'gojo' || hero.id === 'uro' ? 0xf8fafc : hero.id === 'higuruma' ? 0x171412 : 0x334155,
    hero.id === 'gojo' || hero.id === 'uro' ? 0xbae6fd : 0x000000,
    hero.id === 'gojo' || hero.id === 'uro' ? 0.16 : 0.04
  );

  const isHeavy = hero.id === 'higuruma' || hero.id === 'doom';
  const torsoWidthScale = isHeavy ? 1.24 : hero.id === 'gojo' ? 1.12 : hero.id === 'uro' ? 0.92 : 1.06;
  const torsoDepthScale = isHeavy ? 0.84 : 0.72;

  // Root Pelvis/Hips Pivot
  const hipsGroup = new THREE.Group();
  hipsGroup.position.y = 0.88;
  group.add(hipsGroup);

  const pelvisGeo = createEllipticalLathe(
    [
      [0.01, -0.10],
      [0.18, -0.06],
      [0.19, 0.05],
      [0.175, 0.11]
    ],
    torsoWidthScale * 0.96,
    torsoDepthScale * 0.96,
    32
  );
  const pelvisMesh = new THREE.Mesh(pelvisGeo, pantsMat);
  hipsGroup.add(pelvisMesh);
  hitMeshes.push(pelvisMesh);

  const upperBodyGroup = new THREE.Group();
  upperBodyGroup.position.y = 0.08;
  hipsGroup.add(upperBodyGroup);

  // Sculpted High-Poly Torso (`bodyMesh` hitbox)
  const torsoProfile: [number, number][] =
    hero.id === 'gojo'
      ? [
          // Deeply flared pleated peplum coat hem -> cinched waist -> athletic chest -> shoulders
          [0.32, -0.25],
          [0.255, -0.15],
          [0.20, -0.04],
          [0.168, 0.06],
          [0.195, 0.22],
          [0.245, 0.39],
          [0.21, 0.48],
          [0.085, 0.51]
        ]
      : hero.id === 'higuruma'
        ? [
            [0.24, -0.22],
            [0.21, -0.08],
            [0.178, 0.05],
            [0.205, 0.22],
            [0.25, 0.39],
            [0.215, 0.48],
            [0.085, 0.50]
          ]
        : [
            [0.185, -0.04],
            [0.17, 0.08],
            [0.215, 0.24],
            [0.255, 0.40],
            [0.21, 0.49],
            [0.08, 0.51]
          ];

  const torsoGeo = createEllipticalLathe(
    torsoProfile,
    torsoWidthScale,
    torsoDepthScale,
    48,
    hero.id === 'gojo' ? 9 : 6,
    hero.id === 'gojo' ? 0.042 : 0.022,
    36,
    4.5,
    0.008
  );
  const bodyMesh = new THREE.Mesh(torsoGeo, jacketMat);
  bodyMesh.castShadow = true;
  addOutline(bodyMesh, outlineMat, 1.028, 1.012, 1.028);
  upperBodyGroup.add(bodyMesh);
  hitMeshes.push(bodyMesh);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.078, 0.16, 20), skinMat);
  neck.position.y = 0.54;
  upperBodyGroup.add(neck);
  hitMeshes.push(neck);

  // Sculpted High-Poly Anime Head Group (`headMesh` = Headshot Hitbox)
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.77;
  upperBodyGroup.add(headGroup);

  const headGeo = createSculptedHeadGeometry();
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  addOutline(headMesh, outlineMat, 1.035, 1.03, 1.035);
  headGroup.add(headMesh);
  hitMeshes.push(headMesh);

  // Sculpted Ears
  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.040, 14, 10), skinMat);
    ear.scale.set(0.42, 1.15, 0.75);
    ear.position.set(side * 0.20, -0.01, -0.01);
    headGroup.add(ear);
  });

  // High-Poly Anatomical Limb Profiles
  const upperArmProfile: [number, number][] = [
    [0.068, -0.31],
    [0.084, -0.18],
    [0.098, -0.04],
    [0.084, 0.05],
    [0.01, 0.07]
  ];
  const forearmProfile: [number, number][] = [
    [0.056, -0.27],
    [0.068, -0.14],
    [0.074, -0.02],
    [0.048, 0.03]
  ];
  const thighProfile: [number, number][] = [
    [0.082, -0.40],
    [0.106, -0.22],
    [0.120, -0.04],
    [0.096, 0.05]
  ];
  const calfProfile: [number, number][] = [
    [0.058, -0.36],
    [0.088, -0.18],
    [0.086, -0.02],
    [0.055, 0.04]
  ];

  const armScale = isHeavy ? 1.12 : 0.94;
  const shoulderX = 0.275 * torsoWidthScale;
  const isGojo = hero.id === 'gojo';

  // Left side of model (-X = character right side / viewer left)
  const leftArm = buildArticulatedLimb(
    upperArmProfile,
    forearmProfile,
    armScale,
    armScale,
    jacketMat,
    jacketMat,
    skinMat,
    outlineMat,
    false,
    -1,
    isGojo
  );
  leftArm.pivot.position.set(-shoulderX, 0.42, 0);
  upperBodyGroup.add(leftArm.pivot);
  hitMeshes.push(...leftArm.meshes);

  // Right side of model (+X = character left side / viewer right)
  const rightArm = buildArticulatedLimb(
    upperArmProfile,
    forearmProfile,
    armScale,
    armScale,
    jacketMat,
    jacketMat,
    skinMat,
    outlineMat,
    false,
    1,
    isGojo
  );
  rightArm.pivot.position.set(shoulderX, 0.42, 0);
  upperBodyGroup.add(rightArm.pivot);
  hitMeshes.push(...rightArm.meshes);

  const hipX = 0.12 * torsoWidthScale;
  const leftLeg = buildArticulatedLimb(
    thighProfile,
    calfProfile,
    1.0,
    1.05,
    pantsMat,
    pantsMat,
    bootMat,
    outlineMat,
    true
  );
  leftLeg.pivot.position.set(-hipX, -0.04, 0);
  hipsGroup.add(leftLeg.pivot);
  hitMeshes.push(...leftLeg.meshes);

  const rightLeg = buildArticulatedLimb(
    thighProfile,
    calfProfile,
    1.0,
    1.05,
    pantsMat,
    pantsMat,
    bootMat,
    outlineMat,
    true
  );
  rightLeg.pivot.position.set(hipX, -0.04, 0);
  hipsGroup.add(rightLeg.pivot);
  hitMeshes.push(...rightLeg.meshes);

  // Hero-specific sculpted outfits, hair, eyes/visors, and signature weapons
  let riggedGojo: RiggedGojoHandle | null = null;
  if (hero.id === 'gojo') {
    addGojoFeatures(
      headGroup,
      upperBodyGroup,
      bodyMesh,
      rightArm,
      hairMat,
      jacketMat,
      outlineMat,
      hitMeshes
    );

    void loadRiggedGojoGlbs().then((rig) => {
      if (!rig) return;
      if (bodyMesh.userData.unit) {
        for (const m of rig.hitMeshes) {
          m.userData.unit = bodyMesh.userData.unit;
        }
      }

      hipsGroup.visible = false;
      hitMeshes.splice(0, hitMeshes.length, ...rig.hitMeshes);
      group.add(rig.root);
      riggedGojo = rig;
    });
  } else if (hero.id === 'mr_biomaster') {
    void loadRiggedBiomasterGlb().then((rig) => {
      if (!rig) return;
      if (bodyMesh.userData.unit) {
        for (const m of rig.hitMeshes) {
          m.userData.unit = bodyMesh.userData.unit;
        }
      }

      hipsGroup.visible = false;
      hitMeshes.splice(0, hitMeshes.length, ...rig.hitMeshes);
      group.add(rig.root);
      riggedGojo = rig;
    });
  } else if (hero.id === 'higuruma') {
    addHigurumaFeatures(
      headGroup,
      upperBodyGroup,
      rightArm.pivot,
      hairMat,
      createToonMaterial(0xf8fafc, 0x000000, 0.05),
      outlineMat,
      hitMeshes
    );
  } else if (hero.id === 'jogo') {
    // Jogo's iconic flat-top volcano head with glowing molten crater + single cyclops eye
    const volcanoMat = createToonMaterial(0x3a322c, 0x7c2d12, 0.14);
    const craterCone = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.21, 0.24, 16), volcanoMat);
    craterCone.position.set(0, 0.24, 0);
    addOutline(craterCone, outlineMat, 1.05, 1.03, 1.05);
    headGroup.add(craterCone);
    hitMeshes.push(craterCone);

    const lavaCore = new THREE.Mesh(
      new THREE.CircleGeometry(0.095, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4500 })
    );
    lavaCore.rotation.x = -Math.PI / 2;
    lavaCore.position.set(0, 0.365, 0);
    headGroup.add(lavaCore);

    // Single large cyclops eye in the center of the face
    const eyeSclera = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 14),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    eyeSclera.scale.set(1.15, 0.85, 0.5);
    eyeSclera.position.set(0, 0.02, 0.175);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x09090b })
    );
    pupil.position.set(0, 0.02, 0.212);
    headGroup.add(eyeSclera, pupil);

    // Volcanic plug ears
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.08, 10), volcanoMat);
      ear.rotation.z = side * Math.PI * 0.5;
      ear.position.set(side * 0.205, 0.02, 0);
      headGroup.add(ear);
    });

    // High volcanic cloak collar
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 0.2, 16, 1, true),
      createToonMaterial(0x1f1916, 0x000000, 0.05)
    );
    collar.position.set(0, 0.48, -0.02);
    upperBodyGroup.add(collar);
  } else if (hero.id === 'megumi') {
    // Megumi's spiky dark navy-black hair crown + glowing indigo shadow-blade
    const megumiHairMat = createToonMaterial(0x0b0f1c, 0x312e81, 0.12);
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 6), megumiHairMat);
      spike.position.set(Math.cos(ang) * 0.14, 0.18 + (i % 2) * 0.05, Math.sin(ang) * 0.14);
      spike.rotation.z = -Math.cos(ang) * 0.85;
      spike.rotation.x = Math.sin(ang) * 0.85;
      headGroup.add(spike);
    }
    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.92, 0.025),
      createToonMaterial(0x111827, 0x6366f1, 0.35)
    );
    sword.position.set(0, -0.62, 0.32);
    sword.rotation.x = Math.PI * 0.35;
    rightArm.pivot.add(sword);
    hitMeshes.push(sword);
  } else if (hero.id === 'uro') {
    // Load rigged /models/uro_takaka.glb with reality-warping see-through bikini & 5 animation clips
    void loadRiggedUroGlb().then((rig) => {
      if (!rig) return;
      if (bodyMesh.userData.unit) {
        for (const m of rig.hitMeshes) {
          m.userData.unit = bodyMesh.userData.unit;
        }
      }

      hipsGroup.visible = false;
      hitMeshes.splice(0, hitMeshes.length, ...rig.hitMeshes);
      group.add(rig.root);
      riggedGojo = rig;
    });

    // Immediate stylized fallback until async GLB finishes loading
    const uroHairMat = createToonMaterial(0xf1f5f9, 0xbae6fd, 0.18);
    const hairCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
      uroHairMat
    );
    hairCrown.position.set(0, 0.04, -0.01);
    headGroup.add(hairCrown);

    // Sweeping cheek-framing side locks + back curtain
    [-1, 1].forEach((side) => {
      const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.028, 0.34, 10), uroHairMat);
      lock.position.set(side * 0.165, -0.06, 0.06);
      lock.rotation.z = side * 0.18;
      headGroup.add(lock);
    });
    const backHair = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.34, 14, 1, false, Math.PI * 0.65, Math.PI * 0.7), uroHairMat);
    backHair.position.set(0, -0.06, -0.04);
    headGroup.add(backHair);

    // Signature dark sclera with luminous amber-gold irises
    const scleraMat = new THREE.MeshBasicMaterial({ color: 0x090b12 });
    const irisMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), scleraMat);
      eye.scale.set(1.25, 0.78, 0.5);
      eye.position.set(side * 0.072, 0.02, 0.188);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), irisMat);
      iris.position.set(side * 0.072, 0.02, 0.203);
      headGroup.add(eye, iris);
    });

    // Translucent warped-sky veil ribbons swirling around torso and arms ("wearing the sky")
    const skyVeilMat = new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.44,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const skyEdgeMat = new THREE.MeshBasicMaterial({
      color: 0xf0f9ff,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const veil1 = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 10, 32), skyVeilMat);
    veil1.position.set(0, 0.26, 0);
    veil1.rotation.set(Math.PI * 0.36, 0.25, 0.42);
    const veil2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 32), skyEdgeMat);
    veil2.position.set(0, 0.08, 0);
    veil2.rotation.set(Math.PI * 0.56, -0.32, -0.35);
    upperBodyGroup.add(veil1, veil2);

    // Sky-manipulation refraction rings around both wrists
    const wristGeo = new THREE.TorusGeometry(0.11, 0.016, 8, 22);
    const leftWristRing = new THREE.Mesh(wristGeo, skyVeilMat);
    leftWristRing.position.set(0, -0.52, 0.05);
    leftWristRing.rotation.x = Math.PI * 0.5;
    leftArm.pivot.add(leftWristRing);

    const rightWristRing = new THREE.Mesh(wristGeo, skyVeilMat);
    rightWristRing.position.set(0, -0.52, 0.05);
    rightWristRing.rotation.x = Math.PI * 0.5;
    rightArm.pivot.add(rightWristRing);
  } else {
    const pauldronGeo = new THREE.SphereGeometry(0.145, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(pauldronGeo, accentMat);
      pauldron.position.set(side * (shoulderX + 0.02), 0.45, 0);
      pauldron.rotation.z = side * -0.45;
      addOutline(pauldron, outlineMat, 1.05, 1.05, 1.05);
      upperBodyGroup.add(pauldron);
      hitMeshes.push(pauldron);
    });

    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.075, 0.12),
      new THREE.MeshBasicMaterial({ color: accentCol })
    );
    visor.position.set(0, 0.02, 0.195);
    headGroup.add(visor);

    if (hero.id === 'doom') {
      const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.34), accentMat);
      gauntlet.position.set(0.04, -0.42, 0.04);
      addOutline(gauntlet, outlineMat, 1.05, 1.05, 1.05);
      rightArm.pivot.add(gauntlet);
      hitMeshes.push(gauntlet);
    } else if (hero.id === 'brigid') {
      const shield = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 1.15, 0.05),
        new THREE.MeshBasicMaterial({ color: primaryCol, transparent: true, opacity: 0.48 })
      );
      shield.position.set(-0.08, -0.24, 0.28);
      shield.rotation.y = 0.35;
      leftArm.pivot.add(shield);

      const flailHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 1), accentMat);
      flailHead.position.set(0, -0.62, 0.24);
      rightArm.pivot.add(flailHead);
      hitMeshes.push(flailHead);
    } else if (hero.id === 'vex') {
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.85), bootMat);
      rifle.position.set(0, -0.34, 0.38);
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.38),
        new THREE.MeshBasicMaterial({ color: accentCol })
      );
      barrel.position.set(0, -0.31, 0.82);
      rightArm.pivot.add(rifle, barrel);
      hitMeshes.push(rifle);
    } else if (hero.id === 'kael') {
      [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.78, 0.06), accentMat);
        wing.position.set(side * 0.42, 0.32, -0.22);
        wing.rotation.z = side * -0.35;
        addOutline(wing, outlineMat, 1.04, 1.04, 1.04);
        upperBodyGroup.add(wing);
        hitMeshes.push(wing);
      });
    }
  }

  const hpBarFill = createFloatingHpBar(group, 2.55, 1.85, 'red');
  const nameplateMesh = createHeroNameplate(group, 2.95, bannerText, hero.color);
  const phaseOffset = hero.name.charCodeAt(0) * 0.7;

  const animate = (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => {
    const t = elapsed + phaseOffset;

    if (riggedGojo?.uroAnim) {
      const uAnim = riggedGojo.uroAnim;
      const dt = uAnim.lastElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, elapsed - uAnim.lastElapsed));
      uAnim.lastElapsed = elapsed;

      // Continuously scroll the wave normal map & smoky vapor shroud so the see-through bikini warps space smoothly
      uAnim.warpNormalTex.offset.set(elapsed * 0.16, -elapsed * 0.12);
      uAnim.smokeTimeUniform.value = elapsed;

      const getActionByKey = (key: string): THREE.AnimationAction => {
        if (key === 'reality_wipe' && uAnim.realityWipeAction) return uAnim.realityWipeAction;
        if (key === 'thin_ice_breaker' && uAnim.thinIceAction) return uAnim.thinIceAction;
        if (key === 'domain_expansion' && uAnim.domainAction) return uAnim.domainAction;
        if (key === 'move') return uAnim.moveAction;
        return uAnim.idleAction;
      };

      let desiredKey = 'idle';
      if (!isStunned) {
        if (animHint === 'reality_wipe' && uAnim.realityWipeAction) {
          desiredKey = 'reality_wipe';
        } else if (animHint === 'thin_ice_breaker' && uAnim.thinIceAction) {
          desiredKey = 'thin_ice_breaker';
        } else if (animHint === 'domain_expansion' && uAnim.domainAction) {
          desiredKey = 'domain_expansion';
        } else if (animHint === 'run' || animHint === 'walk' || (!animHint && isMoving)) {
          desiredKey = 'move';
        }
      }

      if (desiredKey !== uAnim.activeKey) {
        const prevAction = getActionByKey(uAnim.activeKey);
        const nextAction = getActionByKey(desiredKey);
        nextAction.enabled = true;
        nextAction.reset();
        nextAction.setEffectiveWeight(1.0);
        nextAction.setEffectiveTimeScale(
          desiredKey === 'move'
            ? animHint === 'walk'
              ? 1.0
              : 1.35
            : desiredKey === 'thin_ice_breaker'
              ? 1.25
              : 1.0
        );
        nextAction.play();
        if (prevAction && prevAction !== nextAction) {
          prevAction.enabled = true;
          nextAction.crossFadeFrom(prevAction, 0.2, false);
        }
        uAnim.activeKey = desiredKey;
      }

      // Subtle weightless sky-levitation bob + graceful forward glide tilt while moving
      const targetLean = desiredKey === 'move' && !isStunned ? 0.18 : 0.0;
      uAnim.root.rotation.x = THREE.MathUtils.lerp(uAnim.root.rotation.x, targetLean, Math.min(1, dt * 8));
      uAnim.root.position.y = isStunned ? 0 : 0.05 + Math.sin(t * 2.4) * 0.045;

      if (!isStunned) {
        uAnim.mixer.update(dt);
      }
      return;
    }

    if (riggedGojo?.dualClipAnim) {
      const dual = riggedGojo.dualClipAnim;
      const dt = dual.lastElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, elapsed - dual.lastElapsed));
      dual.lastElapsed = elapsed;

      const wantRun = !isStunned && (animHint === 'run' || animHint === 'walk' || (!animHint && isMoving));
      const desiredState: 'idle' | 'run' = wantRun ? 'run' : 'idle';
      dual.idleRoot.visible = desiredState === 'idle';
      dual.runRoot.visible = desiredState === 'run';

      if (desiredState !== dual.activeState) {
        if (desiredState === 'run') {
          dual.runAction.reset();
          dual.runAction.setEffectiveTimeScale(animHint === 'walk' ? 0.72 : 1.0);
          dual.runAction.play();
        } else {
          dual.idleAction.reset();
          dual.idleAction.setEffectiveTimeScale(1.0);
          dual.idleAction.play();
        }
        dual.activeState = desiredState;
      }

      if (!isStunned) {
        if (desiredState === 'run') {
          dual.runAction.setEffectiveTimeScale(animHint === 'walk' ? 0.72 : 1.0);
          dual.runMixer.update(dt);
        } else {
          dual.idleMixer.update(dt);
        }
      }
      return;
    }

    if (riggedGojo?.biomasterAnim) {
      const anim = riggedGojo.biomasterAnim;
      const dt = anim.lastElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, elapsed - anim.lastElapsed));
      anim.lastElapsed = elapsed;

      const showAnimRig = !isStunned;
      anim.root.visible = showAnimRig;
      for (const c of riggedGojo.root.children) {
        if ((c as THREE.SkinnedMesh).isSkinnedMesh) c.visible = !showAnimRig;
      }

      if (showAnimRig) {
        const rawHint =
          animHint === 'idle' || animHint === 'dance' || animHint === 'walk' || animHint === 'run'
            ? animHint
            : undefined;
        const desiredKey: BasicLocomotionHint =
          rawHint ??
          (isMoving
            ? (elapsed % 9.0) < 4.5
              ? 'walk'
              : 'run'
            : (elapsed % 11.8) < 4.03
              ? 'idle'
              : 'dance');

        if (desiredKey !== anim.activeKey) {
          const prevAction = anim.activeKey ? anim.actions[anim.activeKey] : null;
          const nextAction = anim.actions[desiredKey];
          nextAction.enabled = true;
          nextAction.reset();
          nextAction.setEffectiveTimeScale(1);
          nextAction.setEffectiveWeight(1);
          nextAction.play();
          if (prevAction && prevAction !== nextAction) {
            prevAction.enabled = true;
            nextAction.crossFadeFrom(prevAction, 0.25, false);
          }
          anim.activeKey = desiredKey;
        }
        anim.mixer.update(dt);
        return;
      }
    }

    if (isStunned) {
      hipsGroup.position.y = 0.82;
      upperBodyGroup.rotation.x = 0.28;
      upperBodyGroup.rotation.z = Math.sin(t * 9) * 0.12;
      headGroup.rotation.x = 0.38;
      leftArm.pivot.rotation.set(-0.2, 0, 0.35);
      rightArm.pivot.rotation.set(-0.2, 0, -0.35);
      leftLeg.pivot.rotation.x = -0.15;
      rightLeg.pivot.rotation.x = 0.15;
      if (riggedGojo) {
        const { bones, root, isTposeBind } = riggedGojo;
        const armDown = isTposeBind ? 1.18 : 0;
        const foreBend = isTposeBind ? 0.45 : 0;
        resetRigBones(bones);
        poseRigBone(bones, 'Spine01', 0.26, 0, Math.sin(t * 9) * 0.12);
        poseRigBone(bones, 'Spine', 0.1, 0, 0);
        poseRigBone(bones, 'Head', 0.35, Math.sin(t * 7) * 0.1, 0);
        poseRigBone(bones, 'LeftArm', -0.18, 0, 0.28 - armDown);
        poseRigBone(bones, 'LeftForeArm', isTposeBind ? 0 : -0.25, -foreBend, 0);
        poseRigBone(bones, 'RightArm', -0.18, 0, -0.28 + armDown);
        poseRigBone(bones, 'RightForeArm', isTposeBind ? 0 : -0.25, foreBend, 0);
        poseRigBone(bones, 'LeftUpLeg', -0.15, 0, 0.04);
        poseRigBone(bones, 'LeftLeg', 0.28, 0, 0);
        poseRigBone(bones, 'RightUpLeg', 0.12, 0, -0.04);
        poseRigBone(bones, 'RightLeg', 0.22, 0, 0);
        root.position.y = -0.04;
      }
      return;
    }

    upperBodyGroup.rotation.z = 0;

    if (isMoving) {
      const walkCycle = t * 8.5;
      const swing = Math.sin(walkCycle) * 0.58;
      hipsGroup.position.y = 0.88 + Math.abs(Math.cos(walkCycle)) * 0.045;
      upperBodyGroup.rotation.x = 0.10;
      upperBodyGroup.rotation.y = Math.sin(walkCycle) * 0.08;
      headGroup.rotation.x = -0.06;
      headGroup.rotation.y = -upperBodyGroup.rotation.y * 0.6;

      leftLeg.pivot.rotation.x = swing;
      rightLeg.pivot.rotation.x = -swing;
      leftLeg.lowerPivot.rotation.x = Math.max(0, -swing * 0.75);
      rightLeg.lowerPivot.rotation.x = Math.max(0, swing * 0.75);

      leftArm.pivot.rotation.set(-swing * 0.65, 0, -0.12);
      rightArm.pivot.rotation.set(swing * 0.55 - 0.25, 0, 0.12);

      if (riggedGojo) {
        const { bones, root, isTposeBind } = riggedGojo;
        const armDown = isTposeBind ? 1.18 : 0;
        const foreBend = isTposeBind ? 0.45 : 0;
        resetRigBones(bones);
        root.position.y = Math.abs(Math.cos(walkCycle)) * 0.038;
        poseRigBone(bones, 'Hips', 0.04, Math.sin(walkCycle) * 0.06, 0);
        poseRigBone(bones, 'Spine01', 0.06, -Math.sin(walkCycle) * 0.08, 0);
        poseRigBone(bones, 'Spine', 0.04, -Math.sin(walkCycle) * 0.06, 0);
        poseRigBone(bones, 'neck', -0.04, 0, 0);
        poseRigBone(bones, 'Head', -0.06, Math.sin(walkCycle) * 0.05, 0);
        poseRigBone(bones, 'LeftUpLeg', -swing * 0.7, 0, 0.03);
        poseRigBone(bones, 'LeftLeg', Math.max(0, swing * 0.85), 0, 0);
        poseRigBone(bones, 'RightUpLeg', swing * 0.7, 0, -0.03);
        poseRigBone(bones, 'RightLeg', Math.max(0, -swing * 0.85), 0, 0);
        poseRigBone(bones, 'LeftArm', swing * 0.55 - 0.18, 0, 0.14 - armDown);
        poseRigBone(
          bones,
          'LeftForeArm',
          isTposeBind ? 0 : -0.45 + Math.max(0, -swing * 0.35),
          0.1 - foreBend,
          0
        );
        poseRigBone(bones, 'RightArm', -swing * 0.55 - 0.18, 0, -0.14 + armDown);
        poseRigBone(
          bones,
          'RightForeArm',
          isTposeBind ? 0 : -0.45 + Math.max(0, swing * 0.35),
          -0.1 + foreBend,
          0
        );
      }
    } else {
      const breath = Math.sin(t * 2.2);
      hipsGroup.position.y = 0.88 + breath * 0.010;
      upperBodyGroup.rotation.x = 0.02 + breath * 0.015;
      upperBodyGroup.rotation.y = Math.sin(t * 1.0) * 0.045;
      headGroup.rotation.x = -0.02 + Math.sin(t * 1.6) * 0.025;
      headGroup.rotation.y = Math.sin(t * 0.85) * 0.07;

      if (riggedGojo) {
        const { bones, root, mixer, isTposeBind } = riggedGojo;
        const armDown = isTposeBind ? 1.18 : 0;
        const foreBend = isTposeBind ? 0.45 : 0;
        root.position.y = 0;
        if (mixer) {
          mixer.setTime(elapsed);
        } else {
          poseRigBone(bones, 'Hips', breath * 0.01, Math.sin(t * 0.9) * 0.03, 0);
          poseRigBone(bones, 'Spine01', breath * 0.03, Math.sin(t * 0.9) * 0.04, 0);
          poseRigBone(bones, 'Spine', breath * 0.02, Math.sin(t * 0.9) * 0.04, 0);
          poseRigBone(bones, 'neck', -0.02 + breath * 0.015, Math.sin(t * 0.8) * 0.04, 0);
          poseRigBone(bones, 'Head', -0.04 + Math.sin(t * 1.5) * 0.03, Math.sin(t * 0.8) * 0.08, 0);
          poseRigBone(bones, 'LeftUpLeg', -0.05, 0, 0.04);
          poseRigBone(bones, 'LeftLeg', 0.08, 0, 0);
          poseRigBone(bones, 'RightUpLeg', 0.05, 0, -0.04);
          poseRigBone(bones, 'RightLeg', 0.08, 0, 0);
          // Combat stance holding Reversal Red / Lapse Blue or lowered combat guard for T-pose rig
          poseRigBone(bones, 'LeftArm', -0.42 + breath * 0.05, 0, 0.34 - armDown);
          poseRigBone(
            bones,
            'LeftForeArm',
            isTposeBind ? 0 : -0.78 - breath * 0.04,
            (isTposeBind ? 0 : 0.28) - foreBend,
            isTposeBind ? 0 : 0.12
          );
          poseRigBone(bones, 'LeftHand', isTposeBind ? 0 : -0.25, 0, isTposeBind ? 0 : -0.15);
          poseRigBone(bones, 'RightArm', -0.42 - breath * 0.05, 0, -0.34 + armDown);
          poseRigBone(
            bones,
            'RightForeArm',
            isTposeBind ? 0 : -0.78 + breath * 0.04,
            (isTposeBind ? 0 : -0.28) + foreBend,
            isTposeBind ? 0 : -0.12
          );
          poseRigBone(bones, 'RightHand', isTposeBind ? 0 : -0.25, 0, isTposeBind ? 0 : 0.15);
        }
      }

      leftLeg.pivot.rotation.set(-0.06, 0, -0.05);
      rightLeg.pivot.rotation.set(0.06, 0, 0.05);
      leftLeg.lowerPivot.rotation.x = 0.06;
      rightLeg.lowerPivot.rotation.x = 0.06;

      if (hero.id === 'gojo') {
        // Pose arms angled outward with open palms upturned displaying Reversal Red (left) & Lapse Blue (right)
        leftArm.pivot.rotation.set(-0.28 + breath * 0.04, 0.0, -0.44);
        leftArm.lowerPivot.rotation.x = -0.82;
        if (leftArm.handGroup) leftArm.handGroup.rotation.set(0.35, 0, -0.35);

        rightArm.pivot.rotation.set(-0.42 - breath * 0.04, 0.0, 0.42);
        rightArm.lowerPivot.rotation.x = -0.96;
        if (rightArm.handGroup) rightArm.handGroup.rotation.set(0.35, 0, 0.35);
      } else if (hero.id === 'higuruma') {
        leftArm.pivot.rotation.set(0.08, 0, -0.14);
        leftArm.lowerPivot.rotation.x = -0.18;
        rightArm.pivot.rotation.set(-0.35 + breath * 0.04, 0, 0.14);
        rightArm.lowerPivot.rotation.x = -0.48;
      } else if (hero.id === 'uro') {
        // Weightless floating sky-manipulation stance with open palms catching the air
        hipsGroup.position.y = 1.04 + Math.sin(elapsed * 2.4) * 0.08;
        leftLeg.pivot.rotation.set(-0.18, 0, -0.06);
        rightLeg.pivot.rotation.set(0.22, 0, 0.06);
        leftLeg.lowerPivot.rotation.x = 0.28;
        rightLeg.lowerPivot.rotation.x = 0.38;
        leftArm.pivot.rotation.set(-0.45 + breath * 0.06, 0.0, -0.34);
        leftArm.lowerPivot.rotation.x = -0.68;
        rightArm.pivot.rotation.set(-0.56 - breath * 0.06, 0.0, 0.32);
        rightArm.lowerPivot.rotation.x = -0.76;
      } else {
        leftArm.pivot.rotation.set(-0.22 + breath * 0.04, 0, -0.16);
        leftArm.lowerPivot.rotation.x = -0.25;
        rightArm.pivot.rotation.set(-0.38 - breath * 0.04, 0, 0.16);
        rightArm.lowerPivot.rotation.x = -0.35;
      }
    }
  };

  return {
    group,
    bodyMesh,
    headMesh,
    hitMeshes,
    hpBarFill,
    nameplateMesh,
    animate
  };
}
