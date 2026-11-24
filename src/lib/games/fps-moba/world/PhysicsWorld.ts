import * as THREE from 'three';
import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { ColliderBox, MobaMapBuilder } from './MobaMapBuilder';

type RapierModule = typeof RAPIER_NS;

interface DynamicBodyEntry {
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  mesh: THREE.Mesh;
  halfExtents: THREE.Vector3;
  isCrate: boolean;
  hp: number;
  colorHex: number;
  age: number;
  maxAge: number | null; // null = persistent arena prop (crate); number = transient rubble
}

interface DestructiblePillar {
  id: string;
  mesh: THREE.Mesh;
  colliderBox: ColliderBox;
  staticBody: RAPIER_NS.RigidBody | null;
  staticCollider: RAPIER_NS.Collider | null;
  center: THREE.Vector3;
  size: THREE.Vector3;
  hp: number;
  maxHp: number;
  colorHex: number;
  accentHex: number;
  destroyed: boolean;
}

const MAX_DYNAMIC_BODIES = 110;
const GRAVITY_Y = -24.0;

/**
 * Rapier3D-powered rigid-body physics world for the 3D FPS/MOBA arena.
 * Manages static arena colliders, destructible concrete pillars, stacked dynamic crates,
 * flying rubble debris, radial blast impulses, and 3D Lapse Blue vortex suction.
 */
export class PhysicsWorld {
  private rapier: RapierModule | null = null;
  private world: RAPIER_NS.World | null = null;
  private scene: THREE.Scene;
  private mapBuilder: MobaMapBuilder;
  private destroyed = false;
  private accumulator = 0;

  private dynamicBodies: DynamicBodyEntry[] = [];
  private pillars: DestructiblePillar[] = [];
  private sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  private sharedRockGeo = new THREE.DodecahedronGeometry(0.55, 0);

  constructor(scene: THREE.Scene, mapBuilder: MobaMapBuilder) {
    this.scene = scene;
    this.mapBuilder = mapBuilder;
    // Spawn destructible pillars immediately so cover is visible on frame 1
    this.spawnDestructiblePillars();
  }

  public get ready(): boolean {
    return this.world !== null && this.rapier !== null;
  }

  /**
   * Asynchronously initializes Rapier3D WASM in the browser only (SSR-safe),
   * registers static map colliders, and spawns interactive physics crate stacks.
   */
  public async init(): Promise<void> {
    if (typeof window === 'undefined' || this.destroyed) return;
    try {
      const mod = await import('@dimforge/rapier3d-compat');
      const RAPIER = (mod.default ?? mod) as unknown as RapierModule;
      await RAPIER.init();
      if (this.destroyed) return;

      this.rapier = RAPIER;
      this.world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });

      this.buildStaticArenaColliders();
      this.attachPillarStaticColliders();
      this.spawnArenaCrateStacks();
    } catch (err) {
      console.warn('Rapier3D physics init skipped:', err);
    }
  }

  private buildStaticArenaColliders(): void {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world) return;

    // 1. Main arena ground floor slab (84m x 2m x 156m centered at y = -1)
    const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(42, 1, 78).setFriction(0.85).setRestitution(0.22),
      floorBody
    );

    // 2. Mirror static colliders from MobaMapBuilder (walls, bridges, stairs, buildings)
    const pillarBoxes = new Set(this.pillars.map((p) => p.colliderBox));
    for (const box of this.mapBuilder.colliders) {
      if (pillarBoxes.has(box)) continue;
      const hx = (box.maxX - box.minX) * 0.5;
      const hy = (box.maxY - box.minY) * 0.5;
      const hz = (box.maxZ - box.minZ) * 0.5;
      if (hx <= 0.01 || hy <= 0.01 || hz <= 0.01) continue;
      const cx = (box.minX + box.maxX) * 0.5;
      const cy = (box.minY + box.maxY) * 0.5;
      const cz = (box.minZ + box.maxZ) * 0.5;
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.75).setRestitution(0.25),
        rb
      );
    }
  }

  private spawnDestructiblePillars(): void {
    const isOrlando = this.mapBuilder.mapId === 'orlando';
    const baseColor = isOrlando ? 0xd6d3d1 : 0x64748b;
    const accentColor = isOrlando ? 0xf59e0b : 0x38bdf8;

    const spots: Array<{ x: number; z: number; w: number; h: number; d: number }> = [
      { x: -10.5, z: -20, w: 2.1, h: 5.2, d: 2.1 },
      { x: 10.5, z: -20, w: 2.1, h: 5.2, d: 2.1 },
      { x: -11.5, z: 0, w: 2.2, h: 5.6, d: 2.2 },
      { x: 11.5, z: 0, w: 2.2, h: 5.6, d: 2.2 },
      { x: -10.5, z: 20, w: 2.1, h: 5.2, d: 2.1 },
      { x: 10.5, z: 20, w: 2.1, h: 5.2, d: 2.1 }
    ];

    spots.forEach((s, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.72,
        metalness: 0.18
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mat);
      mesh.position.set(s.x, s.h * 0.5, s.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Glowing structural fracture band so players immediately recognize destructible pillars
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(s.w + 0.08, 0.24, s.d + 0.08),
        new THREE.MeshBasicMaterial({ color: accentColor })
      );
      band.position.y = 0.25;
      mesh.add(band);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(s.w + 0.16, 0.3, s.d + 0.16),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.35 })
      );
      cap.position.y = s.h * 0.5 - 0.15;
      mesh.add(cap);

      this.scene.add(mesh);
      this.mapBuilder.raycastObstacles.push(mesh);

      const colliderBox: ColliderBox = {
        minX: s.x - s.w * 0.5,
        maxX: s.x + s.w * 0.5,
        minY: 0,
        maxY: s.h,
        minZ: s.z - s.d * 0.5,
        maxZ: s.z + s.d * 0.5,
        walkableTop: true
      };
      this.mapBuilder.colliders.push(colliderBox);

      this.pillars.push({
        id: `destructible_pillar_${idx}`,
        mesh,
        colliderBox,
        staticBody: null,
        staticCollider: null,
        center: new THREE.Vector3(s.x, s.h * 0.5, s.z),
        size: new THREE.Vector3(s.w, s.h, s.d),
        hp: 100,
        maxHp: 100,
        colorHex: baseColor,
        accentHex: accentColor,
        destroyed: false
      });
    });
  }

  private attachPillarStaticColliders(): void {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world) return;

    for (const p of this.pillars) {
      if (p.destroyed) continue;
      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.center.x, p.center.y, p.center.z)
      );
      const col = world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.size.x * 0.5, p.size.y * 0.5, p.size.z * 0.5)
          .setFriction(0.75)
          .setRestitution(0.25),
        rb
      );
      p.staticBody = rb;
      p.staticCollider = col;
    }
  }

  private spawnArenaCrateStacks(): void {
    const isOrlando = this.mapBuilder.mapId === 'orlando';
    const crateColorA = isOrlando ? 0xd97706 : 0x475569;
    const crateColorB = isOrlando ? 0xb45309 : 0x334155;

    // 4 interactive physics crate pyramids flanking the center battlefield
    const clusters = [
      { x: -15.5, z: -10 },
      { x: 15.5, z: -10 },
      { x: -15.5, z: 12 },
      { x: 15.5, z: 12 }
    ];

    for (const c of clusters) {
      // Bottom row: 2x2 crates
      this.spawnDynamicBox(new THREE.Vector3(c.x - 0.65, 0.58, c.z - 0.65), new THREE.Vector3(0.55, 0.55, 0.55), crateColorA, true, null);
      this.spawnDynamicBox(new THREE.Vector3(c.x + 0.65, 0.58, c.z - 0.65), new THREE.Vector3(0.55, 0.55, 0.55), crateColorB, true, null);
      this.spawnDynamicBox(new THREE.Vector3(c.x - 0.65, 0.58, c.z + 0.65), new THREE.Vector3(0.55, 0.55, 0.55), crateColorB, true, null);
      this.spawnDynamicBox(new THREE.Vector3(c.x + 0.65, 0.58, c.z + 0.65), new THREE.Vector3(0.55, 0.55, 0.55), crateColorA, true, null);
      // Top crate stacked cleanly in the center
      this.spawnDynamicBox(new THREE.Vector3(c.x, 1.72, c.z), new THREE.Vector3(0.52, 0.52, 0.52), 0xf59e0b, true, null);
    }
  }

  private spawnDynamicBox(
    pos: THREE.Vector3,
    halfExtents: THREE.Vector3,
    colorHex: number,
    isCrate: boolean,
    maxAge: number | null,
    initialLinVel?: THREE.Vector3,
    initialAngVel?: THREE.Vector3,
    useRockShape = false
  ): DynamicBodyEntry | null {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world) return null;

    // Enforce smooth FPS cap by retiring oldest transient debris first
    if (this.dynamicBodies.length >= MAX_DYNAMIC_BODIES) {
      const oldestIdx = this.dynamicBodies.findIndex((d) => d.maxAge !== null);
      if (oldestIdx !== -1) {
        this.removeDynamicAt(oldestIdx);
      } else {
        return null;
      }
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z)
      .setLinearDamping(0.28)
      .setAngularDamping(0.35);

    if (initialLinVel) {
      bodyDesc.setLinvel(initialLinVel.x, initialLinVel.y, initialLinVel.z);
    }
    if (initialAngVel) {
      bodyDesc.setAngvel({ x: initialAngVel.x, y: initialAngVel.y, z: initialAngVel.z });
    }

    const body = world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setDensity(isCrate ? 1.15 : 1.8)
      .setFriction(0.68)
      .setRestitution(isCrate ? 0.28 : 0.34);
    const collider = world.createCollider(colDesc, body);

    const mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: isCrate ? 0.55 : 0.82,
      metalness: isCrate ? 0.32 : 0.12
    });
    const mesh = new THREE.Mesh(useRockShape ? this.sharedRockGeo : this.sharedBoxGeo, mat);
    mesh.scale.set(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (isCrate) {
      // Subtle glowing edge stripe on interactive crates
      const trim = new THREE.Mesh(
        this.sharedBoxGeo,
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.4 })
      );
      trim.scale.setScalar(1.02);
      mesh.add(trim);
    }

    this.scene.add(mesh);

    const entry: DynamicBodyEntry = {
      body,
      collider,
      mesh,
      halfExtents: halfExtents.clone(),
      isCrate,
      hp: isCrate ? 55 : 999,
      colorHex,
      age: 0,
      maxAge
    };
    this.dynamicBodies.push(entry);
    return entry;
  }

  private shatterPillar(p: DestructiblePillar, blastOrigin: THREE.Vector3, strength: number): void {
    if (p.destroyed) return;
    p.destroyed = true;

    // Remove intact pillar mesh & static collision from both Three.js and MobaMapBuilder
    this.scene.remove(p.mesh);
    const rayIdx = this.mapBuilder.raycastObstacles.indexOf(p.mesh);
    if (rayIdx !== -1) this.mapBuilder.raycastObstacles.splice(rayIdx, 1);
    const colIdx = this.mapBuilder.colliders.indexOf(p.colliderBox);
    if (colIdx !== -1) this.mapBuilder.colliders.splice(colIdx, 1);

    if (this.world && p.staticBody) {
      this.world.removeRigidBody(p.staticBody);
      p.staticBody = null;
      p.staticCollider = null;
    }

    // Spawn 12 tumbling concrete rubble chunks across the pillar's volume
    const cols = 2;
    const rows = 4;
    const chunkW = p.size.x / cols;
    const chunkH = p.size.y / rows;
    const chunkD = p.size.z / 2;

    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        for (let rz = 0; rz < 2; rz++) {
          if (Math.random() < 0.25) continue; // Keep ~12 juicy chunks per pillar
          const cx = p.center.x + (rx - 0.5) * chunkW;
          const cy = 0.45 + ry * chunkH + chunkH * 0.4;
          const cz = p.center.z + (rz - 0.5) * chunkD;
          const chunkPos = new THREE.Vector3(cx, cy, cz);

          const away = chunkPos.clone().sub(blastOrigin);
          if (away.lengthSq() < 0.05) {
            away.set(Math.random() - 0.5, 0.6, Math.random() - 0.5);
          }
          away.normalize();
          const spd = Math.min(28, 6 + strength * 0.32 + Math.random() * 6);
          const linVel = away.multiplyScalar(spd);
          linVel.y += 3.5 + Math.random() * 5.5;

          const angVel = new THREE.Vector3(
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 14
          );

          const useAccent = ry === 2 && Math.random() < 0.35;
          this.spawnDynamicBox(
            chunkPos,
            new THREE.Vector3(
              chunkW * (0.34 + Math.random() * 0.14),
              chunkH * (0.34 + Math.random() * 0.14),
              chunkD * (0.34 + Math.random() * 0.14)
            ),
            useAccent ? p.accentHex : p.colorHex,
            false,
            11.0 + Math.random() * 3.0,
            linVel,
            angVel,
            Math.random() < 0.45
          );
        }
      }
    }
  }

  /**
   * Blasts nearby dynamic rigid bodies outward with real Rapier impulses & angular spin,
   * and damages/shatters destructible pillars & crates in radius.
   */
  public applyRadialImpulse(
    center: THREE.Vector3,
    radius: number,
    strength: number,
    upwardLift = 0.55,
    shatterDamage = 65
  ): void {
    // 1. Damage / shatter destructible concrete pillars in blast radius
    if (shatterDamage > 0) {
      for (const p of this.pillars) {
        if (p.destroyed) continue;
        const d = p.center.distanceTo(center);
        if (d <= radius + Math.max(p.size.x, p.size.z) * 0.65) {
          const falloff = 1 - Math.min(0.55, (d / (radius + 2)) * 0.55);
          p.hp -= shatterDamage * falloff;
          if (p.hp <= 0) {
            this.shatterPillar(p, center, strength);
          } else {
            // Visual crack flash on damaged pillar
            const mat = p.mesh.material as THREE.MeshStandardMaterial;
            mat.emissive.setHex(0xf97316);
            mat.emissiveIntensity = 0.35 * (1 - p.hp / p.maxHp);
          }
        }
      }
    }

    if (!this.world) return;

    // 2. Apply real 3D impulses & angular torque to all dynamic crates & rubble
    for (let i = this.dynamicBodies.length - 1; i >= 0; i--) {
      const entry = this.dynamicBodies[i];
      const t = entry.body.translation();
      const bodyPos = new THREE.Vector3(t.x, t.y, t.z);
      const delta = bodyPos.sub(center);
      const dist = delta.length();
      if (dist > radius) continue;

      const falloff = Math.max(0.18, 1 - dist / radius);

      // Shatter heavily hit crates into flying splinters
      if (entry.isCrate && shatterDamage >= 45 && dist <= radius * 0.72) {
        entry.hp -= shatterDamage * falloff;
        if (entry.hp <= 0) {
          const pos = new THREE.Vector3(t.x, t.y, t.z);
          const col = entry.colorHex;
          this.removeDynamicAt(i);
          this.spawnRubbleBurst(pos, 5, col, Math.min(20, 7 + strength * 0.25));
          continue;
        }
      }

      const dir = dist > 0.05 ? delta.divideScalar(dist) : new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
      dir.y = Math.max(dir.y, upwardLift);
      dir.normalize();

      const mass = Math.max(0.5, entry.body.mass());
      const impMag = strength * falloff * Math.min(2.2, mass * 0.55);
      entry.body.wakeUp();
      entry.body.applyImpulse(
        { x: dir.x * impMag, y: dir.y * impMag, z: dir.z * impMag },
        true
      );
      entry.body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * impMag * 0.45,
          y: (Math.random() - 0.5) * impMag * 0.45,
          z: (Math.random() - 0.5) * impMag * 0.45
        },
        true
      );
    }
  }

  /**
   * 3D Vortex Suction (used by Gojo's Lapse Blue):
   * Pulls crates and rubble chunks in full 3D (including upwards toward sky-aimed Blue orbs!)
   * with orbital swirl and rips loose debris from nearby destructible pillars.
   */
  public applyVortexForce(
    center: THREE.Vector3,
    radius: number,
    pullStrength: number,
    swirlStrength: number,
    dt: number
  ): void {
    if (!this.world) return;

    // Stress nearby destructible pillars inside Blue's gravity well
    for (const p of this.pillars) {
      if (p.destroyed) continue;
      const horizDist = Math.hypot(p.center.x - center.x, p.center.z - center.z);
      if (horizDist <= radius + 1.2) {
        p.hp -= 55 * dt;
        if (p.hp <= 0) {
          this.shatterPillar(p, center, 10);
        }
      }
    }

    for (const entry of this.dynamicBodies) {
      const t = entry.body.translation();
      const dx = center.x - t.x;
      const dy = center.y - t.y;
      const dz = center.z - t.z;
      const horizDist = Math.hypot(dx, dz);
      const dist3d = Math.hypot(dx, dy, dz);
      if (horizDist > radius + 1.5 || dist3d < 0.35) continue;

      const inv3d = 1 / dist3d;
      let fx = dx * inv3d * pullStrength;
      let fy = dy * inv3d * pullStrength + 10.0; // Counteract gravity so debris floats & lifts skyward!
      let fz = dz * inv3d * pullStrength;

      if (horizDist > 0.2) {
        const nx = dx / horizDist;
        const nz = dz / horizDist;
        fx += -nz * swirlStrength;
        fz += nx * swirlStrength;
      }

      const mass = Math.max(0.5, entry.body.mass());
      const impScale = dt * Math.min(2.4, mass);
      entry.body.wakeUp();
      entry.body.applyImpulse(
        { x: fx * impScale, y: fy * impScale, z: fz * impScale },
        true
      );
      entry.body.applyTorqueImpulse(
        { x: 0.4 * dt * mass, y: 1.8 * dt * mass, z: 0.4 * dt * mass },
        true
      );
    }
  }

  /**
   * Spawns instant tumbling Rapier3D rubble/rock debris (e.g. Maximum: Meteor crater, wall impacts).
   */
  public spawnRubbleBurst(
    center: THREE.Vector3,
    count: number,
    colorHex: number,
    speed = 14
  ): void {
    if (!this.world) return;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.9;
      const pos = new THREE.Vector3(
        center.x + Math.cos(theta) * r,
        Math.max(0.4, center.y + Math.random() * 0.8),
        center.z + Math.sin(theta) * r
      );
      const linVel = new THREE.Vector3(
        Math.cos(theta) * speed * (0.45 + Math.random() * 0.75),
        speed * (0.4 + Math.random() * 0.6),
        Math.sin(theta) * speed * (0.45 + Math.random() * 0.75)
      );
      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      );
      const sz = 0.16 + Math.random() * 0.24;
      this.spawnDynamicBox(
        pos,
        new THREE.Vector3(sz, sz * (0.7 + Math.random() * 0.5), sz),
        colorHex,
        false,
        7.0 + Math.random() * 3.5,
        linVel,
        angVel,
        true
      );
    }
  }

  /**
   * Nudges any crate/rubble touched by a moving character so you can kick debris & bump crates!
   */
  public nudgeBodiesAroundPoint(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    radius: number,
    dt: number
  ): void {
    if (!this.world) return;
    const speed = Math.hypot(vel.x, vel.z);
    if (speed < 0.8) return;

    for (const entry of this.dynamicBodies) {
      const t = entry.body.translation();
      const dx = t.x - pos.x;
      const dy = t.y - (pos.y + 0.8);
      const dz = t.z - pos.z;
      if (Math.abs(dy) > 1.4) continue;
      const d = Math.hypot(dx, dz);
      const minD = radius + Math.max(entry.halfExtents.x, entry.halfExtents.z);
      if (d < minD && d > 0.01) {
        const push = Math.min(18, speed * 0.85) * dt * Math.max(0.6, entry.body.mass());
        entry.body.wakeUp();
        entry.body.applyImpulse(
          { x: (dx / d) * push, y: push * 0.22, z: (dz / d) * push },
          true
        );
      }
    }
  }

  /**
   * Steps the Rapier3D simulation with a stable fixed timestep and syncs Three.js transforms.
   */
  public step(dt: number): void {
    if (!this.world) return;
    const FIXED_STEP = 1 / 60;
    this.accumulator = Math.min(0.1, this.accumulator + dt);
    while (this.accumulator >= FIXED_STEP) {
      this.world.step();
      this.accumulator -= FIXED_STEP;
    }

    for (let i = this.dynamicBodies.length - 1; i >= 0; i--) {
      const entry = this.dynamicBodies[i];
      entry.age += dt;
      const t = entry.body.translation();

      // Clean up expired transient rubble or anything that fell out of bounds
      if (t.y < -15 || (entry.maxAge !== null && entry.age >= entry.maxAge)) {
        this.removeDynamicAt(i);
        continue;
      }

      const r = entry.body.rotation();
      entry.mesh.position.set(t.x, t.y, t.z);
      entry.mesh.quaternion.set(r.x, r.y, r.z, r.w);

      // Smoothly shrink transient rubble during its final 1.2s
      if (entry.maxAge !== null && entry.maxAge - entry.age < 1.2) {
        const shrink = Math.max(0.01, (entry.maxAge - entry.age) / 1.2);
        entry.mesh.scale.set(
          entry.halfExtents.x * 2 * shrink,
          entry.halfExtents.y * 2 * shrink,
          entry.halfExtents.z * 2 * shrink
        );
      }
    }
  }

  private removeDynamicAt(idx: number): void {
    const entry = this.dynamicBodies[idx];
    this.scene.remove(entry.mesh);
    (entry.mesh.material as THREE.Material).dispose();
    if (this.world) {
      this.world.removeRigidBody(entry.body);
    }
    this.dynamicBodies.splice(idx, 1);
  }

  public dispose(): void {
    this.destroyed = true;
    for (let i = this.dynamicBodies.length - 1; i >= 0; i--) {
      this.removeDynamicAt(i);
    }
    for (const p of this.pillars) {
      if (!p.destroyed) {
        this.scene.remove(p.mesh);
      }
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.pillars.length = 0;
    this.sharedBoxGeo.dispose();
    this.sharedRockGeo.dispose();
    if (this.world) {
      this.world.free();
      this.world = null;
    }
  }
}

