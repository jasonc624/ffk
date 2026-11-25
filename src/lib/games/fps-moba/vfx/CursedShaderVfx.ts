import * as THREE from 'three';

let cachedSoftParticleTex: THREE.CanvasTexture | null = null;

/**
 * Generates a soft-glowing circular radial sprite texture so PointsMaterial
 * renders crisp glowing energy sparks instead of hard-edged WebGL squares.
 */
export function getSoftParticleTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedSoftParticleTex) return cachedSoftParticleTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.28, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.62, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  cachedSoftParticleTex = new THREE.CanvasTexture(canvas);
  cachedSoftParticleTex.needsUpdate = true;
  return cachedSoftParticleTex;
}

const PLASMA_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDisplaceAmp;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vLocalPos = position;
    float n = noise(normalize(position) * 3.8 + vec3(uTime * 3.2, -uTime * 2.6, uTime * 2.1));
    float n2 = noise(normalize(position) * 7.5 - vec3(uTime * 5.0));
    float disp = (n * 0.65 + n2 * 0.35 - 0.5) * uDisplaceAmp;
    vec3 displaced = position + normal * disp;

    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PLASMA_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCoreColor;
  uniform vec3 uMidColor;
  uniform vec3 uRimColor;
  uniform float uDarkCore;
  uniform float uOpacity;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.15 + vec3(1.7, 9.2, 4.3);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    float ndotv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 2.2);

    vec3 p = normalize(vLocalPos) * 3.5;
    float swirl = fbm(p + vec3(uTime * 2.4, -uTime * 1.9, uTime * 2.8));
    float veins = smoothstep(0.42, 0.78, fbm(p * 2.2 - vec3(uTime * 4.2)));

    vec3 col;
    if (uDarkCore > 0.5) {
      // Singularity orb (Lapse Blue / Hollow Purple): deep dark gravity well in center + saturated glowing rim & veins
      vec3 voidCenter = uCoreColor * 0.08;
      col = mix(voidCenter, uMidColor * 1.45, smoothstep(0.16, 0.84, fresnel + swirl * 0.42));
      col += uRimColor * (pow(fresnel, 1.5) * 1.65 + veins * 0.9);
    } else {
      // Explosive plasma orb (Reversal Red): deep saturated crimson core + boiling scarlet corona without white/pink washout
      col = mix(uMidColor * 1.35, uCoreColor * 1.55, pow(ndotv, 1.25) + veins * 0.32);
      col = mix(col, uRimColor * 1.6, fresnel * 0.72 + swirl * 0.28);
    }

    col *= uIntensity;
    float alpha = clamp(uOpacity * (0.94 + fresnel * 0.2 + veins * 0.15), 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const ACCRETION_RING_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float r = length(centered);
    if (r > 1.0 || r < 0.18) discard;

    float angle = atan(centered.y, centered.x);
    float spiral1 = sin(angle * 5.0 - r * 14.0 + uTime * 9.0);
    float spiral2 = cos(angle * 8.0 + r * 10.0 - uTime * 7.0);
    float bands = smoothstep(-0.2, 0.85, spiral1 * 0.6 + spiral2 * 0.4);

    float radialFade = smoothstep(0.18, 0.42, r) * (1.0 - smoothstep(0.68, 1.0, r));
    vec3 col = mix(uColorB, uColorA * 1.35, bands) * uIntensity;
    float alpha = radialFade * (0.35 + bands * 0.65) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

const INFINITY_SHIELD_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const INFINITY_SHIELD_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDeployRatio;
  uniform float uPoolRatio;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.1 + vec2(3.1, 1.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float dist = length(centered);

    // Organic warped space-time distortion field (no grid lines)
    vec2 flowUv = centered * 2.6;
    float n1 = fbm(flowUv + vec2(uTime * 0.55, -uTime * 0.42));
    float n2 = fbm(flowUv * 1.8 - vec2(uTime * 0.75, uTime * 0.6) + n1 * 1.4);

    // Subtle gravitational ripple waves bending outward
    float wave = sin(dist * 14.0 - uTime * 3.8 + n2 * 5.0) * 0.5 + 0.5;
    float caustic = smoothstep(0.45, 0.88, n2 * 0.7 + wave * 0.3);

    float ndotv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 2.4);

    // Prismatic chromatic refraction shift across the distortion field
    vec3 spectralCyan = vec3(0.55, 0.88, 1.0);
    vec3 spectralViolet = vec3(0.78, 0.68, 1.0);
    vec3 lowPoolTint = vec3(1.0, 0.45, 0.6);

    vec3 baseTint = mix(spectralCyan, spectralViolet, n1);
    baseTint = mix(lowPoolTint, baseTint, clamp(uPoolRatio * 1.4, 0.0, 1.0));

    vec3 col = baseTint * (0.55 + caustic * 0.85) + vec3(1.0) * pow(caustic, 3.0) * 0.55;

    // Soft radial falloff so edges melt seamlessly into air
    float edgeMask = 1.0 - smoothstep(0.62, 0.98, dist);
    float hazeAlpha = (0.045 + caustic * 0.085 + fresnel * 0.14) * edgeMask * uDeployRatio;

    gl_FragColor = vec4(col, clamp(hazeAlpha, 0.0, 0.32));
  }
`;

export interface CursedOrbController {
  group: THREE.Group;
  update: (dt: number, elapsed: number) => void;
  setScale: (s: number) => void;
}

export interface CursedOrbOptions {
  variant: 'RED' | 'BLUE' | 'PURPLE';
  radius: number;
  withLight?: boolean;
  isViewModel?: boolean;
}

export function createCursedEnergyOrb(opts: CursedOrbOptions): CursedOrbController {
  const group = new THREE.Group();
  const r = opts.radius;
  // Calibrated intensity + deeply saturated palettes so orbs read rich crimson/cobalt under ACES without white glare
  const isVm = Boolean(opts.isViewModel);
  const orbIntensity = isVm ? 0.92 : 1.12;

  const palette =
    opts.variant === 'RED'
      ? {
          core: new THREE.Color(0xff1422),
          mid: new THREE.Color(0xc40014),
          rim: new THREE.Color(0xff2838),
          darkCore: 0.0,
          lightHex: 0xff1422
        }
      : opts.variant === 'BLUE'
        ? {
            core: new THREE.Color(0x01051a),
            mid: new THREE.Color(0x0044ff),
            rim: new THREE.Color(0x007aff),
            darkCore: 1.0,
            lightHex: 0x007aff
          }
        : {
            core: new THREE.Color(0x070112),
            mid: new THREE.Color(0x9333ea),
            rim: new THREE.Color(0xe879f9),
            darkCore: 1.0,
            lightHex: 0xc084fc
          };

  // 1. Primary Volumetric Plasma / Singularity Sphere
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDisplaceAmp: { value: r * 0.14 },
      uCoreColor: { value: palette.core },
      uMidColor: { value: palette.mid },
      uRimColor: { value: palette.rim },
      uDarkCore: { value: palette.darkCore },
      uOpacity: { value: 1.0 },
      uIntensity: { value: orbIntensity }
    },
    vertexShader: PLASMA_VERTEX_SHADER,
    fragmentShader: PLASMA_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 32), coreMat);
  group.add(coreMesh);

  // 2. Outer Boiling Corona Halo
  const coronaMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 1.7 },
      uDisplaceAmp: { value: r * 0.2 },
      uCoreColor: { value: palette.mid },
      uMidColor: { value: palette.rim },
      uRimColor: { value: palette.rim },
      uDarkCore: { value: 1.0 },
      uOpacity: { value: isVm ? 0.28 : 0.40 },
      uIntensity: { value: orbIntensity }
    },
    vertexShader: PLASMA_VERTEX_SHADER,
    fragmentShader: PLASMA_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(r * (isVm ? 1.24 : 1.34), 28, 28), coronaMat);
  group.add(coronaMesh);

  // 3. Swirling Spiral Accretion Discs (2 intersecting planes)
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: palette.rim },
      uColorB: { value: palette.mid },
      uOpacity: { value: isVm ? 0.34 : 0.48 },
      uIntensity: { value: orbIntensity }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: ACCRETION_RING_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const disc1 = new THREE.Mesh(new THREE.PlaneGeometry(r * (isVm ? 2.1 : 3.0), r * (isVm ? 2.1 : 3.0)), ringMat);
  const disc2 = new THREE.Mesh(new THREE.PlaneGeometry(r * (isVm ? 1.9 : 2.7), r * (isVm ? 1.9 : 2.7)), ringMat);
  disc2.rotation.x = Math.PI * 0.45;
  disc2.rotation.y = Math.PI * 0.25;
  group.add(disc1, disc2);

  // 4. Jagged 3D Cursed Lightning Arcs snapping around the orb
  const arcSegments = 18;
  const arcPositions = new Float32Array(arcSegments * 2 * 3);
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  const arcMat = new THREE.LineBasicMaterial({
    color: palette.rim,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  const lightningLines = new THREE.LineSegments(arcGeo, arcMat);
  group.add(lightningLines);

  // 5. Orbiting / Suction / Repel Particle Sparks
  const particleCount = 36;
  const pPositions = new Float32Array(particleCount * 3);
  const pSeeds = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pSeeds[i * 3] = Math.sin(phi) * Math.cos(theta);
    pSeeds[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
    pSeeds[i * 3 + 2] = Math.cos(phi);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const softParticleMap = getSoftParticleTexture();
  const pMat = new THREE.PointsMaterial({
    color: palette.rim,
    map: softParticleMap ?? undefined,
    size: isVm ? Math.max(0.012, r * 0.65) : Math.max(0.1, r * 0.24),
    transparent: true,
    opacity: isVm ? 0.72 : 0.88,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sparks = new THREE.Points(pGeo, pMat);
  group.add(sparks);

  if (opts.withLight !== false) {
    const light = new THREE.PointLight(palette.lightHex, 5.5, r * 14, 1.6);
    group.add(light);
  }

  let localTime = Math.random() * 10;

  const update = (dt: number, elapsed: number) => {
    localTime += dt;
    const t = elapsed || localTime;
    coreMat.uniforms.uTime.value = t;
    coronaMat.uniforms.uTime.value = t * 1.25 + 1.7;
    ringMat.uniforms.uTime.value = t;

    disc1.rotation.z = t * (opts.variant === 'BLUE' ? -3.5 : 3.2);
    disc1.rotation.y = Math.sin(t * 2.0) * 0.45;
    disc2.rotation.z = -t * 4.1;
    disc2.rotation.x = Math.PI * 0.45 + Math.cos(t * 2.3) * 0.35;

    // Re-jitter 3D lightning arcs around the sphere
    const posArr = arcGeo.attributes.position.array as Float32Array;
    for (let a = 0; a < 3; a++) {
      const chainLen = 6;
      let theta = t * 6 + a * 2.1;
      let phi = 0.7 + a * 0.6;
      for (let s = 0; s < chainLen; s++) {
        const idx = (a * chainLen + s) * 6;
        const rad1 = r * (1.05 + Math.random() * 0.55);
        const x1 = rad1 * Math.sin(phi) * Math.cos(theta);
        const y1 = rad1 * Math.sin(phi) * Math.sin(theta);
        const z1 = rad1 * Math.cos(phi);

        theta += (Math.random() - 0.35) * 0.85;
        phi += (Math.random() - 0.5) * 0.65;
        const rad2 = r * (1.05 + Math.random() * 0.65);
        const x2 = rad2 * Math.sin(phi) * Math.cos(theta);
        const y2 = rad2 * Math.sin(phi) * Math.sin(theta);
        const z2 = rad2 * Math.cos(phi);

        posArr[idx] = x1;
        posArr[idx + 1] = y1;
        posArr[idx + 2] = z1;
        posArr[idx + 3] = x2;
        posArr[idx + 4] = y2;
        posArr[idx + 5] = z2;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;

    // Update suction (BLUE/PURPLE) or repel (RED) particle radial flow
    const pArr = pGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < particleCount; i++) {
      const cycle = (t * 1.8 + i / particleCount) % 1.0;
      // BLUE pulls inward (2.6r -> 0.8r); RED/PURPLE burst outward or swirl
      const radialFactor =
        opts.variant === 'BLUE' ? 2.6 - cycle * 1.85 : 0.85 + cycle * 1.9;
      const dist = r * radialFactor;
      const sx = pSeeds[i * 3];
      const sy = pSeeds[i * 3 + 1];
      const sz = pSeeds[i * 3 + 2];
      const spin = t * 2.5 + cycle * 2.2;
      const cosS = Math.cos(spin);
      const sinS = Math.sin(spin);
      pArr[i * 3] = (sx * cosS - sz * sinS) * dist;
      pArr[i * 3 + 1] = sy * dist;
      pArr[i * 3 + 2] = (sx * sinS + sz * cosS) * dist;
    }
    pGeo.attributes.position.needsUpdate = true;
  };

  const setScale = (s: number) => {
    group.scale.setScalar(s);
  };

  return { group, update, setScale };
}

export function createInfinityDistortionMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeployRatio: { value: 0 },
      uPoolRatio: { value: 1 }
    },
    vertexShader: INFINITY_SHIELD_VERTEX_SHADER,
    fragmentShader: INFINITY_SHIELD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  GOJO DOMAIN EXPANSION: UNLIMITED VOID (Startup Tracer Rush -> Outer Space & Black Hole)
// ─────────────────────────────────────────────────────────────────────────────

const UNLIMITED_VOID_DOME_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalDir;
  void main() {
    vLocalDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const UNLIMITED_VOID_DOME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  varying vec3 vLocalDir;

  float hash1(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = p * 2.12 + vec3(3.7, 1.9, 5.3);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vLocalDir);

    // 1. STARTUP PHASE (0.0s .. 1.35s): Hyper-speed neon purple/pink/red/white tracer streaks
    float rushFade = 1.0 - smoothstep(0.85, 1.45, uAge);

    // Polar coordinates around the forward-back Z axis for radial warp-speed lines
    float angle = atan(dir.y, dir.x);
    float zDist = dir.z;
    float rayId = floor((angle + 3.14159265) * 42.0);
    float rayId2 = floor((angle + 3.14159265) * 95.0);

    float speed1 = 16.0 + hash1(rayId) * 22.0;
    float streak1 = smoothstep(0.55, 0.98, sin(zDist * 9.0 - uAge * speed1 + hash1(rayId) * 20.0));
    float thinMask1 = smoothstep(0.25, 0.92, hash1(rayId * 3.17));

    float speed2 = 24.0 + hash1(rayId2) * 28.0;
    float streak2 = smoothstep(0.72, 0.99, sin(zDist * 16.0 - uAge * speed2 + hash1(rayId2) * 30.0));

    // Palette matching Screenshot 1: electric purple, magenta-crimson, neon pink, blinding white core
    vec3 colPurple = vec3(0.58, 0.16, 0.95);
    vec3 colMagenta = vec3(0.96, 0.20, 0.48);
    vec3 colWhite = vec3(1.45, 1.35, 1.55);

    float colorPick = hash1(rayId * 7.13);
    vec3 rayCol = mix(colPurple, colMagenta, smoothstep(0.25, 0.75, colorPick));
    rayCol = mix(rayCol, colWhite, streak2 * 0.85);

    // Dark convergence hole at z = -1 and z = +1
    float radialMask = smoothstep(0.06, 0.32, length(dir.xy));
    vec3 rushColor = rayCol * (streak1 * thinMask1 * 1.15 + streak2 * 1.45) * radialMask;

    // 2. SETTLED PHASE: Pitch-black outer space abyss + smoky white/ice-blue cosmic nebula clouds + stars
    vec3 spaceBg = vec3(0.003, 0.004, 0.009);

    // Billowing cosmic dust plume across the void
    float neb1 = fbm3(dir * 2.8 + vec3(uTime * 0.03, -uTime * 0.02, 0.0));
    float neb2 = fbm3(dir * 5.6 - vec3(0.0, uTime * 0.04, uTime * 0.02) + neb1 * 1.2);
    float cloudMask = smoothstep(0.48, 0.84, neb1 * 0.6 + neb2 * 0.4);

    vec3 nebulaCol = mix(vec3(0.18, 0.28, 0.38), vec3(0.82, 0.88, 0.95), neb2);
    spaceBg += nebulaCol * cloudMask * 0.42;

    // Pinpoint distant stars in the deep void
    float starNoise = pow( clamp(hash3(floor(dir * 260.0)), 0.0, 1.0), 38.0 );
    spaceBg += vec3(0.9, 0.95, 1.0) * starNoise * 1.4;

    vec3 finalCol = mix(spaceBg, rushColor + vec3(0.06, 0.01, 0.12), rushFade);
    gl_FragColor = vec4(finalCol, 0.985);
  }
`;

const BLACK_HOLE_ACCRETION_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAppear;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.08 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Shift center slightly left so the cosmic dust plume can stream off to the right (+X) like Screenshot 2
    vec2 p = (vUv - vec2(0.42, 0.5)) * 2.3;
    float r = length(p);
    float angle = atan(p.y, p.x);

    // 1. Pitch-black event horizon center (r < 0.30)
    if (r < 0.295) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, uAppear);
      return;
    }

    // 2. Inner wispy white/silver fibrous tendrils spiraling into the black hole (r in 0.295 .. 0.48)
    float spiralAngle = angle + log(max(r, 0.001)) * 3.8 - uTime * 0.85;
    float wisps = fbm(vec2(spiralAngle * 3.2, r * 14.0 - uTime * 1.4));
    float wispMask = smoothstep(0.295, 0.34, r) * (1.0 - smoothstep(0.40, 0.52, r));
    vec3 wispCol = vec3(0.82, 0.85, 0.92) * smoothstep(0.35, 0.82, wisps) * wispMask * 1.15;

    // 3. Blinding white Photon Ring & Concentric Relativistic Lensing Rings (r in 0.44 .. 0.78)
    float photonRing = exp(-pow((r - 0.47) * 26.0, 2.0)) * 1.65;

    // Fine concentric engraved ring bands around the halo
    float ringWave = sin((r - 0.47) * 140.0 - uTime * 2.0) * 0.5 + 0.5;
    float outerHaloEnv = smoothstep(0.43, 0.49, r) * (1.0 - smoothstep(0.55, 0.82, r));
    float ringBands = outerHaloEnv * (0.45 + 0.55 * ringWave);

    // Chromatic gold/amber tint on upper-left arc, cool silver-cyan on lower-right arc (Screenshot 2)
    float arcMix = sin(angle + 0.8) * 0.5 + 0.5;
    vec3 goldTint = vec3(1.05, 0.78, 0.42);
    vec3 cyanSilverTint = vec3(0.68, 0.88, 1.05);
    vec3 ringTint = mix(cyanSilverTint, goldTint, arcMix);

    // 4. Asymmetric Smoky Cosmic Nebula Tail streaming to the right (+X)
    vec2 tailUv = p - vec2(0.35, 0.02);
    float tailMask = smoothstep(0.85, 0.12, abs(tailUv.y * 1.65)) * smoothstep(-0.15, 0.35, tailUv.x) * (1.0 - smoothstep(0.45, 1.35, tailUv.x));
    float tailFbm = fbm(tailUv * 3.2 - vec2(uTime * 0.22, 0.0));
    float tailDetail = fbm(tailUv * 7.5 - vec2(uTime * 0.35, -uTime * 0.15) + tailFbm);
    vec3 tailCol = mix(vec3(0.32, 0.46, 0.58), vec3(0.92, 0.96, 1.0), tailDetail) * smoothstep(0.36, 0.82, tailFbm) * tailMask * 0.95;

    vec3 col = wispCol + vec3(1.35, 1.35, 1.42) * photonRing + ringTint * ringBands * 1.15 + tailCol;

    float alpha = clamp(
      (wispMask * 0.9 + photonRing + outerHaloEnv * 0.92 + tailMask * smoothstep(0.38, 0.8, tailFbm) * 0.75) * uAppear,
      0.0,
      1.0
    );
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export interface UnlimitedVoidDomainController {
  root: THREE.Group;
  update: (dt: number, elapsed: number, ageSec: number, cameraPos: THREE.Vector3) => void;
}

export function createUnlimitedVoidDomainVfx(
  center: THREE.Vector3,
  radius: number
): UnlimitedVoidDomainController {
  const root = new THREE.Group();
  root.position.copy(center);

  // 1. Full Outer-Space Interior Sky Dome + Startup Colored Tracer Rush Shader
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: UNLIMITED_VOID_DOME_VERTEX_SHADER,
    fragmentShader: UNLIMITED_VOID_DOME_FRAGMENT_SHADER,
    side: THREE.BackSide,
    transparent: true
  });
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 40), domeMat);
  root.add(domeMesh);

  // Subtle exterior dark barrier shell so outside observers see a pitch-black sphere with a glowing violet rim
  const extMat = new THREE.MeshBasicMaterial({
    color: 0x05030a,
    transparent: true,
    opacity: 0.82,
    side: THREE.FrontSide
  });
  const extMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.003, 40, 28), extMat);
  root.add(extMesh);

  // 2. Dark Space Floor Overlay inside the Domain (hides the bright arena grid inside the 19m void)
  const floorGeo = new THREE.CircleGeometry(radius * 0.995, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshBasicMaterial({
    color: 0x020308,
    transparent: true,
    opacity: 0.94
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = 0.05;
  root.add(floorMesh);

  // 3. 3D Volumetric Colored Tracer Rush Lines (Screenshot 1 startup rush engulfing the 3D volume)
  const streakCount = 180;
  const streakPos = new Float32Array(streakCount * 2 * 3);
  const streakCol = new Float32Array(streakCount * 2 * 3);
  const streakMeta: { dirX: number; dirY: number; speed: number; offset: number; len: number }[] = [];

  const paletteCols = [
    new THREE.Color(0xa855f7), // Electric purple
    new THREE.Color(0xf43f5e), // Crimson-pink
    new THREE.Color(0xec4899), // Hot magenta
    new THREE.Color(0xffffff)  // White-hot core
  ];

  for (let i = 0; i < streakCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = 1.4 + Math.random() * (radius * 0.85);
    const dirX = Math.cos(angle) * rad;
    const dirY = 0.4 + Math.sin(angle) * (radius * 0.45) + 2.5;
    const speed = 42 + Math.random() * 45;
    const offset = Math.random() * radius * 2;
    const len = 4.5 + Math.random() * 7.5;
    streakMeta.push({ dirX, dirY, speed, offset, len });

    const c = paletteCols[i % paletteCols.length];
    streakCol[i * 6] = c.r;
    streakCol[i * 6 + 1] = c.g;
    streakCol[i * 6 + 2] = c.b;
    streakCol[i * 6 + 3] = 1.0;
    streakCol[i * 6 + 4] = 0.95;
    streakCol[i * 6 + 5] = 1.0;
  }

  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
  const streakMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  root.add(streakLines);

  // 4. The Monumental Black Hole at the Caster's Origin (Screenshot 2)
  const blackHoleGroup = new THREE.Group();
  blackHoleGroup.position.set(0, 4.6, 0);

  const accretionMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAppear: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: BLACK_HOLE_ACCRETION_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const blackHoleBillboard = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 13.5), accretionMat);
  blackHoleGroup.add(blackHoleBillboard);

  // Pure 3D pitch-black spherical core inside the accretion plane so it stays black from any angle
  const voidCoreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.82, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  blackHoleGroup.add(voidCoreMesh);
  root.add(blackHoleGroup);

  // 5. Drifting Cosmic Stardust Motes suspended inside Unlimited Void
  const starCount = 160;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 2.5 + Math.random() * (radius * 0.85);
    const theta = Math.random() * Math.PI * 2;
    starPositions[i * 3] = Math.cos(theta) * r;
    starPositions[i * 3 + 1] = 0.5 + Math.random() * (radius * 0.65);
    starPositions[i * 3 + 2] = Math.sin(theta) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xe0f2fe,
    map: getSoftParticleTexture() ?? undefined,
    size: 0.18,
    transparent: true,
    opacity: 0.0,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const starPoints = new THREE.Points(starGeo, starMat);
  root.add(starPoints);

  const update = (_dt: number, elapsed: number, ageSec: number, cameraPos: THREE.Vector3) => {
    domeMat.uniforms.uTime.value = elapsed;
    domeMat.uniforms.uAge.value = ageSec;

    // 1. Update Startup Rush of Colored Tracers (0.0s .. 1.35s)
    const rushAlpha = 1.0 - THREE.MathUtils.smoothstep(ageSec, 0.8, 1.4);
    if (rushAlpha > 0.01) {
      streakLines.visible = true;
      streakMat.opacity = rushAlpha;
      const arr = streakGeo.attributes.position.array as Float32Array;
      const span = radius * 1.85;
      for (let i = 0; i < streakCount; i++) {
        const m = streakMeta[i];
        const zHead = ((ageSec * m.speed + m.offset) % span) - span * 0.5;
        const zTail = zHead - m.len;
        arr[i * 6] = m.dirX;
        arr[i * 6 + 1] = m.dirY;
        arr[i * 6 + 2] = zHead;
        arr[i * 6 + 3] = m.dirX * 0.92;
        arr[i * 6 + 4] = m.dirY * 0.92;
        arr[i * 6 + 5] = zTail;
      }
      streakGeo.attributes.position.needsUpdate = true;
    } else {
      streakLines.visible = false;
    }

    // 2. Emerge the Black Hole & Cosmic Stardust at the Caster's Origin
    const bhAppear = THREE.MathUtils.smoothstep(ageSec, 0.45, 1.25);
    accretionMat.uniforms.uTime.value = elapsed;
    accretionMat.uniforms.uAppear.value = bhAppear;
    voidCoreMesh.scale.setScalar(Math.max(0.01, bhAppear));
    blackHoleGroup.lookAt(cameraPos);

    starMat.opacity = bhAppear * 0.78;
    starPoints.rotation.y = elapsed * 0.04;
  };

  return { root, update };
}

export interface CursedExplosionController {
  group: THREE.Group;
  update: (dt: number, progress: number) => void;
}

/**
 * Radial burst of glowing circular cursed-energy sparks & embers for orb impacts/explosions.
 */
export function createCursedExplosionParticles(opts: {
  variant: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW' | 'SKY';
  radius?: number;
  count?: number;
}): CursedExplosionController {
  const group = new THREE.Group();
  const count = opts.count ?? 72;
  const spread = opts.radius ?? 1.8;

  const colors =
    opts.variant === 'RED'
      ? { primary: 0xff2a55, secondary: 0xff99aa }
      : opts.variant === 'BLUE'
        ? { primary: 0x0ea5e9, secondary: 0x7dd3fc }
        : opts.variant === 'FIRE'
          ? { primary: 0xff3b00, secondary: 0xfacc15 }
          : opts.variant === 'SHADOW'
            ? { primary: 0x312e81, secondary: 0x818cf8 }
            : opts.variant === 'SKY'
              ? { primary: 0x67e8f9, secondary: 0xf0f9ff }
              : { primary: 0xa855f7, secondary: 0xf0abfc };

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colorArr = new Float32Array(count * 3);
  const c1 = new THREE.Color(colors.primary);
  const c2 = new THREE.Color(colors.secondary);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dirX = Math.sin(phi) * Math.cos(theta);
    const dirY = Math.sin(phi) * Math.sin(theta);
    const dirZ = Math.cos(phi);

    const initR = Math.random() * spread * 0.18;
    positions[i * 3] = dirX * initR;
    positions[i * 3 + 1] = dirY * initR;
    positions[i * 3 + 2] = dirZ * initR;

    const speed = spread * (1.8 + Math.random() * 4.2);
    velocities[i * 3] = dirX * speed;
    velocities[i * 3 + 1] = dirY * speed + (0.4 + Math.random() * 1.4);
    velocities[i * 3 + 2] = dirZ * speed;

    tmpColor.copy(c1).lerp(c2, Math.random());
    colorArr[i * 3] = tmpColor.r;
    colorArr[i * 3 + 1] = tmpColor.g;
    colorArr[i * 3 + 2] = tmpColor.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

  const baseSize = Math.max(0.16, Math.min(0.45, spread * 0.16));
  const mat = new THREE.PointsMaterial({
    map: getSoftParticleTexture() ?? undefined,
    size: baseSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  group.add(points);

  const update = (dt: number, progress: number) => {
    const pos = geo.attributes.position.array as Float32Array;
    const drag = Math.exp(-3.4 * dt);
    const gravity = opts.variant === 'BLUE' ? -1.8 : -4.2;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      velocities[idx] *= drag;
      velocities[idx + 1] = velocities[idx + 1] * drag + gravity * dt;
      velocities[idx + 2] *= drag;

      pos[idx] += velocities[idx] * dt;
      pos[idx + 1] += velocities[idx + 1] * dt;
      pos[idx + 2] += velocities[idx + 2] * dt;
    }
    geo.attributes.position.needsUpdate = true;

    const fade = Math.max(0, 1 - progress * progress);
    mat.opacity = 0.95 * fade;
    mat.size = baseSize * (0.55 + 0.65 * fade);
  };

  return { group, update };
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOGO DOMAIN EXPANSION: COFFIN OF THE IRON MOUNTAIN (CENTER OF THE EARTH)
// ─────────────────────────────────────────────────────────────────────────────

const VOLCANIC_NOISE_GLSL = /* glsl */ `
  float vHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(vHash(i + vec3(0,0,0)), vHash(i + vec3(1,0,0)), f.x),
          mix(vHash(i + vec3(0,1,0)), vHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(vHash(i + vec3(0,0,1)), vHash(i + vec3(1,0,1)), f.x),
          mix(vHash(i + vec3(0,1,1)), vHash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vNoise(p);
      p = p * 2.03 + vec3(13.1, 7.7, 5.3);
      a *= 0.5;
    }
    return v;
  }
`;

const IRON_MOUNTAIN_DOME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  varying vec3 vLocalPos;
  varying vec3 vNormal;

  ${VOLCANIC_NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vLocalPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Volcanic cavern rock strata + flowing incandescent magma veins
    float rockNoise = fbm(dir * 5.2 + vec3(0.0, -uTime * 0.04, 0.0));
    float crackA = fbm(dir * 7.5 + vec3(uTime * 0.14, -uTime * 0.22, uTime * 0.08));
    float crackB = fbm(dir * 12.0 - vec3(uTime * 0.1, uTime * 0.35, -uTime * 0.12));
    float ridge = 1.0 - abs(crackA * 2.0 - 1.0);
    float magmaVeins = pow(clamp(ridge, 0.0, 1.0), 4.2) * (0.7 + 0.3 * sin(uTime * 3.5 + crackB * 8.0));

    // Glowing molten caldera base rising up the walls
    float baseHeat = smoothstep(0.62, 0.18, h);
    vec3 obsidian = vec3(0.07, 0.025, 0.02) * (0.65 + rockNoise * 0.7);
    vec3 crimsonLava = vec3(0.95, 0.14, 0.02);
    vec3 moltenGold = vec3(1.0, 0.68, 0.12);

    vec3 col = mix(obsidian, crimsonLava * 0.55, baseHeat * (0.45 + rockNoise * 0.55));
    col += mix(crimsonLava, moltenGold, clamp(magmaVeins * 1.4, 0.0, 1.0)) * magmaVeins * 1.85;

    // Fiery zenith caldera glow directly overhead (where Maximum: Meteor descends)
    float zenith = smoothstep(0.75, 0.99, dir.y);
    col += vec3(1.0, 0.32, 0.05) * zenith * (0.55 + 0.25 * sin(uTime * 2.6 + rockNoise * 6.0));

    float appear = smoothstep(0.0, 0.75, uAge);
    gl_FragColor = vec4(col, 0.93 * appear);
  }
`;

export function createIronMountainDomainVfx(
  center: THREE.Vector3,
  radius: number
): UnlimitedVoidDomainController {
  const root = new THREE.Group();
  root.position.copy(center);

  // 1. Center-of-the-Earth Volcanic Cavern Dome (visible inside & outside)
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      varying vec3 vNormal;
      void main() {
        vLocalPos = position;
        vNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: IRON_MOUNTAIN_DOME_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 42, 30), domeMat);
  root.add(domeMesh);

  // 2. Molten Magma Floor Overlay Glow inside the Domain
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAge;
      varying vec2 vUv;
      ${VOLCANIC_NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float n = fbm(vec3(p * 6.0, uTime * 0.25));
        float cracks = pow(1.0 - abs(n * 2.0 - 1.0), 4.0);
        float edgeGlow = smoothstep(0.68, 0.98, r);
        vec3 lava = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.72, 0.14), cracks);
        float alpha = (cracks * 0.55 + edgeGlow * 0.45) * smoothstep(0.0, 0.6, uAge) * 0.72;
        gl_FragColor = vec4(lava, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 48), floorMat);
  floorDisc.rotation.x = -Math.PI / 2;
  floorDisc.position.y = 0.06;
  root.add(floorDisc);

  // 3. Jagged Volcanic Basalt Spires ringing the inner perimeter
  const spireMat = new THREE.MeshStandardMaterial({
    color: 0x1c1412,
    emissive: 0xd93800,
    emissiveIntensity: 0.42,
    roughness: 0.85,
    metalness: 0.1
  });
  const spireCount = 14;
  for (let i = 0; i < spireCount; i++) {
    const angle = (i / spireCount) * Math.PI * 2 + (i % 2) * 0.12;
    const h = 3.2 + (i % 3) * 1.65;
    const rBase = 0.9 + (i % 2) * 0.55;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(rBase, h, 5), spireMat);
    const dist = radius * 0.88;
    spire.position.set(Math.cos(angle) * dist, h * 0.45, Math.sin(angle) * dist);
    spire.rotation.z = (Math.random() - 0.5) * 0.22;
    spire.rotation.x = (Math.random() - 0.5) * 0.22;
    root.add(spire);
  }

  // 4. Rising Volcanic Embers floating upward inside the Center of the Earth
  const emberCount = 180;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberSpeeds = new Float32Array(emberCount);
  const emberColors = new Float32Array(emberCount * 3);
  const cHot = new THREE.Color(0xfacc15);
  const cMagma = new THREE.Color(0xff3b00);
  const tmpC = new THREE.Color();

  for (let i = 0; i < emberCount; i++) {
    const dist = 1.0 + Math.random() * (radius * 0.88);
    const theta = Math.random() * Math.PI * 2;
    emberPositions[i * 3] = Math.cos(theta) * dist;
    emberPositions[i * 3 + 1] = Math.random() * (radius * 0.72);
    emberPositions[i * 3 + 2] = Math.sin(theta) * dist;
    emberSpeeds[i] = 1.6 + Math.random() * 3.4;

    tmpC.copy(cMagma).lerp(cHot, Math.random());
    emberColors[i * 3] = tmpC.r;
    emberColors[i * 3 + 1] = tmpC.g;
    emberColors[i * 3 + 2] = tmpC.b;
  }

  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
  const emberMat = new THREE.PointsMaterial({
    map: getSoftParticleTexture() ?? undefined,
    size: 0.28,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const emberPoints = new THREE.Points(emberGeo, emberMat);
  root.add(emberPoints);

  const maxH = radius * 0.75;
  const update = (dt: number, elapsed: number, ageSec: number, _cameraPos: THREE.Vector3) => {
    domeMat.uniforms.uTime.value = elapsed;
    domeMat.uniforms.uAge.value = ageSec;
    floorMat.uniforms.uTime.value = elapsed;
    floorMat.uniforms.uAge.value = ageSec;

    const appear = THREE.MathUtils.smoothstep(ageSec, 0.0, 0.7);
    emberMat.opacity = appear * 0.9;
    const pos = emberGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < emberCount; i++) {
      const idx = i * 3;
      pos[idx + 1] += emberSpeeds[i] * dt;
      pos[idx] += Math.sin(elapsed * 2.2 + i) * 0.35 * dt;
      pos[idx + 2] += Math.cos(elapsed * 1.9 + i * 1.3) * 0.35 * dt;
      if (pos[idx + 1] > maxH) {
        pos[idx + 1] = 0.2;
      }
    }
    emberGeo.attributes.position.needsUpdate = true;
  };

  return { root, update };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MEGUMI DOMAIN EXPANSION: CHIMERA SHADOW GARDEN (LIQUID SHADOW FLOOD)
// ─────────────────────────────────────────────────────────────────────────────

const CHIMERA_SHADOW_DOME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  varying vec3 vLocalPos;

  ${VOLCANIC_NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vLocalPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Churning liquid ink currents swirling along the shadow shell
    float n1 = fbm(dir * 4.8 + vec3(uTime * 0.16, -uTime * 0.25, uTime * 0.12));
    float n2 = fbm(dir * 9.5 - vec3(uTime * 0.22, uTime * 0.18, -uTime * 0.14));
    float ripples = pow(1.0 - abs(n1 * 2.0 - 1.0), 3.6);

    vec3 abyss = vec3(0.015, 0.018, 0.045);
    vec3 indigo = vec3(0.18, 0.16, 0.58);
    vec3 spectral = vec3(0.38, 0.62, 0.96);

    float lowPool = smoothstep(0.65, 0.15, h);
    vec3 col = mix(abyss, indigo * 0.45, lowPool * (0.4 + n2 * 0.6));
    col += mix(indigo, spectral, ripples) * ripples * 0.95;

    float appear = smoothstep(0.0, 0.7, uAge);
    gl_FragColor = vec4(col, 0.88 * appear);
  }
`;

export function createChimeraShadowDomainVfx(
  center: THREE.Vector3,
  radius: number
): UnlimitedVoidDomainController {
  const root = new THREE.Group();
  root.position.copy(center);

  // 1. Liquid Shadow Enclosing Dome
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: CHIMERA_SHADOW_DOME_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 28), domeMat);
  root.add(domeMesh);

  // 2. Flooded Liquid Shadow Floor Pool
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAge;
      varying vec2 vUv;
      ${VOLCANIC_NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float n = fbm(vec3(p * 6.5, uTime * 0.35));
        float rings = sin(r * 22.0 - uTime * 3.8 + n * 5.0) * 0.5 + 0.5;
        vec3 ink = vec3(0.02, 0.025, 0.07);
        vec3 sheen = vec3(0.28, 0.34, 0.88);
        vec3 col = mix(ink, sheen, pow(rings, 4.0) * 0.55 + smoothstep(0.75, 1.0, r) * 0.5);
        float alpha = smoothstep(0.0, 0.55, uAge) * 0.92;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const floorPool = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.99, 52), floorMat);
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.y = 0.07;
  root.add(floorPool);

  // 3. Skeletal Shadow Spine Arches rising around the Chimera Garden perimeter
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0x161726,
    emissive: 0x312e81,
    emissiveIntensity: 0.45,
    roughness: 0.72
  });
  const ribCount = 12;
  for (let i = 0; i < ribCount; i++) {
    const angle = (i / ribCount) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.22, 8, 18, Math.PI * 0.72), boneMat);
    const dist = radius * 0.86;
    rib.position.set(Math.cos(angle) * dist, 0.6, Math.sin(angle) * dist);
    rib.rotation.y = -angle + Math.PI * 0.5;
    rib.rotation.z = -0.25;
    root.add(rib);
  }

  // 4. Rising Ink & Spectral Shadow Droplets
  const dropCount = 160;
  const dropPositions = new Float32Array(dropCount * 3);
  const dropSpeeds = new Float32Array(dropCount);
  const dropColors = new Float32Array(dropCount * 3);
  const cDark = new THREE.Color(0x4338ca);
  const cGlow = new THREE.Color(0x7dd3fc);
  const tmpC = new THREE.Color();

  for (let i = 0; i < dropCount; i++) {
    const d = 1.0 + Math.random() * (radius * 0.9);
    const th = Math.random() * Math.PI * 2;
    dropPositions[i * 3] = Math.cos(th) * d;
    dropPositions[i * 3 + 1] = Math.random() * (radius * 0.65);
    dropPositions[i * 3 + 2] = Math.sin(th) * d;
    dropSpeeds[i] = 1.2 + Math.random() * 2.4;

    tmpC.copy(cDark).lerp(cGlow, Math.random() * 0.6);
    dropColors[i * 3] = tmpC.r;
    dropColors[i * 3 + 1] = tmpC.g;
    dropColors[i * 3 + 2] = tmpC.b;
  }

  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPositions, 3));
  dropGeo.setAttribute('color', new THREE.BufferAttribute(dropColors, 3));
  const dropMat = new THREE.PointsMaterial({
    map: getSoftParticleTexture() ?? undefined,
    size: 0.26,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const dropPoints = new THREE.Points(dropGeo, dropMat);
  root.add(dropPoints);

  const maxH = radius * 0.68;
  const update = (dt: number, elapsed: number, ageSec: number, _cameraPos: THREE.Vector3) => {
    domeMat.uniforms.uTime.value = elapsed;
    domeMat.uniforms.uAge.value = ageSec;
    floorMat.uniforms.uTime.value = elapsed;
    floorMat.uniforms.uAge.value = ageSec;

    const appear = THREE.MathUtils.smoothstep(ageSec, 0.0, 0.65);
    dropMat.opacity = appear * 0.85;
    const pos = dropGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < dropCount; i++) {
      const idx = i * 3;
      pos[idx + 1] += dropSpeeds[i] * dt;
      pos[idx] += Math.sin(elapsed * 1.8 + i) * 0.25 * dt;
      pos[idx + 2] += Math.cos(elapsed * 1.6 + i * 1.1) * 0.25 * dt;
      if (pos[idx + 1] > maxH) {
        pos[idx + 1] = 0.15;
      }
    }
    dropGeo.attributes.position.needsUpdate = true;
  };

  return { root, update };
}

// ─────────────────────────────────────────────────────────────────────────────
//  URO TAKAKO — SKY MANIPULATION: SKY VEIL CURTAIN, THIN ICE BREAKER & DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warped sky-cloth ShaderMaterial for Uro Takako's Sky Veil Deflect (Hold Right Click).
 * Bends space like translucent grabbed fabric with iridescent cerulean-pearl refraction.
 */
export function createSkyVeilDistortionMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uDeployRatio: { value: 0.0 },
      uPoolRatio: { value: 1.0 }
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uDeployRatio;
      varying vec2 vUv;
      varying float vRipple;
      void main() {
        vUv = uv;
        vec3 pos = position;
        vec2 p = uv * 2.0 - 1.0;
        float dist = length(p);
        // Grabbed-cloth pinch & flowing silk-like sky folds
        float fold = sin(p.x * 5.2 + uTime * 3.6) * cos(p.y * 4.4 - uTime * 2.9) * 0.11;
        float pinch = exp(-dist * dist * 3.2) * (0.24 + 0.05 * sin(uTime * 5.0));
        float wave = sin(dist * 10.5 - uTime * 5.4) * 0.04 * (1.0 - smoothstep(0.4, 1.0, dist));
        pos.z += (fold + pinch + wave) * max(0.25, uDeployRatio);
        vRipple = fold * 4.0 + wave * 6.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uDeployRatio;
      uniform float uPoolRatio;
      varying vec2 vUv;
      varying float vRipple;
      ${VOLCANIC_NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float edgeMask = 1.0 - smoothstep(0.68, 1.02, r);
        if (edgeMask <= 0.01) discard;

        // Swirled sky-fabric distortion lines
        float angle = atan(p.y, p.x);
        float twist = fbm(vec3(p * 3.2 + vec2(cos(angle + uTime * 0.7), sin(angle - uTime * 0.6)) * 0.35, uTime * 0.4));
        float silkLines = pow(abs(sin((p.x * 4.0 + p.y * 3.0 + twist * 4.5) * 2.2 - uTime * 2.4)), 6.0);
        float rim = smoothstep(0.52, 0.94, r) * edgeMask;

        vec3 skyCyan = vec3(0.32, 0.84, 0.98);
        vec3 lowTint = vec3(0.95, 0.42, 0.58);
        vec3 baseSky = mix(lowTint, skyCyan, clamp(uPoolRatio * 1.35, 0.0, 1.0));
        vec3 cloudPearl = vec3(0.92, 0.98, 1.0);
        vec3 prismPink = vec3(0.76, 0.86, 1.0);

        vec3 col = mix(baseSky, cloudPearl, clamp(twist * 0.7 + vRipple * 0.35, 0.0, 1.0));
        col += cloudPearl * silkLines * 0.65;
        col += prismPink * rim * 0.85;

        float alpha = (0.14 + silkLines * 0.28 + rim * 0.42 + smoothstep(0.3, 0.0, r) * 0.14) * edgeMask * uOpacity * uDeployRatio;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.78));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

export interface ThinIceShatterController {
  group: THREE.Group;
  update: (dt: number, progress: number) => void;
}

/**
 * Uro Takako's signature "Thin Ice Breaker" crystalline spatial fracture VFX:
 * renders a shattering glass-pane crack plane in mid-air + exploding refractive sky shards.
 */
export function createThinIceShatterEffect(
  pos: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number
): ThinIceShatterController {
  const group = new THREE.Group();
  group.position.copy(pos);

  const forward = normal.clone().normalize();
  if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
  group.quaternion.copy(quat);

  // 1. Fractured Thin-Ice Crack Disc Shader
  const crackMat = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;

        float ang = atan(p.y, p.x);
        // Sharp radial spiderweb fracture lines + concentric ice cracks
        float spokes = abs(sin(ang * 7.0 + sin(r * 11.0) * 0.55));
        float crackRadial = smoothstep(0.08, 0.0, spokes) * (1.0 - smoothstep(0.65, 1.0, r));
        float rings = abs(sin(r * 15.0 + sin(ang * 5.0) * 0.65));
        float crackRing = smoothstep(0.11, 0.0, rings) * (1.0 - smoothstep(0.72, 1.0, r));
        float flash = exp(-r * 3.2) * (1.0 - uProgress);
        float shockRim = smoothstep(0.14, 0.0, abs(r - (0.25 + uProgress * 0.72)));

        float cracks = clamp(crackRadial + crackRing * 0.85, 0.0, 1.0);
        vec3 col = mix(vec3(0.42, 0.90, 1.0), vec3(1.0, 1.0, 1.0), clamp(cracks + flash + shockRim * 0.7, 0.0, 1.0));
        float fade = 1.0 - smoothstep(0.35, 1.0, uProgress);
        float alpha = (cracks * 0.95 + flash * 0.75 + shockRim * 0.85 + 0.12 * (1.0 - r)) * fade;
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const crackDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.78, 40), crackMat);
  group.add(crackDisc);

  // 2. Angular Crystalline Sky-Glass Shards bursting outward along fracture normal
  const shardGeo = new THREE.OctahedronGeometry(0.28, 0);
  shardGeo.scale(1.4, 0.42, 0.16);
  const shardMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const shards: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; rotVel: THREE.Vector3 }> = [];
  const shardCount = 16;
  for (let i = 0; i < shardCount; i++) {
    const m = new THREE.Mesh(shardGeo, shardMat);
    const a = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const radial = 0.25 + Math.random() * (radius * 0.35);
    m.position.set(Math.cos(a) * radial, Math.sin(a) * radial, (Math.random() - 0.5) * 0.25);
    const sc = 0.65 + Math.random() * (radius * 0.22);
    m.scale.set(sc, sc * (0.7 + Math.random() * 0.7), sc);
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, a);
    group.add(m);
    shards.push({
      mesh: m,
      vel: new THREE.Vector3(
        Math.cos(a) * (4.5 + Math.random() * 6.5),
        Math.sin(a) * (4.5 + Math.random() * 6.5),
        3.5 + Math.random() * 8.5
      ),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9
      )
    });
  }

  const update = (dt: number, progress: number) => {
    crackMat.uniforms.uProgress.value = progress;
    crackDisc.scale.setScalar(0.55 + progress * 0.85);
    shardMat.opacity = Math.max(0, (1.0 - progress) * 0.92);
    for (const s of shards) {
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      s.mesh.rotation.x += s.rotVel.x * dt;
      s.mesh.rotation.y += s.rotVel.y * dt;
      s.mesh.rotation.z += s.rotVel.z * dt;
    }
  };

  return { group, update };
}

const SKY_VEIL_DOMAIN_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  varying vec3 vLocalPos;

  ${VOLCANIC_NOISE_GLSL}

  void main() {
    vec3 dir = normalize(vLocalPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // Inverted liquid-sky canopy with flowing cirrus ribbons and glass-prism fractures
    float n1 = fbm(dir * 3.6 + vec3(uTime * 0.14, uTime * 0.08, -uTime * 0.12));
    float n2 = fbm(dir * 7.8 - vec3(uTime * 0.18, -uTime * 0.14, uTime * 0.1));
    float glassLine = pow(1.0 - abs(n2 * 2.0 - 1.0), 4.5);

    vec3 deepCerulean = vec3(0.05, 0.24, 0.48);
    vec3 brightSky = vec3(0.32, 0.78, 0.96);
    vec3 cloudWhite = vec3(0.92, 0.98, 1.0);

    vec3 col = mix(deepCerulean, brightSky, smoothstep(0.12, 0.82, h));
    col = mix(col, cloudWhite, smoothstep(0.45, 0.82, n1) * 0.65);
    col += vec3(0.75, 0.95, 1.0) * glassLine * 0.85;

    float appear = smoothstep(0.0, 0.7, uAge);
    gl_FragColor = vec4(col, 0.82 * appear);
  }
`;

/**
 * Uro Takako's Domain Expansion: Sky Veil Horizon
 * Luminous inverted-sky mirror dome + cloud-mirror floor + orbiting fractured sky-glass panes.
 */
export function createSkyVeilDomainVfx(
  center: THREE.Vector3,
  radius: number
): UnlimitedVoidDomainController {
  const root = new THREE.Group();
  root.position.copy(center);

  // 1. Inverted-Sky Crystal Dome
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      void main() {
        vLocalPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: SKY_VEIL_DOMAIN_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 42, 30), domeMat);
  root.add(domeMesh);

  // 2. Mirrored Sky-Glass Floor Overlay (grounded cleanly at center.y + 0.06)
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAge: { value: 0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uAge;
      varying vec2 vUv;
      ${VOLCANIC_NOISE_GLSL}
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float n = fbm(vec3(p * 5.2, uTime * 0.28));
        float ripples = sin(r * 20.0 - uTime * 3.2 + n * 4.5) * 0.5 + 0.5;
        float cracks = pow(1.0 - abs(n * 2.0 - 1.0), 5.0);
        vec3 mirrorBlue = vec3(0.14, 0.52, 0.78);
        vec3 cloudSheen = vec3(0.84, 0.97, 1.0);
        vec3 col = mix(mirrorBlue, cloudSheen, pow(ripples, 3.0) * 0.45 + cracks * 0.65 + smoothstep(0.75, 1.0, r) * 0.55);
        float alpha = smoothstep(0.0, 0.55, uAge) * 0.78;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const floorMirror = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.99, 52), floorMat);
  floorMirror.rotation.x = -Math.PI / 2;
  floorMirror.position.y = 0.06;
  root.add(floorMirror);

  // 3. Orbiting Fractured Sky-Glass Panes inside the Perimeter
  const paneGroup = new THREE.Group();
  const paneMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const paneEdgeMat = new THREE.MeshBasicMaterial({
    color: 0xf0f9ff,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const dist = radius * (0.76 + (i % 3) * 0.05);
    const h = 2.6 + (i % 4) * 2.4;
    const w = 1.6 + (i % 3) * 0.85;
    const paneGeo = new THREE.PlaneGeometry(w, w * 1.45, 2, 2);
    const pane = new THREE.Mesh(paneGeo, paneMat);
    const edge = new THREE.Mesh(paneGeo, paneEdgeMat);
    pane.add(edge);
    pane.position.set(Math.cos(ang) * dist, h, Math.sin(ang) * dist);
    pane.lookAt(0, h * 0.7, 0);
    pane.rotation.z += (i % 2 === 0 ? 1 : -1) * 0.28;
    paneGroup.add(pane);
  }
  root.add(paneGroup);

  // 4. Drifting Sky-Glass Motes
  const moteCount = 170;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSpeeds = new Float32Array(moteCount);
  const moteColors = new Float32Array(moteCount * 3);
  const cSky = new THREE.Color(0x67e8f9);
  const cWhite = new THREE.Color(0xf8fafc);
  const tmpC = new THREE.Color();

  for (let i = 0; i < moteCount; i++) {
    const d = 1.2 + Math.random() * (radius * 0.9);
    const th = Math.random() * Math.PI * 2;
    motePositions[i * 3] = Math.cos(th) * d;
    motePositions[i * 3 + 1] = Math.random() * (radius * 0.72);
    motePositions[i * 3 + 2] = Math.sin(th) * d;
    moteSpeeds[i] = 1.1 + Math.random() * 2.2;
    tmpC.copy(cSky).lerp(cWhite, Math.random() * 0.65);
    moteColors[i * 3] = tmpC.r;
    moteColors[i * 3 + 1] = tmpC.g;
    moteColors[i * 3 + 2] = tmpC.b;
  }

  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  moteGeo.setAttribute('color', new THREE.BufferAttribute(moteColors, 3));
  const moteMat = new THREE.PointsMaterial({
    map: getSoftParticleTexture() ?? undefined,
    size: 0.28,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const motePoints = new THREE.Points(moteGeo, moteMat);
  root.add(motePoints);

  const maxH = radius * 0.75;
  const update = (dt: number, elapsed: number, ageSec: number, _cameraPos: THREE.Vector3) => {
    domeMat.uniforms.uTime.value = elapsed;
    domeMat.uniforms.uAge.value = ageSec;
    floorMat.uniforms.uTime.value = elapsed;
    floorMat.uniforms.uAge.value = ageSec;

    const appear = THREE.MathUtils.smoothstep(ageSec, 0.0, 0.65);
    moteMat.opacity = appear * 0.85;
    paneMat.opacity = appear * 0.34;
    paneEdgeMat.opacity = appear * 0.55;
    paneGroup.rotation.y += dt * 0.14;

    const pos = moteGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < moteCount; i++) {
      const idx = i * 3;
      pos[idx + 1] += moteSpeeds[i] * dt;
      pos[idx] += Math.sin(elapsed * 1.5 + i) * 0.3 * dt;
      pos[idx + 2] += Math.cos(elapsed * 1.3 + i * 1.2) * 0.3 * dt;
      if (pos[idx + 1] > maxH) {
        pos[idx + 1] = 0.2;
      }
    }
    moteGeo.attributes.position.needsUpdate = true;
  };

  return { root, update };
}

export interface RealityWarpBeamController {
  group: THREE.Group;
  update: (dt: number, progress: number) => void;
}

/**
 * Uro Takako's grounded Thin Ice Breaker: cracks reality at origin and fires a pure
 * reality-warping refraction beam outwards that bends the view of whatever is behind it.
 */
export function createRealityWarpBeamEffect(
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  radius = 0.65
): RealityWarpBeamController {
  const group = new THREE.Group();
  const delta = endPos.clone().sub(startPos);
  const length = Math.max(0.5, delta.length());
  const mid = startPos.clone().addScaledVector(delta, 0.5);
  const dir = delta.clone().normalize();

  group.position.copy(mid);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.quaternion.copy(quat);

  const warpNormalMap = getRealityWipeNormalMap().clone();
  warpNormalMap.repeat.set(2.5, Math.max(2.0, length * 0.45));
  warpNormalMap.needsUpdate = true;

  // 1. Pure transmissive spatial-refraction cylinder: warps the view of the arena behind the beam!
  const beamGeo = new THREE.CylinderGeometry(radius, radius * 0.9, length, 24, 1, true);
  beamGeo.computeTangents();
  const beamMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 1.0,
    ior: 1.5,
    thickness: 2.2,
    roughness: 0.0,
    metalness: 0.0,
    reflectivity: 0.12,
    envMapIntensity: 0.18,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 100.0,
    normalMap: warpNormalMap,
    normalScale: new THREE.Vector2(1.3, 1.3),
    transparent: false,
    side: THREE.DoubleSide
  });

  const outerBeam = new THREE.Mesh(beamGeo, beamMat);
  group.add(outerBeam);

  // 2. Subtle hairline spatial-crack rings traveling along the beam
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const rings: THREE.Mesh[] = [];
  const ringCount = Math.max(4, Math.min(8, Math.floor(length / 3.8)));
  const ringGeo = new THREE.RingGeometry(radius * 0.92, radius * 1.04, 24);
  ringGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < ringCount; i++) {
    const rMesh = new THREE.Mesh(ringGeo, ringMat);
    const frac = (i + 0.5) / ringCount - 0.5;
    rMesh.position.y = frac * length;
    group.add(rMesh);
    rings.push(rMesh);
  }

  const update = (dt: number, progress: number) => {
    warpNormalMap.offset.y -= dt * 3.8;
    warpNormalMap.offset.x += dt * 1.4;
    const taperScale = Math.max(0.02, 1.0 - Math.pow(progress, 1.6));
    outerBeam.scale.set(taperScale, 1.0, taperScale);
    beamMat.transmission = 1.0 - progress * 0.5;
    ringMat.opacity = (1.0 - progress) * 0.32;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      r.position.y += dt * 16.0;
      if (r.position.y > length * 0.5) {
        r.position.y -= length;
      }
      r.scale.setScalar(taperScale * (1.0 + (i % 2) * 0.15));
    }
  };

  return { group, update };
}

export interface DrawnRealityWipeController {
  group: THREE.Group;
  rebuild: (points: THREE.Vector3[], viewForward: THREE.Vector3) => void;
  update: (dt: number, elapsed: number, age: number, maxAge: number) => void;
  dispose: () => void;
}

let cachedRealityWipeNormalMap: THREE.DataTexture | null = null;
function getRealityWipeNormalMap(): THREE.DataTexture {
  if (cachedRealityWipeNormalMap) return cachedRealityWipeNormalMap;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Smooth tileable liquid-mirror spatial lens ripples
      const nx =
        Math.sin(u * 2.0 + v) * 0.45 +
        Math.cos(u - v * 2.0) * 0.35 +
        Math.sin(u * 3.0 - v * 2.0) * 0.2;
      const ny =
        Math.cos(v * 2.0 - u) * 0.45 +
        Math.sin(u * 2.0 + v * 2.0) * 0.35 +
        Math.cos(v * 3.0 + u) * 0.2;
      const nz = Math.sqrt(Math.max(0.15, 1.0 - nx * nx * 0.45 - ny * ny * 0.45));
      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.floor((nx * 0.5 + 0.5) * 255)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.floor((ny * 0.5 + 0.5) * 255)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.floor((nz * 0.5 + 0.5) * 255)));
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 1.4);
  tex.needsUpdate = true;
  cachedRealityWipeNormalMap = tex;
  return tex;
}

/**
 * Uro Takako's Drawn Reality Wipe: a pure view-dependent spatial refraction lens
 * painted directly along the player's cursor drag path that bends and warps the
 * view of whatever is on the other side based on the observer's angle.
 */
export function createDrawnRealityWipe(
  initialPoints: THREE.Vector3[],
  initialViewForward: THREE.Vector3,
  halfWidth = 0.72
): DrawnRealityWipeController {
  const group = new THREE.Group();

  const warpNormalMap = getRealityWipeNormalMap().clone();
  warpNormalMap.needsUpdate = true;

  // Pure view-dependent screen-space refraction lens: 100% clear view of the other side,
  // strongly warped by the 3D curved lens normals and scrolling spatial wave normal map.
  const ribbonMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    transmission: 1.0,
    ior: 1.52,
    thickness: 2.6,
    roughness: 0.0,
    metalness: 0.0,
    reflectivity: 0.14,
    envMapIntensity: 0.2,
    clearcoat: 0.0,
    iridescence: 0.0,
    attenuationColor: new THREE.Color(0xffffff),
    attenuationDistance: 100.0,
    normalMap: warpNormalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide
  });

  // Ultra-faint view-dependent grazing Fresnel contour while active, plus spiderweb
  // thin-ice fracture lines that spread across the lens right before it shatters.
  const sheenMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1.0 },
      uCrackProgress: { value: 0.0 }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFade;
      uniform float uCrackProgress;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      ${VOLCANIC_NOISE_GLSL}
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPos);
        float fresnel = pow(1.0 - abs(dot(N, V)), 4.5);

        float edgeDist = abs(vUv.y * 2.0 - 1.0);
        float borderRim = smoothstep(0.92, 0.995, edgeDist) * (1.0 - smoothstep(0.995, 1.0, edgeDist));
        float tipFade = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));

        // Spiderweb spatial fracture lines when the wipe is about to shatter
        float crackAlpha = 0.0;
        if (uCrackProgress > 0.001) {
          vec3 cp = vec3(vUv.x * 14.0, vUv.y * 6.5, 1.7);
          float n1 = fbm(cp);
          float n2 = fbm(cp * 2.3 + vec3(3.1));
          float line1 = smoothstep(0.065 * uCrackProgress, 0.0, abs(n1 - 0.5));
          float line2 = smoothstep(0.045 * uCrackProgress, 0.0, abs(n2 - 0.5));
          crackAlpha = clamp((line1 + line2 * 0.85) * uCrackProgress, 0.0, 0.95);
        }

        float baseAlpha = (borderRim * 0.18 + fresnel * 0.12) * tipFade * uFade;
        float alpha = clamp(baseAlpha + crackAlpha * tipFade, 0.0, 0.95);
        if (alpha <= 0.005) discard;

        vec3 col = mix(vec3(0.94, 0.98, 1.0), vec3(1.0, 1.0, 1.0), crackAlpha);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const geo = new THREE.BufferGeometry();
  const ribbonMesh = new THREE.Mesh(geo, ribbonMat);
  ribbonMesh.frustumCulled = false;
  const sheenMesh = new THREE.Mesh(geo, sheenMat);
  sheenMesh.frustumCulled = false;
  group.add(ribbonMesh, sheenMesh);

  // Shatter shard burst spawned in-place along the ribbon curve during the final 0.45s
  const shardGeo = new THREE.OctahedronGeometry(0.18, 0);
  shardGeo.scale(1.45, 0.52, 0.14);
  shardGeo.computeTangents();
  const shardGroup = new THREE.Group();
  shardGroup.visible = false;
  group.add(shardGroup);

  interface WipeShatterShard {
    mesh: THREE.Mesh;
    origin: THREE.Vector3;
    vel: THREE.Vector3;
    rotOrigin: THREE.Euler;
    rotVel: THREE.Vector3;
    baseScale: number;
  }
  const shards: WipeShatterShard[] = [];
  const shardCount = 22;
  for (let i = 0; i < shardCount; i++) {
    const m = new THREE.Mesh(shardGeo, ribbonMat);
    m.frustumCulled = false;
    shardGroup.add(m);
    shards.push({
      mesh: m,
      origin: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rotOrigin: new THREE.Euler(),
      rotVel: new THREE.Vector3(),
      baseScale: 1.0
    });
  }

  let latestCurvePts: THREE.Vector3[] = [];
  let latestViewFwd = initialViewForward.clone().normalize();
  let shatterTriggered = false;

  const triggerShatter = () => {
    shatterTriggered = true;
    ribbonMesh.visible = false;
    sheenMesh.visible = false;
    shardGroup.visible = true;

    const pts = latestCurvePts.length > 0 ? latestCurvePts : [new THREE.Vector3()];
    const right = new THREE.Vector3().crossVectors(latestViewFwd, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < shards.length; i++) {
      const s = shards[i];
      const u = (i + 0.5) / shards.length;
      const ptIdx = Math.min(pts.length - 1, Math.floor(u * pts.length));
      const basePt = pts[ptIdx];
      const lat = ((i % 5) / 2 - 1) * halfWidth * 0.78;
      const depthJitter = (((i * 7) % 5) / 2 - 1) * 0.08;

      s.origin
        .copy(basePt)
        .addScaledVector(up, lat)
        .addScaledVector(latestViewFwd, depthJitter);
      s.mesh.position.copy(s.origin);

      // Burst outward in place from the ribbon plane + fall with gravity
      const outSign = i % 2 === 0 ? 1 : -1;
      s.vel
        .copy(up)
        .multiplyScalar(lat * 3.4 + (Math.sin(i * 4.1) * 1.4))
        .addScaledVector(right, Math.cos(i * 2.7) * 2.2)
        .addScaledVector(latestViewFwd, outSign * (1.2 + (i % 3) * 0.7));

      s.rotOrigin.set(i * 1.1, i * 1.7, i * 0.8);
      s.mesh.rotation.copy(s.rotOrigin);
      s.rotVel.set(
        (i % 2 === 0 ? 1 : -1) * (5.5 + (i % 4) * 1.8),
        (i % 3 === 0 ? 1 : -1) * (6.2 + (i % 3) * 2.1),
        (i % 2 === 1 ? 1 : -1) * (4.8 + (i % 5) * 1.5)
      );
      s.baseScale = 0.75 + (i % 4) * 0.24;
      s.mesh.scale.setScalar(s.baseScale);
    }
  };

  const rebuild = (rawPts: THREE.Vector3[], viewForward: THREE.Vector3) => {
    if (rawPts.length === 0) return;

    // Resample / smooth stroke via CatmullRomCurve3 (or synthesize short stroke if 1 point)
    let samplePts: THREE.Vector3[];
    if (rawPts.length === 1) {
      const right = new THREE.Vector3().crossVectors(viewForward, new THREE.Vector3(0, 1, 0));
      if (right.lengthSq() < 0.001) right.set(1, 0, 0);
      right.normalize();
      samplePts = [
        rawPts[0].clone().addScaledVector(right, -0.35),
        rawPts[0].clone(),
        rawPts[0].clone().addScaledVector(right, 0.35)
      ];
    } else if (rawPts.length === 2) {
      const mid = rawPts[0].clone().lerp(rawPts[1], 0.5);
      samplePts = [rawPts[0].clone(), mid, rawPts[1].clone()];
    } else {
      samplePts = rawPts;
    }

    const curve = new THREE.CatmullRomCurve3(samplePts, false, 'catmullrom', 0.35);
    const segs = Math.max(18, Math.min(48, samplePts.length * 5));
    const curvePts = curve.getPoints(segs);
    latestCurvePts = curvePts;
    latestViewFwd.copy(viewForward).normalize();
    if (latestViewFwd.lengthSq() < 0.001) latestViewFwd.set(0, 0, -1);

    // 5 vertices across width so the cross-section curves like a 3D convex spatial lens
    const crossCols = 5;
    const vertCount = (segs + 1) * crossCols;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const indices: number[] = [];

    const fwd = viewForward.clone().normalize();
    if (fwd.lengthSq() < 0.001) fwd.set(0, 0, -1);
    const tangent = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const normalVec = new THREE.Vector3();

    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const p = curvePts[i];
      if (i < segs) {
        tangent.copy(curvePts[i + 1]).sub(p);
      } else {
        tangent.copy(p).sub(curvePts[i - 1]);
      }
      if (tangent.lengthSq() < 0.00001) tangent.set(1, 0, 0);
      tangent.normalize();

      // Cross tangent with viewForward so the lens ribbon always faces the viewer cleanly
      binormal.crossVectors(tangent, fwd);
      if (binormal.lengthSq() < 0.0001) {
        binormal.crossVectors(tangent, new THREE.Vector3(0, 1, 0));
      }
      if (binormal.lengthSq() < 0.0001) {
        binormal.set(0, 1, 0);
      }
      binormal.normalize();

      // Taper smoothly to sleek pointed/rounded tips at both ends of the wipe
      const tipPinch = Math.sin(u * Math.PI);
      const taper = Math.pow(tipPinch, 0.55);
      const w = Math.max(0.015, halfWidth * taper);
      const bulgeDepth = 0.22 * taper;

      for (let j = 0; j < crossCols; j++) {
        const vRatio = j / (crossCols - 1); // 0..1
        const s = vRatio * 2.0 - 1.0; // -1..1 across width
        const arch = Math.cos(s * Math.PI * 0.5); // 1 at spine, 0 at edges

        const vIdx = i * crossCols + j;
        positions[vIdx * 3] = p.x + binormal.x * (s * w) - fwd.x * (arch * bulgeDepth);
        positions[vIdx * 3 + 1] = p.y + binormal.y * (s * w) - fwd.y * (arch * bulgeDepth);
        positions[vIdx * 3 + 2] = p.z + binormal.z * (s * w) - fwd.z * (arch * bulgeDepth);

        // Curved lens normal fan across the cross-section for strong refraction bending
        normalVec
          .copy(fwd)
          .multiplyScalar(-Math.cos(s * 0.85))
          .addScaledVector(binormal, Math.sin(s * 0.85))
          .normalize();
        normals[vIdx * 3] = normalVec.x;
        normals[vIdx * 3 + 1] = normalVec.y;
        normals[vIdx * 3 + 2] = normalVec.z;

        uvs[vIdx * 2] = u;
        uvs[vIdx * 2 + 1] = vRatio;
      }

      if (i < segs) {
        for (let j = 0; j < crossCols - 1; j++) {
          const a = i * crossCols + j;
          const b = i * crossCols + (j + 1);
          const c = (i + 1) * crossCols + j;
          const d = (i + 1) * crossCols + (j + 1);
          indices.push(a, b, c, b, d, c);
        }
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeTangents();
    geo.computeBoundingSphere();
  };

  rebuild(initialPoints, initialViewForward);

  const update = (dt: number, elapsed: number, age: number, maxAge: number) => {
    warpNormalMap.offset.set(elapsed * 0.28, -elapsed * 0.16);
    sheenMat.uniforms.uTime.value = elapsed;
    const remaining = Math.max(0, maxAge - age);

    // Phase 1 (0.42s .. 0.78s remaining): hairline thin-ice cracks spread across the stationary wipe
    if (remaining <= 0.78 && remaining > 0.42) {
      const crackT = 1.0 - (remaining - 0.42) / 0.36;
      sheenMat.uniforms.uCrackProgress.value = crackT;
    } else if (remaining > 0.78) {
      sheenMat.uniforms.uCrackProgress.value = 0.0;
    }

    // Phase 2 (final 0.42s): wipe shatters in-place into tumbling refractive glass shards!
    if (remaining <= 0.42) {
      if (!shatterTriggered) {
        triggerShatter();
      }
      const shatterProgress = 1.0 - remaining / 0.42; // 0..1
      const shrink = Math.max(0.01, 1.0 - Math.pow(shatterProgress, 1.35));
      for (const s of shards) {
        s.vel.y -= 9.5 * dt; // Gravity pull on glass shards
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.rotation.x += s.rotVel.x * dt;
        s.mesh.rotation.y += s.rotVel.y * dt;
        s.mesh.rotation.z += s.rotVel.z * dt;
        s.mesh.scale.setScalar(s.baseScale * shrink);
      }
    }
  };

  const dispose = () => {
    geo.dispose();
    shardGeo.dispose();
    warpNormalMap.dispose();
    ribbonMat.dispose();
    sheenMat.dispose();
  };

  return { group, rebuild, update, dispose };
}

let cachedShadowCloudTex: THREE.CanvasTexture | null = null;

function getShikigamiCloudTexture(): THREE.CanvasTexture {
  if (cachedShadowCloudTex) return cachedShadowCloudTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // Layered soft billowy lobes for a thick, organic Ten Shadows smoke puff
    const lobes = [
      { x: 64, y: 64, r: 54, a: 0.92 },
      { x: 46, y: 54, r: 36, a: 0.72 },
      { x: 82, y: 56, r: 34, a: 0.7 },
      { x: 56, y: 80, r: 35, a: 0.68 },
      { x: 76, y: 76, r: 30, a: 0.65 }
    ];
    for (const l of lobes) {
      const grad = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, l.r);
      grad.addColorStop(0.0, `rgba(255, 255, 255, ${l.a})`);
      grad.addColorStop(0.45, `rgba(235, 215, 255, ${l.a * 0.65})`);
      grad.addColorStop(0.8, `rgba(180, 140, 230, ${l.a * 0.22})`);
      grad.addColorStop(1.0, 'rgba(120, 80, 180, 0.0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  cachedShadowCloudTex = tex;
  return tex;
}

/**
 * Billowing dark purple Ten Shadows smoke cloud played when Nue or any of Megumi's
 * Shikigamis are destroyed or expire, expanding and fading away into shadow mist.
 */
export function createShikigamiShadowCloud(radius = 1.6): {
  group: THREE.Group;
  update: (dt: number, progress: number) => void;
} {
  const group = new THREE.Group();
  const cloudTex = getShikigamiCloudTexture();

  const darkPalette = [0x12051f, 0x1e0936, 0x2b0d4e, 0x3b126b, 0x4c1d95];
  const puffCount = Math.min(30, Math.max(14, Math.round(14 + radius * 7)));

  interface CloudPuff {
    sprite: THREE.Sprite;
    mat: THREE.SpriteMaterial;
    vel: THREE.Vector3;
    baseScale: number;
    targetScale: number;
    baseOpacity: number;
    rotSpeed: number;
  }

  const puffs: CloudPuff[] = [];

  for (let i = 0; i < puffCount; i++) {
    const isInnerWisp = i >= puffCount - 6;
    const colorHex = isInnerWisp
      ? 0x6d28d9
      : darkPalette[Math.floor(Math.random() * darkPalette.length)];
    const baseOpacity = isInnerWisp ? 0.42 + Math.random() * 0.16 : 0.78 + Math.random() * 0.18;

    const mat = new THREE.SpriteMaterial({
      map: cloudTex,
      color: colorHex,
      transparent: true,
      opacity: baseOpacity,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    mat.rotation = Math.random() * Math.PI * 2;

    const sprite = new THREE.Sprite(mat);
    // Distribute puffs throughout the Shikigami's silhouette volume
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const rOff = Math.pow(Math.random(), 0.65) * radius * 0.72;
    sprite.position.set(
      Math.sin(phi) * Math.cos(theta) * rOff,
      Math.cos(phi) * rOff * 0.75,
      Math.sin(phi) * Math.sin(theta) * rOff
    );

    const baseScale = radius * (isInnerWisp ? 0.55 + Math.random() * 0.35 : 0.85 + Math.random() * 0.55);
    const targetScale = baseScale * (1.75 + Math.random() * 0.75);
    sprite.scale.set(baseScale, baseScale, 1);

    const outDir = sprite.position.lengthSq() > 0.001
      ? sprite.position.clone().normalize()
      : new THREE.Vector3(Math.random() - 0.5, 0.5, Math.random() - 0.5).normalize();
    const spreadSpeed = radius * (0.55 + Math.random() * 0.75);
    const vel = outDir.multiplyScalar(spreadSpeed);
    vel.y += 0.65 + Math.random() * 1.1; // Gentle upward smoke drift

    group.add(sprite);
    puffs.push({
      sprite,
      mat,
      vel,
      baseScale,
      targetScale,
      baseOpacity,
      rotSpeed: (Math.random() - 0.5) * 1.4
    });
  }

  const update = (dt: number, progress: number) => {
    const easeOut = 1 - Math.pow(1 - progress, 2.2);
    const fade = Math.pow(Math.max(0, 1 - progress), 1.45);
    const drag = Math.pow(0.28, dt);

    for (const p of puffs) {
      p.sprite.position.addScaledVector(p.vel, dt);
      p.vel.x *= drag;
      p.vel.z *= drag;
      p.vel.y = Math.max(0.35, p.vel.y * Math.pow(0.65, dt));
      const s = THREE.MathUtils.lerp(p.baseScale, p.targetScale, easeOut);
      p.sprite.scale.set(s, s, 1);
      p.mat.rotation += p.rotSpeed * dt;
      p.mat.opacity = p.baseOpacity * fade;
    }
  };

  return { group, update };
}


