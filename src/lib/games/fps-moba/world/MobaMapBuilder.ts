import * as THREE from 'three';

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

  public build(scene: THREE.Scene) {
    // 1. Bright, high-visibility Lighting & Atmospheric Fog
    scene.fog = new THREE.FogExp2(0x283c66, 0.0028);

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

    // Fill light from opposite angle so no wall faces are pitch black
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.4);
    fillLight.position.set(-40, 50, -35);
    scene.add(fillLight);

    // 2. Sky Dome Shader (Crisp vibrant sky with glowing energy bands)
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

          // Celestial sun disc
          vec3 sunDir = normalize(vec3(0.4, 0.75, 0.35));
          float sunDot = max(0.0, dot(dir, sunDir));
          col += vec3(1.0, 0.95, 0.8) * pow(sunDot, 36.0) * 0.7;

          // Subtle grid bands in sky dome
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

    // 3. Main Arena Floor (80m wide x 150m long; Blue at +Z, Red at -Z)
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

    // High-contrast Tactical Grid Overlay
    const gridHelper = new THREE.GridHelper(156, 52, 0x64748b, 0x475569);
    gridHelper.position.y = 0.02;
    scene.add(gridHelper);

    // Glowing Lane Path Strips (Central Lane + Flank Lanes)
    this.addGlowingStrip(scene, 0, 0.03, 0, 8.5, 128, 0x60a5fa, 0.22);
    this.addGlowingStrip(scene, -24, 3.03, 0, 6.0, 42, 0x38bdf8, 0.25); // Left bridge top strip
    this.addGlowingStrip(scene, 24, 3.03, 0, 6.0, 42, 0x38bdf8, 0.25);  // Right bridge top strip
    this.addGlowingStrip(scene, 0, 0.04, 32, 1.4, 62, 0x38bdf8, 0.75);  // Blue half center line
    this.addGlowingStrip(scene, 0, 0.04, -32, 1.4, 62, 0xf43f5e, 0.75); // Red half center line

    // Blue & Red Spawn Sanctuaries
    this.addSpawnPad(scene, 0, 68, 0x38bdf8);
    this.addSpawnPad(scene, 0, -68, 0xf43f5e);

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

    // 5. Elevated Sniper / Flank Bridges on Left (x = -24) and Right (x = +24)
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.25
    });
    // Left Bridge deck (y = 0..3.0m)
    this.addBoxObstacle(scene, -24, 1.5, 0, 8, 3.0, 44, bridgeMat, true);
    // Right Bridge deck (y = 0..3.0m)
    this.addBoxObstacle(scene, 24, 1.5, 0, 8, 3.0, 44, bridgeMat, true);

    // Ramps leading onto Left & Right Bridges (stepped slabs for smooth climbing)
    for (let step = 1; step <= 6; step++) {
      const h = (step / 6) * 3.0;
      const zOffset = 22 + (7 - step) * 2.2;
      this.addBoxObstacle(scene, -24, h / 2, zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, -24, h / 2, -zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, 24, h / 2, zOffset, 6, h, 2.4, bridgeMat, true);
      this.addBoxObstacle(scene, 24, h / 2, -zOffset, 6, h, 2.4, bridgeMat, true);
    }

    // 6. Midfield Tactical Cover Pillars & Chokepoint Monoliths
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.45,
      metalness: 0.25,
      emissive: 0x0f172a,
      emissiveIntensity: 0.35
    });
    const coverPositions = [
      { x: -10, z: 16, w: 3.5, h: 4.5, d: 3.5 },
      { x: 10, z: 16, w: 3.5, h: 4.5, d: 3.5 },
      { x: -10, z: -16, w: 3.5, h: 4.5, d: 3.5 },
      { x: 10, z: -16, w: 3.5, h: 4.5, d: 3.5 },
      { x: -12, z: 42, w: 4.0, h: 5.0, d: 2.5 },
      { x: 12, z: 42, w: 4.0, h: 5.0, d: 2.5 },
      { x: -12, z: -42, w: 4.0, h: 5.0, d: 2.5 },
      { x: 12, z: -42, w: 4.0, h: 5.0, d: 2.5 }
    ];
    coverPositions.forEach((p) => {
      this.addBoxObstacle(scene, p.x, p.h / 2, p.z, p.w, p.h, p.d, pillarMat, true);
    });
  }

  private addGlowingStrip(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: number,
    opacity: number
  ) {
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
  }

  private addSpawnPad(scene: THREE.Scene, x: number, z: number, color: number) {
    const ringGeo = new THREE.RingGeometry(3.2, 4.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, 0.05, z);
    scene.add(ring);
  }

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
    for (const c of this.colliders) {
      if (!c.walkableTop) continue;
      if (x >= c.minX - 0.35 && x <= c.maxX + 0.35 && z >= c.minZ - 0.35 && z <= c.maxZ + 0.35) {
        // Allow stepping up up to 0.75m automatically (for ramps) or landing from above
        if (c.maxY <= currentFeetY + 0.75 && c.maxY > highest) {
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
      // If our feet are above this collider's top (or within step-up threshold on walkable ramps), don't block horizontally
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

    // Clamp inside outer bounds
    rx = THREE.MathUtils.clamp(rx, -39.2, 39.2);
    rz = THREE.MathUtils.clamp(rz, -75.2, 75.2);
    return { x: rx, z: rz };
  }
}

