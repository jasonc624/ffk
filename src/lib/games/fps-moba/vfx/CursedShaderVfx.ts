import * as THREE from 'three';

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
      // Singularity orb (Lapse Blue / Hollow Purple): deep dark gravity well in center + fierce HDR glowing rim & veins
      vec3 voidCenter = uCoreColor * 0.08;
      col = mix(voidCenter, uMidColor * 1.85, smoothstep(0.15, 0.85, fresnel + swirl * 0.45));
      col += uRimColor * (pow(fresnel, 1.45) * 2.6 + veins * 1.45);
    } else {
      // Explosive plasma orb (Reversal Red): blinding HDR hot core + boiling crimson corona
      col = mix(uMidColor * 1.4, uCoreColor * 2.3, pow(ndotv, 1.35) + veins * 0.45);
      col = mix(col, uRimColor * 2.4, fresnel * 0.85 + swirl * 0.35);
    }

    float alpha = clamp(uOpacity * (0.78 + fresnel * 0.35 + veins * 0.25), 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;

const ACCRETION_RING_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uOpacity;
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
    vec3 col = mix(uColorB, uColorA * 1.8, bands);
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
}

export function createCursedEnergyOrb(opts: CursedOrbOptions): CursedOrbController {
  const group = new THREE.Group();
  const r = opts.radius;

  const palette =
    opts.variant === 'RED'
      ? {
          core: new THREE.Color(0xffffff),
          mid: new THREE.Color(0xff1e4d),
          rim: new THREE.Color(0xff8fa3),
          darkCore: 0.0,
          lightHex: 0xff2a55
        }
      : opts.variant === 'BLUE'
        ? {
            core: new THREE.Color(0x020617),
            mid: new THREE.Color(0x0284c7),
            rim: new THREE.Color(0x38bdf8),
            darkCore: 1.0,
            lightHex: 0x38bdf8
          }
        : {
            core: new THREE.Color(0x070112),
            mid: new THREE.Color(0x9333ea),
            rim: new THREE.Color(0xf0abfc),
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
      uOpacity: { value: 0.98 }
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
      uDisplaceAmp: { value: r * 0.22 },
      uCoreColor: { value: palette.mid },
      uMidColor: { value: palette.rim },
      uRimColor: { value: new THREE.Color(0xffffff) },
      uDarkCore: { value: 1.0 },
      uOpacity: { value: 0.52 }
    },
    vertexShader: PLASMA_VERTEX_SHADER,
    fragmentShader: PLASMA_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const coronaMesh = new THREE.Mesh(new THREE.SphereGeometry(r * 1.38, 28, 28), coronaMat);
  group.add(coronaMesh);

  // 3. Swirling Spiral Accretion Discs (2 intersecting planes)
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: palette.rim },
      uColorB: { value: palette.mid },
      uOpacity: { value: 0.85 }
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

  const disc1 = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.4, r * 3.4), ringMat);
  const disc2 = new THREE.Mesh(new THREE.PlaneGeometry(r * 3.1, r * 3.1), ringMat);
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
  const pMat = new THREE.PointsMaterial({
    color: palette.rim,
    size: Math.max(0.08, r * 0.18),
    transparent: true,
    opacity: 0.88,
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
    size: 0.14,
    transparent: true,
    opacity: 0.0,
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


