import * as THREE from 'three';
import type { MobaTeam, MobaUnitType } from '../types';
import { MobaUnitEntity } from './Entity';

export type ShikigamiKind = 'DIVINE_DOG' | 'RABBIT_ESCAPE' | 'TOAD' | 'NUE' | 'MAHORAGA' | 'GENERIC';

export interface ShikigamiTargetableUnit {
  id: string;
  name: string;
  team: MobaTeam;
  type: MobaUnitType;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  alive: boolean;
  isDummy?: boolean;
  stunTimer?: number;
}

export interface ShikigamiTarget {
  unit: ShikigamiTargetableUnit | null;
  targetPlayer: boolean;
  distance: number;
}

export interface ShikigamiContext {
  scene: THREE.Scene;
  units: ShikigamiTargetableUnit[];
  playerPos: THREE.Vector3;
  playerDetectable: boolean;
  damageUnit: (
    unit: ShikigamiTargetableUnit,
    amount: number,
    isCrit: boolean,
    sourceName: string,
    hitPos: THREE.Vector3,
    customLabel?: string
  ) => void;
  grantAbilityPassive: (didHit: boolean) => void;
  spawnImpactRing: (pos: THREE.Vector3, colorHex: string, maxRadius: number) => void;
  spawnCursedBurst: (
    pos: THREE.Vector3,
    variant: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW',
    radius?: number,
    count?: number
  ) => void;
  spawnPopup: (label: string, color: string, y?: number, amount?: number, isCrit?: boolean) => void;
}

export type FloatingHpBarFactory = (
  parent: THREE.Group,
  y: number,
  width: number,
  team: MobaTeam
) => THREE.Mesh;

export type HeroNameplateFactory = (
  parent: THREE.Group,
  y: number,
  text: string,
  color: string
) => THREE.Mesh;

/**
 * Abstract base entity for all summoned Shikigami (Divine Dogs, Toad, Mahoraga, and future summons).
 * Extends MobaUnitEntity with `type = 'SHIKIGAMI'`, summoner ownership, optional lifetime decay,
 * custom AI targeting, rogue transitions, and incoming damage modifiers (e.g. Mahoraga Adaptation).
 */
export abstract class ShikigamiEntity extends MobaUnitEntity {
  readonly shikigamiKind: ShikigamiKind;
  readonly summonerId: string;
  readonly ownerTeam: MobaTeam;
  remainingLifetimeSec: number | null;
  rogue: boolean = false;
  tracksLowHpThroughWalls: boolean = false;
  beamColor: string = '#818cf8';
  attackBurstVariant: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW' = 'SHADOW';

  constructor(
    opts: Omit<ConstructorParameters<typeof MobaUnitEntity>[0], 'type'> & {
      shikigamiKind: ShikigamiKind;
      summonerId: string;
      ownerTeam?: MobaTeam;
      lifetimeSec?: number | null;
      tracksLowHpThroughWalls?: boolean;
      beamColor?: string;
      attackBurstVariant?: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW';
    }
  ) {
    super({ ...opts, type: 'SHIKIGAMI' });
    this.shikigamiKind = opts.shikigamiKind;
    this.summonerId = opts.summonerId;
    this.ownerTeam = opts.ownerTeam ?? opts.team;
    this.remainingLifetimeSec = opts.lifetimeSec ?? null;
    this.tracksLowHpThroughWalls = opts.tracksLowHpThroughWalls ?? false;
    if (opts.beamColor) this.beamColor = opts.beamColor;
    if (opts.attackBurstVariant) this.attackBurstVariant = opts.attackBurstVariant;

    for (const hm of this.hitMeshes ?? [this.bodyMesh]) {
      hm.userData.unit = this;
    }
  }

  /** Returns true if this Shikigami currently fights for the player's side. */
  get isAlliedToSummoner(): boolean {
    return !this.rogue && this.team === this.ownerTeam;
  }

  /**
   * Advances Shikigami-specific timers, animations, and state transitions.
   * Returns `true` when the Shikigami has expired and should be despawned from the battlefield.
   */
  public tickShikigami(dt: number, _elapsed: number, ctx: ShikigamiContext): boolean {
    if (this.remainingLifetimeSec !== null) {
      this.remainingLifetimeSec -= dt;
      if (this.remainingLifetimeSec <= 0) {
        this.onDespawn(ctx);
        return true;
      }
    }
    return false;
  }

  /**
   * Selects the Shikigami's next combat target. Subclasses override this to customize
   * lane patrolling, low-HP wall tracking, or rogue summoner targeting.
   */
  public selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    let bestUnit: ShikigamiTargetableUnit | null = null;
    let bestDist = Infinity;

    for (const other of ctx.units) {
      if (!other.alive || other === this || other.team === this.team) continue;
      const d = this.group.position.distanceTo(other.group.position);
      if (d < bestDist) {
        bestDist = d;
        bestUnit = other;
      }
    }

    if (this.team === 'red' && ctx.playerDetectable) {
      const dp = this.group.position.distanceTo(ctx.playerPos);
      const aggro = Math.max(this.attackRange * 1.35, 28);
      if (dp < bestDist && dp <= aggro) {
        return { unit: null, targetPlayer: true, distance: dp };
      }
    }

    return bestUnit ? { unit: bestUnit, targetPlayer: false, distance: bestDist } : null;
  }

  /**
   * Hook for modifying incoming damage (e.g. Mahoraga's Dharma Wheel Adaptation).
   */
  public modifyIncomingDamage(
    rawAmount: number,
    _sourceName: string,
    _hitWorldPos: THREE.Vector3,
    _ctx: ShikigamiContext
  ): { finalDamage: number; popupLabel?: string } {
    return { finalDamage: rawAmount };
  }

  /**
   * Called when the Shikigami's lifetime expires or it is forcibly dismissed.
   */
  public onDespawn(ctx: ShikigamiContext): void {
    this.alive = false;
    ctx.spawnCursedBurst(
      this.group.position.clone().add(new THREE.Vector3(0, this.height * 0.45, 0)),
      'SHADOW',
      1.0,
      20
    );
    ctx.scene.remove(this.group);
  }
}

/**
 * Megumi's Divine Dog (Totality spectral wolf):
 * Patrols lanes, tracks low-HP enemies (<= 65% HP) through walls within 55m, and bites targets.
 */
export class DivineDogShikigami extends ShikigamiEntity {
  readonly variant: 'WHITE' | 'BLACK';

  constructor(opts: {
    variant?: 'WHITE' | 'BLACK';
    spawnPos: THREE.Vector3;
    team: MobaTeam;
    summonerId: string;
    phaseShift: number;
    createHpBar: FloatingHpBarFactory;
  }) {
    const variant = opts.variant ?? 'BLACK';
    const dogGroup = new THREE.Group();
    dogGroup.position.copy(opts.spawnPos);

    const furColor = variant === 'WHITE' ? 0xe2e8f0 : 0x111827;
    const glowColor = variant === 'WHITE' ? 0x818cf8 : 0x38bdf8;
    const furMat = new THREE.MeshStandardMaterial({
      color: furColor,
      emissive: glowColor,
      emissiveIntensity: variant === 'WHITE' ? 0.25 : 0.45,
      roughness: 0.65
    });
    const eyeMat = new THREE.MeshBasicMaterial({
      color: variant === 'WHITE' ? 0x38bdf8 : 0xf43f5e
    });

    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.52, 1.25), furMat);
    bodyMesh.position.y = 0.72;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.56), furMat);
    headMesh.position.set(0, 1.0, 0.72);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.34), furMat);
    snout.position.set(0, 0.92, 1.06);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
    eyeL.position.set(-0.13, 1.05, 0.99);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.13;
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), furMat);
    earL.position.set(-0.14, 1.26, 0.65);
    const earR = earL.clone();
    earR.position.x = 0.14;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 6), furMat);
    tail.rotation.x = -Math.PI * 0.38;
    tail.position.set(0, 0.92, -0.75);

    const legs: THREE.Mesh[] = [];
    const legOffsets: [number, number][] = [
      [-0.2, 0.42],
      [0.2, 0.42],
      [-0.2, -0.42],
      [0.2, -0.42]
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.16), furMat);
      leg.position.set(lx, 0.3, lz);
      dogGroup.add(leg);
      legs.push(leg);
    }

    dogGroup.add(bodyMesh, headMesh, snout, eyeL, eyeR, earL, earR, tail);
    const hpBarFill = opts.createHpBar(dogGroup, 1.65, 1.1, opts.team);

    const phaseShift = opts.phaseShift;
    super({
      id: `divine_dog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Divine Dog',
      team: opts.team,
      shikigamiKind: 'DIVINE_DOG',
      summonerId: opts.summonerId,
      maxHp: 210,
      radius: 0.72,
      height: 1.25,
      group: dogGroup,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh],
      hpBarFill,
      attackRange: 3.1,
      attackDamage: 34,
      attackCooldown: 0.72,
      moveSpeed: 16.0,
      goldValue: 0,
      xpValue: 0,
      lifetimeSec: 18.0,
      tracksLowHpThroughWalls: true,
      beamColor: '#818cf8',
      attackBurstVariant: 'SHADOW',
      animateRig: (elapsed, isMoving) => {
        const swing = isMoving ? Math.sin(elapsed * 16 + phaseShift) * 0.55 : 0;
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        legs[2].rotation.x = -swing;
        legs[3].rotation.x = swing;
        tail.rotation.z = Math.sin(elapsed * 10 + phaseShift) * 0.28;
      }
    });

    this.variant = variant;
    this.attackTimer = 0.15;
  }

  public override selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    // Prioritize wounded enemies (<= 65% HP) within 55m, tracking them through walls
    let bestLowUnit: ShikigamiTargetableUnit | null = null;
    let bestLowRatio = 0.66;
    let bestLowDist = Infinity;

    for (const other of ctx.units) {
      if (!other.alive || other.team === this.team || other.type === 'TOWER' || other.type === 'CORE') continue;
      const d = this.group.position.distanceTo(other.group.position);
      const ratio = other.hp / other.maxHp;
      if (d <= 55 && ratio < bestLowRatio) {
        bestLowRatio = ratio;
        bestLowDist = d;
        bestLowUnit = other;
      }
    }

    if (bestLowUnit) {
      return { unit: bestLowUnit, targetPlayer: false, distance: bestLowDist };
    }
    return super.selectTarget(ctx);
  }
}

/**
 * Megumi's Rabbit Escape Shikigami:
 * Summoned in a chaotic hopping swarm that overwhelms enemy vision, soaks attacks,
 * swarms around nearby enemies with chip bites, and gives Megumi a clean escape screen.
 */
export class RabbitEscapeShikigami extends ShikigamiEntity {
  private readonly hopPhase: number;
  private readonly scatterAngle: number;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    team: MobaTeam;
    summonerId: string;
    hopPhase: number;
    scatterAngle: number;
    createHpBar: FloatingHpBarFactory;
  }) {
    const rabbitGroup = new THREE.Group();
    rabbitGroup.position.copy(opts.spawnPos);

    const furMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x6366f1,
      emissiveIntensity: 0.18,
      roughness: 0.72
    });
    const earInnerMat = new THREE.MeshBasicMaterial({ color: 0xf9a8d4 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b });

    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), furMat);
    bodyMesh.scale.set(0.88, 0.82, 1.18);
    bodyMesh.position.y = 0.28;

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), furMat);
    headMesh.position.set(0, 0.44, 0.22);

    const earGeo = new THREE.CylinderGeometry(0.032, 0.045, 0.34, 6);
    const earL = new THREE.Mesh(earGeo, furMat);
    earL.position.set(-0.075, 0.68, 0.18);
    earL.rotation.z = 0.16;
    earL.rotation.x = -0.14;
    const earR = earL.clone();
    earR.position.x = 0.075;
    earR.rotation.z = -0.16;

    const earTintL = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 0.015), earInnerMat);
    earTintL.position.set(-0.075, 0.68, 0.215);
    const earTintR = earTintL.clone();
    earTintR.position.x = 0.075;

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
    eyeL.position.set(-0.07, 0.47, 0.36);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.07;

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), furMat);
    tail.position.set(0, 0.28, -0.28);

    rabbitGroup.add(bodyMesh, headMesh, earL, earR, earTintL, earTintR, eyeL, eyeR, tail);

    const hpBarFill = opts.createHpBar(rabbitGroup, 0.95, 0.65, opts.team);
    if (hpBarFill.parent) hpBarFill.parent.visible = false;

    const hopPhase = opts.hopPhase;
    super({
      id: `rabbit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Rabbit Escape',
      team: opts.team,
      shikigamiKind: 'RABBIT_ESCAPE',
      summonerId: opts.summonerId,
      maxHp: 45,
      radius: 0.38,
      height: 0.72,
      group: rabbitGroup,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh],
      hpBarFill,
      attackRange: 2.1,
      attackDamage: 8,
      attackCooldown: 0.95,
      moveSpeed: 15.2,
      goldValue: 0,
      xpValue: 0,
      lifetimeSec: 7.5,
      beamColor: '#e2e8f0',
      attackBurstVariant: 'SHADOW',
      animateRig: (elapsed, isMoving) => {
        const hop = Math.abs(Math.sin(elapsed * 13 + hopPhase));
        const lift = isMoving ? hop * 0.48 : hop * 0.14;
        bodyMesh.position.y = 0.28 + lift;
        headMesh.position.y = 0.44 + lift;
        earL.position.y = 0.68 + lift;
        earR.position.y = 0.68 + lift;
        earTintL.position.y = 0.68 + lift;
        earTintR.position.y = 0.68 + lift;
        eyeL.position.y = 0.47 + lift;
        eyeR.position.y = 0.47 + lift;
        tail.position.y = 0.28 + lift;
      }
    });

    this.hopPhase = hopPhase;
    this.scatterAngle = opts.scatterAngle;
    this.attackTimer = 0.2 + (hopPhase % 0.4);
  }

  public override selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    // Swarm nearest enemy within 28m to disorient & screen Megumi's escape
    let bestUnit: ShikigamiTargetableUnit | null = null;
    let bestDist = 28;
    for (const other of ctx.units) {
      if (!other.alive || other === this || other.team === this.team || other.type === 'TOWER' || other.type === 'CORE') {
        continue;
      }
      const d = this.group.position.distanceTo(other.group.position);
      if (d < bestDist) {
        bestDist = d;
        bestUnit = other;
      }
    }
    if (bestUnit) {
      return { unit: bestUnit, targetPlayer: false, distance: bestDist };
    }
    // Keep hopping outward slightly if no enemy nearby
    this.group.rotation.y = this.scatterAngle + Math.sin(this.hopPhase) * 0.25;
    return null;
  }
}

/**
 * Megumi's Toad (Gama) Rescue Shikigami:
 * Appears beside Megumi, fires a spectral tongue to pull an out-of-position ally cleanly
 * to safety in front of Megumi, then dissolves back into shadow.
 */
export class ToadShikigami extends ShikigamiEntity {
  private readonly ally: ShikigamiTargetableUnit;
  private readonly allyStartPos: THREE.Vector3;
  private readonly safePos: THREE.Vector3;
  private readonly totalDurationSec = 0.85;
  private elapsedSec = 0;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    safePos: THREE.Vector3;
    ally: ShikigamiTargetableUnit;
    team: MobaTeam;
    summonerId: string;
    createHpBar: FloatingHpBarFactory;
  }) {
    const toadGroup = new THREE.Group();
    toadGroup.position.copy(opts.spawnPos);

    const frogMat = new THREE.MeshStandardMaterial({
      color: 0x3f6212,
      emissive: 0x312e81,
      emissiveIntensity: 0.45,
      roughness: 0.7
    });
    const toadBody = new THREE.Mesh(new THREE.SphereGeometry(0.65, 14, 12), frogMat);
    toadBody.scale.set(1.2, 0.75, 1.1);
    toadBody.position.y = 0.55;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), eyeMat);
    eL.position.set(-0.34, 0.96, 0.35);
    const eR = eL.clone();
    eR.position.x = 0.34;
    toadGroup.add(toadBody, eL, eR);
    toadGroup.lookAt(opts.ally.group.position.x, opts.spawnPos.y, opts.ally.group.position.z);

    const hpBarFill = opts.createHpBar(toadGroup, 1.5, 0.8, opts.team);
    if (hpBarFill.parent) hpBarFill.parent.visible = false;

    super({
      id: `toad_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Toad (Gama)',
      team: opts.team,
      shikigamiKind: 'TOAD',
      summonerId: opts.summonerId,
      maxHp: 200,
      radius: 0.7,
      height: 1.1,
      group: toadGroup,
      bodyMesh: toadBody,
      hitMeshes: [],
      hpBarFill,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 99,
      moveSpeed: 0,
      goldValue: 0,
      xpValue: 0,
      isDestructable: false,
      lifetimeSec: 0.85,
      beamColor: '#f472b6'
    });

    this.ally = opts.ally;
    this.allyStartPos = opts.ally.group.position.clone();
    this.safePos = opts.safePos.clone();
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    this.elapsedSec += dt;
    const p = Math.min(1, this.elapsedSec / this.totalDurationSec);
    const pullT = Math.min(1, p / 0.38);
    if (this.ally.alive) {
      this.ally.group.position.lerpVectors(this.allyStartPos, this.safePos, pullT);
      this.ally.group.position.y += Math.sin(pullT * Math.PI) * 1.4;
    }
    if (p > 0.72) {
      this.group.scale.setScalar(Math.max(0.01, 1 - (p - 0.72) / 0.28));
    }
    return super.tickShikigami(dt, elapsed, ctx);
  }

  public override selectTarget(): ShikigamiTarget | null {
    return null;
  }
}

/**
 * Megumi's Nue (Winged Lightning Owl) Shikigami:
 * Swoops from above onto the targeted ground spot, discharges an electric shockwave
 * that stuns and damages all enemies in the area, then dissolves back into shadow.
 */
export class NueShikigami extends ShikigamiEntity {
  private readonly startPos: THREE.Vector3;
  private readonly targetPos: THREE.Vector3;
  private readonly shockRadius: number;
  private readonly shockDamage: number;
  private readonly stunSec: number;
  private readonly wingLeft: THREE.Mesh;
  private readonly wingRight: THREE.Mesh;
  private readonly diveDuration = 0.52;
  private t = 0;
  private detonated = false;

  constructor(opts: {
    startPos: THREE.Vector3;
    targetPos: THREE.Vector3;
    shockRadius: number;
    damage: number;
    stunSec: number;
    team: MobaTeam;
    summonerId: string;
    createHpBar: FloatingHpBarFactory;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.startPos);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b2314,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.55,
      roughness: 0.6
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.72,
      side: THREE.DoubleSide
    });
    const maskMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), bodyMat);
    torso.scale.set(0.9, 0.75, 1.5);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), maskMat);
    mask.position.set(0, 0.08, 0.56);
    mask.scale.set(0.95, 0.85, 0.65);

    const wingGeo = new THREE.BoxGeometry(1.7, 0.08, 0.95);
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-0.95, 0.1, 0);
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(0.95, 0.1, 0);

    const sparkAura = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 14, 14),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending
      })
    );
    group.add(torso, mask, wingLeft, wingRight, sparkAura);

    const hpBarFill = opts.createHpBar(group, 1.4, 1.0, opts.team);
    if (hpBarFill.parent) hpBarFill.parent.visible = false;

    super({
      id: `nue_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Nue',
      team: opts.team,
      shikigamiKind: 'NUE',
      summonerId: opts.summonerId,
      maxHp: 180,
      radius: 1.0,
      height: 1.2,
      group,
      bodyMesh: torso,
      headMesh: mask,
      hitMeshes: [torso, mask],
      hpBarFill,
      attackRange: 0,
      attackDamage: opts.damage,
      attackCooldown: 99,
      moveSpeed: 0,
      goldValue: 0,
      xpValue: 0,
      lifetimeSec: 0.88,
      beamColor: '#38bdf8',
      attackBurstVariant: 'BLUE'
    });

    this.startPos = opts.startPos.clone();
    this.targetPos = opts.targetPos.clone();
    this.shockRadius = opts.shockRadius;
    this.shockDamage = opts.damage;
    this.stunSec = opts.stunSec;
    this.wingLeft = wingLeft;
    this.wingRight = wingRight;
  }

  private detonate(ctx: ShikigamiContext): void {
    if (this.detonated) return;
    this.detonated = true;

    const c = this.targetPos.clone();
    ctx.spawnImpactRing(c.clone().add(new THREE.Vector3(0, 0.2, 0)), '#38bdf8', this.shockRadius * 1.15);
    ctx.spawnImpactRing(c.clone().add(new THREE.Vector3(0, 0.5, 0)), '#facc15', this.shockRadius * 0.72);
    ctx.spawnCursedBurst(c.clone().add(new THREE.Vector3(0, 0.9, 0)), 'BLUE', 2.4, 64);

    let hitCount = 0;
    for (const u of ctx.units) {
      if (!u.alive || u === this || u.team === this.team) continue;
      const d = Math.hypot(u.group.position.x - c.x, u.group.position.z - c.z);
      if (d <= this.shockRadius + u.radius) {
        hitCount++;
        u.stunTimer = Math.max(u.stunTimer ?? 0, this.stunSec);
        const hitPos = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.65, 0));
        ctx.damageUnit(u, this.shockDamage, true, 'Nue Lightning', hitPos, 'NUE STUN!');
      }
    }
    ctx.grantAbilityPassive(hitCount > 0);
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    const flap = Math.sin(elapsed * 26) * 0.52;
    this.wingLeft.rotation.z = 0.25 + flap;
    this.wingRight.rotation.z = -0.25 - flap;

    if (!this.detonated) {
      this.t += dt / this.diveDuration;
      const p = Math.min(1, this.t);
      const prev = this.group.position.clone();
      const x = THREE.MathUtils.lerp(this.startPos.x, this.targetPos.x, p);
      const z = THREE.MathUtils.lerp(this.startPos.z, this.targetPos.z, p);
      const arcY = Math.sin(p * Math.PI) * 3.8;
      const y = THREE.MathUtils.lerp(this.startPos.y, this.targetPos.y + 0.9, p * p) + arcY;
      this.group.position.set(x, y, z);

      const delta = this.group.position.clone().sub(prev);
      if (delta.lengthSq() > 0.0001) {
        this.group.lookAt(this.group.position.clone().add(delta));
      }

      if (p >= 1) {
        this.detonate(ctx);
      }
    } else {
      // Fade/ascend cleanly after discharging lightning shockwave
      this.group.position.y += dt * 4.5;
      this.group.scale.multiplyScalar(Math.pow(0.08, dt));
    }

    return super.tickShikigami(dt, elapsed, ctx);
  }

  public override selectTarget(): ShikigamiTarget | null {
    return null;
  }
}

/**
 * Megumi's Nue Carry Shikigami:
 * Summoned midair after Rabbit Escape when holding SPACE; hovers overhead gripping Megumi
 * and carries him freely in any 3D direction for up to 2.0 seconds.
 */
export class NueCarryShikigami extends ShikigamiEntity {
  private readonly wingLeft: THREE.Mesh;
  private readonly wingRight: THREE.Mesh;
  private yawRef: () => number;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    team: MobaTeam;
    summonerId: string;
    getYaw: () => number;
    createHpBar: FloatingHpBarFactory;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.spawnPos);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b2314,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.65,
      roughness: 0.55
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.85,
      side: THREE.DoubleSide
    });
    const maskMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), bodyMat);
    torso.scale.set(0.9, 0.72, 1.45);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), maskMat);
    mask.position.set(0, 0.04, -0.52);

    const wingGeo = new THREE.BoxGeometry(1.9, 0.08, 0.95);
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-1.1, 0.08, -0.15);
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(1.1, 0.08, -0.15);

    group.add(torso, mask, wingLeft, wingRight);

    const hpBarFill = opts.createHpBar(group, 1.4, 0.9, opts.team);
    if (hpBarFill.parent) hpBarFill.parent.visible = false;

    super({
      id: `nue_carry_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Nue (Flight)',
      team: opts.team,
      shikigamiKind: 'NUE',
      summonerId: opts.summonerId,
      maxHp: 220,
      radius: 1.0,
      height: 1.0,
      group,
      bodyMesh: torso,
      headMesh: mask,
      hitMeshes: [],
      hpBarFill,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 99,
      moveSpeed: 0,
      goldValue: 0,
      xpValue: 0,
      isDestructable: false,
      lifetimeSec: 2.2,
      beamColor: '#38bdf8',
      attackBurstVariant: 'BLUE'
    });

    this.wingLeft = wingLeft;
    this.wingRight = wingRight;
    this.yawRef = opts.getYaw;
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    const flap = Math.sin(elapsed * 20) * 0.42;
    this.wingLeft.rotation.z = 0.22 + flap;
    this.wingRight.rotation.z = -0.22 - flap;

    // Hover cleanly overhead carrying Megumi so wings frame the top of his view & follow his facing
    this.group.position.set(ctx.playerPos.x, ctx.playerPos.y + 2.45, ctx.playerPos.z);
    this.group.rotation.y = this.yawRef();

    return super.tickShikigami(dt, elapsed, ctx);
  }

  public override selectTarget(): ShikigamiTarget | null {
    return null;
  }
}

/**
 * Eight-Handled Sword Divergent Sila Divine General Mahoraga:
 * - Own 950 HP boss health pool.
 * - Dharma Wheel Adaptation: takes progressively less damage each time hit by the same move
 *   (100% -> 72% -> 52% -> 37% -> ... -> 10% floor), clicking its 8-handled golden wheel 45°.
 * - Rogue Berserk: once all living enemies on the enemy team are eliminated, flips team
 *   against its summoner and hunts Megumi and Megumi's allies!
 */
export class MahoragaShikigami extends ShikigamiEntity {
  private readonly adaptationCounts = new Map<string, number>();
  private readonly wheelGroup: THREE.Group;
  private wheelCurrentAngle = 0;
  private wheelTargetAngle = 0;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    ownerTeam: MobaTeam;
    summonerId: string;
    createHpBar: FloatingHpBarFactory;
    createNameplate: HeroNameplateFactory;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.spawnPos);

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      emissive: 0x94a3b8,
      emissiveIntensity: 0.16,
      roughness: 0.5
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.75,
      metalness: 0.85,
      roughness: 0.22
    });
    const bladeMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 1.25, 10), skinMat);
    legL.position.set(-0.34, 0.65, 0);
    const legR = legL.clone();
    legR.position.x = 0.34;

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.65, 12), clothMat);
    waist.position.y = 1.35;

    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.45, 1.15, 12), skinMat);
    bodyMesh.position.y = 2.15;

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), skinMat);
    headMesh.position.y = 2.95;

    const crestGeo = new THREE.BoxGeometry(0.72, 0.14, 0.08);
    const crestUL = new THREE.Mesh(crestGeo, skinMat);
    crestUL.position.set(-0.42, 3.04, 0.16);
    crestUL.rotation.z = 0.38;
    const crestUR = new THREE.Mesh(crestGeo, skinMat);
    crestUR.position.set(0.42, 3.04, 0.16);
    crestUR.rotation.z = -0.38;
    const tailCrest = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 6), skinMat);
    tailCrest.rotation.x = -Math.PI * 0.62;
    tailCrest.position.set(0, 3.02, -0.58);

    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 1.25, 10), skinMat);
    armL.position.set(-0.82, 2.05, 0.12);
    armL.rotation.z = 0.22;

    const armRPivot = new THREE.Group();
    armRPivot.position.set(0.82, 2.55, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 1.25, 10), skinMat);
    armR.position.set(0, -0.55, 0.14);
    const swordBlade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.45, 0.06), bladeMat);
    swordBlade.position.set(0.08, -1.15, 0.55);
    swordBlade.rotation.x = Math.PI * 0.38;
    armRPivot.add(armR, swordBlade);

    // Eight-Handled Golden Dharma Wheel
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 3.68, -0.15);
    const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.075, 10, 28), goldMat);
    wheelRing.rotation.x = Math.PI * 0.5;
    wheelGroup.add(wheelRing);
    for (let s = 0; s < 8; s++) {
      const ang = (s / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.65, 6), goldMat);
      spoke.rotation.z = Math.PI * 0.5;
      spoke.rotation.y = ang;
      const handleOrb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), goldMat);
      handleOrb.position.set(Math.cos(ang) * 0.88, 0, Math.sin(ang) * 0.88);
      wheelGroup.add(spoke, handleOrb);
    }

    group.add(legL, legR, waist, bodyMesh, headMesh, crestUL, crestUR, tailCrest, armL, armRPivot, wheelGroup);

    const hpBarFill = opts.createHpBar(group, 4.35, 2.4, opts.ownerTeam);
    const nameplateMesh = opts.createNameplate(group, 4.78, 'MAHORAGA · DIVINE GENERAL', '#facc15');

    super({
      id: `mahoraga_${Date.now()}`,
      name: 'Mahoraga',
      team: opts.ownerTeam,
      ownerTeam: opts.ownerTeam,
      shikigamiKind: 'MAHORAGA',
      summonerId: opts.summonerId,
      maxHp: 950,
      radius: 1.15,
      height: 3.4,
      group,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh, waist, legL, legR],
      hpBarFill,
      nameplateMesh,
      attackRange: 4.4,
      attackDamage: 62,
      attackCooldown: 0.95,
      moveSpeed: 13.6,
      goldValue: 180,
      xpValue: 140,
      lifetimeSec: null,
      beamColor: '#facc15',
      attackBurstVariant: 'FIRE',
      animateRig: (elapsed, isMoving) => {
        const stride = isMoving ? Math.sin(elapsed * 9.5) * 0.45 : 0;
        legL.rotation.x = stride;
        legR.rotation.x = -stride;
        armL.rotation.x = -stride * 0.7;
        armRPivot.rotation.x = stride * 0.7 - 0.25;
      }
    });

    this.wheelGroup = wheelGroup;
    this.attackTimer = 0.35;
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    this.wheelCurrentAngle = THREE.MathUtils.lerp(
      this.wheelCurrentAngle,
      this.wheelTargetAngle,
      Math.min(1, dt * 8)
    );
    this.wheelGroup.rotation.y = this.wheelCurrentAngle;

    if (!this.rogue) {
      const enemyTeam: MobaTeam = this.ownerTeam === 'blue' ? 'red' : 'blue';
      const remainingEnemies = ctx.units.some(
        (other) =>
          other.alive &&
          other !== this &&
          other.team === enemyTeam &&
          other.type !== 'TOWER' &&
          other.type !== 'CORE'
      );
      if (!remainingEnemies) {
        this.rogue = true;
        this.team = enemyTeam;
        ctx.spawnImpactRing(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ef4444', 9.0);
        ctx.spawnCursedBurst(this.group.position.clone().add(new THREE.Vector3(0, 2.0, 0)), 'RED', 3.4, 90);
        ctx.spawnPopup('⚠ MAHORAGA TURNS ON SUMMONER!', '#ef4444', 26, 0, true);
      }
    }

    return super.tickShikigami(dt, elapsed, ctx);
  }

  public override selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    let bestUnit: ShikigamiTargetableUnit | null = null;
    let bestDist = Infinity;

    for (const other of ctx.units) {
      if (
        !other.alive ||
        other === this ||
        other.team === this.team ||
        other.type === 'TOWER' ||
        other.type === 'CORE'
      ) {
        continue;
      }
      const d = this.group.position.distanceTo(other.group.position);
      if (d < bestDist) {
        bestDist = d;
        bestUnit = other;
      }
    }

    if (this.team === 'red' && ctx.playerDetectable) {
      const dp = this.group.position.distanceTo(ctx.playerPos);
      if (dp < bestDist && dp <= 85) {
        return { unit: null, targetPlayer: true, distance: dp };
      }
    }

    return bestUnit ? { unit: bestUnit, targetPlayer: false, distance: bestDist } : null;
  }

  public override modifyIncomingDamage(
    rawAmount: number,
    sourceName: string,
    _hitWorldPos: THREE.Vector3,
    ctx: ShikigamiContext
  ): { finalDamage: number; popupLabel?: string } {
    const key = sourceName.trim().toLowerCase();
    const stacks = this.adaptationCounts.get(key) ?? 0;
    const mult = Math.max(0.1, Math.pow(0.72, stacks));
    const finalDamage = Math.max(1, Math.round(rawAmount * mult));

    this.adaptationCounts.set(key, stacks + 1);
    this.wheelTargetAngle += Math.PI / 4; // 45-degree iconic Dharma Wheel turn

    const wheelWorld = this.group.position.clone().add(new THREE.Vector3(0, 3.68, 0));
    ctx.spawnImpactRing(wheelWorld, '#facc15', 2.4);

    if (stacks >= 1) {
      const pct = Math.round((1 - mult) * 100);
      return {
        finalDamage,
        popupLabel: `ADAPTED (-${pct}%)`
      };
    }
    return { finalDamage };
  }
}

