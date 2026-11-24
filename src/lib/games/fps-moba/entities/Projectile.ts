import * as THREE from 'three';
import type { MobaTeam } from '../types';
import type { DomainExpansion } from './DomainExpansion';
import { createCursedEnergyOrb, type CursedOrbController } from '../vfx/CursedShaderVfx';

export type ProjectileKind =
  | 'RED'
  | 'BLUE'
  | 'PURPLE'
  | 'EMBER_INSECT'
  | 'VOLCANO_SEED'
  | 'FIRE_BOLT'
  | 'METEOR'
  | 'SHADOW_KUNAI'
  | 'GENERIC';

/** Structural unit shape required by battlefield projectiles (avoids coupling to engine/class hierarchies). */
export interface ProjectileUnit {
  id: string;
  name: string;
  team: MobaTeam;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  moveSpeed: number;
  alive: boolean;
  stunTimer?: number;
  verticalVel?: number;
  pullActiveTimer?: number;
}

/**
 * World & callback context passed to projectiles each tick, keeping projectile
 * subclasses decoupled from FpsMobaEngine internals.
 */
export interface ProjectileContext {
  elapsed: number;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  units: ProjectileUnit[];
  activeDomains: DomainExpansion[];
  raycastObstacles: THREE.Object3D[];
  playerPos: THREE.Vector3;
  playerAlive: boolean;
  playerTeam: MobaTeam;
  resolveHorizontalCollision: (
    nextX: number,
    nextZ: number,
    radius: number,
    y: number
  ) => { x: number; z: number };
  getFloorHeight: (x: number, z: number, currentY: number) => number;
  clampUnitToDomainBarrier: (unit: ProjectileUnit) => void;
  damageUnit: (
    unit: ProjectileUnit,
    amount: number,
    isCrit: boolean,
    sourceName: string,
    hitPos: THREE.Vector3,
    killVerb?: string
  ) => void;
  damageDomainBarrier: (
    dom: DomainExpansion,
    damage: number,
    hitPoint: THREE.Vector3,
    attackerName: string
  ) => void;
  damageTargetsAroundNpc: (
    caster: ProjectileUnit,
    center: THREE.Vector3,
    radius: number,
    damage: number,
    sourceName: string
  ) => void;
  applyDamageToPlayer: (damage: number, sourceName: string, attackerTeam: MobaTeam) => void;
  knockbackUnitWithWallSlam: (
    unit: ProjectileUnit,
    dir: THREE.Vector3,
    dist: number,
    wallSlamBonusDamage: number
  ) => void;
  grantAbilityPassive: (didHit: boolean) => void;
  spawnImpactRing: (pos: THREE.Vector3, colorHex: string, maxRadius: number) => void;
  spawnCursedBurst: (
    pos: THREE.Vector3,
    variant: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW' | 'SKY',
    radius?: number,
    count?: number
  ) => void;
  playSpatialSound: (
    url: string,
    target: THREE.Object3D,
    opts?: { volume?: number; refDistance?: number; maxDistance?: number; rolloff?: number }
  ) => void;
  playGlobalSound: (url: string, opts?: { volume?: number }) => void;
  onPlayerPurpleLaunch?: () => void;
  onNpcPurpleLaunch?: (casterId: string) => void;
  onPullPlayerVertical?: () => void;
  onVolcanoPlant?: (
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    team: MobaTeam,
    casterId: string,
    damage: number,
    radius: number,
    durationMs: number
  ) => void;
  applyPhysicsImpulse?: (
    center: THREE.Vector3,
    radius: number,
    strength: number,
    upwardLift?: number,
    shatterDamage?: number
  ) => void;
  applyPhysicsVortex?: (
    center: THREE.Vector3,
    radius: number,
    pullStrength: number,
    swirlStrength: number,
    dt: number
  ) => void;
  spawnPhysicsDebris?: (
    center: THREE.Vector3,
    count: number,
    colorHex: number,
    speed?: number
  ) => void;
}

export interface ProjectileInit {
  id: string;
  kind: ProjectileKind;
  team: MobaTeam;
  casterId: string;
  casterName: string;
  caster?: ProjectileUnit | null;
  mesh: THREE.Object3D;
  velocity?: THREE.Vector3;
  radius: number;
  maxAge: number;
  canCollideWithOrbs?: boolean;
  piercing?: boolean;
  minFloorY?: number | null;
  shrinkFactor?: number;
}

let projectileCounter = 0;

export function nextProjectileId(prefix = 'proj'): string {
  projectileCounter += 1;
  return `${prefix}-${projectileCounter}`;
}

/**
 * Abstract base class for all 3D battlefield projectiles (Reversal Red, Lapse Blue,
 * Hollow Purple, and future hero projectiles).
 */
export abstract class Projectile {
  readonly id: string;
  readonly kind: ProjectileKind;
  team: MobaTeam;
  casterId: string;
  casterName: string;
  caster: ProjectileUnit | null;
  readonly mesh: THREE.Object3D;
  readonly velocity: THREE.Vector3;
  readonly radius: number;
  age: number = 0;
  maxAge: number;
  alive: boolean = true;
  finished: boolean = false;
  canCollideWithOrbs: boolean;
  piercing: boolean;
  minFloorY: number | null;

  protected readonly stepRay = new THREE.Raycaster();
  protected shrinkFactor: number;
  private shrinkElapsed = 0;

  constructor(opts: ProjectileInit) {
    this.id = opts.id;
    this.kind = opts.kind;
    this.team = opts.team;
    this.casterId = opts.casterId;
    this.casterName = opts.casterName;
    this.caster = opts.caster ?? null;
    this.mesh = opts.mesh;
    this.velocity = opts.velocity ? opts.velocity.clone() : new THREE.Vector3();
    this.radius = opts.radius;
    this.maxAge = opts.maxAge;
    this.canCollideWithOrbs = opts.canCollideWithOrbs ?? false;
    this.piercing = opts.piercing ?? false;
    this.minFloorY = opts.minFloorY === undefined ? 0.25 : opts.minFloorY;
    this.shrinkFactor = opts.shrinkFactor ?? 0.68;
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  /**
   * Redirects an in-flight projectile (e.g. Uro Takako's Sky Veil Deflect).
   * Flips ownership to the deflecting team/caster and redirects velocity along newDir.
   */
  public deflect(
    newTeam: MobaTeam,
    newDir: THREE.Vector3,
    newCasterId: string,
    newCasterName: string,
    speedMultiplier = 1.3
  ): boolean {
    if (!this.alive || this.kind === 'PURPLE' || this.kind === 'METEOR') return false;
    const speed = Math.max(24, this.velocity.length() * speedMultiplier);
    this.team = newTeam;
    this.casterId = newCasterId;
    this.casterName = newCasterName;
    this.caster = null;
    this.velocity.copy(newDir).normalize().multiplyScalar(speed);
    this.age = 0;
    return true;
  }

  /**
   * Advances physics, collision detection, and visual updates each frame.
   */
  public update(dt: number, ctx: ProjectileContext): void {
    if (!this.alive) {
      this.shrinkElapsed += dt;
      this.mesh.scale.multiplyScalar(this.shrinkFactor);
      if (this.shrinkElapsed >= 0.35) {
        this.finished = true;
      }
      return;
    }

    this.age += dt;
    this.updateVisuals(dt, ctx);
    if (!this.alive) return;

    this.stepPhysics(dt, ctx);
    if (!this.alive) return;

    if (this.age >= this.maxAge) {
      this.onExpire(ctx);
    }
  }

  /**
   * Default linear-flight & collision pass against domain barriers, units, player, and world obstacles.
   */
  protected stepPhysics(dt: number, ctx: ProjectileContext): void {
    const speed = this.velocity.length();
    if (speed <= 0.0001) return;

    const prevPos = this.mesh.position.clone();
    const dir = this.velocity.clone().divideScalar(speed);
    const stepDist = speed * dt;
    this.mesh.position.addScaledVector(this.velocity, dt);

    // 1. Check collision with domain barriers from outside
    for (const dom of ctx.activeDomains) {
      const bHit = dom.raycastBarrier(prevPos, dir, stepDist + this.radius);
      if (bHit) {
        this.onHitBarrier(dom, bHit.point, ctx);
        if (!this.alive) return;
      }
    }

    // 2. Check proximity with enemy units
    for (const u of ctx.units) {
      if (!u.alive) continue;
      if (this.caster ? u === this.caster : u.team === this.team) continue;
      const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
      if (unitCenter.distanceTo(this.mesh.position) <= u.radius + this.radius + 0.35) {
        this.onHitUnit(u, this.mesh.position.clone(), ctx);
        if (!this.alive) return;
      }
    }

    // 3. Check proximity with player (if fired by an enemy NPC)
    if (this.caster && ctx.playerAlive && this.team !== ctx.playerTeam) {
      const playerCenter = ctx.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
      if (this.mesh.position.distanceTo(playerCenter) <= this.radius + 0.95) {
        this.onHitPlayer(this.mesh.position.clone(), ctx);
        if (!this.alive) return;
      }
    }

    // 4. World obstacle & floor collision (skipped for piercing projectiles unless overridden)
    if (!this.piercing) {
      this.stepRay.set(prevPos, dir);
      this.stepRay.near = 0;
      this.stepRay.far = stepDist + this.radius;
      const wallHits = this.stepRay.intersectObjects(ctx.raycastObstacles, false);
      if (wallHits.length > 0) {
        this.onHitObstacle(wallHits[0].point, ctx);
        return;
      }
    }

    if (this.minFloorY !== null && this.mesh.position.y <= this.minFloorY) {
      if (this.piercing) {
        this.mesh.position.y = this.minFloorY;
      } else {
        this.onHitObstacle(this.mesh.position.clone(), ctx);
      }
    }
  }

  /**
   * Transitions the projectile into its brief post-impact shrink-out before scene removal.
   */
  public kill(shrinkFactor = this.shrinkFactor): void {
    this.alive = false;
    this.shrinkFactor = shrinkFactor;
    this.canCollideWithOrbs = false;
  }

  /**
   * Called by the engine when two orb-collidable projectiles intersect in midair.
   */
  public onCollideWithProjectile(
    _other: Projectile,
    _midpoint: THREE.Vector3,
    _ctx: ProjectileContext
  ): void {}

  /**
   * Cleans up any extra scene objects owned by the projectile (e.g. ground indicators).
   */
  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }

  protected abstract updateVisuals(dt: number, ctx: ProjectileContext): void;

  protected onHitBarrier(
    _dom: DomainExpansion,
    point: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    this.onHitObstacle(point, ctx);
  }

  protected onHitUnit(
    _unit: ProjectileUnit,
    impactPos: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    this.onHitObstacle(impactPos, ctx);
  }

  protected onHitPlayer(impactPos: THREE.Vector3, ctx: ProjectileContext): void {
    this.onHitObstacle(impactPos, ctx);
  }

  protected onHitObstacle(_point: THREE.Vector3, _ctx: ProjectileContext): void {
    this.kill();
  }

  protected onExpire(_ctx: ProjectileContext): void {
    this.kill();
  }
}

/**
 * Gojo's Reversal Red volumetric plasma orb (shared by player M1 and NPC Gojo).
 */
export class ReversalRedProjectile extends Projectile {
  private readonly orb: CursedOrbController;
  private readonly chargeRatio: number;
  private readonly damage: number;
  private readonly knockback: number;
  private readonly splashRadius: number;
  private readonly flatShotDir: THREE.Vector3;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    chargeRatio: number;
    damage: number;
    knockback: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
    caster?: ProjectileUnit | null;
    maxFlightSec?: number;
  }) {
    const orbRadius = 0.28 + opts.chargeRatio * 0.42;
    const speed = (opts.caster ? 26 : 32) + opts.chargeRatio * 12;
    const orb = createCursedEnergyOrb({ variant: 'RED', radius: orbRadius });
    orb.group.position.copy(opts.startPos);

    super({
      id: nextProjectileId('red'),
      kind: 'RED',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      caster: opts.caster,
      mesh: orb.group,
      velocity: opts.forward.clone().normalize().multiplyScalar(speed),
      radius: orbRadius,
      maxAge: opts.maxFlightSec ?? (opts.caster ? 2.1 : 2.4),
      canCollideWithOrbs: true,
      shrinkFactor: 0.65
    });

    this.orb = orb;
    this.chargeRatio = opts.chargeRatio;
    this.damage = opts.damage;
    this.knockback = opts.knockback;
    this.splashRadius = (opts.caster ? 2.0 : 1.9) + opts.chargeRatio * (opts.caster ? 2.4 : 2.6);
    this.flatShotDir = new THREE.Vector3(opts.forward.x, 0, opts.forward.z).normalize();
  }

  protected updateVisuals(dt: number, ctx: ProjectileContext): void {
    this.orb.update(dt, ctx.elapsed);
  }

  private detonate(
    impactPos: THREE.Vector3,
    ctx: ProjectileContext,
    directUnit?: ProjectileUnit
  ): void {
    if (!this.alive) return;
    this.kill(0.65);

    ctx.spawnImpactRing(impactPos, '#ff2a55', this.splashRadius);
    ctx.spawnCursedBurst(
      impactPos,
      'RED',
      (this.caster ? 1.3 : 1.4) + this.chargeRatio * (this.caster ? 1.2 : 1.4),
      Math.round((this.caster ? 48 : 56) + this.chargeRatio * (this.caster ? 36 : 44))
    );
    ctx.applyPhysicsImpulse?.(
      impactPos,
      this.splashRadius + 4.5,
      20 + this.chargeRatio * 44,
      0.55,
      48 + this.chargeRatio * 75
    );

    if (this.caster) {
      ctx.damageTargetsAroundNpc(
        this.caster,
        impactPos,
        this.splashRadius,
        this.damage,
        'Reversal Red'
      );
      return;
    }

    if (directUnit && directUnit.alive) {
      ctx.damageUnit(directUnit, this.damage, this.chargeRatio >= 0.75, 'Reversal Red', impactPos);
      if (this.knockback > 0 && directUnit.moveSpeed > 0 && directUnit.alive) {
        ctx.knockbackUnitWithWallSlam(
          directUnit,
          this.flatShotDir,
          this.knockback,
          Math.round(22 + this.chargeRatio * 28)
        );
      }
    }

    for (const u of ctx.units) {
      if (!u.alive || u.team === this.team || u === directUnit) continue;
      const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
      if (unitCenter.distanceTo(impactPos) <= this.splashRadius + u.radius) {
        ctx.damageUnit(
          u,
          Math.round(this.damage * 0.8),
          this.chargeRatio >= 0.85,
          'Reversal Red',
          unitCenter
        );
        if (this.knockback > 0 && u.moveSpeed > 0 && u.alive) {
          const pushDir = u.group.position.clone().sub(impactPos);
          pushDir.y = 0;
          if (pushDir.lengthSq() < 0.01) pushDir.copy(this.flatShotDir);
          else pushDir.normalize();
          ctx.knockbackUnitWithWallSlam(
            u,
            pushDir,
            this.knockback * 0.85,
            Math.round(18 + this.chargeRatio * 22)
          );
        }
      }
    }
  }

  protected override onHitBarrier(
    dom: DomainExpansion,
    point: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    this.detonate(point, ctx);
    ctx.damageDomainBarrier(dom, this.damage, point, this.casterName);
  }

  protected override onHitUnit(
    unit: ProjectileUnit,
    impactPos: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    if (this.caster) {
      this.detonate(impactPos, ctx);
    } else {
      this.detonate(impactPos, ctx, unit);
    }
  }

  protected override onHitPlayer(impactPos: THREE.Vector3, ctx: ProjectileContext): void {
    this.detonate(impactPos, ctx);
  }

  protected override onHitObstacle(point: THREE.Vector3, ctx: ProjectileContext): void {
    this.detonate(point, ctx);
  }

  protected override onExpire(ctx: ProjectileContext): void {
    this.detonate(this.mesh.position.clone(), ctx);
  }

  public override onCollideWithProjectile(
    _other: Projectile,
    midpoint: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    this.detonate(midpoint, ctx);
  }
}

/**
 * Gojo's two-stage Lapse Blue Singularity orb:
 * 1st stage flies forward; 2nd stage (manual or auto-trigger) pulls enemies inward and implodes.
 */
export class LapseBlueProjectile extends Projectile {
  private readonly orb: CursedOrbController;
  private readonly pullIndicator: THREE.Group;
  private readonly pullRadius: number;
  private readonly damage: number;
  private readonly abilityName: string;
  private readonly colorHex: string;
  private readonly autoTriggerSec?: number;
  private readonly onCooldownStart: () => void;
  private readonly onClearActiveRef: () => void;
  private readonly placeIndicator: (
    ind: THREE.Group,
    x: number,
    z: number,
    radius: number
  ) => void;

  private phase: 'fly' | 'pull' | 'done' = 'fly';
  private finishedCooldown = false;
  private pullT = 0;
  private flyT = 0;
  private skyDriftY = 0;
  private readonly pullDurationSec = 0.85;
  private captured: Array<{ unit?: ProjectileUnit; isPlayer?: boolean; delay: number; swirlSign: number }> =
    [];

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    pullRadius: number;
    damage: number;
    durationMs: number;
    abilityName: string;
    color: string;
    team: MobaTeam;
    casterId: string;
    casterName: string;
    caster?: ProjectileUnit | null;
    autoTriggerSec?: number;
    pullIndicator: THREE.Group;
    placeIndicator: (ind: THREE.Group, x: number, z: number, radius: number) => void;
    onCooldownStart: () => void;
    onClearActiveRef: () => void;
  }) {
    const blueOrb = createCursedEnergyOrb({ variant: 'BLUE', radius: 0.56 });
    blueOrb.group.position.copy(opts.startPos);

    super({
      id: nextProjectileId('blue'),
      kind: 'BLUE',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      caster: opts.caster,
      mesh: blueOrb.group,
      velocity: opts.forward.clone().normalize().multiplyScalar(14.5),
      radius: 0.56,
      maxAge: opts.durationMs / 1000,
      canCollideWithOrbs: true,
      piercing: true,
      minFloorY: 1.15,
      shrinkFactor: 0.72
    });

    this.orb = blueOrb;
    this.pullIndicator = opts.pullIndicator;
    this.pullRadius = opts.pullRadius;
    this.damage = opts.damage;
    this.abilityName = opts.abilityName;
    this.colorHex = opts.color;
    this.autoTriggerSec = opts.autoTriggerSec;
    this.onCooldownStart = opts.onCooldownStart;
    this.onClearActiveRef = opts.onClearActiveRef;
    this.placeIndicator = opts.placeIndicator;
  }

  private finishAndCooldown(scene: THREE.Scene, removeIndicator = true): void {
    if (this.finishedCooldown) return;
    this.finishedCooldown = true;
    this.onClearActiveRef();
    if (removeIndicator) {
      scene.remove(this.pullIndicator);
    }
    this.onCooldownStart();
  }

  public triggerAttract(ctx: ProjectileContext): void {
    if (this.finishedCooldown || this.phase !== 'fly') return;
    this.finishAndCooldown(ctx.scene, false);
    this.phase = 'pull';
    this.pullT = 0;
    // Retain gentle upward drift if the orb was heading skyward when attraction triggered
    this.skyDriftY = this.velocity.y > 0.25 ? Math.min(4.2, this.velocity.y * 0.28) : 0;
    this.velocity.set(0, 0, 0);
    this.maxAge = this.age + this.pullDurationSec + 0.6;

    const center = this.mesh.position;
    ctx.spawnImpactRing(center, this.colorHex, this.pullRadius * 0.5);

    for (const u of ctx.units) {
      if (!u.alive) continue;
      if (this.caster ? u === this.caster : u.team !== 'red') continue;
      const horizDist = Math.hypot(center.x - u.group.position.x, center.z - u.group.position.z);
      if (horizDist <= this.pullRadius + u.radius) {
        this.captured.push({
          unit: u,
          delay: (horizDist / this.pullRadius) * 0.22,
          swirlSign: Math.random() < 0.5 ? -1 : 1
        });
      }
    }

    if (this.caster && ctx.playerAlive) {
      const pd = Math.hypot(center.x - ctx.playerPos.x, center.z - ctx.playerPos.z);
      if (pd <= this.pullRadius + 0.65) {
        this.captured.push({
          isPlayer: true,
          delay: (pd / this.pullRadius) * 0.22,
          swirlSign: Math.random() < 0.5 ? -1 : 1
        });
      }
    }
  }

  private explode(ctx: ProjectileContext): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    ctx.scene.remove(this.pullIndicator);
    this.kill(0.72);

    const center = this.mesh.position.clone();
    ctx.spawnImpactRing(center, this.colorHex, this.pullRadius * 0.7);
    ctx.spawnImpactRing(center, '#e0f2fe', this.pullRadius * 1.2);
    ctx.spawnCursedBurst(center, 'BLUE', 1.6 + this.pullRadius * 0.25, 84);
    ctx.applyPhysicsImpulse?.(center, this.pullRadius + 3.5, 48, 0.65, 90);

    const blastRadius = Math.max(2.4, this.pullRadius * 0.55);
    const hit = new Set<ProjectileUnit>();
    let playerHit = false;
    for (const c of this.captured) {
      if (c.unit) hit.add(c.unit);
      if (c.isPlayer) playerHit = true;
    }

    if (this.caster) {
      for (const u of ctx.units) {
        if (!u.alive || u === this.caster || hit.has(u)) continue;
        if (Math.hypot(center.x - u.group.position.x, center.z - u.group.position.z) <= blastRadius + u.radius) {
          hit.add(u);
        }
      }
      if (
        !playerHit &&
        ctx.playerAlive &&
        Math.hypot(center.x - ctx.playerPos.x, center.z - ctx.playerPos.z) <= blastRadius + 0.65
      ) {
        playerHit = true;
      }
      for (const u of hit) {
        if (!u.alive) continue;
        u.stunTimer = Math.max(u.stunTimer ?? 0, 0.9);
        u.hp = Math.max(1, u.hp - this.damage);
      }
      if (playerHit && ctx.playerAlive) {
        ctx.applyDamageToPlayer(
          this.damage,
          `${this.casterName} (${this.abilityName})`,
          this.team
        );
      }
      return;
    }

    for (const u of ctx.units) {
      if (!u.alive || u.team !== 'red' || hit.has(u)) continue;
      if (Math.hypot(center.x - u.group.position.x, center.z - u.group.position.z) <= blastRadius + u.radius) {
        hit.add(u);
      }
    }

    let hitCount = 0;
    for (const u of hit) {
      if (!u.alive) continue;
      hitCount++;
      u.stunTimer = Math.max(u.stunTimer ?? 0, 0.9);
      ctx.damageUnit(
        u,
        this.damage,
        false,
        this.abilityName,
        u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.6, 0))
      );
    }
    ctx.grantAbilityPassive(hitCount > 0);
  }

  protected override stepPhysics(dt: number, ctx: ProjectileContext): void {
    if (this.phase === 'pull') {
      this.pullT += dt;
      const k = Math.min(1, this.pullT / this.pullDurationSec);
      if (this.skyDriftY > 0) {
        this.mesh.position.y += this.skyDriftY * Math.max(0, 1 - k * 0.85) * dt;
      }
      this.mesh.scale.setScalar(1 + 0.45 * k * k + Math.sin(this.pullT * 28) * 0.05 * k);
      this.pullIndicator.scale.set(
        this.pullRadius * (1 - 0.7 * k * k),
        1,
        this.pullRadius * (1 - 0.7 * k * k)
      );
      this.pullIndicator.rotation.y += dt * (2 + k * 9);

      const center = this.mesh.position;
      ctx.applyPhysicsVortex?.(
        center,
        this.pullRadius + 2.5,
        42 + 48 * k * k,
        22 * (1 - k * 0.5),
        dt
      );
      for (const c of this.captured) {
        const u = c.unit;
        if (u && !u.alive) continue;
        const t = Math.max(0, this.pullT - c.delay);
        if (t <= 0) continue;
        const kk = Math.min(1, t / (this.pullDurationSec - c.delay));
        const px = u ? u.group.position.x : ctx.playerPos.x;
        const pz = u ? u.group.position.z : ctx.playerPos.z;
        const pr = u ? u.radius : 0.65;
        const py = u ? u.group.position.y : ctx.playerPos.y;
        if (u) {
          u.stunTimer = Math.max(u.stunTimer ?? 0, 0.2);
          u.pullActiveTimer = 0.14;
          u.verticalVel = 0;
        }

        const dx = center.x - px;
        const dz = center.z - pz;
        const targetFeetY = center.y - (u ? u.height * 0.45 : 0.9);
        const dy = targetFeetY - py;
        const horizDist = Math.hypot(dx, dz);
        const dist3d = Math.hypot(dx, dy, dz);
        if (dist3d < 0.45) continue;

        const speed = 1.4 + 15 * kk * kk;
        const inv3d = 1 / dist3d;
        let mx = dx * inv3d * speed * dt;
        let mz = dz * inv3d * speed * dt;
        const my = dy * inv3d * speed * dt;
        if (horizDist > 0.15) {
          const nx = dx / horizDist;
          const nz = dz / horizDist;
          const swirl = 0.38 * (1 - kk) * c.swirlSign * Math.min(1, horizDist / 1.5);
          mx += -nz * swirl * speed * dt;
          mz += nx * swirl * speed * dt;
        }
        const resolved = ctx.resolveHorizontalCollision(px + mx, pz + mz, pr, py);
        const floorY = ctx.getFloorHeight(resolved.x, resolved.z, py);
        const nextY = Math.max(floorY, py + my);

        if (u) {
          u.group.position.set(resolved.x, nextY, resolved.z);
          ctx.clampUnitToDomainBarrier(u);
        } else {
          ctx.playerPos.set(resolved.x, nextY, resolved.z);
          ctx.onPullPlayerVertical?.();
        }
      }

      if (this.pullT >= this.pullDurationSec) {
        this.explode(ctx);
      }
      return;
    }

    if (this.phase !== 'fly') return;

    this.mesh.position.addScaledVector(this.velocity, dt);
    if (this.mesh.position.y < 1.15) this.mesh.position.y = 1.15;
    this.placeIndicator(
      this.pullIndicator,
      this.mesh.position.x,
      this.mesh.position.z,
      this.pullRadius
    );

    this.flyT += dt;
    if (this.autoTriggerSec !== undefined && this.flyT >= this.autoTriggerSec) {
      this.triggerAttract(ctx);
    }
  }

  protected updateVisuals(dt: number, ctx: ProjectileContext): void {
    this.orb.update(dt, ctx.elapsed);
  }

  protected override onExpire(ctx: ProjectileContext): void {
    if (this.phase === 'fly') {
      ctx.spawnCursedBurst(this.mesh.position.clone(), 'BLUE', 1.25, 48);
      this.finishAndCooldown(ctx.scene, true);
      this.kill(0.72);
    } else if (this.phase === 'pull') {
      this.explode(ctx);
    }
  }

  public override onCollideWithProjectile(
    _other: Projectile,
    midpoint: THREE.Vector3,
    ctx: ProjectileContext
  ): void {
    this.mesh.position.copy(midpoint);
    this.finishAndCooldown(ctx.scene, true);
    this.explode(ctx);
  }

  public override dispose(scene: THREE.Scene): void {
    scene.remove(this.pullIndicator);
    super.dispose(scene);
  }
}

/**
 * Gojo's Hollow Technique: Purple projectile (shared by player and NPC Domain/ambient Purple).
 * Excluded from Red/Blue orb-to-orb collisions and pierces all enemies in its path.
 */
export class HollowPurpleProjectile extends Projectile {
  private readonly redOrb: CursedOrbController;
  private readonly blueOrb: CursedOrbController;
  private readonly purpleOrb: CursedOrbController;
  private readonly fusionDuration: number;
  private readonly launchSpeed: number;
  private readonly domainFinisher: boolean;
  private launched = false;
  private hitPlayer = false;
  private readonly hitUnits = new Set<ProjectileUnit>();
  private readonly initialForward: THREE.Vector3;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    team: MobaTeam;
    casterId: string;
    casterName: string;
    caster?: ProjectileUnit | null;
    domainFinisher?: boolean;
    fusionDuration?: number;
    maxAge?: number;
  }) {
    const fusionGroup = new THREE.Group();
    fusionGroup.position.copy(opts.startPos);

    const isNpc = Boolean(opts.caster);
    const redOrb = createCursedEnergyOrb({
      variant: 'RED',
      radius: isNpc ? 0.42 : 0.5,
      withLight: !isNpc
    });
    const blueOrb = createCursedEnergyOrb({
      variant: 'BLUE',
      radius: isNpc ? 0.42 : 0.5,
      withLight: !isNpc
    });
    const purpleOrb = createCursedEnergyOrb({
      variant: 'PURPLE',
      radius: isNpc ? 1.35 : 1.75
    });
    redOrb.group.visible = false;
    blueOrb.group.visible = false;
    purpleOrb.group.visible = false;
    fusionGroup.add(redOrb.group, blueOrb.group, purpleOrb.group);

    super({
      id: nextProjectileId('purple'),
      kind: 'PURPLE',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      caster: opts.caster,
      mesh: fusionGroup,
      radius: isNpc ? 1.35 : 1.75,
      maxAge: opts.maxAge ?? (isNpc ? 7.8 : 7.2),
      canCollideWithOrbs: false, // Hollow Purple is immune to Red/Blue orb clashes
      piercing: true,
      minFloorY: isNpc ? 1.35 : 1.5
    });

    this.redOrb = redOrb;
    this.blueOrb = blueOrb;
    this.purpleOrb = purpleOrb;
    this.fusionDuration = opts.fusionDuration ?? (isNpc ? 4.85 : 4.0);
    this.launchSpeed = isNpc ? 24.0 : 28.0;
    this.domainFinisher = Boolean(opts.domainFinisher);
    this.initialForward = opts.forward.clone().normalize();
  }

  protected updateVisuals(dt: number, ctx: ProjectileContext): void {
    const now = ctx.elapsed;
    if (this.age < this.fusionDuration) {
      if (!this.caster) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion).normalize();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.quaternion).normalize();
        this.mesh.position.copy(ctx.camera.position).addScaledVector(forward, 2.8);
        this.updateFusionOrbs(dt, now, right, up, 1.35);
      } else {
        const right = new THREE.Vector3(-this.initialForward.z, 0, this.initialForward.x).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const anchor = this.caster.group.position
          .clone()
          .add(new THREE.Vector3(0, 1.45, 0))
          .addScaledVector(this.initialForward, 1.5);
        this.mesh.position.copy(anchor);
        this.updateFusionOrbs(dt, now, right, up, 1.2);
      }
      return;
    }

    if (!this.launched) {
      this.launched = true;
      this.redOrb.group.visible = false;
      this.blueOrb.group.visible = false;
      this.purpleOrb.group.visible = true;
      this.purpleOrb.setScale(1.0);

      if (!this.caster) {
        const launchDir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion).normalize();
        this.velocity.copy(launchDir).multiplyScalar(this.launchSpeed);
        ctx.spawnImpactRing(this.mesh.position.clone(), '#a855f7', 6.5);
        ctx.playGlobalSound('/assets/sounds/gojo/hollow_purple_start.mp3', { volume: 0.4 });
        ctx.onPlayerPurpleLaunch?.();
      } else {
        const dir = this.initialForward.clone();
        if (this.domainFinisher && ctx.playerAlive) {
          dir
            .copy(ctx.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0)))
            .sub(this.mesh.position)
            .normalize();
        }
        this.velocity.copy(dir).multiplyScalar(this.launchSpeed);
        ctx.spawnImpactRing(this.mesh.position.clone(), '#a855f7', 5.0);
        ctx.playSpatialSound('/assets/sounds/gojo/hollow_purple_start.mp3', this.mesh, {
          volume: 0.28,
          refDistance: 10,
          maxDistance: 55,
          rolloff: 1.1
        });
        ctx.onNpcPurpleLaunch?.(this.casterId);
      }
    }

    this.purpleOrb.update(dt, now);
  }

  private updateFusionOrbs(
    dt: number,
    now: number,
    right: THREE.Vector3,
    up: THREE.Vector3,
    spread: number
  ): void {
    const ageSec = this.age;
    if (ageSec < 1.3) {
      this.blueOrb.group.visible = true;
      this.redOrb.group.visible = false;
      this.purpleOrb.group.visible = false;
      this.blueOrb.setScale(Math.min(1.0, ageSec / 0.5));
      this.blueOrb.group.position.set(0, 0, 0).addScaledVector(right, spread).addScaledVector(up, 0.2);
      this.blueOrb.update(dt, now);
    } else if (ageSec < 2.3) {
      this.blueOrb.group.visible = true;
      this.redOrb.group.visible = true;
      this.purpleOrb.group.visible = false;
      this.redOrb.setScale(Math.min(1.0, (ageSec - 1.3) / 0.5));
      this.redOrb.group.position.set(0, 0, 0).addScaledVector(right, -spread).addScaledVector(up, 0.2);
      this.blueOrb.group.position.set(0, 0, 0).addScaledVector(right, spread).addScaledVector(up, 0.2);
      this.redOrb.update(dt, now);
      this.blueOrb.update(dt, now);
    } else {
      const swirlProgress = Math.min(1.0, (ageSec - 2.3) / (this.fusionDuration - 2.3));
      const sep = (1 - swirlProgress * swirlProgress) * spread;
      const swirlAngle = swirlProgress * Math.PI * (2.0 + swirlProgress * 4.5);
      const ox = Math.cos(swirlAngle) * sep;
      const oy = Math.sin(swirlAngle) * sep * 0.45;

      if (ageSec < this.fusionDuration) {
        this.blueOrb.group.visible = true;
        this.redOrb.group.visible = true;
        this.redOrb.group.position.set(0, oy, 0).addScaledVector(right, -ox);
        this.blueOrb.group.position.set(0, -oy, 0).addScaledVector(right, ox);
        this.redOrb.update(dt, now);
        this.blueOrb.update(dt, now);
      } else {
        this.redOrb.group.visible = false;
        this.blueOrb.group.visible = false;
      }

      if (swirlProgress > 0.35) {
        this.purpleOrb.group.visible = true;
        const pScale = ((swirlProgress - 0.35) / 0.65) * 0.95;
        this.purpleOrb.setScale(Math.min(1.0, Math.max(0.08, pScale)));
        this.purpleOrb.update(dt, now);
      }
    }
  }

  protected override stepPhysics(dt: number, ctx: ProjectileContext): void {
    if (!this.launched) return;

    this.mesh.position.addScaledVector(this.velocity, dt);
    const minY = this.minFloorY ?? 1.5;
    if (this.mesh.position.y < minY) this.mesh.position.y = minY;

    // Hollow Purple carves through destructible pillars & blasts rubble outward in its wake
    ctx.applyPhysicsImpulse?.(this.mesh.position, 6.2, 62, 0.6, 220);

    if (!this.caster) {
      // Player Hollow Purple: one-hit obliterates all enemy units within 4.2m
      for (const u of ctx.units) {
        if (!u.alive || u.team !== 'red' || this.hitUnits.has(u)) continue;
        const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.5, 0));
        if (unitCenter.distanceTo(this.mesh.position) <= 4.2 + u.radius) {
          this.hitUnits.add(u);
          ctx.spawnImpactRing(unitCenter, '#a855f7', 5.5);
          ctx.spawnCursedBurst(unitCenter, 'PURPLE', 3.0, 96);
          ctx.damageUnit(
            u,
            Math.max(9999, u.hp + u.maxHp),
            true,
            'HOLLOW PURPLE',
            unitCenter,
            'HOLLOW PURPLE'
          );
        }
      }
    } else if (!this.hitPlayer && ctx.playerAlive && this.team !== ctx.playerTeam) {
      const playerCenter = ctx.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
      if (this.mesh.position.distanceTo(playerCenter) <= 3.2) {
        this.hitPlayer = true;
        ctx.spawnImpactRing(playerCenter, '#a855f7', 4.8);
        ctx.spawnCursedBurst(playerCenter, 'PURPLE', 2.8, 90);
        ctx.applyDamageToPlayer(
          this.domainFinisher ? 9999 : 65,
          `${this.casterName} (Hollow Purple)`,
          this.team
        );
      }
    }
  }

  protected override onExpire(ctx: ProjectileContext): void {
    const pos = this.mesh.position.clone();
    ctx.spawnImpactRing(pos, '#a855f7', 6.0);
    ctx.spawnCursedBurst(pos, 'PURPLE', 4.0, 128);
    ctx.applyPhysicsImpulse?.(pos, 14.0, 72, 0.7, 250);
    ctx.spawnPhysicsDebris?.(pos, 10, 0x312e81, 20);
    this.kill(0.7);
  }
}

/**
 * Jogo Primary Fire (M1): Ember Insects — fast fiery cursed shikigami bugs that buzz forward,
 * gently home toward enemies in front, and explode in a blazing AoE burst on impact.
 */
export class EmberInsectProjectile extends Projectile {
  private readonly damage: number;
  private readonly splashRadius: number;
  private readonly wingLeft: THREE.Mesh;
  private readonly wingRight: THREE.Mesh;
  private readonly speed: number;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    damage: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
    caster?: ProjectileUnit | null;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.startPos);

    // Glowing obsidian-and-lava insect thorax & abdomen
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a120a,
      emissive: 0xff4500,
      emissiveIntensity: 1.35,
      roughness: 0.35
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15
    });
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xff8c1a,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), bodyMat);
    thorax.scale.set(0.85, 0.75, 1.55);
    group.add(thorax);

    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), coreMat);
    stinger.rotation.x = Math.PI * 0.5;
    stinger.position.z = 0.28;
    group.add(stinger);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), coreMat);
    eye.position.set(0, 0.03, -0.18);
    group.add(eye);

    const wingGeo = new THREE.PlaneGeometry(0.42, 0.18);
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-0.22, 0.08, 0.02);
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(0.22, 0.08, 0.02);
    group.add(wingLeft, wingRight);

    const speed = 28;
    const dir = opts.forward.clone().normalize();
    group.lookAt(opts.startPos.clone().add(dir));

    super({
      id: nextProjectileId('ember'),
      kind: 'EMBER_INSECT',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      caster: opts.caster,
      mesh: group,
      velocity: dir.multiplyScalar(speed),
      radius: 0.28,
      maxAge: 2.2,
      canCollideWithOrbs: false,
      minFloorY: 0.18
    });

    this.damage = opts.damage;
    this.splashRadius = 2.6;
    this.wingLeft = wingLeft;
    this.wingRight = wingRight;
    this.speed = speed;
  }

  protected updateVisuals(dt: number, ctx: ProjectileContext): void {
    const flap = Math.sin(ctx.elapsed * 58 + this.age * 18) * 0.78;
    this.wingLeft.rotation.z = 0.25 + flap;
    this.wingRight.rotation.z = -0.25 - flap;

    // Gentle homing lock onto nearest enemy within 13m forward cone
    if (this.age > 0.06) {
      const forward = this.velocity.clone().normalize();
      let bestTargetPos: THREE.Vector3 | null = null;
      let bestDist = 13.5;

      for (const u of ctx.units) {
        if (!u.alive || u.team === this.team) continue;
        const center = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
        const toU = center.clone().sub(this.mesh.position);
        const d = toU.length();
        if (d < bestDist && d > 0.2) {
          if (toU.divideScalar(d).dot(forward) > 0.45) {
            bestDist = d;
            bestTargetPos = center;
          }
        }
      }

      if (bestTargetPos) {
        const desiredDir = bestTargetPos.sub(this.mesh.position).normalize();
        forward.lerp(desiredDir, Math.min(1, dt * 6.5)).normalize();
        this.velocity.copy(forward.multiplyScalar(this.speed));
      }
    }

    if (this.velocity.lengthSq() > 0.01) {
      this.mesh.lookAt(this.mesh.position.clone().add(this.velocity));
    }
  }

  private detonate(hitPos: THREE.Vector3, ctx: ProjectileContext, directUnit?: ProjectileUnit): void {
    ctx.spawnImpactRing(hitPos, '#f97316', this.splashRadius * 0.95);
    ctx.spawnCursedBurst(hitPos, 'FIRE', 1.4, 42);
    ctx.applyPhysicsImpulse?.(hitPos, 4.2, 18, 0.45, 32);

    let hitAny = false;
    for (const u of ctx.units) {
      if (!u.alive || u.team === this.team) continue;
      const center = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
      const d = center.distanceTo(hitPos);
      if (u === directUnit || d <= this.splashRadius + u.radius) {
        hitAny = true;
        const dmg = u === directUnit ? this.damage : Math.round(this.damage * 0.65);
        ctx.damageUnit(u, dmg, u === directUnit, 'Ember Insects', center);
      }
    }
    if (hitAny && !this.caster) {
      ctx.grantAbilityPassive(true);
    }
    this.kill(0.62);
  }

  protected override onHitUnit(unit: ProjectileUnit, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    this.detonate(hitPos, ctx, unit);
  }

  protected override onHitBarrier(dom: DomainExpansion, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.damageDomainBarrier(dom, this.damage, hitPos, this.casterName);
    this.detonate(hitPos, ctx);
  }

  protected override onHitObstacle(hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    this.detonate(hitPos, ctx);
  }

  protected override onExpire(ctx: ProjectileContext): void {
    this.detonate(this.mesh.position.clone(), ctx);
  }
}

/**
 * Jogo Ability E: Volcano Seed — lobbed projectile that sticks to the first wall, pillar,
 * ramp, or floor it hits, planting a wall-mounted Mini Volcano oriented along the surface normal.
 */
export class VolcanoSeedProjectile extends Projectile {
  private readonly damage: number;
  private readonly detectRadius: number;
  private readonly volcanoDurationMs: number;
  private readonly gravity = 15.0;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    damage: number;
    detectRadius: number;
    volcanoDurationMs: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.startPos);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x261a16,
      emissive: 0xd93800,
      emissiveIntensity: 0.75,
      roughness: 0.8
    });
    const seedMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rockMat);
    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    group.add(seedMesh, coreMesh);

    const vel = opts.forward.clone().normalize().multiplyScalar(28);
    vel.y += 2.6;

    super({
      id: nextProjectileId('volcano-seed'),
      kind: 'VOLCANO_SEED',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      mesh: group,
      velocity: vel,
      radius: 0.28,
      maxAge: 3.0,
      canCollideWithOrbs: false,
      minFloorY: null
    });

    this.damage = opts.damage;
    this.detectRadius = opts.detectRadius;
    this.volcanoDurationMs = opts.volcanoDurationMs;
  }

  protected updateVisuals(dt: number, _ctx: ProjectileContext): void {
    this.mesh.rotation.x += dt * 7.5;
    this.mesh.rotation.y += dt * 5.2;
  }

  private plant(pos: THREE.Vector3, normal: THREE.Vector3, ctx: ProjectileContext): void {
    const n = normal.clone().normalize();
    ctx.spawnImpactRing(pos.clone().addScaledVector(n, 0.08), '#ea580c', 2.4);
    ctx.spawnCursedBurst(pos.clone().addScaledVector(n, 0.15), 'FIRE', 1.2, 36);
    ctx.onVolcanoPlant?.(
      pos,
      n,
      this.team,
      this.casterId,
      this.damage,
      this.detectRadius,
      this.volcanoDurationMs
    );
    this.kill(0.5);
  }

  protected override stepPhysics(dt: number, ctx: ProjectileContext): void {
    this.velocity.y -= this.gravity * dt;
    const prevPos = this.mesh.position.clone();
    const stepVec = this.velocity.clone().multiplyScalar(dt);
    const stepDist = stepVec.length();
    if (stepDist < 0.0001) return;

    const dir = stepVec.clone().divideScalar(stepDist);
    this.stepRay.set(prevPos, dir);
    this.stepRay.near = 0;
    this.stepRay.far = stepDist + this.radius;

    // Check sticking onto walls / obstacles / ramps
    const hits = this.stepRay.intersectObjects(ctx.raycastObstacles, false);
    if (hits.length > 0) {
      const hit = hits[0];
      const worldNormal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : dir.clone().negate();
      // Ensure normal points back toward the incoming projectile side
      if (worldNormal.dot(dir) > 0) {
        worldNormal.negate();
      }
      this.mesh.position.copy(hit.point);
      this.plant(hit.point.clone(), worldNormal, ctx);
      return;
    }

    this.mesh.position.add(stepVec);

    // Check sticking onto ground floor
    const floorY = ctx.getFloorHeight(this.mesh.position.x, this.mesh.position.z, prevPos.y);
    if (this.mesh.position.y <= floorY + 0.15) {
      const plantPos = new THREE.Vector3(this.mesh.position.x, floorY, this.mesh.position.z);
      this.mesh.position.copy(plantPos);
      this.plant(plantPos, new THREE.Vector3(0, 1, 0), ctx);
    }
  }

  protected override onExpire(ctx: ProjectileContext): void {
    const p = this.mesh.position.clone();
    const floorY = ctx.getFloorHeight(p.x, p.z, p.y);
    p.y = Math.max(floorY, p.y);
    this.plant(p, new THREE.Vector3(0, 1, 0), ctx);
  }
}

/**
 * Magma fire bolt launched by a planted Mini Volcano at enemies inside its 180° frontal hemisphere.
 */
export class FireBoltProjectile extends Projectile {
  private readonly damage: number;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    damage: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.startPos);

    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xff4500 })
    );
    outer.scale.set(0.85, 0.85, 1.8);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    group.add(outer, inner);

    const dir = opts.forward.clone().normalize();
    group.lookAt(opts.startPos.clone().add(dir));

    super({
      id: nextProjectileId('volcano-bolt'),
      kind: 'FIRE_BOLT',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      mesh: group,
      velocity: dir.multiplyScalar(34),
      radius: 0.28,
      maxAge: 1.5,
      canCollideWithOrbs: false,
      minFloorY: 0.15
    });

    this.damage = opts.damage;
  }

  protected updateVisuals(_dt: number, ctx: ProjectileContext): void {
    const s = 1 + Math.sin(ctx.elapsed * 32) * 0.14;
    this.mesh.scale.setScalar(s);
  }

  protected override onHitUnit(unit: ProjectileUnit, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.spawnImpactRing(hitPos, '#f97316', 1.8);
    ctx.spawnCursedBurst(hitPos, 'FIRE', 1.1, 28);
    ctx.damageUnit(unit, this.damage, false, 'Mini Volcano', hitPos);
    ctx.grantAbilityPassive(true);
    this.kill(0.6);
  }

  protected override onHitBarrier(dom: DomainExpansion, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.damageDomainBarrier(dom, this.damage, hitPos, this.casterName);
    ctx.spawnCursedBurst(hitPos, 'FIRE', 1.0, 22);
    this.kill(0.6);
  }

  protected override onHitObstacle(hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.spawnCursedBurst(hitPos, 'FIRE', 0.9, 20);
    this.kill(0.6);
  }
}

/**
 * Jogo Domain Finisher (Q inside Coffin of the Iron Mountain): Maximum: Meteor.
 * Descends from high above directly onto the player's chosen ground target and detonates
 * in a massive volcanic shockwave.
 */
export class MaximumMeteorProjectile extends Projectile {
  private readonly targetPos: THREE.Vector3;
  private readonly blastRadius: number;
  private readonly damage: number;
  private readonly warningRing: THREE.Mesh;
  private readonly outerCorona: THREE.Mesh;
  private fallSpeed = 20;

  constructor(opts: {
    targetPos: THREE.Vector3;
    blastRadius: number;
    damage: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
    scene: THREE.Scene;
  }) {
    const group = new THREE.Group();
    const startPos = opts.targetPos.clone().add(new THREE.Vector3(0, 34, 0));
    group.position.copy(startPos);

    // Cracked volcanic boulder core
    const rockGeo = new THREE.IcosahedronGeometry(3.2, 2);
    const posAttr = rockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const lump = 0.88 + 0.24 * Math.sin(vx * 2.1 + vy * 1.7) * Math.cos(vz * 2.3);
      posAttr.setXYZ(i, vx * lump, vy * lump, vz * lump);
    }
    rockGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x2a1008,
      emissive: 0xff3b00,
      emissiveIntensity: 1.55,
      roughness: 0.78,
      metalness: 0.1
    });
    const meteorCore = new THREE.Mesh(rockGeo, rockMat);
    group.add(meteorCore);

    // Blazing magma aura shell & fiery comet trail cone
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xff6b00,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const outerCorona = new THREE.Mesh(new THREE.SphereGeometry(4.0, 20, 20), coronaMat);
    group.add(outerCorona);

    const trailCone = new THREE.Mesh(
      new THREE.ConeGeometry(3.8, 12.0, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    trailCone.position.y = 6.5;
    group.add(trailCone);

    const meteorLight = new THREE.PointLight(0xff4500, 4.5, 28, 1.5);
    group.add(meteorLight);

    // Ground impact danger ring showing exact landing zone during descent
    const ringGeo = new THREE.RingGeometry(opts.blastRadius * 0.88, opts.blastRadius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const warningRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    warningRing.position.set(opts.targetPos.x, opts.targetPos.y + 0.14, opts.targetPos.z);
    opts.scene.add(warningRing);

    super({
      id: nextProjectileId('meteor'),
      kind: 'METEOR',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      mesh: group,
      velocity: new THREE.Vector3(0, -20, 0),
      radius: 3.4,
      maxAge: 4.5,
      canCollideWithOrbs: false,
      piercing: true,
      minFloorY: null,
      shrinkFactor: 0.72
    });

    this.targetPos = opts.targetPos.clone();
    this.blastRadius = opts.blastRadius;
    this.damage = opts.damage;
    this.warningRing = warningRing;
    this.outerCorona = outerCorona;
  }

  protected updateVisuals(dt: number, ctx: ProjectileContext): void {
    this.mesh.rotation.y += dt * 1.4;
    this.mesh.rotation.x += dt * 0.9;
    const pulse = 1 + Math.sin(ctx.elapsed * 22) * 0.08;
    this.outerCorona.scale.setScalar(pulse);
    this.warningRing.rotation.z += dt * 1.8;
  }

  private impact(ctx: ProjectileContext): void {
    const center = this.targetPos.clone();
    ctx.scene.remove(this.warningRing);
    this.warningRing.geometry.dispose();

    ctx.spawnImpactRing(center.clone().add(new THREE.Vector3(0, 0.2, 0)), '#ff3b00', this.blastRadius * 1.25);
    ctx.spawnImpactRing(center.clone().add(new THREE.Vector3(0, 0.6, 0)), '#facc15', this.blastRadius * 0.85);
    ctx.spawnCursedBurst(center.clone().add(new THREE.Vector3(0, 1.2, 0)), 'FIRE', 5.2, 160);
    ctx.applyPhysicsImpulse?.(center, this.blastRadius + 3.5, 78, 0.8, 300);
    ctx.spawnPhysicsDebris?.(center, 16, 0x451a03, 22);

    let hitCount = 0;
    for (const u of ctx.units) {
      if (!u.alive || u.team === this.team) continue;
      const dist = Math.hypot(u.group.position.x - center.x, u.group.position.z - center.z);
      if (dist <= this.blastRadius + u.radius) {
        hitCount++;
        const falloff = 1 - Math.min(0.4, (dist / (this.blastRadius + u.radius)) * 0.4);
        const dmg = Math.round(this.damage * falloff);
        const hitPos = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.6, 0));
        u.stunTimer = Math.max(u.stunTimer ?? 0, 1.4);
        ctx.damageUnit(u, dmg, true, 'MAXIMUM: METEOR', hitPos, 'MAXIMUM: METEOR');

        if (u.moveSpeed > 0 && u.alive) {
          const knockDir = u.group.position.clone().sub(center);
          knockDir.y = 0;
          if (knockDir.lengthSq() < 0.01) knockDir.set(1, 0, 0);
          else knockDir.normalize();
          ctx.knockbackUnitWithWallSlam(u, knockDir, 12.0, 50);
        }
      }
    }

    ctx.grantAbilityPassive(hitCount > 0);
    this.kill(0.68);
  }

  protected override stepPhysics(dt: number, ctx: ProjectileContext): void {
    this.fallSpeed = Math.min(42, this.fallSpeed + 22 * dt);
    this.mesh.position.y -= this.fallSpeed * dt;
    if (this.mesh.position.y <= this.targetPos.y + 1.8) {
      this.mesh.position.y = this.targetPos.y + 1.8;
      this.impact(ctx);
    }
  }

  protected override onExpire(ctx: ProjectileContext): void {
    this.impact(ctx);
  }

  public override dispose(scene: THREE.Scene): void {
    scene.remove(this.warningRing);
    this.warningRing.geometry.dispose();
    super.dispose(scene);
  }
}

/**
 * Megumi Primary Fire (Ranged): Shadow-Infused Kunai — fast spinning cursed obsidian dagger.
 */
export class ShadowKunaiProjectile extends Projectile {
  private readonly damage: number;
  private readonly spinGroup: THREE.Group;

  constructor(opts: {
    startPos: THREE.Vector3;
    forward: THREE.Vector3;
    damage: number;
    team: MobaTeam;
    casterId: string;
    casterName: string;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.startPos);

    const spinGroup = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.9,
      metalness: 0.75,
      roughness: 0.25
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc
    });

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.56, 4), bladeMat);
    blade.rotation.x = Math.PI * 0.5;
    blade.position.z = 0.14;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.26, 8), bladeMat);
    handle.rotation.x = Math.PI * 0.5;
    handle.position.z = -0.22;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 14), edgeMat);
    ring.position.z = -0.37;
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.12, 0.65, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    aura.rotation.x = Math.PI * 0.5;
    spinGroup.add(blade, handle, ring, aura);
    group.add(spinGroup);

    const dir = opts.forward.clone().normalize();
    group.lookAt(opts.startPos.clone().add(dir));

    super({
      id: nextProjectileId('kunai'),
      kind: 'SHADOW_KUNAI',
      team: opts.team,
      casterId: opts.casterId,
      casterName: opts.casterName,
      mesh: group,
      velocity: dir.multiplyScalar(52),
      radius: 0.24,
      maxAge: 1.5,
      canCollideWithOrbs: false,
      minFloorY: 0.14
    });

    this.damage = opts.damage;
    this.spinGroup = spinGroup;
  }

  protected updateVisuals(dt: number, _ctx: ProjectileContext): void {
    this.spinGroup.rotation.z += dt * 18;
  }

  protected override onHitUnit(unit: ProjectileUnit, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    const isCrit = hitPos.y >= unit.group.position.y + unit.height * 0.68;
    const finalDmg = isCrit ? Math.round(this.damage * 1.5) : this.damage;
    ctx.spawnImpactRing(hitPos, isCrit ? '#facc15' : '#818cf8', 1.45);
    ctx.spawnCursedBurst(hitPos, 'SHADOW', 0.95, 24);
    ctx.damageUnit(unit, finalDmg, isCrit, 'Shadow Kunai', hitPos);
    this.kill(0.55);
  }

  protected override onHitBarrier(dom: DomainExpansion, hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.damageDomainBarrier(dom, this.damage, hitPos, this.casterName);
    ctx.spawnCursedBurst(hitPos, 'SHADOW', 0.85, 18);
    this.kill(0.55);
  }

  protected override onHitObstacle(hitPos: THREE.Vector3, ctx: ProjectileContext): void {
    ctx.spawnCursedBurst(hitPos, 'SHADOW', 0.75, 16);
    this.kill(0.55);
  }
}
