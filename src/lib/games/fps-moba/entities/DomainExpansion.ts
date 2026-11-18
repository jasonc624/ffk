import * as THREE from 'three';
import type { MobaTeam } from '../types';
import type { MobaUnit } from '../FpsMobaEngine';
import {
  createUnlimitedVoidDomainVfx,
  type UnlimitedVoidDomainController
} from '../vfx/CursedShaderVfx';

export interface DomainExpansionConfig {
  id?: string;
  name: string;
  casterId: string;
  casterName: string;
  casterTeam: MobaTeam;
  center: THREE.Vector3;
  radius: number;
  durationMs: number;
  color: string;
  barrierHp?: number;
  barrierMaxHp?: number;
  isDestructable?: boolean;
  isGojoDomain?: boolean;
  isRally?: boolean;
  scene: THREE.Scene;
  initialUnits: MobaUnit[];
  playerPos: THREE.Vector3;
  isPlayerAlive: boolean;
}

export interface BarrierRaycastHit {
  hit: boolean;
  point: THREE.Vector3;
  distance: number;
  normal: THREE.Vector3;
}

export interface BarrierDamageResult {
  currentHp: number;
  maxHp: number;
  absorbed: number;
  shattered: boolean;
}

/**
 * Encapsulates an active Domain Expansion instance (Unlimited Void, Rallying Banner, etc.).
 * Traps everyone within radius upon manifestation, holds a destructible barrier shell with HP,
 * and collapses when barrier HP reaches zero or duration expires.
 */
export class DomainExpansion {
  id: string;
  name: string;
  casterId: string;
  casterName: string;
  casterTeam: MobaTeam;
  center: THREE.Vector3;
  radius: number;
  hp: number;
  maxHp: number;
  isDestructable: boolean;
  isGojoDomain: boolean;
  isRally: boolean;
  color: string;

  ageSec: number = 0;
  remainingSec: number;
  tickTimerSec: number = 0.95;
  trappedUnitIds: Set<string> = new Set();
  isPlayerTrapped: boolean = false;
  purpleTriggered: boolean = false;
  isCollapsed: boolean = false;

  domeMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  voidVfx?: UnlimitedVoidDomainController;
  audio?: THREE.PositionalAudio | THREE.Audio;

  constructor(config: DomainExpansionConfig) {
    this.id = config.id ?? `domain_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.name = config.name;
    this.casterId = config.casterId;
    this.casterName = config.casterName;
    this.casterTeam = config.casterTeam;
    this.center = config.center.clone();
    this.radius = config.radius;
    this.maxHp = config.barrierMaxHp ?? 1200;
    this.hp = config.barrierHp ?? this.maxHp;
    this.isDestructable = config.isDestructable ?? true;
    this.isGojoDomain = config.isGojoDomain ?? false;
    this.isRally = config.isRally ?? false;
    this.color = config.color;
    this.remainingSec = config.durationMs / 1000;

    // ── 1. Trap EVERYONE inside the domain perimeter upon expansion ──
    if (!this.isRally) {
      for (const u of config.initialUnits) {
        if (!u.alive) continue;
        const dist = Math.hypot(u.group.position.x - this.center.x, u.group.position.z - this.center.z);
        if (dist <= this.radius) {
          this.trappedUnitIds.add(u.id);
        }
      }
      if (config.isPlayerAlive) {
        const distPlayer = Math.hypot(config.playerPos.x - this.center.x, config.playerPos.z - this.center.z);
        if (distPlayer <= this.radius) {
          this.isPlayerTrapped = true;
          this.trappedUnitIds.add('player');
        }
      }
    }

    // ── 2. Construct Domain Barrier Geometry ──
    const domeGeo = new THREE.IcosahedronGeometry(this.radius, 3);
    const domeMat = new THREE.MeshBasicMaterial({
      color: this.color,
      wireframe: true,
      transparent: true,
      opacity: this.isRally ? 0.22 : 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.domeMesh = new THREE.Mesh(domeGeo, domeMat);
    this.domeMesh.position.copy(this.center);
    this.domeMesh.visible = !this.isGojoDomain;
    config.scene.add(this.domeMesh);

    const ringGeo = new THREE.RingGeometry(this.radius * 0.94, this.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.isGojoDomain ? '#a855f7' : this.color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(this.center.x, 0.08, this.center.z);
    config.scene.add(this.ringMesh);

    // ── 3. Unlimited Void specific volumetric shader VFX ──
    if (this.isGojoDomain) {
      this.voidVfx = createUnlimitedVoidDomainVfx(this.center, this.radius);
      config.scene.add(this.voidVfx.root);
    }
  }

  get isDestructible(): boolean {
    return this.isDestructable;
  }

  set isDestructible(val: boolean) {
    this.isDestructable = val;
  }

  isTrapped(unitIdOrPlayer: string): boolean {
    if (this.isRally) return false;
    if (unitIdOrPlayer === 'player') return this.isPlayerTrapped;
    return this.trappedUnitIds.has(unitIdOrPlayer);
  }

  isEnemy(team: MobaTeam): boolean {
    return team !== this.casterTeam;
  }

  /** Returns 0.10 (90% slow) for trapped enemy units, or 1.0 otherwise. */
  getSlowMultiplier(unitIdOrPlayer: string, team: MobaTeam): number {
    if (this.isRally || !this.isEnemy(team)) return 1.0;
    return this.isTrapped(unitIdOrPlayer) ? 0.1 : 1.0;
  }

  /**
   * Enforces the Domain barrier boundary:
   * - Trapped entities cannot exit the perimeter (clamped inside).
   * - Outsider entities cannot cross inside (clamped outside).
   */
  clampPosition(
    pos: { x: number; z: number },
    entityRadius: number,
    trapped: boolean
  ): { x: number; z: number; collided: boolean } {
    if (this.isRally) return { x: pos.x, z: pos.z, collided: false };

    const dx = pos.x - this.center.x;
    const dz = pos.z - this.center.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.00001) return { x: pos.x, z: pos.z, collided: false };

    if (trapped) {
      // Must stay inside
      const maxInner = Math.max(0.5, this.radius - entityRadius - 0.15);
      if (dist > maxInner) {
        return {
          x: this.center.x + (dx / dist) * maxInner,
          z: this.center.z + (dz / dist) * maxInner,
          collided: true
        };
      }
    } else {
      // Must stay outside
      const minOuter = this.radius + entityRadius + 0.1;
      if (dist < minOuter) {
        return {
          x: this.center.x + (dx / dist) * minOuter,
          z: this.center.z + (dz / dist) * minOuter,
          collided: true
        };
      }
    }
    return { x: pos.x, z: pos.z, collided: false };
  }

  /**
   * Analytical ray-sphere intersection test against the barrier shell from the outside.
   * Attacks originating inside the domain pass through to inner targets without barrier collision.
   */
  raycastBarrier(
    rayOrigin: THREE.Vector3,
    rayDir: THREE.Vector3,
    maxDistance: number
  ): BarrierRaycastHit | null {
    if (this.isCollapsed || this.isRally) return null;

    const distOriginToCenter = rayOrigin.distanceTo(this.center);
    // Attacker is inside the domain shell; inside attacks do not hit the outer barrier shell
    if (distOriginToCenter < this.radius - 0.25) {
      return null;
    }

    // Analytical sphere intersection
    const L = this.center.clone().sub(rayOrigin);
    const tca = L.dot(rayDir);
    // Ray points away from the sphere
    if (tca < 0) return null;

    const d2 = L.lengthSq() - tca * tca;
    const r2 = this.radius * this.radius;
    if (d2 > r2) return null;

    const thc = Math.sqrt(r2 - d2);
    const t0 = tca - thc;
    if (t0 < 0 || t0 > maxDistance) return null;

    const hitPoint = rayOrigin.clone().addScaledVector(rayDir, t0);
    const normal = hitPoint.clone().sub(this.center).normalize();

    return {
      hit: true,
      point: hitPoint,
      distance: t0,
      normal
    };
  }

  /**
   * Applies damage directly to the barrier HP from an external attack.
   * When HP reaches zero, the barrier shatters.
   */
  takeBarrierDamage(amount: number): BarrierDamageResult {
    if (!this.isDestructable || this.isCollapsed || amount <= 0) {
      return {
        currentHp: this.hp,
        maxHp: this.maxHp,
        absorbed: 0,
        shattered: false
      };
    }

    const absorbed = Math.min(this.hp, amount);
    this.hp = Math.max(0, this.hp - absorbed);
    const shattered = this.hp <= 0;
    if (shattered) {
      this.isCollapsed = true;
    }

    return {
      currentHp: this.hp,
      maxHp: this.maxHp,
      absorbed,
      shattered
    };
  }

  /**
   * Updates domain lifetime, rotations, vfx, and ticks.
   */
  update(
    dt: number,
    elapsed: number,
    cameraPos: THREE.Vector3
  ): { shouldTickDamage: boolean; isExpired: boolean } {
    if (this.isCollapsed) {
      return { shouldTickDamage: false, isExpired: true };
    }

    this.ageSec += dt;
    this.remainingSec -= dt;
    this.tickTimerSec -= dt;

    if (this.voidVfx) {
      this.voidVfx.update(dt, elapsed, this.ageSec, cameraPos);
    }

    this.domeMesh.rotation.y += dt * 0.35;
    this.ringMesh.rotation.z -= dt * 0.6;

    let shouldTick = false;
    if (this.tickTimerSec <= 0) {
      this.tickTimerSec = 0.95;
      shouldTick = true;
    }

    const isExpired = this.remainingSec <= 0 || this.hp <= 0;
    if (isExpired) {
      this.isCollapsed = true;
    }

    return {
      shouldTickDamage: shouldTick,
      isExpired
    };
  }

  cleanup(scene: THREE.Scene) {
    if (this.audio) {
      try {
        this.audio.stop();
        this.audio.disconnect();
      } catch {
        // Ignore audio cleanup errors
      }
      this.audio = undefined;
    }
    scene.remove(this.domeMesh);
    scene.remove(this.ringMesh);
    if (this.voidVfx) {
      scene.remove(this.voidVfx.root);
    }
    this.domeMesh.geometry.dispose();
    this.ringMesh.geometry.dispose();
  }
}

/**
 * Gojo Satoru's Domain Expansion: Unlimited Void.
 */
export class UnlimitedVoidDomain extends DomainExpansion {
  constructor(opts: Omit<DomainExpansionConfig, 'isGojoDomain' | 'name' | 'color'>) {
    super({
      ...opts,
      name: 'Domain Expansion: Unlimited Void',
      color: '#a855f7',
      isGojoDomain: true
    });
  }
}

/**
 * Brigitte's Rallying Banner Ultimate Domain.
 */
export class RallyBannerDomain extends DomainExpansion {
  constructor(opts: Omit<DomainExpansionConfig, 'isRally' | 'name'>) {
    super({
      ...opts,
      name: 'Rally',
      isRally: true
    });
  }
}

