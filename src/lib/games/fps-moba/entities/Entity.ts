import * as THREE from 'three';
import type { MobaTeam, MobaUnitType, FpsHeroDef } from '../types';
import type { HeroAnimHint } from './ProceduralHeroBuilder';

export type { HeroAnimHint };

export interface NpcAiState {
  ce: number;
  maxCe: number;
  burnout: number;
  regen: number;
  cd: { red: number; blue: number; shift: number; infinity: number; domain: number };
  busy: number;
  think: number;
  infinityHold: number;
  strafeDir: 1 | -1;
  strafeTimer: number;
  wanderTimer: number;
}

export interface IMobaEntity {
  id: string;
  name: string;
  team: MobaTeam;
  isDestructable: boolean;
  hp: number;
  maxHp: number;
  alive: boolean;
  takeDamage(amount: number): number;
  heal(amount: number): number;
  isAlive(): boolean;
}

/**
 * Base class for all battlefield entities (Heroes, Minions, Structures, Barriers).
 * Extensible for new entity kinds, boss units, constructs, or barrier shields.
 */
export abstract class MobaEntity<T extends string = MobaUnitType | 'BARRIER'> implements IMobaEntity {
  id: string;
  name: string;
  team: MobaTeam;
  type: T;
  isDestructable: boolean = true;
  hp: number;
  maxHp: number;
  alive: boolean = true;
  group: THREE.Group;
  radius: number;
  height: number;
  outOfCombatTimer: number = 0;

  constructor(opts: {
    id: string;
    name: string;
    team: MobaTeam;
    type: T;
    maxHp: number;
    radius: number;
    height: number;
    isDestructable?: boolean;
    group?: THREE.Group;
  }) {
    this.id = opts.id;
    this.name = opts.name;
    this.team = opts.team;
    this.type = opts.type;
    this.maxHp = opts.maxHp;
    this.hp = opts.maxHp;
    this.radius = opts.radius;
    this.height = opts.height;
    this.isDestructable = opts.isDestructable ?? true;
    this.group = opts.group ?? new THREE.Group();
  }

  get isDestructible(): boolean {
    return this.isDestructable;
  }

  set isDestructible(val: boolean) {
    this.isDestructable = val;
  }

  /**
   * Returns true if this entity can receive damage from `attackerId` on `attackerTeam`.
   * Subclasses (e.g. ShikigamiEntity) override this so certain summons (like Mahoraga)
   * can be damaged by anyone (even their summoner), while others (like Nue & Rabbit Escape)
   * cannot be damaged by their caster.
   */
  public canTakeDamageFrom(attackerId: string, attackerTeam: MobaTeam): boolean {
    if (!this.alive || !this.isDestructable) return false;
    return attackerTeam !== this.team;
  }

  takeDamage(amount: number): number {
    if (!this.isDestructable || !this.alive || amount <= 0) return 0;
    const taken = Math.min(this.hp, amount);
    this.hp = Math.max(0, this.hp - taken);
    this.outOfCombatTimer = 5.0;
    if (this.hp <= 0) {
      this.alive = false;
    }
    return taken;
  }

  heal(amount: number): number {
    if (!this.alive || amount <= 0) return 0;
    const restored = Math.min(this.maxHp - this.hp, amount);
    this.hp += restored;
    return restored;
  }

  isAlive(): boolean {
    return this.alive && this.hp > 0;
  }
}

/**
 * Concrete battlefield unit class implementing MobaUnit interface for seamless backward and forward compatibility.
 */
export class MobaUnitEntity extends MobaEntity<MobaUnitType> {
  bodyMesh: THREE.Mesh;
  headMesh?: THREE.Mesh;
  hitMeshes?: THREE.Object3D[];
  hpBarFill: THREE.Mesh;
  nameplateMesh?: THREE.Mesh;
  animateRig?: (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => void;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  attackTimer: number = 0;
  moveSpeed: number;
  goldValue: number;
  xpValue: number;
  isDummy?: boolean;
  isRoamer?: boolean;
  heroDef?: FpsHeroDef;
  npcAi?: NpcAiState;
  npcAbilityTimer?: number;
  npcAbilityIndex?: number;
  npcShieldTimer?: number;
  npcShieldMesh?: THREE.Mesh;
  npcShieldMat?: THREE.ShaderMaterial;
  npcShieldAudio?: THREE.PositionalAudio;
  npcCast?: { t: number; dur: number; target: THREE.Vector3; marker: THREE.Group };
  roamPhase?: HeroAnimHint;
  roamTimer?: number;
  roamTarget?: THREE.Vector3;
  animOverrideHint?: HeroAnimHint;
  animOverrideTimer?: number;
  npcDelayedBeam?: { timer: number; dir: THREE.Vector3 };
  respawnTimer?: number;
  spawnPos?: THREE.Vector3;
  stunTimer?: number;
  verticalVel?: number;
  pullActiveTimer?: number;
  knockbackVel?: THREE.Vector3;
  hpBarRevealTimer: number = 0;

  constructor(opts: {
    id: string;
    name: string;
    team: MobaTeam;
    type: MobaUnitType;
    maxHp: number;
    radius: number;
    height: number;
    group: THREE.Group;
    bodyMesh: THREE.Mesh;
    hpBarFill: THREE.Mesh;
    headMesh?: THREE.Mesh;
    hitMeshes?: THREE.Object3D[];
    nameplateMesh?: THREE.Mesh;
    animateRig?: (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => void;
    attackRange: number;
    attackDamage: number;
    attackCooldown: number;
    moveSpeed: number;
    goldValue: number;
    xpValue: number;
    isDestructable?: boolean;
    isDummy?: boolean;
    isRoamer?: boolean;
    heroDef?: FpsHeroDef;
    npcAi?: NpcAiState;
    spawnPos?: THREE.Vector3;
  }) {
    super({
      id: opts.id,
      name: opts.name,
      team: opts.team,
      type: opts.type,
      maxHp: opts.maxHp,
      radius: opts.radius,
      height: opts.height,
      isDestructable: opts.isDestructable ?? true,
      group: opts.group
    });

    this.bodyMesh = opts.bodyMesh;
    this.headMesh = opts.headMesh;
    this.hitMeshes = opts.hitMeshes;
    this.hpBarFill = opts.hpBarFill;
    this.nameplateMesh = opts.nameplateMesh;
    this.animateRig = opts.animateRig;
    this.attackRange = opts.attackRange;
    this.attackDamage = opts.attackDamage;
    this.attackCooldown = opts.attackCooldown;
    this.moveSpeed = opts.moveSpeed;
    this.goldValue = opts.goldValue;
    this.xpValue = opts.xpValue;
    this.isDummy = opts.isDummy;
    this.isRoamer = opts.isRoamer;
    this.heroDef = opts.heroDef;
    this.npcAi = opts.npcAi;
    this.spawnPos = opts.spawnPos;
    this.knockbackVel = new THREE.Vector3();
  }
}

/**
 * Specialized Hero Unit class.
 */
export class HeroUnit extends MobaUnitEntity {
  constructor(opts: ConstructorParameters<typeof MobaUnitEntity>[0]) {
    super({ ...opts, type: 'HERO' });
  }

  spendCursedEnergy(amount: number): boolean {
    if (!this.npcAi) return true;
    if (this.npcAi.burnout > 0) return false;
    this.npcAi.ce = Math.max(0, this.npcAi.ce - amount);
    if (this.npcAi.ce <= 0) {
      this.npcAi.burnout = 10.0;
    }
    return true;
  }
}

/**
 * Specialized Minion Unit class.
 */
export class MinionUnit extends MobaUnitEntity {
  constructor(opts: ConstructorParameters<typeof MobaUnitEntity>[0]) {
    super({ ...opts, type: 'MINION' });
  }
}

/**
 * Specialized Structure Unit class (Towers, Cores).
 */
export class StructureUnit extends MobaUnitEntity {
  constructor(opts: ConstructorParameters<typeof MobaUnitEntity>[0]) {
    super(opts);
  }
}

/**
 * Summoned Battlefield Construct (not a Shikigami — e.g. Jogo's wall-sticking Mini Volcanoes).
 * Has its own destructible health pool and floating HP bar so enemies can destroy it early.
 */
export class MiniVolcanoUnit extends MobaUnitEntity {
  readonly casterId: string;
  readonly lavaMesh: THREE.Mesh;
  readonly pos: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly detectRadius: number;
  age: number = 0;
  readonly maxAge: number;
  fireCooldown: number = 0.25;

  constructor(opts: {
    id: string;
    team: MobaTeam;
    casterId: string;
    pos: THREE.Vector3;
    normal: THREE.Vector3;
    damage: number;
    detectRadius: number;
    durationMs: number;
    group: THREE.Group;
    coneMesh: THREE.Mesh;
    lavaMesh: THREE.Mesh;
    hpBarFill: THREE.Mesh;
  }) {
    super({
      id: opts.id,
      name: 'Mini Volcano',
      team: opts.team,
      type: 'CONSTRUCT',
      maxHp: 110,
      radius: 0.62,
      height: 0.75,
      group: opts.group,
      bodyMesh: opts.coneMesh,
      headMesh: opts.lavaMesh,
      hitMeshes: [opts.coneMesh, opts.lavaMesh],
      hpBarFill: opts.hpBarFill,
      attackRange: 0,
      attackDamage: opts.damage,
      attackCooldown: 0.68,
      moveSpeed: 0,
      goldValue: 15,
      xpValue: 10,
      isDestructable: true
    });
    this.casterId = opts.casterId;
    this.lavaMesh = opts.lavaMesh;
    this.pos = opts.pos.clone();
    this.normal = opts.normal.clone().normalize();
    this.detectRadius = opts.detectRadius;
    this.maxAge = opts.durationMs / 1000;
    opts.coneMesh.userData.unit = this;
    opts.lavaMesh.userData.unit = this;
  }

  public override canTakeDamageFrom(attackerId: string, attackerTeam: MobaTeam): boolean {
    if (!this.alive || !this.isDestructable) return false;
    // Cannot be damaged by its own caster, but can be destroyed by any enemy or rogue unit
    if (attackerId === this.casterId) return false;
    return attackerTeam !== this.team;
  }
}

/**
 * Barrier Entity representing physical and spatial barriers (Infinity Barrier, Domain Barrier).
 */
export class DomainBarrierEntity extends MobaEntity {
  domainId: string;

  constructor(opts: {
    id: string;
    domainId: string;
    team: MobaTeam;
    maxHp: number;
    radius: number;
    isDestructable?: boolean;
    group?: THREE.Group;
  }) {
    super({
      id: opts.id,
      name: 'Domain Barrier',
      team: opts.team,
      type: 'BARRIER',
      maxHp: opts.maxHp,
      radius: opts.radius,
      height: opts.radius * 2,
      isDestructable: opts.isDestructable ?? true,
      group: opts.group
    });
    this.domainId = opts.domainId;
  }
}
