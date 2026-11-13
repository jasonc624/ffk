import * as THREE from 'three';
import { ThreeAbilityVfx } from './ThreeAbilityVfx';

export interface PlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
  oneWay?: boolean;
}

export interface FighterSyncState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  isUsingCE: boolean;
  isAttacking: boolean;
  hp: number;
}

interface FloatingRubble {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  bobSpeed: number;
  bobOffset: number;
  bobAmp: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxScale: number;
}

const PHASER_W = 1280;
const PHASER_H = 720;
const WORLD_SCALE = 0.02; // 1280px -> 25.6 world units, 720px -> 14.4 world units
const CAMERA_Z = 18;

export class ThreeArenaStage {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Groups
  private platformGroup!: THREE.Group;
  private parallaxGroup!: THREE.Group;
  private domainGroup!: THREE.Group;
  public abilityVfx!: ThreeAbilityVfx;

  // Dynamic elements
  private rubbleList: FloatingRubble[] = [];
  private shockwaves: ShockwaveRing[] = [];
  private fighterLights: Map<string, {
    light: THREE.PointLight;
    auraDisc: THREE.Mesh;
    auraMat: THREE.MeshBasicMaterial;
  }> = new Map();

  // Environment lights & materials
  private ambientLight!: THREE.AmbientLight;
  private moonLight!: THREE.DirectionalLight;
  private rimLight!: THREE.PointLight;
  private skyMat!: THREE.ShaderMaterial;
  private crackMaterials: THREE.MeshBasicMaterial[] = [];
  private domainBarrierMesh!: THREE.Mesh;
  private domainBarrierMat!: THREE.ShaderMaterial;

  // State
  private clock = new THREE.Clock();
  private trauma = 0;
  private domainActive = false;
  private domainTransition = 0; // 0 -> normal stage, 1 -> full domain
  private domainTargetColor = new THREE.Color(0xff2a4a);
  private baseStageColor = new THREE.Color(0x3b82f6);
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  constructor(container: HTMLElement, platforms: PlatformDef[]) {
    this.container = container;
    this.initThree();
    this.buildSkyAndAtmosphere();
    this.buildPlatforms(platforms);
    this.buildShibuyaRuins();
    this.buildDomainBarrier();
    this.setupResizeSync();
  }

  /**
   * Convert Phaser 2D pixel coordinates (1280x720) to Three.js world coordinates on the z=0 plane.
   */
  public phaserToWorld(px: number, py: number, z = 0): THREE.Vector3 {
    const wx = (px - PHASER_W * 0.5) * WORLD_SCALE;
    const wy = (PHASER_H * 0.5 - py) * WORLD_SCALE;
    return new THREE.Vector3(wx, wy, z);
  }

  private initThree() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x070913, 0.022);

    // Exact FOV so that at z = 0 (distance CAMERA_Z = 18), visible height is exactly PHASER_H * WORLD_SCALE (14.4 units)
    const halfH = (PHASER_H * WORLD_SCALE) * 0.5;
    const fovRad = 2 * Math.atan(halfH / CAMERA_Z);
    const fovDeg = THREE.MathUtils.radToDeg(fovRad);

    this.camera = new THREE.PerspectiveCamera(fovDeg, PHASER_W / PHASER_H, 0.1, 200);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);

    // Prefer WebGL2 context explicitly
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext | null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: context ?? undefined,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Position the Three.js canvas directly behind Phaser's canvas
    canvas.className = 'three-arena-canvas';
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    this.container.prepend(canvas);

    this.platformGroup = new THREE.Group();
    this.parallaxGroup = new THREE.Group();
    this.domainGroup = new THREE.Group();

    this.scene.add(this.platformGroup);
    this.scene.add(this.parallaxGroup);
    this.scene.add(this.domainGroup);

    this.abilityVfx = new ThreeAbilityVfx(
      this.scene,
      (px, py, z) => this.phaserToWorld(px, py, z),
      (px, py, dmg, col) => this.triggerHitImpact(px, py, dmg, col)
    );

    // Lighting
    this.ambientLight = new THREE.AmbientLight(0x1e293b, 1.4);
    this.scene.add(this.ambientLight);

    this.moonLight = new THREE.DirectionalLight(0x93c5fd, 1.8);
    this.moonLight.position.set(8, 18, 10);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.moonLight);

    this.rimLight = new THREE.PointLight(0x6366f1, 3.5, 45, 1.5);
    this.rimLight.position.set(0, 4, -12);
    this.scene.add(this.rimLight);
  }

  private buildSkyAndAtmosphere() {
    // Procedural WebGL shader backdrop with cursed energy aurora + Shibuya eclipse moon
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDomainMix: { value: 0 },
        uPrimaryColor: { value: new THREE.Color(0x3b82f6) },
        uDomainColor: { value: new THREE.Color(0xff2a4a) }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uDomainMix;
        uniform vec3 uPrimaryColor;
        uniform vec3 uDomainColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec2 uv = vUv;
          vec3 nightTop = vec3(0.02, 0.03, 0.08);
          vec3 nightHorizon = vec3(0.06, 0.09, 0.18);
          vec3 domTop = uDomainColor * 0.12;
          vec3 domHorizon = uDomainColor * 0.42;

          vec3 topCol = mix(nightTop, domTop, uDomainMix);
          vec3 horCol = mix(nightHorizon, domHorizon, uDomainMix);
          vec3 col = mix(horCol, topCol, smoothstep(0.15, 0.85, uv.y));

          // Swirling cursed mist bands
          float n1 = noise(uv * vec2(6.0, 3.0) + vec2(uTime * 0.08, -uTime * 0.04));
          float n2 = noise(uv * vec2(12.0, 6.0) - vec2(uTime * 0.12, uTime * 0.06));
          float mist = smoothstep(0.35, 0.75, n1 * 0.65 + n2 * 0.35);

          vec3 energyCol = mix(uPrimaryColor, uDomainColor, uDomainMix);
          col += energyCol * mist * (0.14 + uDomainMix * 0.25) * (1.0 - uv.y * 0.6);

          // Cursed Eclipse Moon / Core in upper sky
          vec2 moonCenter = vec2(0.5, 0.72);
          float dist = length((uv - moonCenter) * vec2(1.8, 1.0));
          float halo = exp(-dist * 7.5) * (0.35 + 0.15 * sin(uTime * 1.5));
          float ring = smoothstep(0.16, 0.145, dist) - smoothstep(0.142, 0.12, dist);
          col += energyCol * halo;
          col += mix(vec3(0.8, 0.9, 1.0), uDomainColor, uDomainMix) * ring * 0.9;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthWrite: false,
      side: THREE.BackSide
    });

    const skyGeo = new THREE.PlaneGeometry(140, 80);
    const skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    skyMesh.position.set(0, 4, -45);
    skyMesh.rotation.y = Math.PI; // Face camera since BackSide is used
    this.parallaxGroup.add(skyMesh);
  }

  /**
   * Builds 3D platforms that align 1:1 with Phaser's 2D Arcade Physics static platforms.
   */
  public buildPlatforms(platforms: PlatformDef[]) {
    this.platformGroup.clear();
    this.crackMaterials = [];

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x1e2433,
      roughness: 0.75,
      metalness: 0.25
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.65
    });

    platforms.forEach((p, idx) => {
      const center = this.phaserToWorld(p.x, p.y, 0);
      const w = p.w * WORLD_SCALE;
      const h = p.h * WORLD_SCALE;
      const depth = p.oneWay ? 1.8 : 4.2;

      const platContainer = new THREE.Group();
      platContainer.position.copy(center);

      // Main 3D slab
      const slabGeo = new THREE.BoxGeometry(w, h, depth);
      const slabMesh = new THREE.Mesh(slabGeo, stoneMat);
      slabMesh.receiveShadow = true;
      slabMesh.castShadow = true;
      platContainer.add(slabMesh);

      // Top walking surface bezel so players clearly see the exact collision plane
      const topLipGeo = new THREE.BoxGeometry(w + 0.08, 0.08, depth + 0.12);
      const topLip = new THREE.Mesh(topLipGeo, trimMat);
      topLip.position.y = h * 0.5 - 0.04;
      topLip.receiveShadow = true;
      platContainer.add(topLip);

      // Glowing cursed fissure lines along the front face of each platform
      const crackColor = p.oneWay ? 0x38bdf8 : 0x6366f1;
      const crackMat = new THREE.MeshBasicMaterial({
        color: crackColor,
        transparent: true,
        opacity: 0.85
      });
      this.crackMaterials.push(crackMat);

      const stripGeo = new THREE.BoxGeometry(w * 0.96, 0.035, 0.04);
      const stripMesh = new THREE.Mesh(stripGeo, crackMat);
      stripMesh.position.set(0, h * 0.5 - 0.06, depth * 0.5 + 0.05);
      platContainer.add(stripMesh);

      // Under-structure pillars or floating rune anchors for elevated platforms
      if (p.oneWay) {
        const underGeo = new THREE.ConeGeometry(w * 0.35, h * 1.9, 6);
        const underMesh = new THREE.Mesh(underGeo, stoneMat);
        underMesh.rotation.x = Math.PI;
        underMesh.position.y = -h * 1.1;
        platContainer.add(underMesh);
      } else {
        // Extended deep ground floor receding into the Shibuya crater
        const craterFloorGeo = new THREE.PlaneGeometry(80, 50, 24, 16);
        const posAttr = craterFloorGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const distFromCenter = Math.hypot(vx * 0.5, vy);
          const ridge = Math.sin(distFromCenter * 0.8) * 0.35 + (distFromCenter > 10 ? (distFromCenter - 10) * 0.18 : 0);
          posAttr.setZ(i, ridge);
        }
        craterFloorGeo.computeVertexNormals();
        const craterFloor = new THREE.Mesh(craterFloorGeo, stoneMat);
        craterFloor.rotation.x = -Math.PI / 2;
        craterFloor.position.set(0, h * 0.5 - 0.05, -20);
        craterFloor.receiveShadow = true;
        platContainer.add(craterFloor);
      }

      this.platformGroup.add(platContainer);
    });
  }

  /**
   * Builds 3D Shibuya ruins, broken skyscrapers, a cursed Torii gate, and floating debris in the background.
   */
  private buildShibuyaRuins() {
    const ruinMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.3
    });

    const crimsonWoodMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.6,
      metalness: 0.15,
      emissive: 0x450a0a,
      emissiveIntensity: 0.4
    });

    // 1. Midground Cursed Torii Gate
    const torii = new THREE.Group();
    torii.position.set(0, -1.8, -7.5);

    const pillarGeo = new THREE.CylinderGeometry(0.32, 0.38, 7.5, 12);
    const leftPillar = new THREE.Mesh(pillarGeo, crimsonWoodMat);
    leftPillar.position.set(-3.2, 0, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, crimsonWoodMat);
    rightPillar.position.set(3.2, 0, 0);

    const kasagiGeo = new THREE.BoxGeometry(8.6, 0.45, 0.65);
    const kasagi = new THREE.Mesh(kasagiGeo, crimsonWoodMat);
    kasagi.position.set(0, 3.6, 0);

    const nukiGeo = new THREE.BoxGeometry(7.4, 0.3, 0.45);
    const nuki = new THREE.Mesh(nukiGeo, crimsonWoodMat);
    nuki.position.set(0, 2.4, 0);

    torii.add(leftPillar, rightPillar, kasagi, nuki);
    this.parallaxGroup.add(torii);

    // 2. Broken Shibuya Skyscrapers framing the arena
    const buildingDefs = [
      { x: -16, y: 2, z: -18, w: 4.5, h: 18, d: 4.5, tilt: 0.08, hue: 0x38bdf8 },
      { x: -10.5, y: 0.5, z: -24, w: 5.2, h: 22, d: 5.0, tilt: -0.05, hue: 0x818cf8 },
      { x: -4.5, y: -1, z: -28, w: 4.0, h: 15, d: 4.0, tilt: 0.12, hue: 0x38bdf8 },
      { x: 5.5, y: -0.5, z: -26, w: 4.8, h: 17, d: 4.5, tilt: -0.1, hue: 0xf43f5e },
      { x: 11.5, y: 1.5, z: -22, w: 5.5, h: 24, d: 5.0, tilt: -0.07, hue: 0x6366f1 },
      { x: 17, y: 1.0, z: -16, w: 4.2, h: 16, d: 4.2, tilt: 0.09, hue: 0x38bdf8 }
    ];

    buildingDefs.forEach((b) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, b.y, b.z);
      bGroup.rotation.z = b.tilt;

      const bodyGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const bodyMesh = new THREE.Mesh(bodyGeo, ruinMat);
      bGroup.add(bodyMesh);

      // Glowing neon signage / window strips
      const neonMat = new THREE.MeshBasicMaterial({
        color: b.hue,
        transparent: true,
        opacity: 0.45
      });
      for (let row = -3; row <= 4; row += 2) {
        const winGeo = new THREE.PlaneGeometry(b.w * 0.75, 0.22);
        const winMesh = new THREE.Mesh(winGeo, neonMat);
        winMesh.position.set(0, row * 1.4, b.d * 0.5 + 0.02);
        bGroup.add(winMesh);
      }

      this.parallaxGroup.add(bGroup);
    });

    // 3. Floating Cursed Rubble Boulders
    const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.65,
      metalness: 0.35,
      flatShading: true
    });

    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(rockGeo, rockMat);
      const scale = 0.35 + Math.random() * 1.15;
      mesh.scale.set(scale, scale * (0.6 + Math.random() * 0.8), scale);

      const angle = (i / 28) * Math.PI * 2;
      const radius = 8 + Math.random() * 14;
      const bx = Math.cos(angle) * radius;
      const by = -2 + Math.random() * 11;
      const bz = -4 - Math.random() * 18;

      mesh.position.set(bx, by, bz);
      this.parallaxGroup.add(mesh);

      this.rubbleList.push({
        mesh,
        basePos: new THREE.Vector3(bx, by, bz),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 0.8
        ),
        bobSpeed: 0.8 + Math.random() * 1.5,
        bobOffset: Math.random() * Math.PI * 2,
        bobAmp: 0.25 + Math.random() * 0.45
      });
    }
  }

  /**
   * Builds the 3D Domain Expansion spherical barrier that encloses the arena when triggered.
   */
  private buildDomainBarrier() {
    this.domainBarrierMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xff2a4a) },
        uProgress: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uProgress;
        varying vec3 vNormal;
        varying vec3 vPos;

        void main() {
          // Hexagonal / sacred geometry grid lines inside the barrier dome
          float lat = abs(sin(vPos.y * 2.2 - uTime * 1.5));
          float lon = abs(sin(atan(vPos.z, vPos.x) * 16.0 + uTime * 0.8));
          float grid = smoothstep(0.95, 0.995, max(lat, lon));
          float fresnel = pow(1.0 - abs(vNormal.z), 2.2);

          vec3 col = uColor * (grid * 1.4 + fresnel * 0.65);
          float alpha = (grid * 0.45 + fresnel * 0.25) * uProgress;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const sphereGeo = new THREE.IcosahedronGeometry(22, 3);
    this.domainBarrierMesh = new THREE.Mesh(sphereGeo, this.domainBarrierMat);
    this.domainBarrierMesh.position.set(0, 0, -6);
    this.domainBarrierMesh.visible = false;
    this.domainGroup.add(this.domainBarrierMesh);
  }

  private ensureFighterLight(fighter: FighterSyncState) {
    if (this.fighterLights.has(fighter.id)) {
      return this.fighterLights.get(fighter.id)!;
    }

    const col = new THREE.Color(fighter.color || '#38bdf8');
    const light = new THREE.PointLight(col, 2.0, 10, 1.5);
    this.scene.add(light);

    const auraGeo = new THREE.RingGeometry(0.35, 0.95, 32);
    const auraMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const auraDisc = new THREE.Mesh(auraGeo, auraMat);
    auraDisc.rotation.x = -Math.PI / 2;
    this.scene.add(auraDisc);

    const entry = { light, auraDisc, auraMat };
    this.fighterLights.set(fighter.id, entry);
    return entry;
  }

  /**
   * Spawns a 3D expanding shockwave ring + camera shake when an attack lands.
   */
  public triggerHitImpact(px: number, py: number, damage: number, colorHex = '#38bdf8') {
    const pos = this.phaserToWorld(px, py, 0.3);
    const col = new THREE.Color(colorHex);

    const ringGeo = new THREE.RingGeometry(0.2, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.position.copy(pos);
    // Slight 3D tilt for dynamic perspective
    mesh.rotation.x = (Math.random() - 0.5) * 0.7;
    mesh.rotation.y = (Math.random() - 0.5) * 0.7;
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      material: ringMat,
      age: 0,
      maxAge: 0.38,
      maxScale: 2.5 + Math.min(damage * 0.12, 4.5)
    });

    this.trauma = Math.min(1.0, this.trauma + Math.min(damage * 0.025, 0.65));
  }

  /**
   * Transitions the 3D arena into a Domain Expansion state.
   */
  public activateDomain(visualProfile: any, casterPx: number, casterPy: number) {
    this.domainActive = true;
    const hex =
      visualProfile?.domain?.config?.palette?.primary ||
      visualProfile?.color ||
      '#ff2a4a';
    this.domainTargetColor.set(hex);
    this.domainBarrierMat.uniforms.uColor.value.copy(this.domainTargetColor);
    this.skyMat.uniforms.uDomainColor.value.copy(this.domainTargetColor);

    const origin = this.phaserToWorld(casterPx, casterPy, -4);
    this.domainBarrierMesh.position.set(origin.x * 0.3, origin.y * 0.3, -6);
    this.domainBarrierMesh.scale.setScalar(0.05);
    this.domainBarrierMesh.visible = true;
    this.trauma = 0.75;
  }

  public deactivateDomain() {
    this.domainActive = false;
  }

  /**
   * Called every frame from MainScene.update() to sync 3D lighting, parallax, shockwaves, and render.
   */
  public syncAndRender(fighters: FighterSyncState[]) {
    if (this.destroyed) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    this.skyMat.uniforms.uTime.value = elapsed;
    this.domainBarrierMat.uniforms.uTime.value = elapsed;

    // Update 3D Special Move VFX
    this.abilityVfx.update(dt, elapsed);

    // 1. Smoothly transition Domain Expansion state
    const targetMix = this.domainActive ? 1.0 : 0.0;
    this.domainTransition = THREE.MathUtils.lerp(this.domainTransition, targetMix, dt * 3.2);
    this.skyMat.uniforms.uDomainMix.value = this.domainTransition;
    this.domainBarrierMat.uniforms.uProgress.value = this.domainTransition;

    if (this.domainTransition > 0.01) {
      const s = THREE.MathUtils.lerp(0.05, 1.0, this.domainTransition);
      this.domainBarrierMesh.scale.setScalar(s);
      this.domainBarrierMesh.rotation.y += dt * 0.25;
      this.domainBarrierMesh.rotation.x += dt * 0.1;
    } else if (!this.domainActive) {
      this.domainBarrierMesh.visible = false;
    }

    // 2. Sync fighter 3D PointLights, floor aura rings, and midpoint for parallax
    let sumX = 0;
    let sumY = 0;
    let anyCE = false;

    fighters.forEach((f) => {
      const entry = this.ensureFighterLight(f);
      const wPos = this.phaserToWorld(f.x, f.y, 0.8);
      entry.light.position.copy(wPos);

      const fColor = new THREE.Color(f.color || '#38bdf8');
      entry.light.color.copy(fColor);
      entry.auraMat.color.copy(fColor);

      const targetIntensity = f.isUsingCE ? 7.5 : f.isAttacking ? 4.2 : 1.8;
      entry.light.intensity = THREE.MathUtils.lerp(entry.light.intensity, targetIntensity, dt * 10);

      // Place ground ring at fighter's X on nearest surface below them
      const footWorld = this.phaserToWorld(f.x, f.y + 38, 0.2);
      entry.auraDisc.position.set(footWorld.x, footWorld.y, 0.35);
      const ringScale = f.isUsingCE ? 1.35 + Math.sin(elapsed * 12) * 0.2 : 0.75;
      entry.auraDisc.scale.setScalar(ringScale);
      entry.auraMat.opacity = f.isUsingCE ? 0.65 : 0.22;

      sumX += wPos.x;
      sumY += wPos.y;
      if (f.isUsingCE) anyCE = true;
    });

    // 3. Subtle 2.5D Parallax on background group (while keeping platformGroup locked 1:1 with Phaser physics!)
    if (fighters.length > 0) {
      const midX = sumX / fighters.length;
      const midY = sumY / fighters.length;
      this.parallaxGroup.position.x = THREE.MathUtils.lerp(this.parallaxGroup.position.x, -midX * 0.18, dt * 5);
      this.parallaxGroup.position.y = THREE.MathUtils.lerp(this.parallaxGroup.position.y, -midY * 0.10, dt * 5);
      this.parallaxGroup.rotation.y = THREE.MathUtils.lerp(this.parallaxGroup.rotation.y, midX * 0.012, dt * 5);
    }

    // 4. Camera trauma / impact shake
    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma * 0.35;
      this.camera.position.x = (Math.random() - 0.5) * shake;
      this.camera.position.y = (Math.random() - 0.5) * shake;
      this.trauma = Math.max(0, this.trauma - dt * 2.6);
    } else {
      this.camera.position.set(0, 0, CAMERA_Z);
    }

    // 5. Animate floating rubble (faster & higher levitation during CE charge or Domain Expansion)
    const energyMult = 1 + (anyCE ? 1.2 : 0) + this.domainTransition * 2.0;
    for (const r of this.rubbleList) {
      r.mesh.rotation.x += r.rotSpeed.x * dt * energyMult;
      r.mesh.rotation.y += r.rotSpeed.y * dt * energyMult;
      r.mesh.rotation.z += r.rotSpeed.z * dt * energyMult;
      r.mesh.position.y =
        r.basePos.y +
        Math.sin(elapsed * r.bobSpeed * energyMult + r.bobOffset) * r.bobAmp +
        this.domainTransition * 1.4;
    }

    // 6. Pulse platform fissure cracks
    const crackColor = this.baseStageColor.clone().lerp(this.domainTargetColor, this.domainTransition);
    this.crackMaterials.forEach((mat, idx) => {
      mat.color.copy(crackColor);
      mat.opacity = 0.55 + Math.sin(elapsed * 4 + idx) * 0.3;
    });

    // 7. Update expanding 3D hit shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const t = sw.age / sw.maxAge;
      if (t >= 1) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.material.dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const ease = 1 - Math.pow(1 - t, 3);
        sw.mesh.scale.setScalar(1 + ease * sw.maxScale);
        sw.material.opacity = (1 - t) * 0.9;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Keeps the Three.js canvas identically sized and aligned with Phaser's FIT canvas.
   */
  private setupResizeSync() {
    const syncBounds = () => {
      if (this.destroyed) return;
      // Find Phaser's canvas (the second canvas in container, or querySelectorAll)
      const canvases = this.container.querySelectorAll('canvas');
      const threeCanvas = this.renderer.domElement;
      let phaserCanvas: HTMLCanvasElement | null = null;
      canvases.forEach((c) => {
        if (c !== threeCanvas) phaserCanvas = c;
      });

      if (phaserCanvas) {
        const rect = (phaserCanvas as HTMLCanvasElement).getBoundingClientRect();
        const parentRect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          threeCanvas.style.width = `${rect.width}px`;
          threeCanvas.style.height = `${rect.height}px`;
          threeCanvas.style.left = `${rect.left - parentRect.left}px`;
          threeCanvas.style.top = `${rect.top - parentRect.top}px`;
          this.renderer.setSize(rect.width, rect.height, false);
          return;
        }
      }

      // Fallback before Phaser canvas mounts
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.renderer.setSize(w, h);
    };

    syncBounds();
    this.resizeObserver = new ResizeObserver(() => syncBounds());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', syncBounds);
    // Re-sync shortly after Phaser creates its canvas
    setTimeout(syncBounds, 50);
    setTimeout(syncBounds, 250);
  }

  public destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
