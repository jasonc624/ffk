import * as THREE from 'three';

export type Vfx3DShape =
  | 'SPHERE'
  | 'SPEAR'
  | 'SLASH_ARC'
  | 'VORTEX'
  | 'PILLAR'
  | 'BEAM'
  | 'METEOR'
  | 'CHAINS'
  | 'DOME'
  | 'SINGULARITY'
  | 'SONIC_CONE';

export interface Vfx3DConfig {
  shape?: Vfx3DShape;
  primaryColor?: string;
  secondaryColor?: string;
  scale?: number;
}

interface Active3DEffect {
  group: THREE.Group;
  light?: THREE.PointLight;
  age: number;
  maxAge: number;
  onUpdate: (dt: number, elapsed: number, progress: number) => boolean | void;
  onDispose?: () => void;
}

export class ThreeAbilityVfx {
  private scene: THREE.Scene;
  private phaserToWorld: (px: number, py: number, z?: number) => THREE.Vector3;
  private triggerHitImpact: (px: number, py: number, dmg: number, col?: string) => void;
  private effects: Active3DEffect[] = [];

  constructor(
    scene: THREE.Scene,
    phaserToWorld: (px: number, py: number, z?: number) => THREE.Vector3,
    triggerHitImpact: (px: number, py: number, dmg: number, col?: string) => void
  ) {
    this.scene = scene;
    this.phaserToWorld = phaserToWorld;
    this.triggerHitImpact = triggerHitImpact;
  }

  public update(dt: number, elapsed: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.age += dt;
      const progress = Math.min(1, fx.age / fx.maxAge);
      const keepAlive = fx.onUpdate(dt, elapsed, progress);

      if (fx.age >= fx.maxAge || keepAlive === false) {
        this.disposeEffect(fx);
        this.effects.splice(i, 1);
      }
    }
  }

  private disposeEffect(fx: Active3DEffect) {
    fx.onDispose?.();
    if (fx.light) {
      this.scene.remove(fx.light);
      fx.light.dispose();
    }
    this.scene.remove(fx.group);
    fx.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material.dispose();
      }
    });
  }

  /**
   * 1. PROJECTILE — 3D glowing orb, spinning cursed spear, or meteor with a live 3D PointLight
   * that tracks the Phaser physics body in real time.
   */
  public spawnProjectile(opts: {
    getPos: () => { x: number; y: number; active: boolean };
    dir: number;
    color: string;
    secondaryColor?: string;
    shape?: Vfx3DShape;
    radiusPx?: number;
    maxDurationMs?: number;
  }) {
    const group = new THREE.Group();
    const col1 = new THREE.Color(opts.color || '#38bdf8');
    const col2 = new THREE.Color(opts.secondaryColor || '#ffffff');
    const baseRadius = Math.max(0.28, (opts.radiusPx ?? 20) * 0.018);

    // Inner bright core
    const coreGeo =
      opts.shape === 'SPEAR'
        ? new THREE.ConeGeometry(baseRadius * 0.65, baseRadius * 3.2, 8)
        : opts.shape === 'METEOR'
          ? new THREE.DodecahedronGeometry(baseRadius * 1.1, 0)
          : new THREE.IcosahedronGeometry(baseRadius * 0.85, 2);

    if (opts.shape === 'SPEAR') {
      coreGeo.rotateZ(opts.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    }

    const coreMat = new THREE.MeshBasicMaterial({
      color: col2,
      transparent: true,
      opacity: 0.95
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // Outer additive energy shell
    const shellGeo = new THREE.IcosahedronGeometry(baseRadius * 1.45, 2);
    const shellMat = new THREE.MeshBasicMaterial({
      color: col1,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    group.add(shellMesh);

    // Orbiting cursed ring
    const ringGeo = new THREE.TorusGeometry(baseRadius * 1.7, baseRadius * 0.12, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: col1,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    group.add(ringMesh);

    const light = new THREE.PointLight(col1, 5.5, 9, 1.5);
    this.scene.add(light);
    this.scene.add(group);

    let lastX = 0;
    let lastY = 0;

    this.effects.push({
      group,
      light,
      age: 0,
      maxAge: (opts.maxDurationMs ?? 2200) / 1000,
      onUpdate: (dt, elapsed) => {
        const state = opts.getPos();
        if (!state.active) {
          this.triggerHitImpact(lastX, lastY, 18, opts.color);
          return false;
        }
        lastX = state.x;
        lastY = state.y;
        const wPos = this.phaserToWorld(state.x, state.y, 0.45);
        group.position.copy(wPos);
        light.position.copy(wPos);

        shellMesh.rotation.x += dt * 6;
        shellMesh.rotation.y += dt * 8;
        ringMesh.rotation.x = elapsed * 9;
        ringMesh.rotation.y = elapsed * 5;
        return true;
      }
    });
  }

  /**
   * 2. MELEE — 3D Crescent Slash Arc + Spatial Cleave Lines + Dynamic PointLight
   */
  public spawnSlash(opts: {
    x: number;
    y: number;
    dir: number;
    widthPx: number;
    heightPx: number;
    color: string;
    secondaryColor?: string;
  }) {
    const group = new THREE.Group();
    const pos = this.phaserToWorld(opts.x, opts.y, 0.5);
    group.position.copy(pos);

    const col1 = new THREE.Color(opts.color || '#38bdf8');
    const col2 = new THREE.Color(opts.secondaryColor || '#ffffff');
    const radius = Math.max(0.8, Math.max(opts.widthPx, opts.heightPx) * 0.015);

    // 3D Crescent Torus Arc
    const arcGeo = new THREE.TorusGeometry(radius, radius * 0.16, 10, 28, Math.PI * 1.15);
    const arcMat = new THREE.MeshBasicMaterial({
      color: col1,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const arcMesh = new THREE.Mesh(arcGeo, arcMat);
    arcMesh.rotation.z = opts.dir > 0 ? -Math.PI * 0.55 : Math.PI * 0.45;
    arcMesh.rotation.x = 0.45;
    group.add(arcMesh);

    // Inner white-hot edge
    const innerGeo = new THREE.TorusGeometry(radius * 0.92, radius * 0.06, 8, 24, Math.PI * 1.05);
    const innerMat = new THREE.MeshBasicMaterial({
      color: col2,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.rotation.copy(arcMesh.rotation);
    group.add(innerMesh);

    const light = new THREE.PointLight(col1, 6.5, 8, 1.5);
    light.position.copy(pos);
    this.scene.add(light);
    this.scene.add(group);

    this.effects.push({
      group,
      light,
      age: 0,
      maxAge: 0.32,
      onUpdate: (dt, _elapsed, p) => {
        const scale = 0.55 + (1 - Math.pow(1 - p, 3)) * 1.15;
        group.scale.setScalar(scale);
        arcMesh.rotation.z += opts.dir * dt * 8.5;
        innerMesh.rotation.z = arcMesh.rotation.z;
        arcMat.opacity = (1 - p) * 0.95;
        innerMat.opacity = 1 - p;
        light.intensity = (1 - p) * 6.5;
      }
    });
  }

  /**
   * 3. MOVEMENT — 3D Spatial Warp Tunnel & Velocity Streak between start and end
   */
  public spawnDash(opts: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const startW = this.phaserToWorld(opts.fromX, opts.fromY, 0.35);
    const endW = this.phaserToWorld(opts.toX, opts.toY, 0.35);
    const col = new THREE.Color(opts.color || '#10b981');

    // 5 warp rings along the trajectory
    const ringMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const p = new THREE.Vector3().lerpVectors(startW, endW, t);
      const rGeo = new THREE.TorusGeometry(0.45 + t * 0.35, 0.05, 8, 24);
      const rMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      });
      ringMats.push(rMat);
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.position.copy(p);
      rMesh.rotation.y = Math.PI / 2;
      group.add(rMesh);
    }

    // Core warp beam connecting start to end
    const dist = startW.distanceTo(endW);
    const mid = new THREE.Vector3().lerpVectors(startW, endW, 0.5);
    const beamGeo = new THREE.CylinderGeometry(0.12, 0.35, Math.max(0.5, dist), 12);
    beamGeo.rotateZ(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.copy(mid);
    group.add(beamMesh);

    this.scene.add(group);
    this.effects.push({
      group,
      age: 0,
      maxAge: 0.42,
      onUpdate: (_dt, _el, p) => {
        const fade = 1 - p;
        beamMat.opacity = fade * 0.75;
        beamMesh.scale.y = 1 + p * 1.5;
        ringMats.forEach((m, idx) => {
          m.opacity = fade * 0.85;
          const child = group.children[idx];
          if (child) child.scale.setScalar(1 + p * 1.4);
        });
      }
    });
  }

  /**
   * 4. AREA_DENIAL / TERRAIN HAZARD — 3D Swirling Cursed Glyph Vortex + Rising Energy Pillars
   */
  public spawnAreaZone(opts: {
    x: number;
    y: number;
    radiusPx: number;
    durationMs: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const pos = this.phaserToWorld(opts.x, opts.y + 34, 0.25);
    group.position.copy(pos);

    const col = new THREE.Color(opts.color || '#f43f5e');
    const radius = Math.max(1.2, opts.radiusPx * 0.02);

    // Base glowing vortex disc
    const discGeo = new THREE.RingGeometry(0.2, radius, 32, 3);
    const discMat = new THREE.MeshBasicMaterial({
      color: col,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const discMesh = new THREE.Mesh(discGeo, discMat);
    discMesh.rotation.x = -Math.PI / 2;
    group.add(discMesh);

    // Outer boundary torus
    const rimGeo = new THREE.TorusGeometry(radius, 0.06, 8, 36);
    const rimMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    group.add(rimMesh);

    // Orbiting 3D cursed obelisks/shards inside the zone
    const shards: THREE.Mesh[] = [];
    const shardGeo = new THREE.ConeGeometry(0.18, 1.4, 5);
    const shardMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(shardGeo, shardMat);
      const a = (i / 6) * Math.PI * 2;
      s.position.set(Math.cos(a) * radius * 0.65, 0.6, Math.sin(a) * radius * 0.65);
      group.add(s);
      shards.push(s);
    }

    const light = new THREE.PointLight(col, 4.5, radius * 2.8, 1.5);
    light.position.set(pos.x, pos.y + 0.8, pos.z);
    this.scene.add(light);
    this.scene.add(group);

    this.effects.push({
      group,
      light,
      age: 0,
      maxAge: opts.durationMs / 1000,
      onUpdate: (dt, elapsed, p) => {
        discMesh.rotation.z += dt * 2.5;
        shards.forEach((s, i) => {
          const a = elapsed * 2.2 + (i / 6) * Math.PI * 2;
          s.position.x = Math.cos(a) * radius * 0.65;
          s.position.z = Math.sin(a) * radius * 0.65;
          s.position.y = 0.5 + Math.sin(elapsed * 5 + i) * 0.35;
        });
        const fade = p > 0.85 ? (1 - p) / 0.15 : 1;
        discMat.opacity = 0.75 * fade;
        rimMat.opacity = 0.9 * fade;
        shardMat.opacity = 0.65 * fade;
        light.intensity = 4.5 * fade;
      }
    });
  }

  /**
   * 5. BARRIER / COUNTER — 3D Geodesic Infinity Shield following the fighter
   */
  public spawnBarrier(opts: {
    getPos: () => { x: number; y: number; active: boolean };
    radiusPx: number;
    durationMs: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const col = new THREE.Color(opts.color || '#38bdf8');
    const radius = Math.max(1.05, opts.radiusPx * 0.015);

    const domeGeo = new THREE.IcosahedronGeometry(radius, 2);
    const domeMat = new THREE.MeshBasicMaterial({
      color: col,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    group.add(domeMesh);

    const innerGeo = new THREE.SphereGeometry(radius * 0.94, 24, 24);
    const innerMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    group.add(innerMesh);

    this.scene.add(group);
    this.effects.push({
      group,
      age: 0,
      maxAge: opts.durationMs / 1000,
      onUpdate: (dt, elapsed, p) => {
        const s = opts.getPos();
        if (!s.active) return false;
        group.position.copy(this.phaserToWorld(s.x, s.y, 0.4));
        domeMesh.rotation.y += dt * 1.8;
        domeMesh.rotation.x += dt * 0.9;
        const pulse = 1 + Math.sin(elapsed * 8) * 0.05;
        group.scale.setScalar(pulse);
        const fade = p > 0.85 ? (1 - p) / 0.15 : 1;
        domeMat.opacity = 0.65 * fade;
        innerMat.opacity = 0.18 * fade;
        return true;
      }
    });
  }

  /**
   * 6. EXECUTION / DETONATION — 3D Imploding Singularity Sphere + Black Flash Lightning Spokes
   */
  public spawnSingularity(opts: {
    x: number;
    y: number;
    stacks: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const pos = this.phaserToWorld(opts.x, opts.y, 0.5);
    group.position.copy(pos);

    const col = new THREE.Color(opts.color || '#a855f7');
    const coreRadius = 0.9 + Math.min(opts.stacks, 5) * 0.25;

    // Dark void singularity core
    const voidGeo = new THREE.SphereGeometry(coreRadius * 0.65, 24, 24);
    const voidMat = new THREE.MeshBasicMaterial({
      color: 0x05050a,
      transparent: true,
      opacity: 0.95
    });
    const voidMesh = new THREE.Mesh(voidGeo, voidMat);
    group.add(voidMesh);

    // Accretion wireframe shell
    const shellGeo = new THREE.IcosahedronGeometry(coreRadius * 1.35, 2);
    const shellMat = new THREE.MeshBasicMaterial({
      color: col,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    group.add(shellMesh);

    // 8 radial lightning/spatial rupture spears
    const spokeMats: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < 8; i++) {
      const sGeo = new THREE.ConeGeometry(0.09, coreRadius * 3.4, 5);
      const sMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? col : new THREE.Color(0xff1133),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      spokeMats.push(sMat);
      const sMesh = new THREE.Mesh(sGeo, sMat);
      sMesh.rotation.z = (i / 8) * Math.PI * 2;
      sMesh.rotation.x = (Math.random() - 0.5) * 0.8;
      group.add(sMesh);
    }

    const light = new THREE.PointLight(col, 10, 16, 1.4);
    light.position.copy(pos);
    this.scene.add(light);
    this.scene.add(group);

    this.triggerHitImpact(opts.x, opts.y, 35 + opts.stacks * 10, opts.color);

    this.effects.push({
      group,
      light,
      age: 0,
      maxAge: 0.65,
      onUpdate: (dt, _el, p) => {
        // First 40% implodes inward, then 60% explodes outward
        const scale =
          p < 0.4
            ? THREE.MathUtils.lerp(1.5, 0.35, p / 0.4)
            : THREE.MathUtils.lerp(0.35, 2.6, (p - 0.4) / 0.6);
        group.scale.setScalar(scale);
        shellMesh.rotation.y += dt * 10;
        shellMesh.rotation.z -= dt * 7;
        const fade = p > 0.5 ? 1 - (p - 0.5) / 0.5 : 1;
        voidMat.opacity = fade * 0.95;
        shellMat.opacity = fade * 0.95;
        spokeMats.forEach((m) => (m.opacity = fade * 0.9));
        light.intensity = fade * 10;
      }
    });
  }

  /**
   * 7. TETHER / RESOURCE DRAIN — Live 3D Energy Helix connecting Caster & Target
   */
  public spawnTether(opts: {
    getCasterPos: () => { x: number; y: number; active: boolean };
    getTargetPos: () => { x: number; y: number; active: boolean };
    durationMs: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const col = new THREE.Color(opts.color || '#a855f7');

    const segCount = 14;
    const nodes: THREE.Mesh[] = [];
    const nodeGeo = new THREE.OctahedronGeometry(0.18, 0);
    const nodeMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    for (let i = 0; i < segCount; i++) {
      const m = new THREE.Mesh(nodeGeo, nodeMat);
      group.add(m);
      nodes.push(m);
    }

    this.scene.add(group);
    this.effects.push({
      group,
      age: 0,
      maxAge: opts.durationMs / 1000,
      onUpdate: (_dt, elapsed, p) => {
        const c = opts.getCasterPos();
        const t = opts.getTargetPos();
        if (!c.active || !t.active) return false;

        const startW = this.phaserToWorld(c.x, c.y, 0.4);
        const endW = this.phaserToWorld(t.x, t.y, 0.4);

        for (let i = 0; i < segCount; i++) {
          const frac = i / (segCount - 1);
          const pos = new THREE.Vector3().lerpVectors(startW, endW, frac);
          const wave = Math.sin(frac * Math.PI * 3 - elapsed * 12) * 0.28 * Math.sin(frac * Math.PI);
          pos.y += wave;
          pos.z += Math.cos(frac * Math.PI * 3 - elapsed * 12) * 0.25;
          nodes[i].position.copy(pos);
          nodes[i].rotation.x = elapsed * 6 + i;
          nodes[i].rotation.y = elapsed * 8;
        }
        nodeMat.opacity = p > 0.85 ? ((1 - p) / 0.15) * 0.9 : 0.9;
        return true;
      }
    });
  }

  /**
   * 8. COMMAND (Cursed Speech) — Expanding 3D Sonic Shockwave Cones
   */
  public spawnSonicWave(opts: {
    x: number;
    y: number;
    dir: number;
    rangePx: number;
    color: string;
  }) {
    const group = new THREE.Group();
    const startW = this.phaserToWorld(opts.x, opts.y - 8, 0.5);
    group.position.copy(startW);

    const col = new THREE.Color(opts.color || '#f43f5e');
    const rings: THREE.Mesh[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];

    for (let i = 0; i < 5; i++) {
      const rGeo = new THREE.TorusGeometry(0.25 + i * 0.22, 0.045, 8, 28);
      const rMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.rotation.y = Math.PI / 2;
      rMesh.position.x = opts.dir * (i * 0.45);
      group.add(rMesh);
      rings.push(rMesh);
      mats.push(rMat);
    }

    this.scene.add(group);
    const maxDist = Math.max(3.5, opts.rangePx * 0.02);

    this.effects.push({
      group,
      age: 0,
      maxAge: 0.48,
      onUpdate: (_dt, _el, p) => {
        rings.forEach((r, idx) => {
          const offset = (idx / 5) * 0.35;
          const localP = Math.max(0, Math.min(1, (p - offset) / (1 - offset)));
          r.position.x = opts.dir * localP * maxDist;
          r.scale.setScalar(1 + localP * 2.2);
          mats[idx].opacity = (1 - localP) * 0.9;
        });
      }
    });
  }

  /**
   * 9. TERRAIN / SUMMON DIVE — 3D Erupting Cursed Pillar or Sky Thunderbolt
   */
  public spawnPillar(opts: {
    x: number;
    y: number;
    widthPx: number;
    heightPx: number;
    durationMs: number;
    color: string;
    fromSky?: boolean;
  }) {
    const group = new THREE.Group();
    const pos = this.phaserToWorld(opts.x, opts.y, 0.35);
    group.position.copy(pos);

    const col = new THREE.Color(opts.color || '#6366f1');
    const w = Math.max(0.55, opts.widthPx * 0.012);
    const h = Math.max(2.2, opts.heightPx * 0.035);

    const geo = new THREE.CylinderGeometry(w * 0.7, w * 1.15, h, 7);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      wireframe: opts.fromSky ?? false,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    const coreGeo = new THREE.CylinderGeometry(w * 0.35, w * 0.5, h * 1.02, 6);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    const light = new THREE.PointLight(col, 6.0, 10, 1.5);
    light.position.copy(pos);
    this.scene.add(light);
    this.scene.add(group);

    this.effects.push({
      group,
      light,
      age: 0,
      maxAge: opts.durationMs / 1000,
      onUpdate: (dt, _el, p) => {
        mesh.rotation.y += dt * 4;
        const emerge = Math.min(1, p * 6);
        group.scale.y = emerge;
        const fade = p > 0.75 ? (1 - p) / 0.25 : 1;
        mat.opacity = 0.88 * fade;
        coreMat.opacity = 0.85 * fade;
        light.intensity = 6.0 * fade;
      }
    });
  }
}

