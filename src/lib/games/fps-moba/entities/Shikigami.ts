import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FpsHeroDef, MobaTeam, MobaUnitType } from '../types';
import { MobaUnitEntity, type NpcAiState } from './Entity';
import { applyAnimeToonToScene, getAnimeToonGradient, loadCachedGlb } from './ProceduralHeroBuilder';

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
  isDestructable?: boolean;
  isDummy?: boolean;
  stunTimer?: number;
  heroDef?: FpsHeroDef;
  npcAi?: NpcAiState;
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
  playerHp: number;
  playerMana: number;
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
  spawnShikigamiShadowCloud: (pos: THREE.Vector3, radius?: number) => void;
  spawnLightningBolt: (start: THREE.Vector3, end: THREE.Vector3) => void;
  getFloorHeight: (x: number, z: number, currentY: number) => number;
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
  readonly canBeDamagedByAnyone: boolean;
  readonly canBeDamagedByCaster: boolean;
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
      canBeDamagedByAnyone?: boolean;
      canBeDamagedByCaster?: boolean;
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
    this.canBeDamagedByAnyone = opts.canBeDamagedByAnyone ?? opts.shikigamiKind === 'MAHORAGA';
    this.canBeDamagedByCaster = opts.canBeDamagedByCaster ?? opts.shikigamiKind === 'MAHORAGA';
    this.remainingLifetimeSec = opts.lifetimeSec ?? null;
    this.tracksLowHpThroughWalls = opts.tracksLowHpThroughWalls ?? false;
    if (opts.beamColor) this.beamColor = opts.beamColor;
    if (opts.attackBurstVariant) this.attackBurstVariant = opts.attackBurstVariant;

    for (const hm of this.hitMeshes ?? [this.bodyMesh]) {
      hm.userData.unit = this;
    }
  }

  /**
   * Determines whether this Shikigami can take damage from `attackerId` on `attackerTeam`:
   * - Mahoraga (`canBeDamagedByAnyone: true`): can be damaged by anyone, even his own summoner!
   * - Nue & Rabbit Escape (`canBeDamagedByCaster: false`): cannot be damaged by their caster,
   *   but have health pools that can be damaged by enemies (or rogue Mahoraga).
   */
  public override canTakeDamageFrom(attackerId: string, attackerTeam: MobaTeam): boolean {
    if (!this.alive || !this.isDestructable) return false;
    if (this.canBeDamagedByAnyone) return true;
    if (attackerId === this.summonerId && !this.canBeDamagedByCaster) return false;
    return attackerTeam !== this.team;
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
   * Dissolves every Megumi Shikigami into a billowing dark purple shadow cloud that fades away.
   */
  public onDespawn(ctx: ShikigamiContext): void {
    this.alive = false;
    const yOff = this.shikigamiKind === 'NUE' ? 0 : this.height * 0.45;
    const cloudCenter = this.group.position.clone().add(new THREE.Vector3(0, yOff, 0));
    const cloudRadius = Math.max(0.85, Math.max(this.radius, this.height * 0.65));
    ctx.spawnShikigamiShadowCloud(cloudCenter, cloudRadius);
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
      moveSpeed: 12.0,
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
  public stacked: boolean;
  private readonly pileBasePos: THREE.Vector3;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    team: MobaTeam;
    summonerId: string;
    hopPhase: number;
    scatterAngle: number;
    stacked?: boolean;
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

    const hopPhase = opts.hopPhase;
    super({
      id: `rabbit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Rabbit Escape',
      team: opts.team,
      shikigamiKind: 'RABBIT_ESCAPE',
      summonerId: opts.summonerId,
      canBeDamagedByCaster: false,
      maxHp: 20,
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
      moveSpeed: 11.4,
      goldValue: 0,
      xpValue: 0,
      lifetimeSec: null,
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
    this.stacked = opts.stacked ?? false;
    this.pileBasePos = opts.spawnPos.clone();
    if (this.stacked) {
      this.pullActiveTimer = 0.2;
    }
    this.attackTimer = 0.2 + (hopPhase % 0.4);
  }

  /** Releases this rabbit from Megumi's Rabbit Escape pile so it bursts outward and attacks nearby enemies. */
  public releaseFromStack(burstAngle: number): void {
    if (!this.stacked) return;
    this.stacked = false;
    this.pullActiveTimer = 0;
    this.group.position.x += Math.cos(burstAngle) * (0.55 + Math.random() * 0.75);
    this.group.position.z += Math.sin(burstAngle) * (0.55 + Math.random() * 0.75);
    this.verticalVel = 3.5 + Math.random() * 4.5;
    this.group.rotation.y = burstAngle;
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    if (this.stacked) {
      this.pullActiveTimer = 0.2;
      const wobbleX = Math.sin(elapsed * 15 + this.hopPhase) * 0.045;
      const wobbleZ = Math.cos(elapsed * 15 + this.hopPhase) * 0.045;
      this.group.position.set(
        this.pileBasePos.x + wobbleX,
        this.pileBasePos.y,
        this.pileBasePos.z + wobbleZ
      );
      this.group.rotation.y = this.scatterAngle + Math.sin(elapsed * 6 + this.hopPhase) * 0.35;
      this.animateRig?.(elapsed, false, false);
    }
    return super.tickShikigami(dt, elapsed, ctx);
  }

  public override selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    // Stay stacked under Megumi until he releases Rabbit Escape
    if (this.stacked) return null;
    // Once released, remain on the field and swarm all nearby enemies (within 50m)
    let bestUnit: ShikigamiTargetableUnit | null = null;
    let bestDist = 50;
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
    if (this.team === 'red' && ctx.playerDetectable && ctx.playerHp > 0) {
      const dp = this.group.position.distanceTo(ctx.playerPos);
      if (dp < bestDist) {
        return { unit: null, targetPlayer: true, distance: dp };
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

    super({
      id: `toad_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Toad (Gama)',
      team: opts.team,
      shikigamiKind: 'TOAD',
      summonerId: opts.summonerId,
      canBeDamagedByCaster: false,
      maxHp: 200,
      radius: 0.7,
      height: 1.1,
      group: toadGroup,
      bodyMesh: toadBody,
      hitMeshes: [toadBody],
      hpBarFill,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 99,
      moveSpeed: 0,
      goldValue: 0,
      xpValue: 0,
      isDestructable: true,
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
 * Loaded from `/models/nue_fly.glb` with its `Fly` animation clip.
 * Swoops from above onto the targeted ground spot, discharges an electric shockwave
 * that stuns and damages all enemies in the area, then dissolves back into shadow.
 */
export class NueShikigami extends ShikigamiEntity {
  private readonly startPos: THREE.Vector3;
  private readonly targetPos: THREE.Vector3;
  private readonly shockRadius: number;
  private readonly shockDamage: number;
  private readonly stunSec: number;
  private readonly fallbackMeshGroup: THREE.Group;
  private readonly wingLeft: THREE.Mesh;
  private readonly wingRight: THREE.Mesh;
  private readonly diveDuration = 0.52;
  private mixer: THREE.AnimationMixer | null = null;
  private boltTimer = 0.05;
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

    const fallbackMeshGroup = new THREE.Group();
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

    const fallbackTorso = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), bodyMat);
    fallbackTorso.scale.set(0.9, 0.75, 1.5);
    const fallbackMask = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), maskMat);
    fallbackMask.position.set(0, 0.08, 0.56);
    fallbackMask.scale.set(0.95, 0.85, 0.65);

    const wingGeo = new THREE.BoxGeometry(1.7, 0.08, 0.95);
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-0.95, 0.1, 0);
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(0.95, 0.1, 0);
    fallbackMeshGroup.add(fallbackTorso, fallbackMask, wingLeft, wingRight);

    // Low-poly invisible hitboxes so raycasting never hits 99k skinned vertices
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), hitboxMat);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 10), hitboxMat);
    headMesh.position.set(0, 0.55, 0.35);
    headMesh.userData.isHead = true;

    const sparkAura = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 14, 14),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending
      })
    );
    group.add(fallbackMeshGroup, bodyMesh, headMesh, sparkAura);

    const hpBarFill = opts.createHpBar(group, 1.85, 1.4, opts.team);

    super({
      id: `nue_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Nue',
      team: opts.team,
      shikigamiKind: 'NUE',
      summonerId: opts.summonerId,
      canBeDamagedByCaster: false,
      maxHp: 180,
      radius: 1.35,
      height: 2.7,
      group,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh],
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
    this.fallbackMeshGroup = fallbackMeshGroup;
    this.wingLeft = wingLeft;
    this.wingRight = wingRight;
    void this.loadNueGlb();
  }

  private async loadNueGlb(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const gltf = await loadCachedGlb('/models/nue_fly.glb');
      const toonGrad = getAnimeToonGradient();
      const animRoot = cloneSkeleton(gltf.scene) as THREE.Group;
      // Native mesh height is 1.772m; scale to 2.70m stature
      animRoot.scale.setScalar(2.7 / 1.772);
      applyAnimeToonToScene(animRoot, toonGrad);
      animRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
          if (mat && mat.isMeshToonMaterial) {
            mat.color.setHex(0xd4d8e0);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        }
      });

      const mixer = new THREE.AnimationMixer(animRoot);
      const flyClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('fly')) ?? gltf.animations[0] ?? null;
      if (flyClip) {
        const act = mixer.clipAction(flyClip);
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.timeScale = 1.65;
        act.play();
      }

      this.fallbackMeshGroup.visible = false;
      this.group.add(animRoot);
      this.mixer = mixer;
    } catch (err) {
      console.warn('[NueShikigami] Failed to load /models/nue_fly.glb:', err);
    }
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
    if (this.mixer) {
      this.mixer.update(dt);
    } else {
      const flap = Math.sin(elapsed * 26) * 0.52;
      this.wingLeft.rotation.z = 0.25 + flap;
      this.wingRight.rotation.z = -0.25 - flap;
    }

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

      // Rain lightning bolts down underneath Nue as it swoops across the sky
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = 0.08 + Math.random() * 0.05;
        const ox = this.group.position.x + (Math.random() - 0.5) * 2.6;
        const oz = this.group.position.z + (Math.random() - 0.5) * 2.0;
        const gx = ox + (Math.random() - 0.5) * 1.2;
        const gz = oz + (Math.random() - 0.5) * 1.2;
        const floorY = ctx.getFloorHeight(gx, gz, this.group.position.y);
        const start = new THREE.Vector3(ox, Math.max(floorY + 1.2, this.group.position.y - 0.6), oz);
        const end = new THREE.Vector3(gx, floorY + 0.06, gz);
        ctx.spawnLightningBolt(start, end);
        ctx.spawnImpactRing(end, '#38bdf8', 1.45);
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
 * Loaded from `/models/nue_fly.glb` with its `Fly` animation clip.
 * Summoned midair after Rabbit Escape when holding SPACE; hovers overhead gripping Megumi
 * with its talons (`LeftHindFoot` / `RightHindFoot`) and carries him freely in any 3D direction.
 */
export class NueCarryShikigami extends ShikigamiEntity {
  private readonly fallbackMeshGroup: THREE.Group;
  private readonly wingLeft: THREE.Mesh;
  private readonly wingRight: THREE.Mesh;
  private mixer: THREE.AnimationMixer | null = null;
  private boltTimer = 0.08;
  private posRef?: () => THREE.Vector3;
  private yawRef: () => number;

  constructor(opts: {
    spawnPos: THREE.Vector3;
    team: MobaTeam;
    summonerId: string;
    getYaw: () => number;
    getCarrierPos?: () => THREE.Vector3;
    lifetimeSec?: number;
    createHpBar: FloatingHpBarFactory;
  }) {
    const group = new THREE.Group();
    group.position.copy(opts.spawnPos);

    const fallbackMeshGroup = new THREE.Group();
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

    const fallbackTorso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), bodyMat);
    fallbackTorso.scale.set(0.9, 0.72, 1.45);
    const fallbackMask = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), maskMat);
    fallbackMask.position.set(0, 0.04, -0.52);

    const wingGeo = new THREE.BoxGeometry(1.9, 0.08, 0.95);
    const wingLeft = new THREE.Mesh(wingGeo, wingMat);
    wingLeft.position.set(-1.1, 0.08, -0.15);
    const wingRight = new THREE.Mesh(wingGeo, wingMat);
    wingRight.position.set(1.1, 0.08, -0.15);
    fallbackMeshGroup.add(fallbackTorso, fallbackMask, wingLeft, wingRight);

    // Low-poly invisible hitboxes so raycasting never hits 99k skinned vertices
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 10), hitboxMat);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 10), hitboxMat);
    headMesh.position.set(0, 0.55, -0.35);
    headMesh.userData.isHead = true;

    group.add(fallbackMeshGroup, bodyMesh, headMesh);

    const hpBarFill = opts.createHpBar(group, 1.85, 1.4, opts.team);

    super({
      id: `nue_carry_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: 'Nue (Flight)',
      team: opts.team,
      shikigamiKind: 'NUE',
      summonerId: opts.summonerId,
      canBeDamagedByCaster: false,
      maxHp: 220,
      radius: 1.35,
      height: 2.7,
      group,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh],
      hpBarFill,
      attackRange: 0,
      attackDamage: 0,
      attackCooldown: 99,
      moveSpeed: 0,
      goldValue: 0,
      xpValue: 0,
      isDestructable: true,
      lifetimeSec: opts.lifetimeSec ?? 2.2,
      beamColor: '#38bdf8',
      attackBurstVariant: 'BLUE'
    });

    this.fallbackMeshGroup = fallbackMeshGroup;
    this.wingLeft = wingLeft;
    this.wingRight = wingRight;
    this.posRef = opts.getCarrierPos;
    this.yawRef = opts.getYaw;
    void this.loadNueCarryGlb();
  }

  private async loadNueCarryGlb(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const gltf = await loadCachedGlb('/models/nue_fly.glb');
      const toonGrad = getAnimeToonGradient();
      const animRoot = cloneSkeleton(gltf.scene) as THREE.Group;
      // Native mesh height is 1.772m; scale to 2.70m stature (~4.27m wingspan) and rotate 180° around Y
      // so Nue's +Z head/wings align with Megumi's -Z camera forward direction when group.rotation.y = yawRef()
      animRoot.scale.setScalar(2.7 / 1.772);
      animRoot.rotation.y = Math.PI;
      applyAnimeToonToScene(animRoot, toonGrad);
      animRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
          if (mat && mat.isMeshToonMaterial) {
            mat.color.setHex(0xd4d8e0);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        }
      });

      const mixer = new THREE.AnimationMixer(animRoot);
      const flyClip =
        gltf.animations.find((c) => c.name.toLowerCase().includes('fly')) ?? gltf.animations[0] ?? null;
      if (flyClip) {
        const act = mixer.clipAction(flyClip);
        act.setLoop(THREE.LoopRepeat, Infinity);
        act.timeScale = 1.35;
        act.play();
      }

      this.fallbackMeshGroup.visible = false;
      this.group.add(animRoot);
      this.mixer = mixer;
    } catch (err) {
      console.warn('[NueCarryShikigami] Failed to load /models/nue_fly.glb:', err);
    }
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    if (this.mixer) {
      this.mixer.update(dt);
    } else {
      const flap = Math.sin(elapsed * 20) * 0.42;
      this.wingLeft.rotation.z = 0.22 + flap;
      this.wingRight.rotation.z = -0.22 - flap;
    }

    // Hover cleanly overhead carrying Megumi so Nue's talons (y ≈ -1.16 local at 2.7m height) grip right at
    // Megumi's shoulders/head (carrierPos.y + 1.59) and its 4.27m wings frame the top of his view
    const carrierPos = this.posRef ? this.posRef() : ctx.playerPos;
    this.group.position.set(carrierPos.x, carrierPos.y + 2.75, carrierPos.z);
    this.group.rotation.y = this.yawRef();

    // Rain electric lightning bolts down underneath Nue as he flies by!
    this.boltTimer -= dt;
    if (this.boltTimer <= 0) {
      this.boltTimer = 0.1 + Math.random() * 0.07;
      const spreadX = (Math.random() - 0.5) * 3.4;
      const spreadZ = (Math.random() - 0.5) * 2.6;
      const ox = this.group.position.x + spreadX;
      const oz = this.group.position.z + spreadZ;
      const gx = ox + (Math.random() - 0.5) * 1.4;
      const gz = oz + (Math.random() - 0.5) * 1.4;
      const floorY = ctx.getFloorHeight(gx, gz, this.group.position.y);
      const start = new THREE.Vector3(ox, Math.max(floorY + 1.5, this.group.position.y - 0.65), oz);
      const end = new THREE.Vector3(gx, floorY + 0.06, gz);
      ctx.spawnLightningBolt(start, end);
      ctx.spawnImpactRing(end, Math.random() < 0.35 ? '#facc15' : '#38bdf8', 1.65);

      // Zap any enemy unit caught directly underneath the lightning strike
      for (const u of ctx.units) {
        if (!u.alive || u === this || u.team === this.team || u.id === this.summonerId) continue;
        const d = Math.hypot(u.group.position.x - gx, u.group.position.z - gz);
        if (d <= 2.3 + u.radius) {
          u.stunTimer = Math.max(u.stunTimer ?? 0, 0.25);
          ctx.damageUnit(
            u,
            14,
            false,
            'Nue Flight Lightning',
            u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.6, 0)),
            'ZAP!'
          );
        }
      }
    }

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
type MahoragaAnimKey = 'skill_01' | 'run' | 'sword_slash' | 'spartan_kick';

interface MahoragaRigHandle {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<MahoragaAnimKey, THREE.AnimationAction | null>;
  activeKey: MahoragaAnimKey | null;
}

/**
 * Eight-Handled Sword Divergent Sila Divine General Mahoraga:
 * - Loaded from `/models/mahoraga_combined.glb` with animations:
 *   `Skill_01`, `RunFast`, `Right_Hand_Sword_Slash`, `Spartan_Kick`.
 * - Targets the living enemy with the highest combined Health + Cursed Energy (`hp + ce`)
 *   and locks onto that target until it kills them!
 * - Immediately triggers `Skill_01` upon being summoned AND whenever it changes target.
 * - Cycles through its combat attack animations (`Right_Hand_Sword_Slash` <-> `Spartan_Kick`)
 *   while striking, and `RunFast` while pursuing its locked target.
 * - Dharma Wheel Adaptation: takes progressively less damage each time hit by the same move
 *   (100% -> 72% -> 52% -> 37% -> ... -> 10% floor), clicking its 8-handled golden wheel 45°.
 * - Rogue Berserk: once all living enemies on the enemy team are eliminated, flips team
 *   against its summoner and hunts Megumi and Megumi's allies!
 */
export class MahoragaShikigami extends ShikigamiEntity {
  private readonly adaptationCounts = new Map<string, number>();
  private readonly wheelGroup: THREE.Group;
  private readonly fallbackMeshGroup: THREE.Group;
  private wheelCurrentAngle = 0;
  private wheelTargetAngle = 0;

  private lockedTargetId: string | null = null;
  private unreachableTimer = 0;
  private bestReachDistance = Infinity;
  private readonly unreachableCooldowns = new Map<string, number>();
  private skill01Timer = 1.083;
  private pendingSkill01Vfx = true;
  private attackAnimTimer = 0;
  private activeAttackAnim: 'sword_slash' | 'spartan_kick' = 'sword_slash';
  private nextAttackIsKick = false;
  private activeAttackSourceName = 'Sword of Extermination';
  private rig: MahoragaRigHandle | null = null;
  private lastRigElapsed = -1;

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
      color: 0xd1d5db,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.65
    });
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      emissive: 0x78350f,
      emissiveIntensity: 0.12,
      metalness: 0.65,
      roughness: 0.38
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.5,
      roughness: 0.35
    });

    const fallbackMeshGroup = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 1.25, 10), skinMat);
    legL.position.set(-0.34, 0.65, 0);
    const legR = legL.clone();
    legR.position.x = 0.34;

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.65, 12), clothMat);
    waist.position.y = 1.35;

    const fallbackTorso = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.45, 1.15, 12), skinMat);
    fallbackTorso.position.y = 2.15;

    const fallbackHead = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 14), skinMat);
    fallbackHead.position.y = 2.95;

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

    fallbackMeshGroup.add(
      legL,
      legR,
      waist,
      fallbackTorso,
      fallbackHead,
      crestUL,
      crestUR,
      tailCrest,
      armL,
      armRPivot
    );

    // Low-poly invisible hit capsules so raycasting never hits 148k skinned triangles
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 2.55, 10), hitboxMat);
    bodyMesh.position.y = 1.45;
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 10), hitboxMat);
    headMesh.position.y = 3.05;
    headMesh.userData.isHead = true;

    // Eight-Handled Golden Dharma Wheel floating above Mahoraga
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 3.75, -0.15);
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

    group.add(fallbackMeshGroup, bodyMesh, headMesh, wheelGroup);

    const hpBarFill = opts.createHpBar(group, 4.35, 2.4, opts.ownerTeam);
    const nameplateMesh = opts.createNameplate(group, 4.78, 'MAHORAGA · DIVINE GENERAL', '#facc15');

    super({
      id: `mahoraga_${Date.now()}`,
      name: 'Mahoraga',
      team: opts.ownerTeam,
      ownerTeam: opts.ownerTeam,
      shikigamiKind: 'MAHORAGA',
      summonerId: opts.summonerId,
      canBeDamagedByAnyone: true,
      canBeDamagedByCaster: true,
      maxHp: 950,
      radius: 1.15,
      height: 3.4,
      group,
      bodyMesh,
      headMesh,
      hitMeshes: [bodyMesh, headMesh],
      hpBarFill,
      nameplateMesh,
      attackRange: 4.4,
      attackDamage: 62,
      attackCooldown: 1.05,
      moveSpeed: 10.2,
      goldValue: 180,
      xpValue: 140,
      lifetimeSec: null,
      beamColor: '#facc15',
      attackBurstVariant: 'FIRE',
      animateRig: (elapsed, isMoving, isStunned) => {
        this.updateMahoragaAnimation(elapsed, isMoving, isStunned);
        if (!this.rig) {
          const stride = isMoving ? Math.sin(elapsed * 9.5) * 0.45 : 0;
          legL.rotation.x = stride;
          legR.rotation.x = -stride;
          armL.rotation.x = -stride * 0.7;
          armRPivot.rotation.x = stride * 0.7 - 0.25;
        }
      }
    });

    this.wheelGroup = wheelGroup;
    this.fallbackMeshGroup = fallbackMeshGroup;
    this.attackTimer = 0.35;
    void this.loadMahoragaGlb();
  }

  private async loadMahoragaGlb(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const gltf = await loadCachedGlb('/models/mahoraga_combined.glb');
      const toonGrad = getAnimeToonGradient();
      const animRoot = cloneSkeleton(gltf.scene) as THREE.Group;
      // Native mesh height is 2.70m; scale to 3.40m towering Divine General stature
      animRoot.scale.setScalar(3.4 / 2.7);
      applyAnimeToonToScene(animRoot, toonGrad);
      // Tone down albedo & zero out emissive on Mahoraga's pale skin so directional light + HDR exposure (1.4)
      // never pushes his mesh above the UnrealBloomPass threshold (1.28)
      animRoot.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
          if (mat && mat.isMeshToonMaterial) {
            mat.color.setHex(0xb8bec8);
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0.0;
          }
        }
      });

      const mixer = new THREE.AnimationMixer(animRoot);
      const findClip = (substr: string) =>
        gltf.animations.find((c) => c.name.toLowerCase().includes(substr.toLowerCase())) ?? null;

      const skillClip = findClip('Skill_01');
      const runClip = findClip('RunFast');
      const slashClip = findClip('Right_Hand_Sword_Slash');
      const kickClip = findClip('Spartan_Kick');

      const makeAction = (clip: THREE.AnimationClip | null, loop: boolean) => {
        if (!clip) return null;
        const act = mixer.clipAction(clip);
        if (loop) {
          act.setLoop(THREE.LoopRepeat, Infinity);
        } else {
          act.setLoop(THREE.LoopOnce, 1);
          act.clampWhenFinished = true;
        }
        return act;
      };

      const actions: Record<MahoragaAnimKey, THREE.AnimationAction | null> = {
        skill_01: makeAction(skillClip, false),
        run: makeAction(runClip, true),
        sword_slash: makeAction(slashClip, false),
        spartan_kick: makeAction(kickClip, false)
      };

      this.fallbackMeshGroup.visible = false;
      this.group.add(animRoot);
      this.rig = {
        root: animRoot,
        mixer,
        actions,
        activeKey: null
      };

      // Immediately play Skill_01 if still in the summon / target-switch Skill_01 window
      if (this.skill01Timer > 0) {
        this.playRigAction('skill_01', true);
      } else {
        this.playRigAction('run', true);
      }
    } catch (err) {
      console.warn('Failed to load mahoraga_combined.glb:', err);
    }
  }

  private playRigAction(key: MahoragaAnimKey, forceReset = false): void {
    if (!this.rig) return;
    const nextAction = this.rig.actions[key];
    if (!nextAction) return;
    if (this.rig.activeKey === key && !forceReset) return;

    const prevAction = this.rig.activeKey ? this.rig.actions[this.rig.activeKey] : null;
    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveWeight(1.0);
    nextAction.setEffectiveTimeScale(key === 'run' ? 0.92 : 1.0);
    nextAction.play();
    if (prevAction && prevAction !== nextAction) {
      prevAction.enabled = true;
      nextAction.crossFadeFrom(prevAction, 0.16, false);
    }
    this.rig.activeKey = key;
  }

  private updateMahoragaAnimation(elapsed: number, isMoving: boolean, isStunned: boolean): void {
    if (!this.rig) return;
    const dt =
      this.lastRigElapsed < 0 ? 0.016 : Math.max(0, Math.min(0.1, elapsed - this.lastRigElapsed));
    this.lastRigElapsed = elapsed;

    if (isStunned) return;

    if (this.skill01Timer > 0) {
      if (this.rig.activeKey !== 'skill_01') {
        this.playRigAction('skill_01', true);
      }
    } else if (this.attackAnimTimer > 0) {
      if (this.rig.activeKey !== this.activeAttackAnim) {
        this.playRigAction(this.activeAttackAnim, true);
      }
    } else if (isMoving) {
      if (this.rig.actions.run) {
        this.rig.actions.run.setEffectiveTimeScale(0.92);
      }
      if (this.rig.activeKey !== 'run') {
        this.playRigAction('run', true);
      }
    } else {
      // Idle combat ready poise: slow breathing cadence on RunFast / combat stance
      if (this.rig.actions.run) {
        if (this.rig.activeKey !== 'run') {
          this.playRigAction('run', true);
        }
        this.rig.actions.run.setEffectiveTimeScale(0.18);
      }
    }

    this.rig.mixer.update(dt);
  }

  /** Returns true when Mahoraga is not locked in his `Skill_01` summon / target-switch roar animation. */
  public canMoveNow(): boolean {
    return this.skill01Timer <= 0;
  }

  /**
   * Cycles between Mahoraga's `Right_Hand_Sword_Slash` and `Spartan_Kick` attack animations
   * whenever he strikes his target, returning the active move label & knockback distance.
   */
  public triggerNextCombatAttack(): { attackName: string; isKick: boolean; knockback: number } {
    const isKick = this.nextAttackIsKick;
    this.nextAttackIsKick = !this.nextAttackIsKick;
    if (isKick) {
      this.activeAttackAnim = 'spartan_kick';
      this.attackAnimTimer = 0.95;
      this.activeAttackSourceName = 'Mahoraga Spartan Kick';
      this.playRigAction('spartan_kick', true);
      return { attackName: 'Mahoraga Spartan Kick', isKick: true, knockback: 8.5 };
    } else {
      this.activeAttackAnim = 'sword_slash';
      this.attackAnimTimer = 0.95;
      this.activeAttackSourceName = 'Right Hand Sword Slash';
      this.playRigAction('sword_slash', true);
      return { attackName: 'Right Hand Sword Slash', isKick: false, knockback: 4.2 };
    }
  }

  /**
   * Triggers Mahoraga's `Skill_01` animation and golden shockwave burst immediately on summon
   * and whenever he locks onto a new target.
   */
  private triggerSkill01(): void {
    this.skill01Timer = 1.083;
    this.attackAnimTimer = 0;
    this.pendingSkill01Vfx = true;
    this.playRigAction('skill_01', true);
  }

  /** Called whenever Mahoraga successfully lands a melee strike on his current target. */
  public notifyAttackLanded(): void {
    this.unreachableTimer = 0;
  }

  public override tickShikigami(dt: number, elapsed: number, ctx: ShikigamiContext): boolean {
    this.wheelCurrentAngle = THREE.MathUtils.lerp(
      this.wheelCurrentAngle,
      this.wheelTargetAngle,
      Math.min(1, dt * 8)
    );
    this.wheelGroup.rotation.y = this.wheelCurrentAngle;

    if (this.skill01Timer > 0) {
      this.skill01Timer = Math.max(0, this.skill01Timer - dt);
    }
    if (this.attackAnimTimer > 0) {
      this.attackAnimTimer = Math.max(0, this.attackAnimTimer - dt);
    }
    if (this.pendingSkill01Vfx) {
      this.pendingSkill01Vfx = false;
      this.wheelTargetAngle += Math.PI / 4;
      const origin = this.group.position.clone();
      ctx.spawnImpactRing(origin.clone().add(new THREE.Vector3(0, 0.25, 0)), '#d97706', 4.6);
      ctx.spawnCursedBurst(origin.clone().add(new THREE.Vector3(0, 1.6, 0)), 'SHADOW', 1.8, 36);
    }

    // Decrement unreachable target cooldowns
    for (const [tid, rem] of this.unreachableCooldowns.entries()) {
      if (rem - dt <= 0) {
        this.unreachableCooldowns.delete(tid);
      } else {
        this.unreachableCooldowns.set(tid, rem - dt);
      }
    }

    // Track whether Mahoraga has failed to reach or close in on his locked target for over 3.0 seconds
    if (this.lockedTargetId && this.skill01Timer <= 0) {
      let curDist: number | null = null;
      if (this.lockedTargetId === 'player') {
        if (ctx.playerDetectable && ctx.playerHp > 0) {
          curDist = this.group.position.distanceTo(ctx.playerPos);
        }
      } else {
        const lu = ctx.units.find((u) => u.id === this.lockedTargetId && u.alive);
        if (lu) {
          curDist = this.group.position.distanceTo(lu.group.position);
        }
      }

      if (curDist !== null) {
        if (curDist <= this.attackRange) {
          // Within melee reach
          this.unreachableTimer = 0;
          this.bestReachDistance = curDist;
        } else if (curDist < this.bestReachDistance - 0.65) {
          // Making steady forward progress toward the target
          this.bestReachDistance = curDist;
          this.unreachableTimer = Math.max(0, this.unreachableTimer - dt * 0.5);
        } else {
          // Blocked by a wall/domain barrier, outrun, or unable to reach for > 3 seconds
          this.unreachableTimer += dt;
          if (this.unreachableTimer >= 3.0) {
            this.unreachableCooldowns.set(this.lockedTargetId, 6.0);
            this.unreachableTimer = 0;
            this.bestReachDistance = Infinity;
          }
        }
      }
    }

    if (!this.rogue) {
      const enemyTeam: MobaTeam = this.ownerTeam === 'blue' ? 'red' : 'blue';
      const remainingEnemies = ctx.units.some(
        (other) =>
          other.alive &&
          other !== this &&
          other.team === enemyTeam &&
          other.type !== 'TOWER' &&
          other.type !== 'CORE' &&
          other.isDestructable !== false
      );
      if (!remainingEnemies) {
        this.rogue = true;
        this.team = enemyTeam;
        this.lockedTargetId = null; // Force re-acquire & trigger Skill_01 on new target
        this.unreachableTimer = 0;
        this.bestReachDistance = Infinity;
        ctx.spawnImpactRing(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ef4444', 9.0);
        ctx.spawnCursedBurst(this.group.position.clone().add(new THREE.Vector3(0, 2.0, 0)), 'RED', 3.4, 90);
        ctx.spawnPopup('⚠ MAHORAGA TURNS ON SUMMONER!', '#ef4444', 26, 0, true);
      }
    }

    return super.tickShikigami(dt, elapsed, ctx);
  }

  /**
   * Scores any valid combatant (Players, NPCs, Shikigami, or Minions) by their combined
   * Health + Cursed Energy (`hp + ce`) so Mahoraga targets Shikigamis, NPCs, and Players alike.
   */
  private getUnitHpAndCeScore(u: ShikigamiTargetableUnit): number {
    const ce =
      u.npcAi !== undefined
        ? u.npcAi.ce
        : u.heroDef !== undefined
          ? u.heroDef.maxMana * (u.hp / Math.max(1, u.maxHp))
          : u.type === 'HERO'
            ? 100 * (u.hp / Math.max(1, u.maxHp))
            : u.type === 'SHIKIGAMI'
              ? 60 * (u.hp / Math.max(1, u.maxHp))
              : 0;
    return u.hp + ce;
  }

  private isValidCombatTargetUnit(u: ShikigamiTargetableUnit): boolean {
    if (!u.alive || u === this) return false;
    if (u.type === 'TOWER' || u.type === 'CORE' || u.type === 'CONSTRUCT') return false;
    if (u.isDestructable === false) return false;
    // When rogue, Mahoraga hunts everyone (Players, NPCs, and Shikigami alike); otherwise enemy team units
    if (!this.rogue && u.team === this.team) return false;
    return true;
  }

  public override selectTarget(ctx: ShikigamiContext): ShikigamiTarget | null {
    // 1. Keep locked onto the current target until killed, UNLESS they became unreachable for > 3 seconds
    const lockedTimedOut =
      this.lockedTargetId !== null && this.unreachableCooldowns.has(this.lockedTargetId);

    if (!lockedTimedOut) {
      if (this.lockedTargetId === 'player') {
        if ((this.team === 'red' || this.rogue) && ctx.playerDetectable && ctx.playerHp > 0) {
          const dp = this.group.position.distanceTo(ctx.playerPos);
          return { unit: null, targetPlayer: true, distance: dp };
        }
      } else if (this.lockedTargetId) {
        const lockedUnit = ctx.units.find(
          (u) => u.id === this.lockedTargetId && this.isValidCombatTargetUnit(u)
        );
        if (lockedUnit) {
          const d = this.group.position.distanceTo(lockedUnit.group.position);
          return { unit: lockedUnit, targetPlayer: false, distance: d };
        }
      }
    }

    // 2. Pick the highest (HP + CE) target among Shikigami, NPCs, and Players (skipping unreachable-cooldown targets if alternatives exist)
    const pickBest = (ignoreCooldowns: boolean): {
      unit: ShikigamiTargetableUnit | null;
      targetPlayer: boolean;
      dist: number;
    } => {
      let bestUnit: ShikigamiTargetableUnit | null = null;
      let bestScore = -Infinity;
      let bestDist = Infinity;
      let targetPlayer = false;

      for (const other of ctx.units) {
        if (!this.isValidCombatTargetUnit(other)) continue;
        if (!ignoreCooldowns && this.unreachableCooldowns.has(other.id)) continue;

        const score = this.getUnitHpAndCeScore(other);
        const d = this.group.position.distanceTo(other.group.position);
        if (score > bestScore || (Math.abs(score - bestScore) < 1 && d < bestDist)) {
          bestScore = score;
          bestDist = d;
          bestUnit = other;
          targetPlayer = false;
        }
      }

      const canTargetPlayer =
        (this.team === 'red' || this.rogue) &&
        ctx.playerDetectable &&
        ctx.playerHp > 0 &&
        (ignoreCooldowns || !this.unreachableCooldowns.has('player'));

      if (canTargetPlayer) {
        const playerScore = ctx.playerHp + ctx.playerMana;
        const dp = this.group.position.distanceTo(ctx.playerPos);
        if (playerScore > bestScore || (Math.abs(playerScore - bestScore) < 1 && dp < bestDist)) {
          bestScore = playerScore;
          bestDist = dp;
          bestUnit = null;
          targetPlayer = true;
        }
      }

      return { unit: bestUnit, targetPlayer, dist: bestDist };
    };

    let chosen = pickBest(false);
    if (!chosen.unit && !chosen.targetPlayer) {
      chosen = pickBest(true);
    }

    const nextTargetId = chosen.targetPlayer ? 'player' : chosen.unit ? chosen.unit.id : null;
    if (nextTargetId && nextTargetId !== this.lockedTargetId) {
      const hadPreviousTarget = this.lockedTargetId !== null;
      this.lockedTargetId = nextTargetId;
      this.unreachableTimer = 0;
      this.bestReachDistance = chosen.dist;
      // Trigger Skill_01 whenever Mahoraga changes target (whether from a kill or 3s unreachable timeout)
      if (hadPreviousTarget) {
        this.triggerSkill01();
      }
    } else if (!nextTargetId) {
      this.lockedTargetId = null;
      this.unreachableTimer = 0;
      this.bestReachDistance = Infinity;
    }

    if (chosen.targetPlayer) {
      return { unit: null, targetPlayer: true, distance: chosen.dist };
    }
    return chosen.unit ? { unit: chosen.unit, targetPlayer: false, distance: chosen.dist } : null;
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

    const wheelWorld = this.group.position.clone().add(new THREE.Vector3(0, 3.75, 0));
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

