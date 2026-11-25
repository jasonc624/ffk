import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MobaMapId } from '../types';

export interface ColliderBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  walkableTop?: boolean;
}

export class MobaMapBuilder {
  public colliders: ColliderBox[] = [];
  public raycastObstacles: THREE.Object3D[] = [];
  private skyMat!: THREE.ShaderMaterial;

  constructor(public mapId: MobaMapId = 'arena') {}

  public build(scene: THREE.Scene) {
    if (this.mapId === 'orlando') {
      this.buildOrlandoMap(scene);
    } else {
      this.buildArenaMap(scene);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  MAP 1: CYBER SHIBUYA (Default Tactical Cyber Arena)
  // ─────────────────────────────────────────────────────────────
  private applySkyEnvironmentMap(scene: THREE.Scene, isOrlando: boolean) {
    const w = 128;
    const h = 64;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const v = 1.0 - y / (h - 1); // 1 at top (zenith), 0 at bottom (nadir)
      for (let x = 0; x < w; x++) {
        let r: number;
        let g: number;
        let b: number;
        if (v >= 0.45) {
          const t = Math.min(1, (v - 0.45) / 0.55);
          if (isOrlando) {
            r = Math.round(THREE.MathUtils.lerp(248, 38, Math.pow(t, 0.65)));
            g = Math.round(THREE.MathUtils.lerp(225, 130, Math.pow(t, 0.65)));
            b = Math.round(THREE.MathUtils.lerp(195, 242, Math.pow(t, 0.65)));
          } else {
            r = Math.round(THREE.MathUtils.lerp(110, 34, Math.pow(t, 0.6)));
            g = Math.round(THREE.MathUtils.lerp(168, 72, Math.pow(t, 0.6)));
            b = Math.round(THREE.MathUtils.lerp(235, 148, Math.pow(t, 0.6)));
          }
        } else {
          const t = v / 0.45;
          r = Math.round(THREE.MathUtils.lerp(45, 95, t));
          g = Math.round(THREE.MathUtils.lerp(58, 122, t));
          b = Math.round(THREE.MathUtils.lerp(82, 165, t));
        }
        const idx = (y * w + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    const envTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    envTex.needsUpdate = true;
    scene.environment = envTex;
  }

  private buildArenaMap(scene: THREE.Scene) {
    // 1. High-visibility Lighting & Atmospheric Fog
    scene.background = new THREE.Color(0x3a629c);
    scene.fog = new THREE.FogExp2(0x283c66, 0.0028);
    this.applySkyEnvironmentMap(scene, false);

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x475569, 2.6);
    hemiLight.position.set(0, 80, 0);
    scene.add(hemiLight);

    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfffbeb, 3.0);
    sun.position.set(40, 80, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    const d = 80;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    fillLight.position.set(-40, 50, -35);
    scene.add(fillLight);

    // 2. Sky Dome Shader
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDomainColor: { value: new THREE.Color(0x10b981) },
        uDomainMix: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDomainColor;
        uniform float uDomainMix;
        varying vec3 vWorldPos;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 zenith = mix(vec3(0.11, 0.22, 0.46), uDomainColor * 0.25, uDomainMix);
          vec3 horizon = mix(vec3(0.32, 0.52, 0.82), uDomainColor * 0.65, uDomainMix);
          vec3 col = mix(horizon, zenith, pow(h, 0.55));

          vec3 sunDir = normalize(vec3(0.4, 0.75, 0.35));
          float sunDot = max(0.0, dot(dir, sunDir));
          col += vec3(1.0, 0.95, 0.8) * pow(sunDot, 36.0) * 0.7;

          float pulse = sin(dir.x * 18.0 + uTime * 0.5) * sin(dir.z * 18.0 - uTime * 0.4);
          col += mix(vec3(0.25, 0.55, 0.95), uDomainColor, uDomainMix) * smoothstep(0.85, 0.99, pulse) * 0.22 * h;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 20), this.skyMat);
    scene.add(skyDome);

    // 3. Main Arena Floor (84m wide x 156m long)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.1
    });
    const floorGeo = new THREE.BoxGeometry(84, 2, 156);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    this.raycastObstacles.push(floorMesh);

    const gridHelper = new THREE.GridHelper(156, 52, 0x64748b, 0x475569);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // 4. Perimeter Arena Walls
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.55,
      metalness: 0.2
    });
    this.addBoxObstacle(scene, -41, 4, 0, 2, 8, 156, wallMat);
    this.addBoxObstacle(scene, 41, 4, 0, 2, 8, 156, wallMat);
    this.addBoxObstacle(scene, 0, 4, 77, 84, 8, 2, wallMat);
    this.addBoxObstacle(scene, 0, 4, -77, 84, 8, 2, wallMat);

    // 5. Elevated Bridges on Left (x = -24) and Right (x = +24)
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.25
    });
    this.addBoxObstacle(scene, -24, 1.5, 0, 8, 3.0, 44, bridgeMat, true);
    this.addBoxObstacle(scene, 24, 1.5, 0, 8, 3.0, 44, bridgeMat, true);

    for (let step = 1; step <= 6; step++) {
      const h = (step / 6) * 3.0;
      const zOffset = 22 + (7 - step) * 2.2;
      this.addBoxObstacle(scene, -24, h / 2, zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, -24, h / 2, -zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, 24, h / 2, zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, 24, h / 2, -zOffset, 6, h, 2.4, bridgeMat, true);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  MAP 2: ORLANDO (Florida International Drive with WhirlyDome)
  // ─────────────────────────────────────────────────────────────
  private buildOrlandoMap(scene: THREE.Scene) {
    // 1. Warm Tropical Sunshine & Atmospheric Florida Haze
    scene.background = new THREE.Color(0x5694e8);
    scene.fog = new THREE.FogExp2(0xe0f2fe, 0.0022);
    this.applySkyEnvironmentMap(scene, true);

    const hemiLight = new THREE.HemisphereLight(0xfef08a, 0x0284c7, 2.8);
    hemiLight.position.set(0, 80, 0);
    scene.add(hemiLight);

    const ambient = new THREE.AmbientLight(0xfffbeb, 1.6);
    scene.add(ambient);

    // Golden sunshine casting crisp shadows
    const sun = new THREE.DirectionalLight(0xffedd5, 3.5);
    sun.position.set(45, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    const d = 80;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xfde047, 1.5);
    fillLight.position.set(-40, 50, -35);
    scene.add(fillLight);

    // 2. Orlando Sky Dome Shader (Radiant Florida blue with golden horizon)
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDomainColor: { value: new THREE.Color(0xf59e0b) },
        uDomainMix: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDomainColor;
        uniform float uDomainMix;
        varying vec3 vWorldPos;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);

          vec3 zenith = mix(vec3(0.06, 0.45, 0.92), uDomainColor * 0.25, uDomainMix);
          vec3 horizon = mix(vec3(0.98, 0.88, 0.72), uDomainColor * 0.65, uDomainMix);
          vec3 col = mix(horizon, zenith, pow(h, 0.65));

          // Radiant Sun
          vec3 sunDir = normalize(vec3(0.45, 0.75, 0.35));
          float sunDot = max(0.0, dot(dir, sunDir));
          col += vec3(1.0, 0.96, 0.82) * pow(sunDot, 28.0) * 0.95;
          col += vec3(1.0, 0.85, 0.5) * pow(sunDot, 6.0) * 0.25;

          // Gentle tropical cloud shimmer
          float cloud = sin(dir.x * 12.0 + uTime * 0.1) * cos(dir.z * 12.0 - uTime * 0.08);
          col += vec3(0.95, 0.98, 1.0) * smoothstep(0.8, 0.98, cloud) * 0.18 * (1.0 - h);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 20), this.skyMat);
    scene.add(skyDome);

    // 3. Orlando Resort Plaza Floor (Warm paver stone & asphalt)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.7,
      metalness: 0.15
    });
    const floorGeo = new THREE.BoxGeometry(84, 2, 156);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -1, 0);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    this.raycastObstacles.push(floorMesh);

    // High-visibility golden roadway & crosswalk markers
    const gridHelper = new THREE.GridHelper(156, 52, 0xf59e0b, 0x64748b);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // Center lane boulevard painted road stripes
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, depthWrite: false });
    for (let z = -65; z <= 65; z += 12) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 6), lineMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.03, z);
      scene.add(stripe);
    }

    // 4. Perimeter Resort Walls (Florida limestone & terracotta caps)
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.6,
      metalness: 0.1
    });
    const wallCapMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.5
    });
    this.addBoxObstacle(scene, -41, 4, 0, 2, 8, 156, wallMat);
    this.addBoxObstacle(scene, 41, 4, 0, 2, 8, 156, wallMat);
    this.addBoxObstacle(scene, 0, 4, 77, 84, 8, 2, wallMat);
    this.addBoxObstacle(scene, 0, 4, -77, 84, 8, 2, wallMat);

    // Wall top terracotta trim
    const topCapN = new THREE.Mesh(new THREE.BoxGeometry(84, 0.4, 2.4), wallCapMat);
    topCapN.position.set(0, 8.2, 77);
    scene.add(topCapN);
    const topCapS = new THREE.Mesh(new THREE.BoxGeometry(84, 0.4, 2.4), wallCapMat);
    topCapS.position.set(0, 8.2, -77);
    scene.add(topCapS);

    // 5. West Flank: International Drive Resort Promenade (x = -24)
    const promenadeMat = new THREE.MeshStandardMaterial({
      color: 0x78716c,
      roughness: 0.5,
      metalness: 0.2
    });
    this.addBoxObstacle(scene, -24, 1.5, 0, 8, 3.0, 44, promenadeMat, true);

    // Promenade access ramps
    for (let step = 1; step <= 6; step++) {
      const h = (step / 6) * 3.0;
      const zOffset = 22 + (7 - step) * 2.2;
      this.addBoxObstacle(scene, -24, h / 2, zOffset, 6, h, 2.4, promenadeMat, true);
      this.addBoxObstacle(scene, -24, h / 2, -zOffset, 6, h, 2.4, promenadeMat, true);
    }

    // 6. Centerpiece Landmark: WhirlyDome Arena (x = 22, z = 0)
    this.loadWhirlyDome(scene, 22, 0);

    // 7. WhirlyDome Entrance Marquee Sign
    this.createOrlandoMarquee(scene, 4.5, 4.2, 0);

    // 8. Tropical Palm Trees & Landscaping Planters
    const palmPositions: [number, number, number][] = [
      // Along East Promenade / WhirlyDome Plaza
      [9.5, -30, 1.0],
      [9.5, -15, 1.05],
      [9.5, 15, 1.05],
      [9.5, 30, 1.0],
      // Along West Promenade
      [-14.5, -30, 1.0],
      [-14.5, -15, 1.05],
      [-14.5, 15, 1.05],
      [-14.5, 30, 1.0],
      // Corner Palm Groves
      [-34, -60, 1.15],
      [-34, 60, 1.15],
      [34, -60, 1.15],
      [34, 60, 1.15]
    ];

    palmPositions.forEach(([px, pz, pScale]) => {
      const palm = this.createPalmTree(px, pz, pScale);
      scene.add(palm);
      // Low planter box collision
      this.colliders.push({
        minX: px - 1.4 * pScale,
        maxX: px + 1.4 * pScale,
        minY: 0,
        maxY: 0.7 * pScale,
        minZ: pz - 1.4 * pScale,
        maxZ: pz + 1.4 * pScale,
        walkableTop: true
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  WhirlyDome 3D Model Loader & Physical Colliders
  // ─────────────────────────────────────────────────────────────
  private loadWhirlyDome(scene: THREE.Scene, posX: number, posZ: number) {
    // 1. Foundation Plaza Base under WhirlyDome (walkable)
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.2
    });
    this.addBoxObstacle(scene, posX, 0.2, posZ, 36, 0.4, 38, baseMat, true);

    // 2. Low-Poly Raycast Proxy (~32 triangles)
    // Avoids raycasting against 203,902 vertices every frame which causes slow-motion CPU lag!
    const proxyGeo = new THREE.CylinderGeometry(16.5, 17.5, 15.5, 16);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
    proxyMesh.position.set(posX, 7.8, posZ);
    scene.add(proxyMesh);
    this.raycastObstacles.push(proxyMesh);

    // 3. Asynchronously Load Visual WhirlyDome GLB
    const loader = new GLTFLoader();
    loader.load(
      '/models/whirlydome.glb',
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            m.castShadow = true;
            m.receiveShadow = true;
            // High-poly visual mesh is NOT added to raycastObstacles to prevent slow-motion frame drops
          }
        });

        // Compute original size
        const bbox = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        // Target width: 34m
        const targetWidth = 34.0;
        const scale = targetWidth / Math.max(0.1, size.x);
        model.scale.setScalar(scale);

        // Ground flush with the arena floor
        bbox.setFromObject(model);
        const yOffset = -bbox.min.y;

        model.position.set(posX, yOffset + 0.4, posZ);
        // Face toward center boulevard
        model.rotation.y = -Math.PI / 2;

        scene.add(model);
      },
      undefined,
      (err) => {
        console.error('Failed to load whirlydome.glb:', err);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  Procedural Palm Tree Generator
  // ─────────────────────────────────────────────────────────────
  private createPalmTree(x: number, z: number, scale = 1.0): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);

    // Stone planter
    const planterGeo = new THREE.CylinderGeometry(1.4, 1.6, 0.7, 16);
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
    const planter = new THREE.Mesh(planterGeo, planterMat);
    planter.position.y = 0.35;
    planter.castShadow = true;
    planter.receiveShadow = true;
    g.add(planter);

    // Soil
    const soilGeo = new THREE.CircleGeometry(1.3, 16);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 });
    const soil = new THREE.Mesh(soilGeo, soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.71;
    g.add(soil);

    // Trunk
    const trunkHeight = 6.8;
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.4, trunkHeight, 8, 4);
    const posAttr = trunkGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const curve = Math.pow(Math.max(0, y + trunkHeight / 2) / trunkHeight, 1.8) * 0.75;
      posAttr.setX(i, posAttr.getX(i) + curve);
    }
    trunkGeo.computeVertexNormals();

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x78350f,
      roughness: 0.85,
      metalness: 0.05
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2 + 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    // Palm Crown & Fronds
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.5,
      side: THREE.DoubleSide
    });

    const crownGroup = new THREE.Group();
    crownGroup.position.set(0.75, trunkHeight + 0.5, 0);

    const numFronds = 9;
    for (let i = 0; i < numFronds; i++) {
      const angle = (i / numFronds) * Math.PI * 2;
      const frond = new THREE.Group();
      frond.rotation.y = angle;

      const leafGeo = new THREE.ConeGeometry(0.55, 3.8, 5);
      leafGeo.rotateX(Math.PI / 2.6);
      const leaf = new THREE.Mesh(leafGeo, frondMat);
      leaf.position.z = 1.7;
      leaf.position.y = -0.4;
      leaf.castShadow = true;
      frond.add(leaf);

      crownGroup.add(frond);
    }
    g.add(crownGroup);

    return g;
  }

  // ─────────────────────────────────────────────────────────────
  //  Orlando Marquee Neon Sign
  // ─────────────────────────────────────────────────────────────
  private createOrlandoMarquee(scene: THREE.Scene, x: number, y: number, z: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, 1004, 236);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 74px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★ WHIRLYDOME ★', 512, 90);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 36px monospace';
      ctx.fillText('INTERNATIONAL DRIVE · ORLANDO, FL', 512, 175);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = -Math.PI / 2;
    scene.add(mesh);
  }

  // ─────────────────────────────────────────────────────────────
  //  Obstacle & Collision Helpers
  // ─────────────────────────────────────────────────────────────
  private addBoxObstacle(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    walkableTop = false
  ) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    this.raycastObstacles.push(mesh);
    this.colliders.push({
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: y - h / 2,
      maxY: y + h / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      walkableTop
    });
  }

  public updateSky(elapsed: number, domainActive: boolean, domainColorHex?: string) {
    if (!this.skyMat) return;
    this.skyMat.uniforms.uTime.value = elapsed;
    const targetMix = domainActive ? 1.0 : 0.0;
    this.skyMat.uniforms.uDomainMix.value = THREE.MathUtils.lerp(
      this.skyMat.uniforms.uDomainMix.value,
      targetMix,
      0.06
    );
    if (domainColorHex) {
      this.skyMat.uniforms.uDomainColor.value.set(domainColorHex);
    }
  }

  /**
   * Returns the highest walkable floor Y at (x, z) that the player can step onto from currentFeetY.
   */
  public getFloorHeight(x: number, z: number, currentFeetY: number): number {
    let highest = 0;

    // Smooth walkable dome roof for WhirlyDome on Orlando map
    if (this.mapId === 'orlando') {
      const dx = x - 22;
      const dz = z - 0;
      const d = Math.hypot(dx, dz);
      const domeRadius = 18.0;
      if (d <= domeRadius) {
        // Curve rises smoothly from 0.4m at perimeter to 15.2m at the center
        const norm = d / domeRadius;
        const domeRoofY = 0.4 + 14.8 * Math.cos(norm * (Math.PI * 0.48));
        if (domeRoofY > highest) {
          highest = domeRoofY;
        }
      }
    }

    for (const c of this.colliders) {
      if (!c.walkableTop) continue;
      if (x >= c.minX - 0.35 && x <= c.maxX + 0.35 && z >= c.minZ - 0.35 && z <= c.maxZ + 0.35) {
        if (c.maxY <= currentFeetY + 0.85 && c.maxY > highest) {
          highest = c.maxY;
        }
      }
    }
    return highest;
  }

  /**
   * Resolves horizontal circle vs AABB collisions at the player's current foot height.
   */
  public resolveHorizontalCollision(x: number, z: number, radius: number, feetY: number): { x: number; z: number } {
    let rx = x;
    let rz = z;

    for (const c of this.colliders) {
      if (c.walkableTop && feetY >= c.maxY - 0.65) continue;
      if (feetY + 1.7 < c.minY || feetY > c.maxY) continue;

      const closestX = THREE.MathUtils.clamp(rx, c.minX, c.maxX);
      const closestZ = THREE.MathUtils.clamp(rz, c.minZ, c.maxZ);
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        rx += (dx / dist) * overlap;
        rz += (dz / dist) * overlap;
      }
    }

    rx = THREE.MathUtils.clamp(rx, -39.2, 39.2);
    rz = THREE.MathUtils.clamp(rz, -75.2, 75.2);
    return { x: rx, z: rz };
  }
}
