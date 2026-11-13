import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FpsHeroDef, MobaTeam } from '../types';

export interface ProceduralHeroBuildResult {
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  hitMeshes: THREE.Object3D[];
  hpBarFill: THREE.Mesh;
  nameplateMesh: THREE.Mesh;
  animate: (elapsed: number, isMoving: boolean, isStunned: boolean) => void;
}

interface RiggedBoneRecord {
  bone: THREE.Bone;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  bindWorldQuat: THREE.Quaternion;
}

interface RiggedGojoHandle {
  root: THREE.Group;
  hitMeshes: THREE.Mesh[];
  bones: Map<string, RiggedBoneRecord>;
  mixer: THREE.AnimationMixer | null;
}

let cachedToonGradient: THREE.DataTexture | null = null;
let cachedWoodTexture: THREE.CanvasTexture | null = null;

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

function getAnimeToonGradient(): THREE.DataTexture {
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
  leftArm: ReturnType<typeof buildArticulatedLimb>,
  rightArm: ReturnType<typeof buildArticulatedLimb>,
  hairMat: THREE.Material,
  coatMat: THREE.Material,
  outlineMat: THREE.Material,
  hitMeshes: THREE.Object3D[]
): { redOrb: THREE.Group; blueOrb: THREE.Group } {
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

  // 4. Swirling Limitless Vortex Orbs (Reversal Red in Viewer's Left Palm, Lapse Blue in Viewer's Right Palm)
  const createSwirlingVortexOrb = (coreHex: number, innerCss: string, outerCss: string, ringHex: number) => {
    const orbGroup = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 24, 24),
      new THREE.MeshBasicMaterial({
        color: coreHex,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      })
    );

    const vortexMat = new THREE.MeshBasicMaterial({
      map: createSwirlingVortexTexture(innerCss, outerCss),
      transparent: true,
      opacity: 0.96,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const vortexDiscFront = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), vortexMat);
    vortexDiscFront.name = 'vortexDisc';
    const vortexDiscTilt = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), vortexMat);
    vortexDiscTilt.rotation.y = Math.PI * 0.35;
    vortexDiscTilt.name = 'vortexDiscTilt';

    // 4 nested 3D twisted spiral energy ribbons
    const ribbonGroup = new THREE.Group();
    ribbonGroup.name = 'ribbons';
    for (let r = 0; r < 4; r++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.19 + (r % 2) * 0.045, 0.011, 8, 28, Math.PI * 1.25),
        new THREE.MeshBasicMaterial({
          color: r % 2 === 0 ? 0xffffff : ringHex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending
        })
      );
      arc.rotation.set(r * 0.75, r * 1.15, r * 0.55);
      ribbonGroup.add(arc);
    }

    orbGroup.add(core, innerGlow, vortexDiscFront, vortexDiscTilt, ribbonGroup);
    return orbGroup;
  };

  // Remember: when facing +Z (toward viewer), -X (`leftArm`) is VIEWER'S LEFT = Reversal Red!
  const redOrb = createSwirlingVortexOrb(0xff2a55, '#ff4d79', '#be123c', 0xfda4af);
  redOrb.position.set(0, -0.36, 0.14);
  leftArm.lowerPivot.add(redOrb);

  // And +X (`rightArm`) is VIEWER'S RIGHT = Lapse Blue!
  const blueOrb = createSwirlingVortexOrb(0x00d2ff, '#38bdf8', '#0284c7', 0xbae6fd);
  blueOrb.position.set(0, -0.36, 0.14);
  rightArm.lowerPivot.add(blueOrb);

  return { redOrb, blueOrb };
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
    brigid: 0x422006,
    vex: 0x0f172a,
    kael: 0x3b0764
  };
  const pantsColorMap: Record<string, number> = {
    gojo: 0x111827,
    higuruma: 0x111827,
    doom: 0x1c1917,
    brigid: 0x292524,
    vex: 0x1e293b,
    kael: 0x1e1b4b
  };
  const skinColorMap: Record<string, number> = {
    gojo: 0xffe0d0,
    higuruma: 0xf7d7c4,
    doom: 0x7c4a32,
    brigid: 0xfde2d0,
    vex: 0xf5d0ba,
    kael: 0xe9d5ff
  };

  const jacketMat = createToonMaterial(jacketColorMap[hero.id] ?? 0x1e293b, primaryCol, 0.06);
  const pantsMat = createToonMaterial(pantsColorMap[hero.id] ?? 0x0f172a, 0x000000, 0.04);
  const skinMat = createToonMaterial(skinColorMap[hero.id] ?? 0xfde2d0, 0x000000, 0.03);
  const accentMat = createToonMaterial(primaryCol, primaryCol, 0.25);
  const bootMat = createToonMaterial(0x090d16, 0x000000, 0.05);
  const hairMat = createToonMaterial(
    hero.id === 'gojo' ? 0xf8fafc : hero.id === 'higuruma' ? 0x171412 : 0x334155,
    hero.id === 'gojo' ? 0xbae6fd : 0x000000,
    hero.id === 'gojo' ? 0.16 : 0.04
  );

  const isHeavy = hero.id === 'higuruma' || hero.id === 'doom';
  const torsoWidthScale = isHeavy ? 1.24 : hero.id === 'gojo' ? 1.12 : 1.06;
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
  let orbs: { redOrb: THREE.Group; blueOrb: THREE.Group } | null = null;
  let riggedGojo: RiggedGojoHandle | null = null;
  if (hero.id === 'gojo') {
    orbs = addGojoFeatures(
      headGroup,
      upperBodyGroup,
      bodyMesh,
      leftArm,
      rightArm,
      hairMat,
      jacketMat,
      outlineMat,
      hitMeshes
    );

    void loadRiggedGojoFbx().then((rig) => {
      if (!rig) return;
      if (bodyMesh.userData.unit) {
        for (const m of rig.hitMeshes) {
          m.userData.unit = bodyMesh.userData.unit;
        }
      }

      if (orbs) {
        orbs.redOrb.scale.setScalar(0.68);
        orbs.blueOrb.scale.setScalar(0.68);
        group.add(orbs.redOrb, orbs.blueOrb);
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

  const animate = (elapsed: number, isMoving: boolean, isStunned: boolean) => {
    const t = elapsed + phaseOffset;

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
        const { bones, root } = riggedGojo;
        resetRigBones(bones);
        poseRigBone(bones, 'Spine01', 0.26, 0, Math.sin(t * 9) * 0.12);
        poseRigBone(bones, 'Spine', 0.1, 0, 0);
        poseRigBone(bones, 'Head', 0.35, Math.sin(t * 7) * 0.1, 0);
        poseRigBone(bones, 'LeftArm', -0.18, 0, 0.28);
        poseRigBone(bones, 'LeftForeArm', -0.25, 0, 0);
        poseRigBone(bones, 'RightArm', -0.18, 0, -0.28);
        poseRigBone(bones, 'RightForeArm', -0.25, 0, 0);
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
        const { bones, root } = riggedGojo;
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
        poseRigBone(bones, 'LeftArm', swing * 0.55 - 0.18, 0, 0.14);
        poseRigBone(bones, 'LeftForeArm', -0.45 + Math.max(0, -swing * 0.35), 0.1, 0);
        poseRigBone(bones, 'RightArm', -swing * 0.55 - 0.18, 0, -0.14);
        poseRigBone(bones, 'RightForeArm', -0.45 + Math.max(0, swing * 0.35), -0.1, 0);
      }
    } else {
      const breath = Math.sin(t * 2.2);
      hipsGroup.position.y = 0.88 + breath * 0.010;
      upperBodyGroup.rotation.x = 0.02 + breath * 0.015;
      upperBodyGroup.rotation.y = Math.sin(t * 1.0) * 0.045;
      headGroup.rotation.x = -0.02 + Math.sin(t * 1.6) * 0.025;
      headGroup.rotation.y = Math.sin(t * 0.85) * 0.07;

      if (riggedGojo) {
        const { bones, root, mixer } = riggedGojo;
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
          // Combat stance holding Reversal Red (right hand / viewer left) & Lapse Blue (left hand / viewer right)
          poseRigBone(bones, 'LeftArm', -0.42 + breath * 0.05, 0, 0.34);
          poseRigBone(bones, 'LeftForeArm', -0.78 - breath * 0.04, 0.28, 0.12);
          poseRigBone(bones, 'LeftHand', -0.25, 0, -0.15);
          poseRigBone(bones, 'RightArm', -0.42 - breath * 0.05, 0, -0.34);
          poseRigBone(bones, 'RightForeArm', -0.78 + breath * 0.04, -0.28, -0.12);
          poseRigBone(bones, 'RightHand', -0.25, 0, 0.15);
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
      } else {
        leftArm.pivot.rotation.set(-0.22 + breath * 0.04, 0, -0.16);
        leftArm.lowerPivot.rotation.x = -0.25;
        rightArm.pivot.rotation.set(-0.38 - breath * 0.04, 0, 0.16);
        rightArm.lowerPivot.rotation.x = -0.35;
      }
    }

    if (orbs) {
      if (riggedGojo) {
        group.updateMatrixWorld(true);
        const rightHand = riggedGojo.bones.get('RightHand');
        if (rightHand) {
          rightHand.bone.getWorldPosition(_tmpHandWorld);
          group.worldToLocal(_tmpHandWorld);
          orbs.redOrb.position.set(_tmpHandWorld.x, _tmpHandWorld.y + 0.1, _tmpHandWorld.z + 0.14);
        }
        const leftHand = riggedGojo.bones.get('LeftHand');
        if (leftHand) {
          leftHand.bone.getWorldPosition(_tmpHandWorld);
          group.worldToLocal(_tmpHandWorld);
          orbs.blueOrb.position.set(_tmpHandWorld.x, _tmpHandWorld.y + 0.1, _tmpHandWorld.z + 0.14);
        }
      }

      const spinSwirl = (orb: THREE.Group, speed: number) => {
        const disc = orb.getObjectByName('vortexDisc');
        const tilt = orb.getObjectByName('vortexDiscTilt');
        const ribbons = orb.getObjectByName('ribbons');
        if (disc) disc.rotation.z = elapsed * speed;
        if (tilt) tilt.rotation.z = -elapsed * speed * 0.85;
        if (ribbons) {
          ribbons.rotation.y = elapsed * speed * 0.9;
          ribbons.rotation.x = elapsed * speed * 0.55;
        }
      };
      spinSwirl(orbs.redOrb, 3.6);
      spinSwirl(orbs.blueOrb, -4.1);
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
