import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  CE_EXHAUSTION_LOCKOUT_SEC,
  STANDARD_CE_REGEN_PER_SEC,
  type DamagePopup,
  type FpsAbilityDef,
  type FpsAbilityKey,
  type FpsHeroDef,
  type FpsHudState,
  type KillFeedEntry,
  type MinimapBlip,
  type MobaTeam,
  type MobaUnitType
} from './types';
import { MobaMapBuilder } from './world/MobaMapBuilder';
import { FpsViewModel } from './entities/FpsViewModel';
import { buildProceduralHeroModel, type HeroAnimHint } from './entities/ProceduralHeroBuilder';
import {
  createCursedEnergyOrb,
  createInfinityDistortionMaterial,
  createUnlimitedVoidDomainVfx,
  type UnlimitedVoidDomainController
} from './vfx/CursedShaderVfx';
import { getMouseSensitivity } from './storage';
import { FPS_MOBA_HEROES } from './data/heroes';

const BLUE_MIN_RADIUS = 3;
const BLUE_MAX_RADIUS = 9;
const BLUE_MAX_CHARGE_MS = 1600;
const BLUE_CHARGE_DRAIN_PER_SEC = 26;
const TELEPORT_MAX_RANGE = 30;
const TELEPORT_CAM_DIST = 4.6;

interface NpcAiState {
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

interface NpcDomainState {
  casterId: string;
  center: THREE.Vector3;
  radius: number;
  ageSec: number;
  remainingSec: number;
  tickSec: number;
  playerTrapped: boolean;
  purpleFired: boolean;
  ringMesh: THREE.Mesh;
  voidVfx: UnlimitedVoidDomainController;
  color: string;
}

interface MobaUnit {
  id: string;
  name: string;
  team: MobaTeam;
  type: MobaUnitType;
  group: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh?: THREE.Mesh;
  hitMeshes?: THREE.Object3D[];
  hpBarFill: THREE.Mesh;
  nameplateMesh?: THREE.Mesh;
  animateRig?: (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => void;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  attackTimer: number;
  moveSpeed: number;
  goldValue: number;
  xpValue: number;
  alive: boolean;
  isDummy?: boolean;
  isRoamer?: boolean;
  heroDef?: FpsHeroDef;
  npcAi?: NpcAiState;
  npcAbilityTimer?: number;
  npcAbilityIndex?: number;
  npcShieldTimer?: number;
  npcShieldMesh?: THREE.Mesh;
  npcShieldMat?: THREE.ShaderMaterial;
  npcCast?: { t: number; dur: number; target: THREE.Vector3; marker: THREE.Group };
  roamPhase?: HeroAnimHint;
  roamTimer?: number;
  roamTarget?: THREE.Vector3;
  outOfCombatTimer?: number;
  respawnTimer?: number;
  spawnPos?: THREE.Vector3;
  stunTimer?: number;
  knockbackVel?: THREE.Vector3;
}

interface Active3DVfx {
  mesh: THREE.Object3D;
  age: number;
  maxAge: number;
  onUpdate: (dt: number, progress: number) => void;
}

export class FpsMobaEngine {
  private container: HTMLElement;
  private hero: FpsHeroDef;
  private onHudUpdate: (state: FpsHudState) => void;

  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private mapBuilder!: MobaMapBuilder;
  private viewModel!: FpsViewModel;

  // Player state (Blue Team)
  private playerPos = new THREE.Vector3(0, 0, 64);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private hp: number;
  private maxHp: number;
  private shield = 0;
  private mana: number;
  private maxMana: number;
  private manaExhaustedTimerSec = 0;
  private ammo: number;
  private maxAmmo: number;
  private autoRegenTimerMs = 0;
  private isReloading = false;
  private reloadRemainingMs = 0;
  private fireCooldownMs = 0;

  // Secondary Fire state (Barrier Shield / Charged Rocket Punch / Helix Rocket)
  private rightMouseDown = false;
  private barrierHp: number;
  private barrierMaxHp: number;
  private barrierRegenDelaySec = 0;
  private isChargingPunch = false;
  private punchChargeMs = 0;
  private isChargingPrimary = false;
  private primaryChargeMs = 0;
  private activeBlueOrb: { mesh: THREE.Object3D; triggerAttract: () => void } | null = null;
  private isChargingBlue = false;
  private blueChargeMs = 0;
  private blueIndicator: THREE.Group | null = null;
  private teleportPhase: 'NONE' | 'AIMING' | 'CASTING' = 'NONE';
  private teleportCastMs = 0;
  private teleportTarget = new THREE.Vector3();
  private teleportMarker: THREE.Group | null = null;
  private teleportCamBlend = 0;
  private teleportMorph = 0;
  private npcDomain: NpcDomainState | null = null;
  private playerAvatar: {
    group: THREE.Group;
    animate: (elapsed: number, isMoving: boolean, isStunned: boolean, animHint?: HeroAnimHint) => void;
  } | null = null;
  private secondaryCooldownMs = 0;
  private isPowerEmpowered = false;
  private inspireTimerSec = 0;
  private executionerTimerSec = 0;

  private level = 1;
  private xp = 0;
  private nextLevelXp = 100;
  private gold = 500;
  private kills = 0;
  private deaths = 0;
  private assists = 0;
  private minionKills = 0;
  private playerRespawnTimer = 0;

  // Cooldowns
  private cooldowns: Record<FpsAbilityKey, { remainingMs: number; totalMs: number }>;

  // Domain Expansion / Rally Ultimate state
  private activeDomain: {
    name: string;
    isRally: boolean;
    isGojoDomain: boolean;
    center: THREE.Vector3;
    radius: number;
    hp: number;
    maxHp: number;
    trappedUnitIds: Set<string>;
    purpleTriggered: boolean;
    ageSec: number;
    remainingMs: number;
    tickTimerMs: number;
    color: string;
    domeMesh: THREE.Mesh;
    ringMesh: THREE.Mesh;
    voidVfx?: UnlimitedVoidDomainController;
  } | null = null;

  // Input state
  private keys: Set<string> = new Set();
  private mouseDown = false;
  private pointerLocked = false;

  // Battlefield units & VFX
  private units: MobaUnit[] = [];
  private vfxList: Active3DVfx[] = [];
  private killFeed: KillFeedEntry[] = [];
  private damagePopups: DamagePopup[] = [];
  private popupCounter = 1;
  private hitMarkerAlpha = 0;
  private hitMarkerCrit = false;

  // Timers
  private clock = new THREE.Clock();
  private matchTimeSec = 0;
  private waveTimerSec = 2.0;
  private waveCount = 0;
  private hudThrottle = 0;
  private winner: MobaTeam | null = null;
  private destroyed = false;
  private animFrameId = 0;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onResizeBound: () => void;

  constructor(container: HTMLElement, hero: FpsHeroDef, onHudUpdate: (state: FpsHudState) => void) {
    this.container = container;
    this.hero = hero;
    this.onHudUpdate = onHudUpdate;

    this.maxHp = hero.maxHp;
    this.hp = hero.maxHp;
    this.maxMana = hero.maxMana;
    this.mana = hero.maxMana;
    this.maxAmmo = hero.weapon.magazineSize;
    this.ammo = hero.weapon.magazineSize;

    this.barrierMaxHp = hero.secondaryFire.barrierMaxHp ?? 0;
    this.barrierHp = this.barrierMaxHp;

    this.cooldowns = {
      SHIFT: { remainingMs: 0, totalMs: hero.abilities.SHIFT.cooldownMs },
      E: { remainingMs: 0, totalMs: hero.abilities.E.cooldownMs },
      Q: { remainingMs: 0, totalMs: hero.abilities.Q.cooldownMs }
    };

    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onMouseMoveBound = (e) => this.handleMouseMove(e);
    this.onMouseDownBound = (e) => this.handleMouseDown(e);
    this.onMouseUpBound = (e) => this.handleMouseUp(e);
    this.onContextMenuBound = (e) => e.preventDefault();
    this.onPointerLockChangeBound = () => {
      this.pointerLocked = document.pointerLockElement === this.renderer?.domElement;
      if (!this.pointerLocked) {
        this.mouseDown = false;
        this.rightMouseDown = false;
        this.isChargingPunch = false;
        this.punchChargeMs = 0;
        this.cancelBlueCharge();
        this.cancelTeleport();
      }
      this.emitHud();
    };
    this.onResizeBound = () => this.handleResize();

    this.initScene();
    this.ensurePlayerAvatar();
    this.spawnStructuresAndRival();
    this.bindEvents();
    this.emitHud();
    this.loop();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2', {
      antialias: true,
      powerPreference: 'high-performance'
    }) as WebGL2RenderingContext | null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl2 ?? undefined,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.container.appendChild(canvas);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // High HDR threshold (1.28) so normal lit meshes/weapons never bloom, only HDR shader orbs (>1.3) glow
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.38, 0.35, 1.28);
    this.composer.addPass(bloomPass);

    this.mapBuilder = new MobaMapBuilder();
    this.mapBuilder.build(this.scene);

    this.viewModel = new FpsViewModel(this.camera, this.hero);
    this.syncCameraToPlayer();
  }

  private spawnStructuresAndRival() {
    this.spawnHeroTrainingDummies();
  }

  private createStructureUnit(
    id: string,
    name: string,
    team: MobaTeam,
    type: 'TOWER' | 'CORE',
    x: number,
    z: number,
    maxHp: number,
    radius: number,
    height: number,
    attackRange: number,
    attackDamage: number
  ) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const teamCol = team === 'blue' ? 0x38bdf8 : 0xf43f5e;
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.4
    });
    const crystalMat = new THREE.MeshBasicMaterial({
      color: teamCol,
      wireframe: type === 'CORE',
      transparent: true,
      opacity: 0.95
    });

    const baseGeo = new THREE.CylinderGeometry(radius * 0.85, radius * 1.15, height * 0.55, 8);
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = height * 0.275;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    const crystalGeo =
      type === 'CORE'
        ? new THREE.IcosahedronGeometry(radius * 0.75, 1)
        : new THREE.OctahedronGeometry(radius * 0.65, 0);
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.position.y = height * 0.82;
    group.add(crystalMesh);

    const hpBarFill = this.createFloatingHpBar(group, height + 1.2, 2.8, team);
    this.scene.add(group);

    const unit: MobaUnit = {
      id,
      name,
      team,
      type,
      group,
      bodyMesh: baseMesh,
      headMesh: crystalMesh,
      hpBarFill,
      hp: maxHp,
      maxHp,
      radius,
      height,
      attackRange,
      attackDamage,
      attackCooldown: 1.25,
      attackTimer: 0,
      moveSpeed: 0,
      goldValue: type === 'CORE' ? 500 : 250,
      xpValue: type === 'CORE' ? 300 : 180,
      alive: true
    };
    baseMesh.userData.unit = unit;
    crystalMesh.userData.unit = unit;
    crystalMesh.userData.isHead = true;
    this.units.push(unit);
  }

  private createHeroBotUnit() {
    const rivalHero =
      FPS_MOBA_HEROES.find((h) => h.id !== this.hero.id && h.id === 'mr_biomaster') ??
      FPS_MOBA_HEROES.find((h) => h.id !== this.hero.id && h.id === 'gojo') ??
      FPS_MOBA_HEROES.find((h) => h.id !== this.hero.id) ??
      FPS_MOBA_HEROES[0];

    const spawnPos = new THREE.Vector3(0, 0, -62);
    const { group, bodyMesh, headMesh, hitMeshes, hpBarFill, nameplateMesh, animate } =
      buildProceduralHeroModel(
        rivalHero,
        `RIVAL ${rivalHero.name.toUpperCase()} [AI]`,
        (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team),
        (parent, y, text, col) => this.createHeroNameplate(parent, y, text, col)
      );
    group.position.copy(spawnPos);
    this.scene.add(group);

    const unit: MobaUnit = {
      id: `enemy_hero_${rivalHero.id}`,
      name: `Rival ${rivalHero.name} [AI]`,
      team: 'red',
      type: 'HERO',
      group,
      bodyMesh,
      headMesh,
      hitMeshes,
      hpBarFill,
      nameplateMesh,
      animateRig: animate,
      hp: rivalHero.maxHp,
      maxHp: rivalHero.maxHp,
      radius: 0.72,
      height: 2.25,
      attackRange: 22,
      attackDamage: 18,
      attackCooldown: 0.9,
      attackTimer: 0,
      moveSpeed: 9.0,
      goldValue: 300,
      xpValue: 160,
      alive: true,
      respawnTimer: 0,
      spawnPos,
      knockbackVel: new THREE.Vector3()
    };
    hitMeshes.forEach((m) => {
      m.userData.unit = unit;
    });
    headMesh.userData.unit = unit;
    headMesh.userData.isHead = true;
    this.units.push(unit);
  }

  /**
   * Spawns Mr. Biomaster and Gojo in the arena so they can cycle through their animations and roam the map.
   */
  private spawnHeroTrainingDummies() {
    const biomaster = FPS_MOBA_HEROES.find((h) => h.id === 'mr_biomaster');
    const gojo = FPS_MOBA_HEROES.find((h) => h.id === 'gojo');
    const dummySpots: { hero: FpsHeroDef; x: number; z: number; yaw: number }[] = [];
    if (biomaster) dummySpots.push({ hero: biomaster, x: -4.0, z: 46.0, yaw: 0.15 });
    if (gojo) dummySpots.push({ hero: gojo, x: 4.0, z: 46.0, yaw: -0.15 });

    dummySpots.forEach(({ hero, x, z, yaw }) => {
      if (!hero) return;
      const spawnPos = new THREE.Vector3(x, 0, z);

      const { group, bodyMesh, headMesh, hitMeshes, hpBarFill, nameplateMesh, animate } =
        buildProceduralHeroModel(
          hero,
          `[DUMMY] ${hero.name.toUpperCase()} (${hero.role})`,
          (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team),
          (parent, y, text, col) => this.createHeroNameplate(parent, y, text, col)
        );
      group.position.copy(spawnPos);
      group.rotation.y = yaw;
      this.scene.add(group);

      const shieldMat = createInfinityDistortionMaterial();
      // Infinity: 4m wide x 3m tall spatial distortion wall projected ~2.4m in front of him
      const shieldGeo = new THREE.PlaneGeometry(4, 3, 32, 24);
      const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      shieldMesh.position.set(0, 1.5, 2.4);
      shieldMesh.visible = false;
      group.add(shieldMesh);

      const unit: MobaUnit = {
        id: `dummy_hero_${hero.id}`,
        name: `${hero.name} [NPC]`,
        team: 'red',
        type: 'HERO',
        group,
        bodyMesh,
        headMesh,
        hitMeshes,
        hpBarFill,
        nameplateMesh,
        animateRig: animate,
        hp: hero.maxHp,
        maxHp: hero.maxHp,
        radius: 0.75,
        height: 2.25,
        attackRange: hero.weapon.range,
        attackDamage: hero.weapon.damage,
        attackCooldown: hero.weapon.fireRateMs / 1000,
        attackTimer: 1.5,
        moveSpeed: hero.moveSpeed,
        goldValue: 50,
        xpValue: 40,
        alive: true,
        isDummy: true,
        isRoamer: hero.id === 'mr_biomaster' || hero.id === 'gojo',
        heroDef: hero,
        npcAi:
          hero.id === 'gojo'
            ? {
                ce: hero.maxMana,
                maxCe: hero.maxMana,
                burnout: 0,
                regen: STANDARD_CE_REGEN_PER_SEC * hero.ceRegenMultiplier,
                cd: { red: 1, blue: 3, shift: 0, infinity: 0, domain: 6 },
                busy: 0,
                think: 1.0,
                infinityHold: 0,
                strafeDir: 1,
                strafeTimer: 1.5,
                wanderTimer: 0
              }
            : undefined,
        npcAbilityTimer: hero.id === 'gojo' ? 2.4 : 3.2,
        npcAbilityIndex: 0,
        npcShieldTimer: 0,
        npcShieldMesh: shieldMesh,
        npcShieldMat: shieldMat,
        roamPhase: 'idle',
        roamTimer: hero.id === 'gojo' ? 5.8 : 4.1,
        outOfCombatTimer: 0,
        respawnTimer: 0,
        spawnPos,
        knockbackVel: new THREE.Vector3()
      };

      hitMeshes.forEach((m) => {
        m.userData.unit = unit;
      });
      headMesh.userData.unit = unit;
      headMesh.userData.isHead = true;

      this.units.push(unit);
    });
  }

  private createHeroNameplate(parent: THREE.Group, y: number, text: string, accentHex: string): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
      ctx.fillRect(8, 10, 496, 76);
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 10, 496, 76);

      ctx.font = 'bold 30px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(text, 256, 48);
    }
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), mat);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  private spawnMinionWave() {
    this.waveCount++;
    const offsets = [-2.6, 0, 2.6];

    (['blue', 'red'] as MobaTeam[]).forEach((team) => {
      const zStart = team === 'blue' ? 50 : -50;
      const col = team === 'blue' ? 0x38bdf8 : 0xf43f5e;

      offsets.forEach((ox, idx) => {
        const id = `minion_${team}_${this.waveCount}_${idx}`;
        const group = new THREE.Group();
        group.position.set(ox, 0, zStart);

        const bodyMat = new THREE.MeshStandardMaterial({
          color: team === 'blue' ? 0x0284c7 : 0xe11d48,
          roughness: 0.45,
          metalness: 0.25
        });
        const headMat = new THREE.MeshBasicMaterial({ color: col });

        const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.1, 8), bodyMat);
        bodyMesh.position.y = 0.6;
        bodyMesh.castShadow = true;
        group.add(bodyMesh);

        const headMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), headMat);
        headMesh.position.y = 1.42;
        group.add(headMesh);

        const hpBarFill = this.createFloatingHpBar(group, 2.05, 1.2, team);
        this.scene.add(group);

        const unit: MobaUnit = {
          id,
          name: `${team === 'blue' ? 'Allied' : 'Enemy'} Trooper`,
          team,
          type: 'MINION',
          group,
          bodyMesh,
          headMesh,
          hpBarFill,
          hp: 95 + this.waveCount * 6,
          maxHp: 95 + this.waveCount * 6,
          radius: 0.55,
          height: 1.6,
          attackRange: 9,
          attackDamage: 10,
          attackCooldown: 1.2,
          attackTimer: Math.random() * 0.5,
          moveSpeed: 6.4,
          goldValue: 45,
          xpValue: 35,
          alive: true,
          knockbackVel: new THREE.Vector3()
        };
        bodyMesh.userData.unit = unit;
        headMesh.userData.unit = unit;
        headMesh.userData.isHead = true;
        this.units.push(unit);
      });
    });
  }

  private createFloatingHpBar(parent: THREE.Group, y: number, width: number, team: MobaTeam): THREE.Mesh {
    const barGroup = new THREE.Group();
    barGroup.position.set(0, y, 0);
    barGroup.userData.isHpBarRoot = true;
    parent.add(barGroup);

    const bgGeo = new THREE.PlaneGeometry(width, 0.18);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x020617, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    barGroup.add(bgMesh);

    const fillGeo = new THREE.PlaneGeometry(width * 0.96, 0.12);
    const fillMat = new THREE.MeshBasicMaterial({
      color: team === 'blue' ? 0x38bdf8 : 0xf43f5e,
      side: THREE.DoubleSide
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.z = 0.015;
    barGroup.add(fillMesh);
    return fillMesh;
  }

  // ─────────────────────────────────────────────────────────────
  //  Input & PointerLock Controls
  // ─────────────────────────────────────────────────────────────
  private bindEvents() {
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mousedown', this.onMouseDownBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
    window.addEventListener('contextmenu', this.onContextMenuBound);
    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.addEventListener('resize', this.onResizeBound);
  }

  public requestPointerLock() {
    if (this.destroyed || this.winner) return;
    this.renderer?.domElement.requestPointerLock?.();
  }

  private handleKeyDown(e: KeyboardEvent) {
    const code = e.code;
    this.keys.add(code);

    if (!this.pointerLocked || this.playerRespawnTimer > 0 || this.winner) return;

    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      e.preventDefault();
      if (this.hero.abilities.SHIFT.kind === 'LIMITLESS_TELEPORT') {
        this.startTeleportAim();
      } else {
        this.tryCastAbility('SHIFT');
      }
    } else if (code === 'KeyE') this.tryCastAbility('E');
    else if (code === 'KeyQ') this.tryCastAbility('Q');
    else if (code === 'KeyV') this.executeQuickMelee();
    else if (code === 'KeyR' || code === 'KeyC') this.startReload();
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.teleportPhase === 'AIMING') {
      this.releaseTeleport();
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Limitless Teleport (SHIFT): hold to aim in third person, release to cast (800ms), then blink
  // ─────────────────────────────────────────────────────────────
  private ensurePlayerAvatar() {
    if (this.playerAvatar || this.hero.abilities.SHIFT.kind !== 'LIMITLESS_TELEPORT') return;
    const built = buildProceduralHeroModel(
      this.hero,
      this.hero.name.toUpperCase(),
      (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team),
      (parent, y, text, col) => this.createHeroNameplate(parent, y, text, col)
    );
    built.group.traverse((o) => {
      if (o.userData?.isHpBarRoot) o.visible = false;
    });
    if (built.nameplateMesh) built.nameplateMesh.visible = false;
    built.group.visible = false;
    this.scene.add(built.group);
    this.playerAvatar = { group: built.group, animate: built.animate };
  }

  private startTeleportAim() {
    if (this.teleportPhase !== 'NONE' || this.playerRespawnTimer > 0 || this.winner) return;
    const cd = this.cooldowns.SHIFT;
    if (cd.remainingMs > 0 || !this.canSpendCursedEnergy()) return;
    this.teleportPhase = 'AIMING';
    this.teleportCastMs = 0;
    this.isChargingPrimary = false;
    this.primaryChargeMs = 0;
    this.cancelBlueCharge();
    this.isChargingPunch = false;
    this.punchChargeMs = 0;
    this.ensurePlayerAvatar();
    if (!this.teleportMarker) {
      // Scene is only rendered through the player's camera, so this marker is visible to the user alone
      this.teleportMarker = this.createRadiusIndicator(this.hero.abilities.SHIFT.color);
    }
    this.computeTeleportTarget();
    this.placeIndicator(this.teleportMarker, this.teleportTarget.x, this.teleportTarget.z, 1.6);
  }

  private releaseTeleport() {
    if (this.teleportPhase !== 'AIMING') return;
    const ab = this.hero.abilities.SHIFT;
    if (!this.canSpendCursedEnergy()) {
      this.cancelTeleport();
      return;
    }
    this.consumeCursedEnergy(ab.manaCost);
    this.cooldowns.SHIFT.remainingMs = ab.cooldownMs;
    this.teleportPhase = 'CASTING';
    this.teleportCastMs = 0;
    this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 0.15, 0)), ab.color, 2.6);
    // Instant Transmission build-up: light streaks gather around both the departure & arrival points
    const castSec = ab.durationMs / 1000;
    this.spawnTransmissionStreaks(this.playerPos, 'converge', castSec);
    this.spawnTransmissionStreaks(this.teleportTarget, 'converge', castSec);
  }

  private cancelTeleport() {
    this.teleportPhase = 'NONE';
    this.teleportCastMs = 0;
    if (this.teleportMarker) {
      this.scene.remove(this.teleportMarker);
      this.teleportMarker = null;
    }
  }

  private computeTeleportTarget() {
    const f = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const flat = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const o = this.camera.position;
    const groundY = this.playerPos.y;
    let tx: number;
    let tz: number;
    if (f.y < -0.02) {
      const t = (groundY - o.y) / f.y;
      tx = o.x + f.x * t;
      tz = o.z + f.z * t;
    } else {
      tx = this.playerPos.x + flat.x * TELEPORT_MAX_RANGE;
      tz = this.playerPos.z + flat.z * TELEPORT_MAX_RANGE;
    }
    let dx = tx - this.playerPos.x;
    let dz = tz - this.playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > TELEPORT_MAX_RANGE) {
      dx = (dx / d) * TELEPORT_MAX_RANGE;
      dz = (dz / d) * TELEPORT_MAX_RANGE;
    }
    let x = this.playerPos.x + dx;
    let z = this.playerPos.z + dz;
    const resolved = this.mapBuilder.resolveHorizontalCollision(x, z, 0.7, this.playerPos.y);
    x = resolved.x;
    z = resolved.z;
    const dom = this.activeDomain;
    if (dom && !dom.isRally) {
      const ddx = x - dom.center.x;
      const ddz = z - dom.center.z;
      const dd = Math.hypot(ddx, ddz);
      const maxR = Math.max(1.0, dom.radius - 0.75);
      if (dd > maxR && dd > 0.0001) {
        x = dom.center.x + (ddx / dd) * maxR;
        z = dom.center.z + (ddz / dd) * maxR;
      }
    }
    if (this.npcDomain) {
      const c = this.clampPlayerToNpcDomain(x, z);
      x = c.x;
      z = c.z;
    }
    this.teleportTarget.set(x, this.mapBuilder.getFloorHeight(x, z, this.playerPos.y), z);
  }

  private performTeleport() {
    const ab = this.hero.abilities.SHIFT;
    const startPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.spawnTransmissionStreaks(this.playerPos, 'burst', 0.55);
    this.playerPos.copy(this.teleportTarget);
    this.spawnTransmissionStreaks(this.playerPos, 'burst', 0.7);
    this.playerVel.set(0, 0, 0);
    const endPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.spawnBeamTracer(startPos, endPos, ab.color, 0.5, 0.22);
    this.spawnImpactRing(startPos, ab.color, 2.4);
    this.spawnImpactRing(endPos, ab.color, ab.radius);
    this.spawnPillarEffect(this.playerPos, 0.9, 5.0, ab.color, 0.45);
    const hits = this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name);
    this.grantAbilityPassive(hits > 0);
    this.cancelTeleport();
  }

  private updateTeleport(dt: number, elapsed: number) {
    if (this.playerRespawnTimer > 0 && this.teleportPhase !== 'NONE') this.cancelTeleport();

    const target = this.teleportPhase !== 'NONE' ? 1 : 0;
    this.teleportCamBlend += (target - this.teleportCamBlend) * Math.min(1, dt * 9);
    if (Math.abs(this.teleportCamBlend - target) < 0.002) this.teleportCamBlend = target;

    this.viewModel.root.visible = this.teleportCamBlend < 0.2;
    if (this.teleportPhase === 'CASTING') {
      const k = this.teleportCastMs / this.hero.abilities.SHIFT.durationMs;
      this.teleportMorph = Math.min(1, Math.max(0, (k - 0.7) / 0.3));
    } else {
      this.teleportMorph = Math.max(0, this.teleportMorph - dt * 5);
    }
    const avatar = this.playerAvatar;
    if (avatar) {
      avatar.group.visible = this.teleportCamBlend > 0.25;
      if (avatar.group.visible) {
        avatar.group.position.copy(this.playerPos);
        avatar.group.rotation.y = this.yaw + Math.PI;
        avatar.group.scale.set(
          1 - this.teleportMorph * 0.75,
          1 + this.teleportMorph * 2.2,
          1 - this.teleportMorph * 0.75
        );
        avatar.animate(elapsed, false, false, 'idle');
      }
    }

    if (this.teleportPhase === 'NONE') return;
    const ab = this.hero.abilities.SHIFT;

    if (this.teleportPhase === 'AIMING') {
      this.computeTeleportTarget();
      if (this.teleportMarker) {
        const pulse = 1.6 + Math.sin(elapsed * 7) * 0.12;
        this.placeIndicator(this.teleportMarker, this.teleportTarget.x, this.teleportTarget.z, pulse);
        this.teleportMarker.rotation.y += dt * 1.2;
      }
    } else {
      this.teleportCastMs += dt * 1000;
      const k = Math.min(1, this.teleportCastMs / ab.durationMs);
      if (this.teleportMarker) {
        this.placeIndicator(
          this.teleportMarker,
          this.teleportTarget.x,
          this.teleportTarget.z,
          1.6 * (1 - 0.55 * k * k)
        );
        this.teleportMarker.rotation.y += dt * (3 + k * 14);
      }
      if (this.teleportCastMs >= ab.durationMs) this.performTeleport();
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.pointerLocked || this.playerRespawnTimer > 0) return;
    const sens = 0.0021 * getMouseSensitivity();
    this.yaw -= e.movementX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -Math.PI * 0.47, Math.PI * 0.47);
    this.viewModel.onMouseLook(e.movementX, e.movementY);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.pointerLocked) {
      if (e.button === 0 && e.target === this.renderer.domElement) {
        this.requestPointerLock();
      }
      return;
    }

    if (e.button === 0) {
      this.mouseDown = true;
      // Brigitte / Reinhardt combo: Left Click while holding Barrier Shield performs Shield Bash!
      if (this.isBarrierActive() && this.hero.abilities.SHIFT.kind === 'SHIELD_BASH' && this.cooldowns.SHIFT.remainingMs <= 0) {
        this.tryCastAbility('SHIFT');
        return;
      }
      this.tryPrimaryFire();
    } else if (e.button === 2) {
      this.rightMouseDown = true;
      this.startSecondaryFire();
    }
  }

  private handleMouseUp(e: MouseEvent) {
    if (e.button === 0) {
      this.mouseDown = false;
      if (this.isChargingPrimary) {
        const maxCharge = this.hero.weapon.maxChargeMs ?? 900;
        const ratio = Math.min(1, this.primaryChargeMs / maxCharge);
        this.isChargingPrimary = false;
        this.primaryChargeMs = 0;
        this.tryPrimaryFire(ratio);
      }
    } else if (e.button === 2) {
      this.rightMouseDown = false;
      if (this.isChargingPunch) {
        this.releaseChargedPunch();
      }
      if (this.isChargingBlue) {
        this.releaseChargedBlue();
      }
    }
  }

  private handleResize() {
    if (this.destroyed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  private canSpendCursedEnergy(): boolean {
    return this.manaExhaustedTimerSec <= 0 && this.mana > 0;
  }

  private getCeRegenPerSec(): number {
    return STANDARD_CE_REGEN_PER_SEC * (this.hero.ceRegenMultiplier ?? 1.0);
  }

  /**
   * Consumes Cursed Energy from the player's reserve pool.
   * If Cursed Energy reaches 0, triggers the exhaustion lockout timeout penalty.
   */
  private consumeCursedEnergy(amount: number) {
    if (amount <= 0) return;
    this.mana = Math.max(0, this.mana - amount);
    if (this.mana <= 0) {
      this.mana = 0;
      this.manaExhaustedTimerSec = CE_EXHAUSTION_LOCKOUT_SEC;
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      this.isChargingPunch = false;
      this.punchChargeMs = 0;
      this.cancelBlueCharge();
      if (this.hero.abilities.E.kind === 'INFINITY_SHIELD') {
        this.cooldowns.E.remainingMs = Math.max(
          this.cooldowns.E.remainingMs,
          CE_EXHAUSTION_LOCKOUT_SEC * 1000
        );
      }
    }
  }

  private isBarrierActive(): boolean {
    if (this.playerRespawnTimer > 0 || !this.canSpendCursedEnergy()) return false;
    if (this.hero.abilities.E.kind === 'INFINITY_SHIELD') {
      return this.keys.has('KeyE') && this.cooldowns.E.remainingMs <= 0;
    }
    return (
      this.rightMouseDown &&
      this.hero.secondaryFire.kind === 'BARRIER_SHIELD' &&
      this.barrierHp > 0 &&
      this.secondaryCooldownMs <= 0
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  Secondary Fire (M2): Barrier Shield, Charged Rocket Punch, Helix Rocket, or Two-Stage Lapse Blue Orb
  // ─────────────────────────────────────────────────────────────
  private startSecondaryFire() {
    if (this.playerRespawnTimer > 0 || this.winner || this.teleportPhase !== 'NONE') return;
    const sec = this.hero.secondaryFire;

    if (sec.kind === 'LAPSE_BLUE_ORB') {
      // 2nd Right Click: Detonate active Lapse Blue orb to attract enemies within 3m (10 CE)
      if (this.activeBlueOrb) {
        if (!this.canSpendCursedEnergy()) return;
        this.consumeCursedEnergy(10);
        this.viewModel.triggerCastGesture();
        this.activeBlueOrb.triggerAttract();
        return;
      }
      if (this.secondaryCooldownMs > 0 || !this.canSpendCursedEnergy()) return;
      // Begin charging: ground radius preview grows while held, CE drains continuously
      this.isChargingBlue = true;
      this.blueChargeMs = 0;
      return;
    }

    if (sec.kind === 'CHARGED_PUNCH') {
      if (this.secondaryCooldownMs > 0 || !this.canSpendCursedEnergy()) return;
      this.isChargingPunch = true;
      this.punchChargeMs = 0;
    } else if (sec.kind === 'HELIX_ROCKET') {
      if (this.secondaryCooldownMs > 0 || !this.canSpendCursedEnergy()) return;
      this.consumeCursedEnergy(sec.manaCost ?? 22);
      this.secondaryCooldownMs = sec.cooldownMs ?? 5000;
      this.viewModel.triggerFireRecoil();
      const targetPt = this.getAimGroundPoint(85);
      const muzzle = new THREE.Vector3(0.28, -0.22, -0.75).applyMatrix4(this.camera.matrixWorld);
      this.spawnBeamTracer(muzzle, targetPt, sec.color, 0.35, 0.14);
      this.spawnImpactRing(targetPt, sec.color, 5.0);
      this.damageEnemiesInRadius(targetPt, 5.0, sec.maxDamage ?? 75, sec.name);
    }
  }

  private getBlueChargeRadius(): number {
    const ratio = Math.min(1, this.blueChargeMs / BLUE_MAX_CHARGE_MS);
    return BLUE_MIN_RADIUS + (BLUE_MAX_RADIUS - BLUE_MIN_RADIUS) * ratio;
  }

  private createRadiusIndicator(color: string): THREE.Group {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    ring.rotation.x = -Math.PI / 2;
    disc.rotation.x = -Math.PI / 2;
    g.add(ring, disc);
    this.scene.add(g);
    return g;
  }

  private placeIndicator(g: THREE.Group, x: number, z: number, radius: number) {
    g.position.set(x, this.mapBuilder.getFloorHeight(x, z, this.playerPos.y) + 0.07, z);
    g.scale.set(radius, 1, radius);
  }

  private removeBlueIndicator() {
    if (this.blueIndicator) {
      this.scene.remove(this.blueIndicator);
      this.blueIndicator = null;
    }
  }

  private cancelBlueCharge() {
    this.isChargingBlue = false;
    this.blueChargeMs = 0;
    this.removeBlueIndicator();
  }

  private releaseChargedBlue() {
    const sec = this.hero.secondaryFire;
    const radius = this.getBlueChargeRadius();
    const ratio = (radius - BLUE_MIN_RADIUS) / (BLUE_MAX_RADIUS - BLUE_MIN_RADIUS);
    this.cancelBlueCharge();
    if (!this.canSpendCursedEnergy()) return;
    this.consumeCursedEnergy(sec.manaCost ?? 12);
    this.viewModel.triggerCastGesture();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    this.launchTwoStageBlueOrb({
      forward,
      radius,
      damage: Math.round((sec.maxDamage ?? 65) * (1 + ratio * 0.9)),
      durationMs: 3200,
      name: 'Lapse Blue',
      color: sec.color,
      onCooldownStart: () => {
        this.secondaryCooldownMs = sec.cooldownMs ?? 7000;
      }
    });
  }

  private releaseChargedPunch() {
    const sec = this.hero.secondaryFire;
    if (!this.canSpendCursedEnergy()) {
      this.isChargingPunch = false;
      this.punchChargeMs = 0;
      return;
    }
    const maxCharge = sec.maxChargeMs ?? 1000;
    const ratio = Math.min(1, Math.max(0.2, this.punchChargeMs / maxCharge));
    this.isChargingPunch = false;
    this.punchChargeMs = 0;
    // Charge time already drained CE continuously; only a base release cost remains
    this.consumeCursedEnergy(Math.round((sec.manaCost ?? 22) * 0.4));
    this.secondaryCooldownMs = sec.cooldownMs ?? 3800;

    this.viewModel.triggerRocketPunchLunge();

    const empoweredMult = this.isPowerEmpowered ? 1.5 : 1.0;
    this.isPowerEmpowered = false;

    const lungeDist = (8 + ratio * 11) * empoweredMult;
    const baseDmg = Math.round(
      THREE.MathUtils.lerp(sec.minDamage ?? 45, sec.maxDamage ?? 95, ratio) * empoweredMult
    );
    const wallBonus = Math.round((sec.wallSlamBonusDamage ?? 65) * empoweredMult);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const flatForward = new THREE.Vector3(forward.x, 0, forward.z).normalize();

    const startPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    const hitSet = new Set<MobaUnit>();

    for (let step = 1; step <= 12; step++) {
      const nextX = this.playerPos.x + flatForward.x * (lungeDist / 12);
      const nextZ = this.playerPos.z + flatForward.z * (lungeDist / 12);
      const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;

      for (const u of this.units) {
        if (!u.alive || u.team !== 'red' || hitSet.has(u)) continue;
        if (u.group.position.distanceTo(this.playerPos) <= 2.8 + u.radius) {
          hitSet.add(u);
          this.grantAbilityPassive(true);
          this.damageUnit(
            u,
            baseDmg,
            ratio > 0.85,
            'Rocket Punch',
            u.group.position.clone().add(new THREE.Vector3(0, 1.2, 0))
          );

          // Apply knockback & check if enemy slams into a wall!
          if (u.moveSpeed > 0 && u.alive) {
            this.KnockbackUnitWithWallSlam(u, flatForward, 9.5 * empoweredMult, wallBonus);
          }
        }
      }
    }

    const endPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
    this.spawnBeamTracer(startPos, endPos, sec.color, 0.4, 0.25);
    this.spawnImpactRing(endPos, sec.color, 3.8);
  }

  private KnockbackUnitWithWallSlam(unit: MobaUnit, dir: THREE.Vector3, pushDist: number, wallSlamDamage: number) {
    // Knockback unit movement with active Domain barrier containment
    let slammed = false;
    for (let i = 1; i <= 8; i++) {
      const candX = unit.group.position.x + dir.x * (pushDist / 8);
      const candZ = unit.group.position.z + dir.z * (pushDist / 8);
      const resolved = this.mapBuilder.resolveHorizontalCollision(candX, candZ, unit.radius, 0);
      if (Math.hypot(resolved.x - candX, resolved.z - candZ) > 0.05) {
        slammed = true;
      }
      unit.group.position.x = resolved.x;
      unit.group.position.z = resolved.z;
      if (this.clampUnitToDomainBarrier(unit)) {
        slammed = true;
      }
    }

    if (slammed && unit.alive) {
      unit.stunTimer = 1.2;
      this.spawnImpactRing(unit.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#facc15', 3.5);
      this.damageUnit(
        unit,
        wallSlamDamage,
        true,
        'WALL SLAM!',
        unit.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)),
        'WALL SLAM!'
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Primary Fire (M1): Melee Cleave (Hammer/Flail), Hand Cannon, or Hitscan Gun
  // ─────────────────────────────────────────────────────────────
  private startReload() {
    if (this.hero.weapon.magazineSize === 0 || this.hero.weapon.autoRegenAmmo) return;
    if (this.isReloading || this.ammo >= this.maxAmmo) return;
    this.isReloading = true;
    this.reloadRemainingMs = this.hero.weapon.reloadTimeMs;
    this.viewModel.triggerReload(this.hero.weapon.reloadTimeMs / 1000);
  }

  private executeQuickMelee() {
    if (this.fireCooldownMs > 0 || !this.canSpendCursedEnergy()) return;
    this.consumeCursedEnergy(5);
    this.fireCooldownMs = 450;
    this.viewModel.triggerQuickMelee();
    this.performMeleeCleave(38, 4.2, 95, 3.5, 'Quick Melee');
  }

  private tryPrimaryFire(releasedChargeRatio?: number) {
    if (this.playerRespawnTimer > 0 || this.winner || this.isChargingPunch || this.teleportPhase !== 'NONE') return;
    if (!this.canSpendCursedEnergy()) {
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      return;
    }
    if (this.isBarrierActive()) {
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      return;
    }
    if (this.isReloading || this.fireCooldownMs > 0) return;

    const wep = this.hero.weapon;

    // 1. MELEE CLEAVE HEROES (Higuruma Gavel / Executioner's Sword / Brigid Flail)
    if (wep.fireMode === 'MELEE_CLEAVE') {
      const execActive = this.executionerTimerSec > 0;
      this.consumeCursedEnergy(wep.manaCost ?? 6);
      this.fireCooldownMs = execActive ? Math.round(wep.fireRateMs * 0.72) : wep.fireRateMs;
      this.viewModel.triggerFireRecoil();
      const baseDmg = execActive ? Math.round(wep.damage * 2.15) : wep.damage;
      const dmg = Math.round(baseDmg + (this.level - 1) * 4);
      this.performMeleeCleave(
        dmg,
        execActive ? wep.range + 1.2 : wep.range,
        wep.cleaveArcDeg ?? 115,
        wep.knockback ?? 5.0,
        execActive ? "Executioner's Sword" : wep.name
      );
      return;
    }

    // 2. RANGED / HAND CANNON HEROES
    if (this.ammo <= 0 && !this.activeDomain) {
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      if (!wep.autoRegenAmmo) this.startReload();
      return;
    }

    // If weapon is chargeable (Gojo Reversal Red), begin charging while M1 is held and fire upon release
    if (wep.chargeable && releasedChargeRatio === undefined) {
      if (!this.isChargingPrimary) {
        this.isChargingPrimary = true;
        this.primaryChargeMs = 0;
      }
      return;
    }

    const chargeRatio = releasedChargeRatio ?? 0;
    // Charge time already drained CE continuously (see updatePlayer); release costs the base amount
    const shotManaCost = Math.round(wep.manaCost ?? 4);
    this.consumeCursedEnergy(shotManaCost);
    const shotBaseDamage = THREE.MathUtils.lerp(wep.damage, wep.maxDamage ?? wep.damage, chargeRatio);
    const shotKnockback = wep.knockback
      ? THREE.MathUtils.lerp(wep.knockback, wep.maxKnockback ?? wep.knockback, chargeRatio)
      : 0;

    if (!this.activeDomain) {
      this.ammo--;
      this.autoRegenTimerMs = wep.reloadTimeMs;
      if (this.ammo <= 0 && !wep.autoRegenAmmo) {
        setTimeout(() => this.startReload(), 120);
      }
    }

    const rateMult = this.activeDomain ? 0.68 : 1.0;
    this.fireCooldownMs = wep.fireRateMs * rateMult;
    this.viewModel.triggerFireRecoil();

    const pellets = wep.pellets ?? 1;
    const spread = wep.spread ?? 0.004;

    const muzzleOffset = wep.fireMode === 'HAND_CANNON' ? new THREE.Vector3(-0.28, -0.2, -0.65) : new THREE.Vector3(0.28, -0.22, -0.75);
    const muzzleWorld = muzzleOffset.applyMatrix4(this.camera.matrixWorld);

    // Gojo Primary Fire (M1): Launch a 3D Volumetric Reversal Red Plasma Orb projectile
    if (wep.isProjectileOrb) {
      this.launchReversalRedOrb(muzzleWorld, chargeRatio, shotBaseDamage, shotKnockback);
      return;
    }

    const allTargets = [...this.getEnemyHitMeshes(), ...this.mapBuilder.raycastObstacles];

    for (let p = 0; p < pellets; p++) {
      const ndcX = (Math.random() - 0.5) * spread * 2;
      const ndcY = (Math.random() - 0.5) * spread * 2;

      const raycaster = new THREE.Raycaster();
      raycaster.near = 0.2;
      raycaster.far = wep.range;
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

      const hits = raycaster.intersectObjects(allTargets, false);
      let endPoint = raycaster.ray.origin
        .clone()
        .add(raycaster.ray.direction.clone().multiplyScalar(wep.range));

      if (hits.length > 0) {
        const hit = hits[0];
        endPoint = hit.point;
        const unit = hit.object.userData.unit as MobaUnit | undefined;
        if (unit && unit.alive && unit.team === 'red') {
          const isHeadshot = Boolean(hit.object.userData.isHead);
          const dmg = Math.round((shotBaseDamage + (this.level - 1) * 2.5) * (isHeadshot ? 1.6 : 1.0));
          if (isHeadshot && this.hero.id === 'vex') {
            this.mana = Math.min(this.maxMana, this.mana + 4);
          }
          this.damageUnit(unit, dmg, isHeadshot || chargeRatio >= 0.85, wep.name, hit.point);
          if (shotKnockback > 0 && unit.moveSpeed > 0 && unit.alive) {
            const flatShotDir = new THREE.Vector3(
              raycaster.ray.direction.x,
              0,
              raycaster.ray.direction.z
            ).normalize();
            this.KnockbackUnitWithWallSlam(unit, flatShotDir, shotKnockback, Math.round(20 + chargeRatio * 25));
          }
        } else if (wep.chargeable && chargeRatio >= 0.35) {
          // Charged Reversal Red splash repel on terrain impact
          const splashRad = 1.8 + chargeRatio * 2.4;
          this.damageEnemiesInRadius(
            hit.point,
            splashRad,
            Math.round(shotBaseDamage * 0.75),
            wep.name,
            false,
            shotKnockback * 0.75
          );
        }
        const ringRad = wep.knockback ? 1.5 + chargeRatio * 2.4 : 0.35;
        this.spawnImpactRing(hit.point, wep.projectileColor, ringRad);
      }

      this.spawnBeamTracer(
        muzzleWorld,
        endPoint,
        wep.projectileColor,
        wep.knockback ? 0.2 + chargeRatio * 0.14 : 0.14,
        wep.knockback ? 0.08 + chargeRatio * 0.12 : 0.045
      );
    }
  }

  /**
   * Launches Gojo's 3D Volumetric Reversal Red Plasma Orb projectile (`M1`) that explodes and repels on impact.
   */
  private launchReversalRedOrb(
    startPos: THREE.Vector3,
    chargeRatio: number,
    shotBaseDamage: number,
    shotKnockback: number
  ) {
    const wep = this.hero.weapon;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const flatShotDir = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const orbRadius = 0.28 + chargeRatio * 0.42;
    const speed = 32 + chargeRatio * 12;
    const vel = forward.clone().multiplyScalar(speed);

    const redOrb = createCursedEnergyOrb({
      variant: 'RED',
      radius: orbRadius
    });
    redOrb.group.position.copy(startPos);
    this.scene.add(redOrb.group);

    const maxFlightSec = 2.4;
    let exploded = false;
    const stepRay = new THREE.Raycaster();

    const detonate = (impactPos: THREE.Vector3, directUnit?: MobaUnit) => {
      if (exploded) return;
      exploded = true;

      const splashRad = 1.9 + chargeRatio * 2.6;
      this.spawnImpactRing(impactPos, '#ff2a55', splashRad);
      this.spawnPillarEffect(impactPos, 0.55 + chargeRatio * 0.65, 3.8 + chargeRatio * 2.5, '#f43f5e', 0.35);

      const dmg = Math.round(shotBaseDamage + (this.level - 1) * 2.5);
      if (directUnit && directUnit.alive) {
        this.damageUnit(directUnit, dmg, chargeRatio >= 0.75, 'Reversal Red', impactPos);
        if (shotKnockback > 0 && directUnit.moveSpeed > 0 && directUnit.alive) {
          this.KnockbackUnitWithWallSlam(
            directUnit,
            flatShotDir,
            shotKnockback,
            Math.round(22 + chargeRatio * 28)
          );
        }
      }

      // Splash repel to nearby enemies within the Red blast wave
      for (const u of this.units) {
        if (!u.alive || u.team !== 'red' || u === directUnit) continue;
        const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
        if (unitCenter.distanceTo(impactPos) <= splashRad + u.radius) {
          this.damageUnit(u, Math.round(dmg * 0.8), chargeRatio >= 0.85, 'Reversal Red', unitCenter);
          if (shotKnockback > 0 && u.moveSpeed > 0 && u.alive) {
            const pushDir = u.group.position.clone().sub(impactPos);
            pushDir.y = 0;
            if (pushDir.lengthSq() < 0.01) pushDir.copy(flatShotDir);
            else pushDir.normalize();
            this.KnockbackUnitWithWallSlam(
              u,
              pushDir,
              shotKnockback * 0.85,
              Math.round(18 + chargeRatio * 22)
            );
          }
        }
      }
    };

    this.vfxList.push({
      mesh: redOrb.group,
      age: 0,
      maxAge: maxFlightSec,
      onUpdate: (dt, progress) => {
        if (exploded) {
          redOrb.group.scale.multiplyScalar(0.65);
          return;
        }
        redOrb.update(dt, this.clock.getElapsedTime());

        const prevPos = redOrb.group.position.clone();
        const stepDist = speed * dt;
        redOrb.group.position.addScaledVector(vel, dt);

        // 1. Check direct proximity collision with enemy units
        for (const u of this.units) {
          if (!u.alive || u.team !== 'red') continue;
          const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
          if (unitCenter.distanceTo(redOrb.group.position) <= u.radius + orbRadius + 0.35) {
            detonate(redOrb.group.position.clone(), u);
            return;
          }
        }

        // 2. Check obstacle / floor collision along step
        stepRay.set(prevPos, forward);
        stepRay.near = 0;
        stepRay.far = stepDist + orbRadius;
        const wallHits = stepRay.intersectObjects(this.mapBuilder.raycastObstacles, false);
        if (wallHits.length > 0) {
          detonate(wallHits[0].point);
          return;
        }
        if (redOrb.group.position.y <= 0.25) {
          detonate(redOrb.group.position.clone());
          return;
        }

        if (progress >= 0.96) {
          detonate(redOrb.group.position.clone());
        }
      }
    });
  }

  /**
   * Shared two-stage Lapse Blue Singularity Orb launcher:
   * 1st activation propels the shader orb forward; 2nd activation attracts anyone within 3m into its center.
   */
  private launchTwoStageBlueOrb(opts: {
    forward: THREE.Vector3;
    radius: number;
    damage: number;
    durationMs: number;
    name: string;
    color: string;
    onCooldownStart: () => void;
    /** NPC casters reuse this exact implementation (charge radius, gradual pull, explosion). */
    caster?: MobaUnit;
    startPos?: THREE.Vector3;
    autoTriggerSec?: number;
  }) {
    const caster = opts.caster;
    const orbPos =
      opts.startPos?.clone() ?? this.camera.position.clone().add(opts.forward.clone().multiplyScalar(1.5));
    // Pull-radius indicator only exists once the orb has been manifested & launched
    const pullIndicator = this.createRadiusIndicator(opts.color);
    const orbVel = opts.forward.clone().multiplyScalar(14.5);
    const blueOrb = createCursedEnergyOrb({
      variant: 'BLUE',
      radius: 0.56
    });
    blueOrb.group.position.copy(orbPos);
    this.scene.add(blueOrb.group);

    const PULL_SEC = 0.85;
    let finished = false;
    let phase: 'fly' | 'pull' | 'done' = 'fly';
    let pullT = 0;
    let flightVfx: Active3DVfx | null = null;
    const captured: { unit?: MobaUnit; isPlayer?: boolean; delay: number; swirlSign: number }[] = [];
    let flyT = 0;

    const finishAndCooldown = (removeIndicator = true) => {
      if (finished) return;
      finished = true;
      if (!caster && this.activeBlueOrb?.mesh === blueOrb.group) {
        this.activeBlueOrb = null;
      }
      if (removeIndicator) this.scene.remove(pullIndicator);
      opts.onCooldownStart();
    };

    const explode = () => {
      phase = 'done';
      this.scene.remove(pullIndicator);
      const center = blueOrb.group.position.clone();
      this.spawnImpactRing(center, opts.color, opts.radius * 0.7);
      this.spawnImpactRing(center, '#e0f2fe', opts.radius * 1.2);
      this.spawnPillarEffect(center, 0.75 + opts.radius * 0.18, 4.5 + opts.radius * 0.6, '#38bdf8', 0.55);

      const blastRadius = Math.max(2.4, opts.radius * 0.55);
      const hit = new Set<MobaUnit>();
      let playerHit = false;
      for (const c of captured) {
        if (c.unit) hit.add(c.unit);
        if (c.isPlayer) playerHit = true;
      }
      if (caster) {
        for (const u of this.units) {
          if (!u.alive || u === caster || hit.has(u)) continue;
          if (Math.hypot(center.x - u.group.position.x, center.z - u.group.position.z) <= blastRadius + u.radius) {
            hit.add(u);
          }
        }
        if (
          !playerHit &&
          this.playerRespawnTimer <= 0 &&
          Math.hypot(center.x - this.playerPos.x, center.z - this.playerPos.z) <= blastRadius + 0.65
        ) {
          playerHit = true;
        }
        for (const u of hit) {
          if (!u.alive) continue;
          u.stunTimer = Math.max(u.stunTimer ?? 0, 0.9);
          u.hp = Math.max(1, u.hp - opts.damage);
        }
        if (playerHit && this.playerRespawnTimer <= 0) {
          this.applyDamageToPlayer(opts.damage, `${caster.name} (${opts.name})`, caster.team);
        }
        return;
      }
      for (const u of this.units) {
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
        this.damageUnit(
          u,
          opts.damage,
          false,
          opts.name,
          u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.6, 0))
        );
      }
      this.grantAbilityPassive(hitCount > 0);
    };

    const triggerAttract = () => {
      if (finished) return;
      finishAndCooldown(false);
      phase = 'pull';
      pullT = 0;
      // Extend the flight VFX lifetime so the orb survives the full pull phase
      if (flightVfx) flightVfx.maxAge = flightVfx.age + PULL_SEC + 0.6;

      const center = blueOrb.group.position;
      this.spawnImpactRing(center, opts.color, opts.radius * 0.5);
      for (const u of this.units) {
        if (!u.alive) continue;
        if (caster ? u === caster : u.team !== 'red') continue;
        const horizDist = Math.hypot(center.x - u.group.position.x, center.z - u.group.position.z);
        if (horizDist <= opts.radius + u.radius) {
          // Farther targets are caught slightly later, so the pull ripples outward-in
          captured.push({
            unit: u,
            delay: (horizDist / opts.radius) * 0.22,
            swirlSign: Math.random() < 0.5 ? -1 : 1
          });
        }
      }
      if (caster && this.playerRespawnTimer <= 0) {
        const pd = Math.hypot(center.x - this.playerPos.x, center.z - this.playerPos.z);
        if (pd <= opts.radius + 0.65) {
          captured.push({
            isPlayer: true,
            delay: (pd / opts.radius) * 0.22,
            swirlSign: Math.random() < 0.5 ? -1 : 1
          });
        }
      }
    };

    if (!caster) this.activeBlueOrb = { mesh: blueOrb.group, triggerAttract };

    flightVfx = {
      mesh: blueOrb.group,
      age: 0,
      maxAge: opts.durationMs / 1000,
      onUpdate: (dt, progress) => {
        const now = this.clock.getElapsedTime();

        if (phase === 'pull') {
          pullT += dt;
          const k = Math.min(1, pullT / PULL_SEC);
          blueOrb.update(dt, now);
          // Orb swells & pulses while the indicator collapses inward
          blueOrb.group.scale.setScalar(1 + 0.45 * k * k + Math.sin(pullT * 28) * 0.05 * k);
          pullIndicator.scale.set(
            opts.radius * (1 - 0.7 * k * k),
            1,
            opts.radius * (1 - 0.7 * k * k)
          );
          pullIndicator.rotation.y += dt * (2 + k * 9);

          const center = blueOrb.group.position;
          for (const c of captured) {
            const u = c.unit;
            if (u && !u.alive) continue;
            const t = Math.max(0, pullT - c.delay);
            if (t <= 0) continue;
            const kk = Math.min(1, t / (PULL_SEC - c.delay));
            const px = u ? u.group.position.x : this.playerPos.x;
            const pz = u ? u.group.position.z : this.playerPos.z;
            const pr = u ? u.radius : 0.65;
            const py = u ? u.group.position.y : this.playerPos.y;
            if (u) u.stunTimer = Math.max(u.stunTimer ?? 0, 0.2);
            const dx = center.x - px;
            const dz = center.z - pz;
            const d = Math.hypot(dx, dz);
            if (d < 0.8) continue;
            // Starts as a gentle drift and accelerates; slight tangential swirl
            const speed = 1.4 + 15 * kk * kk;
            const nx = dx / d;
            const nz = dz / d;
            const swirl = 0.38 * (1 - kk) * c.swirlSign;
            const mx = (nx - nz * swirl) * speed * dt;
            const mz = (nz + nx * swirl) * speed * dt;
            const resolved = this.mapBuilder.resolveHorizontalCollision(px + mx, pz + mz, pr, py);
            if (u) {
              u.group.position.x = resolved.x;
              u.group.position.z = resolved.z;
              this.clampUnitToDomainBarrier(u);
              u.group.position.y = this.mapBuilder.getFloorHeight(
                u.group.position.x,
                u.group.position.z,
                u.group.position.y
              );
            } else {
              this.playerPos.x = resolved.x;
              this.playerPos.z = resolved.z;
            }
          }

          if (pullT >= PULL_SEC) explode();
          return;
        }

        if (phase === 'done' || finished) {
          blueOrb.group.scale.multiplyScalar(0.72);
          return;
        }

        blueOrb.update(dt, now);
        blueOrb.group.position.addScaledVector(orbVel, dt);
        if (blueOrb.group.position.y < 1.15) blueOrb.group.position.y = 1.15;
        this.placeIndicator(pullIndicator, blueOrb.group.position.x, blueOrb.group.position.z, opts.radius);

        flyT += dt;
        if (opts.autoTriggerSec !== undefined && flyT >= opts.autoTriggerSec) {
          triggerAttract();
          return;
        }

        if (progress >= 0.96) {
          finishAndCooldown();
        }
      }
    };
    this.vfxList.push(flightVfx);
  }

  /**
   * Wide-cone 3D Melee Cleave (Reinhardt Rocket Hammer / Brigitte Rocket Flail / Quick Melee).
   */
  private performMeleeCleave(
    damage: number,
    range: number,
    arcDeg: number,
    knockbackDist: number,
    sourceName: string
  ) {
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const minCos = Math.cos(THREE.MathUtils.degToRad(arcDeg * 0.5));

    // Spawn 3D horizontal cleave wave arc in front of camera
    const slashPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(forward, range * 0.42);
    this.spawnMeleeArcVfx(slashPos, range * 0.6, this.hero.color);

    let hitAny = false;
    for (const u of this.units) {
      if (!u.alive || u.team !== 'red') continue;
      const toUnit = u.group.position.clone().sub(this.playerPos);
      toUnit.y = 0;
      const dist = toUnit.length();
      if (dist <= range + u.radius) {
        const dir = dist > 0.01 ? toUnit.clone().normalize() : forward;
        if (dist < 1.8 || dir.dot(forward) >= minCos) {
          hitAny = true;
          const hitPt = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.7, 0));
          this.damageUnit(u, damage, false, sourceName, hitPt);
          this.spawnImpactRing(hitPt, this.hero.color, 1.6);

          if (u.moveSpeed > 0 && knockbackDist > 0) {
            const resolved = this.mapBuilder.resolveHorizontalCollision(
              u.group.position.x + dir.x * knockbackDist * 0.45,
              u.group.position.z + dir.z * knockbackDist * 0.45,
              u.radius,
              0
            );
            u.group.position.x = resolved.x;
            u.group.position.z = resolved.z;
          }
        }
      }
    }

    if (hitAny && this.hero.id === 'brigid') {
      this.triggerInspirePassive();
    }
  }

  private triggerInspirePassive() {
    this.inspireTimerSec = 5.0;
    // Also immediately heal nearby allied minions
    for (const u of this.units) {
      if (u.alive && u.team === 'blue' && u.type === 'MINION') {
        if (u.group.position.distanceTo(this.playerPos) <= 18) {
          u.hp = Math.min(u.maxHp, u.hp + 25);
        }
      }
    }
  }

  private grantAbilityPassive(hitLanded: boolean) {
    if (!hitLanded) return;
    if (this.hero.id === 'doom') {
      this.shield = Math.min(200, this.shield + 35);
    } else if (this.hero.id === 'brigid') {
      this.triggerInspirePassive();
    } else if (this.hero.id === 'higuruma') {
      this.shield = Math.min(200, this.shield + 15);
      this.mana = Math.min(this.maxMana, this.mana + 8);
    } else if (this.hero.id === 'gojo') {
      this.shield = Math.min(200, this.shield + 20);
      this.mana = Math.min(this.maxMana, this.mana + 10);
    } else if (this.hero.id === 'mr_biomaster') {
      this.shield = Math.min(200, this.shield + 25);
      this.mana = Math.min(this.maxMana, this.mana + 10);
    }
  }

  /** Collects raycastable target meshes for all living enemy units. */
  private getEnemyHitMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const u of this.units) {
      if (u.alive && u.team === 'red') {
        if (u.hitMeshes && u.hitMeshes.length > 0) {
          meshes.push(...u.hitMeshes);
        } else {
          meshes.push(u.bodyMesh);
          if (u.headMesh) meshes.push(u.headMesh);
        }
      }
    }
    return meshes;
  }

  // ─────────────────────────────────────────────────────────────
  //  Overwatch-Style Special Abilities (SHIFT / E / Q)
  // ─────────────────────────────────────────────────────────────
  private tryCastAbility(key: FpsAbilityKey) {
    if (this.teleportPhase !== 'NONE') return;
    const ab = this.hero.abilities[key];
    const cd = this.cooldowns[key];

    // Gojo inside his active Domain Expansion: pressing Q activates Hollow Technique: Purple (1-hit kill)
    if (
      key === 'Q' &&
      this.activeDomain?.isGojoDomain &&
      !this.activeDomain.purpleTriggered
    ) {
      if (!this.canSpendCursedEnergy()) return;
      this.consumeCursedEnergy(35);
      this.triggerHollowPurple();
      return;
    }

    // Gojo's E is Infinity [Hold E], managed continuously via isBarrierActive()
    if (ab.kind === 'INFINITY_SHIELD') {
      return;
    }

    // Two-stage GRAVITY_ORB: 2nd press detonates active orb & attracts within radius
    if (ab.kind === 'GRAVITY_ORB' && this.activeBlueOrb) {
      if (!this.canSpendCursedEnergy()) return;
      this.consumeCursedEnergy(10);
      this.viewModel.triggerCastGesture();
      this.activeBlueOrb.triggerAttract();
      return;
    }

    if (cd.remainingMs > 0 || !this.canSpendCursedEnergy()) return;

    this.consumeCursedEnergy(ab.manaCost);
    const isGojoDomainCast = ab.kind === 'DOMAIN_ULT' && this.hero.id === 'gojo';
    if (ab.kind !== 'GRAVITY_ORB' && !isGojoDomainCast) {
      cd.remainingMs = ab.cooldownMs;
    }
    this.viewModel.triggerCastGesture();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    switch (ab.kind) {
      // ── HIGURUMA / REINHARDT: EXTENDED GAVEL RUSH (CRUSADER CHARGE) ──
      case 'CRUSADER_CHARGE': {
        const startPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const chargeDist = 20;
        const hitUnits = new Set<MobaUnit>();

        for (let step = 1; step <= 14; step++) {
          const nextX = this.playerPos.x + flatForward.x * (chargeDist / 14);
          const nextZ = this.playerPos.z + flatForward.z * (chargeDist / 14);
          const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.75, this.playerPos.y);
          this.playerPos.x = resolved.x;
          this.playerPos.z = resolved.z;

          for (const u of this.units) {
            if (!u.alive || u.team !== 'red' || hitUnits.has(u)) continue;
            if (u.group.position.distanceTo(this.playerPos) <= 3.2 + u.radius) {
              hitUnits.add(u);
              this.grantAbilityPassive(true);
              this.damageUnit(u, ab.damage, true, ab.name, u.group.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
              if (u.moveSpeed > 0 && u.alive) {
                this.KnockbackUnitWithWallSlam(u, flatForward, 8.0, 55);
              }
            }
          }
        }
        const endPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnBeamTracer(startPos, endPos, ab.color, 0.55, 0.35);
        this.spawnImpactRing(endPos, ab.color, ab.radius);
        break;
      }

      // ── HIGURUMA / REINHARDT: VERDICT SHOCKWAVE (FLAME STRIKE) ──
      case 'FLAME_STRIKE': {
        const wavePos = this.camera.position.clone().addScaledVector(forward, 1.6);
        const waveVel = forward.clone().multiplyScalar(28);
        const waveGeo = new THREE.TorusGeometry(1.4, 0.22, 8, 24, Math.PI * 1.15);
        const waveMat = new THREE.MeshBasicMaterial({
          color: ab.color,
          side: THREE.DoubleSide
        });
        const waveMesh = new THREE.Mesh(waveGeo, waveMat);
        waveMesh.position.copy(wavePos);
        waveMesh.lookAt(wavePos.clone().add(forward));
        this.scene.add(waveMesh);

        const pierced = new Set<MobaUnit>();
        this.vfxList.push({
          mesh: waveMesh,
          age: 0,
          maxAge: ab.durationMs / 1000,
          onUpdate: (dt) => {
            waveMesh.position.addScaledVector(waveVel, dt);
            for (const u of this.units) {
              if (!u.alive || u.team !== 'red' || pierced.has(u)) continue;
              const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.5, 0));
              if (unitCenter.distanceTo(waveMesh.position) <= ab.radius + u.radius) {
                pierced.add(u);
                this.grantAbilityPassive(true);
                this.damageUnit(u, ab.damage, false, ab.name, unitCenter);
                this.spawnImpactRing(unitCenter, ab.color, 2.2);
              }
            }
          }
        });
        break;
      }

      // ── HIGURUMA ULTIMATE: DEADLY SENTENCING & EXECUTIONER'S SWORD (EARTHSHATTER) ──
      case 'EARTHSHATTER': {
        this.viewModel.triggerFireRecoil();
        this.executionerTimerSec = ab.durationMs / 1000;
        const origin = this.playerPos.clone();
        // Spawn 4 expanding golden courtroom fissure rings & guillotine pillars along the 18m forward cone
        for (let i = 1; i <= 4; i++) {
          const stepPos = origin.clone().addScaledVector(flatForward, i * 4.2);
          this.spawnImpactRing(stepPos.clone().add(new THREE.Vector3(0, 0.15, 0)), ab.color, i * 2.2);
          this.spawnPillarEffect(stepPos, 0.8 + i * 0.25, 4.2, ab.color, 1.0);
        }

        const minCos = Math.cos(THREE.MathUtils.degToRad(45));
        for (const u of this.units) {
          if (!u.alive || u.team !== 'red') continue;
          const toU = u.group.position.clone().sub(origin);
          toU.y = 0;
          const d = toU.length();
          if (d <= ab.radius && (d < 2.5 || toU.normalize().dot(flatForward) >= minCos)) {
            u.stunTimer = 2.5;
            this.grantAbilityPassive(true);
            this.damageUnit(
              u,
              ab.damage,
              true,
              ab.name,
              u.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
              'GUILTY! DEATH PENALTY!'
            );
          }
        }
        break;
      }

      // ── BRIGITTE: SHIELD BASH ──
      case 'SHIELD_BASH': {
        const startPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const bashDist = 9.5;
        for (let step = 1; step <= 8; step++) {
          const nextX = this.playerPos.x + flatForward.x * (bashDist / 8);
          const nextZ = this.playerPos.z + flatForward.z * (bashDist / 8);
          const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
          this.playerPos.x = resolved.x;
          this.playerPos.z = resolved.z;
        }
        const hitCount = this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name, true, 5.0);
        this.grantAbilityPassive(hitCount > 0);
        this.spawnBeamTracer(startPos, this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0)), ab.color, 0.35, 0.28);
        this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)), ab.color, ab.radius);
        break;
      }

      // ── BRIGITTE: WHIP SHOT (22m Extending Flail Chain + Knockback + Inspire) ──
      case 'WHIP_SHOT': {
        const muzzle = new THREE.Vector3(0.28, -0.22, -0.75).applyMatrix4(this.camera.matrixWorld);
        const raycaster = new THREE.Raycaster();
        raycaster.near = 0.2;
        raycaster.far = ab.radius;
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        const hits = raycaster.intersectObjects(this.getEnemyHitMeshes(), false);
        let endPt = this.camera.position.clone().addScaledVector(forward, ab.radius);

        if (hits.length > 0) {
          endPt = hits[0].point;
          const unit = hits[0].object.userData.unit as MobaUnit | undefined;
          if (unit && unit.alive) {
            this.grantAbilityPassive(true);
            this.damageUnit(unit, ab.damage, false, ab.name, endPt);
            if (unit.moveSpeed > 0) {
              this.KnockbackUnitWithWallSlam(unit, flatForward, 9.0, 25);
            }
          }
        }
        this.spawnBeamTracer(muzzle, endPt, ab.color, 0.38, 0.09);
        this.spawnImpactRing(endPt, ab.color, 1.8);
        break;
      }

      // ── DOOMFIST: SEISMIC SLAM (Forward Leap + Frontal Cone Pull & Shockwave) ──
      case 'SEISMIC_SLAM': {
        this.playerVel.y = 8.5;
        for (let step = 1; step <= 8; step++) {
          const nextX = this.playerPos.x + flatForward.x * 1.4;
          const nextZ = this.playerPos.z + flatForward.z * 1.4;
          const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
          this.playerPos.x = resolved.x;
          this.playerPos.z = resolved.z;
        }
        const slamCenter = this.playerPos.clone().addScaledVector(flatForward, 3.5);
        this.spawnImpactRing(slamCenter.clone().add(new THREE.Vector3(0, 0.2, 0)), ab.color, ab.radius);
        const hits = this.damageEnemiesInRadius(slamCenter, ab.radius, ab.damage, ab.name, false, -3.5);
        this.grantAbilityPassive(hits > 0);
        break;
      }

      // ── DOOMFIST: RISING UPPERCUT (Launches Doom + Nearby Enemies into the Air) ──
      case 'RISING_UPPERCUT': {
        this.playerVel.y = 13.5;
        this.grounded = false;
        const frontPos = this.playerPos.clone().addScaledVector(flatForward, 2.8);
        this.spawnPillarEffect(frontPos, 2.4, 7.5, ab.color, 0.55);
        const hits = this.damageEnemiesInRadius(frontPos, ab.radius, ab.damage, ab.name, true);
        this.grantAbilityPassive(hits > 0);
        break;
      }

      // ── DOOMFIST: POWER BLOCK (Shield + Empowered Rocket Punch) ──
      case 'POWER_BLOCK': {
        this.shield = Math.min(200, this.shield + 90);
        this.isPowerEmpowered = true;
        this.secondaryCooldownMs = 0; // Immediately refreshes Rocket Punch!
        this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0)), ab.color, 4.0);
        break;
      }

      // ── DOOMFIST ULTIMATE: METEOR STRIKE ──
      case 'METEOR_STRIKE_ULT': {
        this.playerVel.y = 18.0;
        this.grounded = false;
        const targetGround = this.getAimGroundPoint(26);
        const resolved = this.mapBuilder.resolveHorizontalCollision(targetGround.x, targetGround.z, 0.75, 0);
        this.playerPos.x = resolved.x;
        this.playerPos.z = resolved.z;
        this.shield = Math.min(200, this.shield + 120);

        this.spawnPillarEffect(this.playerPos, 3.5, 18, ab.color, 0.9);
        this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 0.2, 0)), ab.color, ab.radius);
        this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name, true, 6.0);
        break;
      }

      // ── VEX / KAEL ABILITIES ──
      case 'BLINK_DASH': {
        const startPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const dashDist = 14;
        for (let step = 1; step <= 10; step++) {
          const nextX = this.playerPos.x + flatForward.x * (dashDist / 10);
          const nextZ = this.playerPos.z + flatForward.z * (dashDist / 10);
          const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
          this.playerPos.x = resolved.x;
          this.playerPos.z = resolved.z;
        }
        const endPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnBeamTracer(startPos, endPos, ab.color, 0.45, 0.22);
        this.spawnImpactRing(endPos, ab.color, ab.radius);
        this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name);
        break;
      }

      case 'METEOR_LEAP': {
        this.playerVel.y = 14.5;
        this.playerVel.x = flatForward.x * 18;
        this.playerVel.z = flatForward.z * 18;
        this.grounded = false;
        this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 0.2, 0)), ab.color, ab.radius);
        this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name);
        break;
      }

      case 'GRAVITY_ORB': {
        this.launchTwoStageBlueOrb({
          forward,
          radius: ab.radius,
          damage: ab.damage,
          durationMs: ab.durationMs,
          name: ab.name,
          color: ab.color,
          onCooldownStart: () => {
            cd.remainingMs = ab.cooldownMs;
          }
        });
        break;
      }

      case 'SOLAR_PILLAR': {
        const targetPos = this.getAimGroundPoint(42);
        this.spawnPillarEffect(targetPos, ab.radius * 0.55, 14, ab.color, 1.1);
        this.damageEnemiesInRadius(targetPos, ab.radius, ab.damage, ab.name);
        break;
      }

      case 'BARRIER_WALL': {
        const wallPos = this.playerPos.clone().addScaledVector(flatForward, 4.2);
        wallPos.y = this.playerPos.y + 1.6;
        const wallMesh = new THREE.Mesh(
          new THREE.BoxGeometry(6.2, 3.2, 0.35),
          new THREE.MeshBasicMaterial({
            color: ab.color,
            transparent: true,
            opacity: 0.48
          })
        );
        wallMesh.position.copy(wallPos);
        wallMesh.rotation.y = this.yaw;
        this.scene.add(wallMesh);
        this.shield = Math.min(180, this.shield + 60);

        let tickAcc = 0;
        this.vfxList.push({
          mesh: wallMesh,
          age: 0,
          maxAge: ab.durationMs / 1000,
          onUpdate: (dt, p) => {
            tickAcc += dt;
            if (tickAcc >= 0.5) {
              tickAcc = 0;
              this.damageEnemiesInRadius(wallPos, 4.0, Math.round(ab.damage * 0.4), ab.name);
            }
            (wallMesh.material as THREE.MeshBasicMaterial).opacity = (1 - p * 0.7) * 0.5;
          }
        });
        break;
      }

      case 'SIPHON_BEAM': {
        let bestUnit: MobaUnit | null = null;
        let bestDist = ab.radius;
        for (const u of this.units) {
          if (!u.alive || u.team !== 'red') continue;
          const d = u.group.position.distanceTo(this.playerPos);
          if (d < bestDist) {
            bestDist = d;
            bestUnit = u;
          }
        }
        const targetPoint = bestUnit
          ? bestUnit.group.position.clone().add(new THREE.Vector3(0, 1.2, 0))
          : this.camera.position.clone().addScaledVector(forward, 16);

        if (bestUnit) {
          this.damageUnit(bestUnit, ab.damage, false, ab.name, targetPoint);
          this.hp = Math.min(this.maxHp, this.hp + Math.round(ab.damage * 0.75));
        }
        this.spawnBeamTracer(
          this.camera.position.clone().add(new THREE.Vector3(-0.25, -0.2, -0.5).applyQuaternion(this.camera.quaternion)),
          targetPoint,
          ab.color,
          0.6,
          0.16
        );
        break;
      }

      case 'OVERCHARGE': {
        this.shield = Math.min(200, this.shield + 95);
        this.hp = Math.min(this.maxHp, this.hp + 55);
        if (this.barrierMaxHp > 0) {
          this.barrierHp = Math.min(this.barrierMaxHp, this.barrierHp + 200);
        }
        this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)), ab.color, ab.radius);
        this.damageEnemiesInRadius(this.playerPos, ab.radius, ab.damage, ab.name);
        break;
      }

      case 'RALLY_ULT':
      case 'DOMAIN_ULT': {
        this.activateDomainExpansion(ab, ab.kind === 'RALLY_ULT');
        break;
      }
    }
  }

  private activateDomainExpansion(ab: FpsAbilityDef, isRally = false) {
    if (this.activeDomain) {
      this.endActiveDomain();
    }

    const center = this.playerPos.clone();
    const isGojoDomain = this.hero.id === 'gojo' && !isRally;
    const domeGeo = new THREE.IcosahedronGeometry(ab.radius, 3);
    const domeMat = new THREE.MeshBasicMaterial({
      color: ab.color,
      wireframe: true,
      transparent: true,
      opacity: isRally ? 0.22 : 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.position.copy(center);
    domeMesh.visible = !isGojoDomain;
    this.scene.add(domeMesh);

    const ringGeo = new THREE.RingGeometry(ab.radius * 0.94, ab.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isGojoDomain ? '#a855f7' : ab.color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(center.x, 0.08, center.z);
    this.scene.add(ringMesh);

    let voidVfx: UnlimitedVoidDomainController | undefined;
    if (isGojoDomain) {
      voidVfx = createUnlimitedVoidDomainVfx(center, ab.radius);
      this.scene.add(voidVfx.root);
    }

    const trappedUnitIds = new Set<string>();
    if (!isRally) {
      for (const u of this.units) {
        if (!u.alive) continue;
        const dx = u.group.position.x - center.x;
        const dz = u.group.position.z - center.z;
        if (Math.hypot(dx, dz) <= ab.radius) {
          trappedUnitIds.add(u.id);
        }
      }
    }

    this.activeDomain = {
      name: ab.name,
      isRally,
      isGojoDomain,
      center,
      radius: ab.radius,
      hp: 1200,
      maxHp: 1200,
      trappedUnitIds,
      purpleTriggered: false,
      ageSec: 0,
      remainingMs: ab.durationMs,
      tickTimerMs: 250,
      color: ab.color,
      domeMesh,
      ringMesh,
      voidVfx
    };
  }

  private endActiveDomain() {
    if (!this.activeDomain) return;
    const wasGojoDomain = this.activeDomain.isGojoDomain;
    this.scene.remove(this.activeDomain.domeMesh);
    this.scene.remove(this.activeDomain.ringMesh);
    if (this.activeDomain.voidVfx) {
      this.scene.remove(this.activeDomain.voidVfx.root);
    }
    this.activeDomain = null;
    if (wasGojoDomain) {
      this.cooldowns.Q.remainingMs = this.hero.abilities.Q.cooldownMs;
    }
  }

  /**
   * Enforces the Domain barrier boundary: units trapped inside cannot escape, and outside units cannot walk in.
   * Returns true if the unit collided against the barrier shell.
   */
  private clampUnitToDomainBarrier(unit: MobaUnit): boolean {
    const dom = this.activeDomain;
    if (!dom || dom.isRally) return false;
    const dx = unit.group.position.x - dom.center.x;
    const dz = unit.group.position.z - dom.center.z;
    const dist = Math.hypot(dx, dz);

    if (dom.trappedUnitIds.has(unit.id)) {
      const maxInner = Math.max(0.5, dom.radius - unit.radius - 0.15);
      if (dist > maxInner && dist > 0.0001) {
        unit.group.position.x = dom.center.x + (dx / dist) * maxInner;
        unit.group.position.z = dom.center.z + (dz / dist) * maxInner;
        return true;
      }
    } else {
      const minOuter = dom.radius + unit.radius + 0.1;
      if (dist < minOuter) {
        if (dist > 0.0001) {
          unit.group.position.x = dom.center.x + (dx / dist) * minOuter;
          unit.group.position.z = dom.center.z + (dz / dist) * minOuter;
        } else {
          unit.group.position.z = dom.center.z + minOuter;
        }
        return true;
      }
    }
    return false;
  }

  /** Returns 0.10 (90% slow) for any enemy caught inside an active Domain barrier, or 1.0 otherwise. */
  private getDomainSlowMultiplier(unit: MobaUnit): number {
    const dom = this.activeDomain;
    if (!dom || dom.isRally || unit.team !== 'red') return 1.0;
    const dx = unit.group.position.x - dom.center.x;
    const dz = unit.group.position.z - dom.center.z;
    if (dom.trappedUnitIds.has(unit.id) || Math.hypot(dx, dz) <= dom.radius) {
      return 0.1;
    }
    return 1.0;
  }

  /**
   * Gojo's Domain-only finisher: fuses Reversal Red + Lapse Blue in an animation to form
   * a massive Hollow Purple orb (1-hit kill), ending Unlimited Void upon launch.
   */
  private triggerHollowPurple() {
    if (!this.activeDomain || this.activeDomain.purpleTriggered) return;
    this.activeDomain.purpleTriggered = true;
    this.viewModel.triggerCastGesture();

    const fusionGroup = new THREE.Group();
    const redOrb = createCursedEnergyOrb({ variant: 'RED', radius: 0.5 });
    const blueOrb = createCursedEnergyOrb({ variant: 'BLUE', radius: 0.5 });
    const purpleOrb = createCursedEnergyOrb({ variant: 'PURPLE', radius: 1.75 });
    purpleOrb.group.visible = false;

    fusionGroup.add(redOrb.group, blueOrb.group, purpleOrb.group);
    this.scene.add(fusionGroup);

    const fusionDuration = 0.78;
    const totalDuration = 3.1;
    let launched = false;
    const launchDir = new THREE.Vector3();
    const hitUnits = new Set<MobaUnit>();

    this.vfxList.push({
      mesh: fusionGroup,
      age: 0,
      maxAge: totalDuration,
      onUpdate: (dt, progress) => {
        const now = this.clock.getElapsedTime();
        const ageSec = progress * totalDuration;
        if (ageSec < fusionDuration) {
          // Phase 1: Shader Red (left) and Blue (right) spiral and fuse together in front of Gojo
          const t = ageSec / fusionDuration;
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();

          const anchor = this.camera.position.clone().addScaledVector(forward, 2.8);
          fusionGroup.position.copy(anchor);

          const sep = (1 - t * t) * 1.55;
          const swirlAngle = t * Math.PI * 2.5;
          const offsetX = Math.cos(swirlAngle) * sep;
          const offsetY = Math.sin(swirlAngle) * sep * 0.45;

          redOrb.group.position
            .set(0, 0, 0)
            .addScaledVector(right, -offsetX)
            .addScaledVector(up, offsetY);
          blueOrb.group.position
            .set(0, 0, 0)
            .addScaledVector(right, offsetX)
            .addScaledVector(up, -offsetY);
          redOrb.update(dt, now);
          blueOrb.update(dt, now);

          if (t > 0.62) {
            purpleOrb.group.visible = true;
            const pScale = ((t - 0.62) / 0.38) * 0.78;
            purpleOrb.setScale(Math.max(0.05, pScale));
            purpleOrb.update(dt, now);
          }
        } else {
          // Phase 2: Red + Blue combine into Hollow Purple -> launch forward & end Domain Expansion!
          if (!launched) {
            launched = true;
            redOrb.group.visible = false;
            blueOrb.group.visible = false;
            purpleOrb.group.visible = true;
            purpleOrb.setScale(1.0);
            launchDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            this.viewModel.triggerFireRecoil();
            this.spawnImpactRing(fusionGroup.position.clone(), '#a855f7', 6.5);
            this.endActiveDomain();
          }

          purpleOrb.update(dt, now);
          fusionGroup.position.addScaledVector(launchDir, 26.0 * dt);
          if (fusionGroup.position.y < 1.5) fusionGroup.position.y = 1.5;

          // Obliterate any enemy within 4.2m of the Hollow Purple singularity (One-Hit Kill)
          for (const u of this.units) {
            if (!u.alive || u.team !== 'red' || hitUnits.has(u)) continue;
            const unitCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.5, 0));
            if (unitCenter.distanceTo(fusionGroup.position) <= 4.2 + u.radius) {
              hitUnits.add(u);
              this.spawnImpactRing(unitCenter, '#a855f7', 5.5);
              this.spawnPillarEffect(u.group.position, 1.8, 12, '#a855f7', 0.8);
              this.damageUnit(
                u,
                Math.max(9999, u.hp + u.maxHp),
                true,
                'HOLLOW PURPLE',
                unitCenter,
                'HOLLOW PURPLE'
              );
            }
          }
        }
      }
    });
  }

  private getAimGroundPoint(maxDist: number): THREE.Vector3 {
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0.2;
    raycaster.far = maxDist;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = raycaster.intersectObjects(this.mapBuilder.raycastObstacles, false);
    if (hits.length > 0) return hits[0].point;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const pt = this.playerPos.clone().addScaledVector(forward, 16);
    pt.y = 0;
    return pt;
  }

  private damageEnemiesInRadius(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    sourceName: string,
    stun = false,
    radialPush = 0
  ): number {
    let hitCount = 0;
    for (const u of this.units) {
      if (!u.alive || u.team !== 'red') continue;
      const dist = u.group.position.distanceTo(center);
      if (dist <= radius + u.radius) {
        hitCount++;
        if (stun) u.stunTimer = 1.1;
        this.damageUnit(
          u,
          damage,
          false,
          sourceName,
          u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.7, 0))
        );
        if (u.moveSpeed > 0 && radialPush !== 0 && dist > 0.1) {
          const dir = u.group.position.clone().sub(center).normalize();
          const resolved = this.mapBuilder.resolveHorizontalCollision(
            u.group.position.x + dir.x * radialPush,
            u.group.position.z + dir.z * radialPush,
            u.radius,
            0
          );
          u.group.position.x = resolved.x;
          u.group.position.z = resolved.z;
        }
      }
    }
    return hitCount;
  }

  /** True if the unit is its caster, or an ally standing inside an active NPC Infinity wall (4m wide, in front). */
  private isShieldedByNpcInfinity(unit: MobaUnit): boolean {
    for (const c of this.units) {
      if (!c.alive || !c.npcShieldTimer || c.npcShieldTimer <= 0 || c.team !== unit.team) continue;
      if (c === unit) return true;
      const dx = unit.group.position.x - c.group.position.x;
      const dz = unit.group.position.z - c.group.position.z;
      const ry = c.group.rotation.y;
      const lz = dx * Math.sin(ry) + dz * Math.cos(ry);
      const lx = dx * Math.cos(ry) - dz * Math.sin(ry);
      if (lz >= 0.6 && lz <= 3.4 && Math.abs(lx) <= 2.2) return true;
    }
    return false;
  }

  private damageUnit(
    unit: MobaUnit,
    amount: number,
    isCrit: boolean,
    sourceName: string,
    hitWorldPos: THREE.Vector3,
    customLabel?: string
  ) {
    if (!unit.alive || this.winner) return;
    if (this.isShieldedByNpcInfinity(unit) && sourceName !== 'HOLLOW PURPLE') {
      const projected = hitWorldPos.clone().project(this.camera);
      if (projected.z < 1) {
        const sx = (projected.x * 0.5 + 0.5) * 100;
        const sy = (-projected.y * 0.5 + 0.5) * 100;
        this.damagePopups.push({
          id: this.popupCounter++,
          x: THREE.MathUtils.clamp(sx, 10, 90),
          y: THREE.MathUtils.clamp(sy, 10, 90),
          amount: 0,
          label: 'INFINITY BLOCKED',
          isCrit: false,
          color: '#38bdf8',
          ageSec: 0,
          opacity: 1
        });
        if (this.damagePopups.length > 10) this.damagePopups.shift();
      }
      return;
    }
    unit.hp = Math.max(0, unit.hp - amount);
    unit.outOfCombatTimer = 4.0;

    this.hitMarkerAlpha = 1.0;
    this.hitMarkerCrit = isCrit;

    const projected = hitWorldPos.clone().project(this.camera);
    if (projected.z < 1) {
      const sx = (projected.x * 0.5 + 0.5) * 100;
      const sy = (-projected.y * 0.5 + 0.5) * 100;
      this.damagePopups.push({
        id: this.popupCounter++,
        x: THREE.MathUtils.clamp(sx + (Math.random() - 0.5) * 4, 10, 90),
        y: THREE.MathUtils.clamp(sy + (Math.random() - 0.5) * 4, 10, 90),
        amount,
        label: customLabel,
        isCrit,
        color: isCrit ? '#facc15' : this.hero.color,
        ageSec: 0,
        opacity: 1
      });
      if (this.damagePopups.length > 10) this.damagePopups.shift();
    }

    if (unit.hp <= 0) {
      unit.alive = false;
      this.gold += unit.goldValue;
      this.addXp(unit.xpValue);

      if (this.hero.id === 'higuruma' || this.hero.id === 'titan') {
        this.shield = Math.min(200, this.shield + 15);
        this.mana = Math.min(this.maxMana, this.mana + 8);
      }

      if (unit.type === 'HERO') {
        if (!unit.isDummy) {
          this.kills++;
        }
        unit.respawnTimer = unit.isDummy ? 2.5 : 8.0;
        unit.group.visible = false;
      } else if (unit.type === 'MINION') {
        this.minionKills++;
        this.scene.remove(unit.group);
      } else {
        this.scene.remove(unit.group);
      }

      this.addKillFeed(this.hero.name, 'blue', unit.name, unit.team, sourceName);

      if (unit.id === 'red_core') {
        this.winner = 'blue';
        document.exitPointerLock?.();
      }
    }
  }

  private addXp(amount: number) {
    this.xp += amount;
    while (this.xp >= this.nextLevelXp) {
      this.xp -= this.nextLevelXp;
      this.level++;
      this.nextLevelXp = Math.round(this.nextLevelXp * 1.35);
      this.maxHp += 25;
      this.hp = this.maxHp;
      this.maxMana += 15;
      this.mana = this.maxMana;
    }
  }

  private addKillFeed(killer: string, killerTeam: MobaTeam, victim: string, victimTeam: MobaTeam, weaponOrAbility: string) {
    this.killFeed.unshift({
      id: `${Date.now()}_${Math.random()}`,
      killer,
      killerTeam,
      victim,
      victimTeam,
      weaponOrAbility,
      timestamp: Date.now()
    });
    if (this.killFeed.length > 5) this.killFeed.pop();
  }

  // ─────────────────────────────────────────────────────────────
  //  3D Visual Effects Helpers (Tracers, Melee Arcs, Shockwaves, Pillars)
  // ─────────────────────────────────────────────────────────────
  private spawnMeleeArcVfx(pos: THREE.Vector3, radius: number, colorHex: string) {
    const geo = new THREE.TorusGeometry(radius, 0.14, 8, 24, Math.PI * 0.95);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = Math.PI / 2;
    mesh.rotation.z = this.yaw - Math.PI * 0.48;
    this.scene.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      maxAge: 0.25,
      onUpdate: (_dt, p) => {
        mesh.scale.setScalar(0.85 + p * 0.45);
        mat.opacity = (1 - p) * 0.92;
      }
    });
  }

  private spawnBeamTracer(start: THREE.Vector3, end: THREE.Vector3, colorHex: string, durationSec = 0.14, thickness = 0.045) {
    const dist = start.distanceTo(end);
    if (dist < 0.05) return;
    const geo = new THREE.CylinderGeometry(thickness * 0.6, thickness, dist, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.lerpVectors(start, end, 0.5);
    mesh.lookAt(end);
    this.scene.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      maxAge: durationSec,
      onUpdate: (_dt, p) => {
        mat.opacity = (1 - p) * 0.92;
      }
    });
  }

  private spawnImpactRing(pos: THREE.Vector3, colorHex: string, maxRadius: number) {
    const geo = new THREE.RingGeometry(0.18, 0.38, 28);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      maxAge: 0.35,
      onUpdate: (_dt, p) => {
        const s = 1 + p * (maxRadius * 2.4);
        mesh.scale.setScalar(s);
        mat.opacity = (1 - p) * 0.9;
      }
    });
  }

  /**
   * Instant Transmission streaks: a swarm of glowing light lines.
   * 'converge' = lines rush inward / streak vertically around the point (cast build-up);
   * 'burst' = lines blast outward and fade (departure / arrival flash).
   */
  private spawnTransmissionStreaks(origin: THREE.Vector3, mode: 'converge' | 'burst', durationSec: number) {
    const count = 120;
    const maxR = mode === 'converge' ? 3.4 : 4.6;
    const geo = new THREE.BoxGeometry(0.035, 0.035, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;

    const palette = [
      new THREE.Color(2.4, 2.6, 3.0),
      new THREE.Color(0.5, 1.6, 2.6),
      new THREE.Color(0.35, 0.8, 2.4),
      new THREE.Color(1.6, 1.2, 2.8)
    ];
    const lines = Array.from({ length: count }, (_, i) => {
      mesh.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]);
      return {
        theta: Math.random() * Math.PI * 2,
        radius: 0.9 + Math.random() * (maxR - 0.9),
        y: 0.05 + Math.random() * 2.7,
        speed: 1.3 + Math.random() * 2.2,
        phase: Math.random(),
        len: 0.7 + Math.random() * 2.0,
        vertical: Math.random() < 0.4,
        tilt: (Math.random() - 0.5) * 0.9
      };
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const dummy = new THREE.Object3D();
    const dir = new THREE.Vector3();
    this.vfxList.push({
      mesh,
      age: 0,
      maxAge: durationSec,
      onUpdate: (_dt, p) => {
        const age = p * durationSec;
        mat.opacity =
          mode === 'converge' ? Math.min(1, p * 5) * 0.95 : Math.pow(1 - p, 0.7) * 0.95;
        for (let i = 0; i < count; i++) {
          const l = lines[i];
          let u: number;
          let r: number;
          let len: number;
          if (mode === 'converge') {
            u = (l.phase + age * l.speed) % 1;
            r = maxR * (1 - u) + 0.12;
            len = l.len * (0.35 + 0.65 * Math.sin(u * Math.PI));
          } else {
            u = Math.min(1, Math.max(0, (p - l.phase * 0.2) / 0.8));
            r = 0.2 + (1 - Math.pow(1 - u, 3)) * (l.radius + 1.2);
            len = l.len * (1 - u * 0.85);
          }
          const cx = Math.cos(l.theta);
          const sz = Math.sin(l.theta);
          if (l.vertical) {
            const rr = Math.min(l.radius, r);
            const dirY = mode === 'converge' ? (i % 2 === 0 ? 1 : -1) : 1;
            const yCenter =
              l.y * (mode === 'converge' ? 1 : 0.4 + u * 1.6) + dirY * (u - 0.5) * (mode === 'converge' ? 2.4 : 3.2);
            dummy.position.set(cx * rr * 0.55, Math.max(0.05, yCenter), sz * rr * 0.55);
            dir.set(0, 1, 0);
          } else {
            dir.set(cx, l.tilt * 0.6, sz).normalize();
            dummy.position
              .set(0, l.y * 0.7 + 0.2, 0)
              .addScaledVector(dir, r + len * 0.5);
          }
          dummy.lookAt(dummy.position.clone().add(dir));
          dummy.scale.set(1, 1, Math.max(0.01, len));
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  private spawnPillarEffect(pos: THREE.Vector3, radius: number, height: number, colorHex: string, durationSec: number) {
    const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, height * 0.5, pos.z);
    this.scene.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      maxAge: durationSec,
      onUpdate: (dt, p) => {
        mesh.rotation.y += dt * 6;
        mat.opacity = (1 - p) * 0.9;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  Main Simulation & Render Loop
  // ─────────────────────────────────────────────────────────────
  private loop = () => {
    if (this.destroyed) return;
    this.animFrameId = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    if (!this.winner && this.pointerLocked) {
      this.matchTimeSec += dt;
      this.updatePlayer(dt, elapsed);
      this.updateDomainExpansion(dt);
      this.updateNpcDomain(dt);
      this.updateMobaUnits(dt, elapsed);
    }

    this.updateVfx(dt);
    this.mapBuilder.updateSky(
      elapsed,
      Boolean(this.activeDomain || this.npcDomain),
      this.activeDomain?.color ?? this.npcDomain?.color
    );
    this.composer.render();

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.05) {
      this.hudThrottle = 0;
      this.emitHud();
    }
  };

  private updatePlayer(dt: number, elapsed: number) {
    const dtMs = dt * 1000;
    this.updateTeleport(dt, elapsed);
    this.hitMarkerAlpha = Math.max(0, this.hitMarkerAlpha - dt * 4.5);

    // Cursed Energy Exhaustion Penalty Timeout vs Character-Modified CE Regeneration
    if (this.manaExhaustedTimerSec > 0) {
      this.manaExhaustedTimerSec = Math.max(0, this.manaExhaustedTimerSec - dt);
      if (this.manaExhaustedTimerSec === 0) {
        // Restore a small spark of Cursed Energy once the exhaustion lockout expires
        this.mana = Math.min(this.maxMana, 15);
      }
    } else if (!this.isBarrierActive() && !this.isChargingPrimary && !this.isChargingPunch) {
      this.mana = Math.min(this.maxMana, this.mana + this.getCeRegenPerSec() * dt);
    }

    // Brigitte Inspire Passive Healing over time
    if (this.inspireTimerSec > 0) {
      this.inspireTimerSec = Math.max(0, this.inspireTimerSec - dt);
      this.hp = Math.min(this.maxHp, this.hp + 22 * dt);
    }

    // Higuruma Executioner's Sword Ultimate Duration
    if (this.executionerTimerSec > 0) {
      this.executionerTimerSec = Math.max(0, this.executionerTimerSec - dt);
    }

    // Secondary Fire Cooldowns & Charge
    if (this.secondaryCooldownMs > 0) {
      this.secondaryCooldownMs = Math.max(0, this.secondaryCooldownMs - dtMs);
    }
    if (this.isChargingPunch) {
      const maxCharge = this.hero.secondaryFire.maxChargeMs ?? 1000;
      this.punchChargeMs = Math.min(maxCharge, this.punchChargeMs + dtMs);
    }
    if (this.isChargingPrimary) {
      const maxPrimaryCharge = this.hero.weapon.maxChargeMs ?? 900;
      const before = this.primaryChargeMs;
      this.primaryChargeMs = Math.min(maxPrimaryCharge, this.primaryChargeMs + dtMs);
      // Held charge drains Cursed Energy continuously until fully charged
      const wep = this.hero.weapon;
      const extra = (wep.maxManaCost ?? wep.manaCost ?? 0) - (wep.manaCost ?? 0);
      if (extra > 0) {
        this.consumeCursedEnergy((extra / (maxPrimaryCharge / 1000)) * ((this.primaryChargeMs - before) / 1000));
      }
    }
    if (this.isChargingPunch) {
      const sec = this.hero.secondaryFire;
      const maxC = sec.maxChargeMs ?? 1000;
      this.consumeCursedEnergy(((sec.manaCost ?? 22) * 0.9) / (maxC / 1000) * (this.punchChargeMs < maxC ? dt : 0));
    }
    if (this.isChargingBlue) {
      this.blueChargeMs = Math.min(BLUE_MAX_CHARGE_MS, this.blueChargeMs + dtMs);
      this.consumeCursedEnergy(BLUE_CHARGE_DRAIN_PER_SEC * dt);
    }

    // Barrier Shield / Gojo Infinity: drains Cursed Energy while held!
    if (this.isBarrierActive()) {
      const ceDrain =
        this.hero.abilities.E.kind === 'INFINITY_SHIELD'
          ? (this.hero.abilities.E.manaDrainPerSec ?? 30)
          : (this.hero.secondaryFire.manaDrainPerSec ?? 15);
      this.consumeCursedEnergy(ceDrain * dt);
      this.barrierRegenDelaySec = 0.85;
    } else if (this.barrierMaxHp > 0 && this.hero.abilities.E.kind !== 'INFINITY_SHIELD') {
      if (this.barrierRegenDelaySec > 0) {
        this.barrierRegenDelaySec = Math.max(0, this.barrierRegenDelaySec - dt);
      } else if (this.barrierHp < this.barrierMaxHp) {
        const regen = this.hero.secondaryFire.barrierRegenPerSec ?? 100;
        this.barrierHp = Math.min(this.barrierMaxHp, this.barrierHp + regen * dt);
      }
    }

    if (this.hero.abilities.E.kind === 'INFINITY_SHIELD') {
      this.barrierMaxHp = this.maxMana;
      this.barrierHp = this.mana;
    }

    // Doomfist Hand Cannon auto-ammo regeneration
    if (this.hero.weapon.autoRegenAmmo && this.ammo < this.maxAmmo) {
      this.autoRegenTimerMs -= dtMs;
      if (this.autoRegenTimerMs <= 0) {
        this.ammo++;
        this.autoRegenTimerMs = this.hero.weapon.reloadTimeMs;
      }
    }

    (['SHIFT', 'E', 'Q'] as FpsAbilityKey[]).forEach((k) => {
      if (this.cooldowns[k].remainingMs > 0) {
        this.cooldowns[k].remainingMs = Math.max(0, this.cooldowns[k].remainingMs - dtMs);
      }
    });

    if (this.fireCooldownMs > 0) {
      this.fireCooldownMs = Math.max(0, this.fireCooldownMs - dtMs);
    }

    if (this.isReloading) {
      this.reloadRemainingMs -= dtMs;
      if (this.reloadRemainingMs <= 0) {
        this.isReloading = false;
        this.ammo = this.maxAmmo;
      }
    }

    if (this.playerRespawnTimer > 0) {
      this.playerRespawnTimer = Math.max(0, this.playerRespawnTimer - dt);
      if (this.playerRespawnTimer === 0) {
        this.hp = this.maxHp;
        this.mana = this.maxMana;
        this.barrierHp = this.barrierMaxHp;
        this.playerPos.set(0, 0, 64);
      }
      this.syncCameraToPlayer();
      return;
    }

    // Continuous fire / melee swing when holding Left Click
    if (
      this.mouseDown &&
      this.pointerLocked &&
      (this.hero.weapon.fireMode === 'AUTO' ||
        this.hero.weapon.fireMode === 'BURST' ||
        this.hero.weapon.fireMode === 'MELEE_CLEAVE' ||
        this.hero.weapon.fireMode === 'HAND_CANNON')
    ) {
      this.tryPrimaryFire();
    }

    // First-person WASD movement
    let moveForward = 0;
    let moveRight = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    const isMoving = moveForward !== 0 || moveRight !== 0;
    const domainSpeedBonus = this.activeDomain ? 1.28 : 1.0;
    const shieldPenalty = this.isBarrierActive() || this.isChargingPunch ? 0.72 : 1.0;
    const teleportSlow = this.teleportPhase !== 'NONE' ? 0 : 1.0;
    const npcDomainSlow = this.npcDomain?.playerTrapped ? 0.1 : 1.0;
    const speed = this.hero.moveSpeed * domainSpeedBonus * shieldPenalty * teleportSlow * npcDomainSlow;

    const forwardVec = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3()
      .addScaledVector(forwardVec, moveForward)
      .addScaledVector(rightVec, moveRight);
    if (moveDir.lengthSq() > 1) moveDir.normalize();

    const targetVx = moveDir.x * speed;
    const targetVz = moveDir.z * speed;
    this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, targetVx, dt * 12);
    this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, targetVz, dt * 12);
    if (this.teleportPhase !== 'NONE') {
      // Movement is fully locked while choosing / casting Limitless Teleport
      this.playerVel.x = 0;
      this.playerVel.z = 0;
    }

    if (this.keys.has('Space') && this.grounded && this.teleportPhase === 'NONE') {
      this.playerVel.y = 11.2;
      this.grounded = false;
    }
    this.playerVel.y -= 28.0 * dt;

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    // Keep player inside their own active Domain barrier
    if (this.activeDomain && !this.activeDomain.isRally) {
      const dx = this.playerPos.x - this.activeDomain.center.x;
      const dz = this.playerPos.z - this.activeDomain.center.z;
      const dist = Math.hypot(dx, dz);
      const maxR = Math.max(1.0, this.activeDomain.radius - 0.75);
      if (dist > maxR && dist > 0.0001) {
        this.playerPos.x = this.activeDomain.center.x + (dx / dist) * maxR;
        this.playerPos.z = this.activeDomain.center.z + (dz / dist) * maxR;
      }
    }

    // Enemy (NPC) Domain: trapped players cannot leave, others cannot enter
    if (this.npcDomain) {
      const c = this.clampPlayerToNpcDomain(this.playerPos.x, this.playerPos.z);
      this.playerPos.x = c.x;
      this.playerPos.z = c.z;
    }

    this.playerPos.y += this.playerVel.y * dt;
    const floorY = this.mapBuilder.getFloorHeight(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    if (this.playerPos.y <= floorY) {
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.grounded = true;
    }

    if (this.playerPos.z > 62 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 35 * dt);
    }

    this.syncCameraToPlayer();

    const maxCharge = this.hero.secondaryFire.maxChargeMs ?? 1000;
    const maxPrimaryCharge = this.hero.weapon.maxChargeMs ?? 900;
    const blueChargeRatio = this.isChargingBlue ? Math.min(1, this.blueChargeMs / BLUE_MAX_CHARGE_MS) : 0;
    this.viewModel.setSecondaryState({
      isBarrierActive: this.isBarrierActive(),
      barrierHpRatio: this.barrierMaxHp > 0 ? this.barrierHp / this.barrierMaxHp : 1,
      punchChargeRatio: this.isChargingPunch ? this.punchChargeMs / maxCharge : 0,
      primaryChargeRatio: this.isChargingPrimary ? Math.min(1, this.primaryChargeMs / maxPrimaryCharge) : 0,
      blueChargeRatio,
      isExecutionerActive: this.executionerTimerSec > 0
    });
    this.viewModel.update(dt, elapsed, isMoving, false, this.grounded);
  }

  private syncCameraToPlayer() {
    const eye = new THREE.Vector3(this.playerPos.x, this.playerPos.y + 1.72, this.playerPos.z);
    if (this.teleportCamBlend > 0.001) {
      // Over-the-shoulder third-person camera used while aiming / casting Limitless Teleport
      const f = new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const back = f.clone().multiplyScalar(-1).addScaledVector(right, 0.18).normalize();
      let dist = TELEPORT_CAM_DIST * this.teleportCamBlend;
      const ray = new THREE.Raycaster(eye, back, 0, dist);
      const hits = ray.intersectObjects(this.mapBuilder.raycastObstacles, false);
      if (hits.length > 0) dist = Math.max(0.4, hits[0].distance - 0.3);
      const pos = eye.clone().addScaledVector(back, dist);
      pos.y = Math.max(0.35, pos.y);
      this.camera.position.copy(pos);
    } else {
      this.camera.position.copy(eye);
    }
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private updateDomainExpansion(dt: number) {
    if (!this.activeDomain) return;
    const dom = this.activeDomain;
    dom.ageSec += dt;
    dom.remainingMs -= dt * 1000;
    dom.tickTimerMs -= dt * 1000;

    if (dom.voidVfx) {
      dom.voidVfx.update(dt, this.clock.getElapsedTime(), dom.ageSec, this.camera.position);
    }

    // Brigitte's Rally follows the player!
    if (dom.isRally) {
      dom.center.copy(this.playerPos);
      dom.domeMesh.position.copy(this.playerPos);
      dom.ringMesh.position.set(this.playerPos.x, this.playerPos.y + 0.08, this.playerPos.z);
      this.shield = Math.min(200, this.shield + 35 * dt);
      this.hp = Math.min(this.maxHp, this.hp + 25 * dt);
    }

    dom.domeMesh.rotation.y += dt * 0.35;
    dom.ringMesh.rotation.z -= dt * 0.6;

    if (dom.tickTimerMs <= 0) {
      dom.tickTimerMs = 950;
      for (const u of this.units) {
        if (!u.alive || u.team !== 'red') continue;
        if (u.group.position.distanceTo(dom.center) <= dom.radius) {
          this.spawnPillarEffect(u.group.position, 0.9, 10, dom.color, 0.45);
          this.damageUnit(
            u,
            this.hero.abilities.Q.damage,
            false,
            dom.name,
            u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.8, 0))
          );
        }
      }
    }

    if (dom.remainingMs <= 0 || dom.hp <= 0) {
      this.endActiveDomain();
    }
  }

  private updateMobaUnits(dt: number, elapsed: number) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];

      if (!u.alive) {
        if (u.npcAi) this.resetNpcAiOnDeath(u);
        if (u.type === 'HERO' && u.respawnTimer !== undefined) {
          u.respawnTimer -= dt;
          if (u.respawnTimer <= 0 && u.spawnPos) {
            u.alive = true;
            u.hp = u.maxHp;
            u.group.position.copy(u.spawnPos);
            u.group.visible = true;
            if (u.npcAi) {
              u.npcAi.ce = u.npcAi.maxCe;
              u.npcAi.burnout = 0;
              u.npcAi.busy = 0;
              u.npcAi.cd = { red: 1, blue: 3, shift: 0, infinity: 0, domain: 6 };
            }
          }
        } else if (u.type === 'MINION') {
          this.units.splice(i, 1);
        }
        continue;
      }

      const hpRatio = Math.max(0.001, u.hp / u.maxHp);
      u.hpBarFill.scale.x = hpRatio;
      const hpBarTarget = u.hpBarFill.parent?.userData.isHpBarRoot ? u.hpBarFill.parent : u.hpBarFill;
      hpBarTarget.lookAt(this.camera.position);
      if (u.nameplateMesh) {
        u.nameplateMesh.lookAt(this.camera.position);
      }
      if (u.headMesh && (u.type === 'TOWER' || u.type === 'CORE')) {
        u.headMesh.rotation.y = elapsed * 1.8;
        u.headMesh.rotation.x = elapsed * 1.1;
      }

      // Stunned units (from Earthshatter / Shield Bash / Wall Slam) cannot move or attack
      if (u.stunTimer && u.stunTimer > 0) {
        u.stunTimer = Math.max(0, u.stunTimer - dt);
        if (u.animateRig) {
          u.animateRig(elapsed, false, true);
        } else {
          u.bodyMesh.rotation.z = 0.45;
        }
        continue;
      } else if (!u.animateRig) {
        u.bodyMesh.rotation.z = 0;
      }

      // Hero Training Dummies stay at their sparring stations (or roam the map if isRoamer) & regen out of combat
      if (u.isDummy) {
        if (u.outOfCombatTimer && u.outOfCombatTimer > 0) {
          u.outOfCombatTimer = Math.max(0, u.outOfCombatTimer - dt);
        } else {
          if (!u.isRoamer && u.spawnPos && u.group.position.distanceTo(u.spawnPos) > 0.05) {
            u.group.position.lerp(u.spawnPos, Math.min(1, dt * 4.5));
          }
          if (u.hp < u.maxHp) {
            u.hp = Math.min(u.maxHp, u.hp + 95 * dt);
          }
        }

        // AI-driven combatant (Gojo): full move kit, CE pool, cooldowns, domain & purple
        if (u.npcAi) {
          this.updateNpcGojoAi(u, dt, elapsed);
          continue;
        }

        if (u.isRoamer) {
          u.roamTimer = (u.roamTimer ?? 0) - dt;
          if (u.roamTimer <= 0) {
            if (u.id === 'dummy_hero_gojo') {
              if (u.roamPhase === 'idle') {
                u.roamPhase = 'run';
                u.roamTimer = 6.5 + Math.random() * 3.0;
                u.roamTarget = this.pickRandomRoamTarget(u.radius);
              } else {
                u.roamPhase = 'idle';
                u.roamTimer = 5.8;
              }
            } else if (u.roamPhase === 'idle') {
              u.roamPhase = 'walk';
              u.roamTimer = 5.5;
              u.roamTarget = this.pickRandomRoamTarget(u.radius);
            } else if (u.roamPhase === 'walk') {
              u.roamPhase = 'dance';
              u.roamTimer = 7.8;
            } else if (u.roamPhase === 'dance') {
              u.roamPhase = 'run';
              u.roamTimer = 6.5 + Math.random() * 3.5;
              u.roamTarget = this.pickRandomRoamTarget(u.radius);
            } else {
              u.roamPhase = 'idle';
              u.roamTimer = 4.1;
            }
          }

          const phase: HeroAnimHint = u.roamPhase ?? 'idle';
          const movingNow = phase === 'walk' || phase === 'run';
          if (movingNow) {
            if (!u.roamTarget) {
              u.roamTarget = this.pickRandomRoamTarget(u.radius);
            }
            const dx = u.roamTarget.x - u.group.position.x;
            const dz = u.roamTarget.z - u.group.position.z;
            const dist = Math.hypot(dx, dz);
            if (dist < 1.4) {
              u.roamTarget = this.pickRandomRoamTarget(u.radius);
            } else {
              const domainSlow = this.getDomainSlowMultiplier(u);
              const activeSpeed = (phase === 'walk' ? 4.2 : u.moveSpeed) * domainSlow;
              const step = Math.min(dist, activeSpeed * dt);
              const nx = (dx / dist) * step;
              const nz = (dz / dist) * step;
              const prevX = u.group.position.x;
              const prevZ = u.group.position.z;
              const resolved = this.mapBuilder.resolveHorizontalCollision(
                prevX + nx,
                prevZ + nz,
                u.radius,
                u.group.position.y
              );
              u.group.position.x = resolved.x;
              u.group.position.z = resolved.z;
              this.clampUnitToDomainBarrier(u);
              u.group.position.y = this.mapBuilder.getFloorHeight(
                u.group.position.x,
                u.group.position.z,
                u.group.position.y
              );
              this.rotateUnitToward(u, dx, dz, dt);

              const moved = Math.hypot(u.group.position.x - prevX, u.group.position.z - prevZ);
              if (moved < step * 0.25) {
                u.roamTarget = this.pickRandomRoamTarget(u.radius);
              }
            }
          } else {
            this.clampUnitToDomainBarrier(u);
          }
          u.animateRig?.(elapsed, movingNow, false, phase);
          this.updateNpcHeroAbilities(u, dt, elapsed);
        } else {
          u.animateRig?.(elapsed, false, false);
          this.updateNpcHeroAbilities(u, dt, elapsed);
        }
        continue;
      }

      let bestTargetUnit: MobaUnit | null = null;
      let bestDist = Infinity;

      for (const other of this.units) {
        if (!other.alive || other.team === u.team || other.isDummy) continue;
        const d = u.group.position.distanceTo(other.group.position);
        if (d < bestDist) {
          bestDist = d;
          bestTargetUnit = other;
        }
      }

      let targetIsPlayer = false;
      if (u.team === 'red' && this.playerRespawnTimer <= 0) {
        const distToPlayer = u.group.position.distanceTo(this.playerPos);
        if (distToPlayer < bestDist && distToPlayer <= Math.max(u.attackRange * 1.35, 28)) {
          bestDist = distToPlayer;
          targetIsPlayer = true;
          bestTargetUnit = null;
        }
      }

      const isMovingUnit = u.moveSpeed > 0 && bestDist > u.attackRange * 0.85;
      u.animateRig?.(elapsed, isMovingUnit, false);

      if (isMovingUnit) {
        const goalPos = targetIsPlayer
          ? this.playerPos
          : bestTargetUnit
            ? bestTargetUnit.group.position
            : new THREE.Vector3(0, 0, u.team === 'blue' ? -58 : 58);

        const dir = goalPos.clone().sub(u.group.position);
        dir.y = 0;
        if (dir.lengthSq() > 0.01) {
          dir.normalize();
          if (u.type === 'HERO') {
            dir.x += Math.sin(elapsed * 2.6) * 0.45;
            dir.normalize();
          }
          const inDomainSlow = this.getDomainSlowMultiplier(u);
          u.group.position.addScaledVector(dir, u.moveSpeed * inDomainSlow * dt);
          this.clampUnitToDomainBarrier(u);
          if (u.type === 'HERO') {
            this.rotateUnitToward(u, dir.x, dir.z, dt);
          }
        }
      } else {
        this.clampUnitToDomainBarrier(u);
      }

      u.attackTimer -= dt;
      if (u.attackTimer <= 0 && bestDist <= u.attackRange) {
        u.attackTimer = u.attackCooldown;
        const origin = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.75, 0));
        const beamCol = u.team === 'blue' ? '#38bdf8' : '#f43f5e';

        if (targetIsPlayer) {
          const dom = this.activeDomain;
          const attackerOutsideDomain =
            dom &&
            !dom.isRally &&
            !dom.trappedUnitIds.has(u.id) &&
            Math.hypot(u.group.position.x - dom.center.x, u.group.position.z - dom.center.z) > dom.radius;

          if (dom && attackerOutsideDomain) {
            // Outside attackers hit the exterior of the Domain barrier and reduce its health pool!
            const toAttacker = origin.clone().sub(dom.center).normalize();
            const shellHit = dom.center.clone().addScaledVector(toAttacker, dom.radius);
            this.spawnBeamTracer(origin, shellHit, beamCol, 0.18, 0.06);
            this.spawnImpactRing(shellHit, '#f43f5e', 1.8);
            dom.hp = Math.max(0, dom.hp - u.attackDamage);
            if (dom.hp <= 0) {
              this.spawnImpactRing(dom.center.clone().add(new THREE.Vector3(0, 1.5, 0)), dom.color, dom.radius);
              this.endActiveDomain();
            }
          } else {
            const playerChest = this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
            this.spawnBeamTracer(origin, playerChest, beamCol, 0.18, 0.06);
            this.applyDamageToPlayer(u.attackDamage, u.name, u.team);
          }
        } else if (bestTargetUnit) {
          const targetCenter = bestTargetUnit.group.position
            .clone()
            .add(new THREE.Vector3(0, bestTargetUnit.height * 0.65, 0));
          this.spawnBeamTracer(origin, targetCenter, beamCol, 0.16, 0.05);
          bestTargetUnit.hp = Math.max(0, bestTargetUnit.hp - u.attackDamage);

          if (bestTargetUnit.hp <= 0) {
            bestTargetUnit.alive = false;
            if (bestTargetUnit.type === 'HERO') {
              bestTargetUnit.respawnTimer = 8.0;
              bestTargetUnit.group.visible = false;
            } else {
              this.scene.remove(bestTargetUnit.group);
            }
            this.addKillFeed(u.name, u.team, bestTargetUnit.name, bestTargetUnit.team, 'Cursed Volley');
            if (bestTargetUnit.id === 'blue_core') {
              this.winner = 'red';
              document.exitPointerLock?.();
            } else if (bestTargetUnit.id === 'red_core') {
              this.winner = 'blue';
              document.exitPointerLock?.();
            }
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  NPC Gojo AI: same kit as the player (Red, Blue, Infinity, Teleport, Domain, Purple),
  //  with its own Cursed Energy pool, regen, burnout and cooldowns.
  // ─────────────────────────────────────────────────────────────
  private npcSpendCe(u: MobaUnit, amount: number) {
    const ai = u.npcAi;
    if (!ai || amount <= 0) return;
    ai.ce = Math.max(0, ai.ce - amount);
    if (ai.ce <= 0) {
      // Burnout: lose Infinity, no regen and no casting until it passes
      ai.burnout = CE_EXHAUSTION_LOCKOUT_SEC;
      ai.infinityHold = 0;
      u.npcShieldTimer = 0;
    }
  }

  private resetNpcAiOnDeath(u: MobaUnit) {
    if (u.npcCast) {
      this.scene.remove(u.npcCast.marker);
      u.npcCast = undefined;
      u.group.scale.set(1, 1, 1);
    }
    u.npcShieldTimer = 0;
    if (u.npcShieldMesh) u.npcShieldMesh.visible = false;
    if (u.npcAi) u.npcAi.infinityHold = 0;
    if (this.npcDomain?.casterId === u.id) this.endNpcDomain();
  }

  private updateNpcGojoAi(u: MobaUnit, dt: number, elapsed: number) {
    const hero = u.heroDef;
    const ai = u.npcAi;
    if (!hero || !ai || !u.alive) return;

    // ── Resources: cooldowns, burnout, regen, Infinity drain ──
    ai.cd.red = Math.max(0, ai.cd.red - dt);
    ai.cd.blue = Math.max(0, ai.cd.blue - dt);
    ai.cd.shift = Math.max(0, ai.cd.shift - dt);
    ai.cd.infinity = Math.max(0, ai.cd.infinity - dt);
    ai.cd.domain = Math.max(0, ai.cd.domain - dt);
    ai.busy = Math.max(0, ai.busy - dt);
    ai.think -= dt;

    if (ai.burnout > 0) {
      ai.burnout = Math.max(0, ai.burnout - dt);
      if (ai.burnout === 0) ai.ce = Math.min(ai.maxCe, 15);
    } else if (ai.infinityHold > 0) {
      ai.infinityHold -= dt;
      this.npcSpendCe(u, (hero.abilities.E.manaDrainPerSec ?? 30) * dt);
      u.npcShieldTimer = 0.3;
      if (ai.infinityHold <= 0) {
        ai.infinityHold = 0;
        u.npcShieldTimer = 0;
        ai.cd.infinity = hero.abilities.E.cooldownMs / 1000;
      }
    } else if (ai.busy <= 0) {
      ai.ce = Math.min(ai.maxCe, ai.ce + ai.regen * dt);
    }

    // Shared: Infinity wall visual + Limitless Teleport cast processing
    this.updateNpcHeroAbilities(u, dt, elapsed);
    if (u.npcShieldMat && ai.infinityHold > 0) {
      u.npcShieldMat.uniforms.uPoolRatio.value = ai.ce / ai.maxCe;
    }

    const playerAlive = this.playerRespawnTimer <= 0 && !this.winner;
    const toPlayer = new THREE.Vector3(this.playerPos.x - u.group.position.x, 0, this.playerPos.z - u.group.position.z);
    const d = playerAlive ? toPlayer.length() : Infinity;
    const casting = Boolean(u.npcCast);
    const busy = ai.busy > 0 || casting;

    // ── Movement: hold a mid-range, strafing around the player ──
    let spd = 0;
    let mx = 0;
    let mz = 0;
    let phase: HeroAnimHint = 'idle';
    if (!busy) {
      if (playerAlive && d < 60) {
        this.rotateUnitToward(u, toPlayer.x, toPlayer.z, dt);
        const dir = toPlayer.clone().normalize();
        if (d > 17) {
          mx = dir.x;
          mz = dir.z;
          spd = u.moveSpeed * 0.7;
          phase = 'run';
        } else if (d < 9) {
          mx = -dir.x;
          mz = -dir.z;
          spd = u.moveSpeed * 0.6;
          phase = 'run';
        } else {
          ai.strafeTimer -= dt;
          if (ai.strafeTimer <= 0) {
            ai.strafeDir = ai.strafeDir === 1 ? -1 : 1;
            ai.strafeTimer = 1.2 + Math.random() * 1.6;
          }
          mx = -dir.z * ai.strafeDir;
          mz = dir.x * ai.strafeDir;
          spd = 4.2;
          phase = 'walk';
        }
      } else {
        // No target: wander
        ai.wanderTimer -= dt;
        if (!u.roamTarget || ai.wanderTimer <= 0) {
          u.roamTarget = this.pickRandomRoamTarget(u.radius);
          ai.wanderTimer = 5 + Math.random() * 4;
        }
        const wx = u.roamTarget.x - u.group.position.x;
        const wz = u.roamTarget.z - u.group.position.z;
        const wd = Math.hypot(wx, wz);
        if (wd < 1.4) {
          ai.wanderTimer = 0;
        } else {
          mx = wx / wd;
          mz = wz / wd;
          spd = 4.2;
          phase = 'walk';
          this.rotateUnitToward(u, wx, wz, dt);
        }
      }
      if (ai.infinityHold > 0) spd *= 0.6;
    }

    let movedNow = false;
    if (spd > 0) {
      const step = spd * this.getDomainSlowMultiplier(u) * dt;
      const resolved = this.mapBuilder.resolveHorizontalCollision(
        u.group.position.x + mx * step,
        u.group.position.z + mz * step,
        u.radius,
        u.group.position.y
      );
      movedNow = Math.hypot(resolved.x - u.group.position.x, resolved.z - u.group.position.z) > 0.0005;
      u.group.position.x = resolved.x;
      u.group.position.z = resolved.z;
    }
    const ownDomain = this.npcDomain && this.npcDomain.casterId === u.id ? this.npcDomain : null;
    if (ownDomain) {
      const ox = u.group.position.x - ownDomain.center.x;
      const oz = u.group.position.z - ownDomain.center.z;
      const od = Math.hypot(ox, oz);
      const maxR = ownDomain.radius - 1.5;
      if (od > maxR && od > 0.0001) {
        u.group.position.x = ownDomain.center.x + (ox / od) * maxR;
        u.group.position.z = ownDomain.center.z + (oz / od) * maxR;
      }
    }
    this.clampUnitToDomainBarrier(u);
    u.group.position.y = this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y);
    u.animateRig?.(elapsed, movedNow && spd > 0, false, casting || busy ? 'idle' : phase);

    // ── Decisions ──
    if (busy || ai.burnout > 0 || ai.think > 0) return;
    ai.think = 0.25 + Math.random() * 0.25;

    // Inside his own Domain: let the player feel the void, then finish with Hollow Purple
    if (ownDomain) {
      if (!ownDomain.purpleFired && ownDomain.ageSec >= 2.4 && ai.ce >= 35 && playerAlive) {
        this.npcCastPurple(u, ownDomain);
      } else if (ai.cd.red <= 0 && ai.ce >= 20 && playerAlive) {
        this.npcCastRed(u);
      }
      return;
    }
    if (!playerAlive || d > 60) return;
    if (ai.infinityHold > 0) return;

    const q = hero.abilities.Q;
    if (ai.cd.domain <= 0 && ai.ce >= q.manaCost && d <= 24) {
      this.npcCastDomain(u);
      return;
    }
    if (ai.cd.infinity <= 0 && ai.ce >= 30 && d <= 26 && Math.random() < 0.3) {
      ai.infinityHold = 2.0 + Math.random() * 1.0;
      u.npcShieldTimer = 0.3;
      this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#e0f2fe', 3.2);
      return;
    }
    if (ai.cd.shift <= 0 && ai.ce >= hero.abilities.SHIFT.manaCost && (d > 22 || (d < 5.5 && Math.random() < 0.6))) {
      this.npcCastTeleport(u, d > 22 ? 'approach' : 'retreat');
      return;
    }
    if (ai.cd.blue <= 0 && ai.ce >= 45 && d >= 6 && d <= 24 && Math.random() < 0.55) {
      this.npcCastBlue(u);
      return;
    }
    if (ai.cd.red <= 0 && ai.ce >= 20 && d <= 45) {
      this.npcCastRed(u);
    }
  }

  private npcAimPoint(u: MobaUnit): THREE.Vector3 {
    return this.playerRespawnTimer <= 0
      ? this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0))
      : u.group.position
          .clone()
          .add(new THREE.Vector3(Math.sin(u.group.rotation.y) * 10, 1.35, Math.cos(u.group.rotation.y) * 10));
  }

  private npcCastRed(u: MobaUnit) {
    const ai = u.npcAi;
    if (!ai) return;
    const chargeSec = 0.3 + Math.random() * 0.65;
    const ratio = Math.min(1, (chargeSec * 1000) / 900);
    const wep = u.heroDef?.weapon;
    this.npcSpendCe(u, (wep?.manaCost ?? 14) + ((wep?.maxManaCost ?? 34) - (wep?.manaCost ?? 14)) * ratio);
    ai.cd.red = chargeSec + 1.1;
    ai.busy = chargeSec + 0.15;
    this.npcChargeOrb(u, 'RED', chargeSec, 900, (r) => {
      const o = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const dir = this.npcAimPoint(u).sub(o).normalize();
      this.launchNpcGojoRedOrb(u, o.clone().addScaledVector(dir, 0.9), dir, r);
    });
  }

  private npcCastBlue(u: MobaUnit) {
    const ai = u.npcAi;
    const hero = u.heroDef;
    if (!ai || !hero) return;
    const chargeSec = 0.5 + Math.random() * 1.0;
    // Same cost model as the player: base launch + continuous charge drain + detonate press
    this.npcSpendCe(u, 12 + BLUE_CHARGE_DRAIN_PER_SEC * chargeSec + 10);
    ai.cd.blue = hero.secondaryFire.cooldownMs! / 1000 + chargeSec;
    ai.busy = chargeSec + 0.2;
    this.npcChargeOrb(u, 'BLUE', chargeSec, BLUE_MAX_CHARGE_MS, (ratio) => {
      const radius = BLUE_MIN_RADIUS + (BLUE_MAX_RADIUS - BLUE_MIN_RADIUS) * ratio;
      const o = u.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      const tgt = this.npcAimPoint(u);
      const dir = tgt.clone().sub(o).normalize();
      this.launchTwoStageBlueOrb({
        forward: dir,
        startPos: o.clone().addScaledVector(dir, 1.0),
        caster: u,
        radius,
        damage: Math.round(30 * (1 + ratio * 0.9)),
        durationMs: 3200,
        name: 'Lapse Blue',
        color: hero.secondaryFire.color,
        autoTriggerSec: Math.min(2.4, Math.max(0.6, (tgt.distanceTo(o) - 1.0) / 14.5)),
        onCooldownStart: () => {}
      });
    });
  }

  private npcCastTeleport(u: MobaUnit, mode: 'approach' | 'retreat') {
    const ai = u.npcAi;
    const hero = u.heroDef;
    if (!ai || !hero) return;
    const ab = hero.abilities.SHIFT;
    this.npcSpendCe(u, ab.manaCost);
    ai.cd.shift = ab.cooldownMs / 1000;
    const away = new THREE.Vector3(
      u.group.position.x - this.playerPos.x,
      0,
      u.group.position.z - this.playerPos.z
    );
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    const side = Math.random() < 0.5 ? -1 : 1;
    const perp = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(side * 3.5);
    const keep = mode === 'approach' ? 11 : 17;
    let tx = this.playerPos.x + away.x * keep + perp.x;
    let tz = this.playerPos.z + away.z * keep + perp.z;
    const dx = tx - u.group.position.x;
    const dz = tz - u.group.position.z;
    const dd = Math.hypot(dx, dz);
    if (dd > 30) {
      tx = u.group.position.x + (dx / dd) * 30;
      tz = u.group.position.z + (dz / dd) * 30;
    }
    const resolved = this.mapBuilder.resolveHorizontalCollision(tx, tz, u.radius, u.group.position.y);
    const target = new THREE.Vector3(
      resolved.x,
      this.mapBuilder.getFloorHeight(resolved.x, resolved.z, u.group.position.y),
      resolved.z
    );
    const castSec = ab.durationMs / 1000;
    const marker = this.createRadiusIndicator(ab.color);
    this.placeIndicator(marker, target.x, target.z, 1.6);
    u.npcCast = { t: 0, dur: castSec, target, marker };
    this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)), ab.color, 2.6);
    this.spawnTransmissionStreaks(u.group.position, 'converge', castSec);
    this.spawnTransmissionStreaks(target, 'converge', castSec);
  }

  private npcCastDomain(u: MobaUnit) {
    const ai = u.npcAi;
    const hero = u.heroDef;
    if (!ai || !hero) return;
    const q = hero.abilities.Q;
    this.npcSpendCe(u, q.manaCost);
    ai.cd.domain = (q.cooldownMs + q.durationMs) / 1000;
    ai.busy = 1.2;
    this.activateNpcDomain(u);
  }

  private npcCastPurple(u: MobaUnit, dom: NpcDomainState) {
    const ai = u.npcAi;
    if (!ai) return;
    this.npcSpendCe(u, 35);
    dom.purpleFired = true;
    ai.busy = 1.0;
    const origin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = this.npcAimPoint(u).sub(origin).normalize();
    this.launchNpcGojoHollowPurple(u, origin, dir, true);
  }

  private activateNpcDomain(u: MobaUnit) {
    const q = u.heroDef!.abilities.Q;
    if (this.npcDomain) this.endNpcDomain();
    const center = u.group.position.clone();
    const ringGeo = new THREE.RingGeometry(q.radius * 0.94, q.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: '#a855f7', transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ringMesh.position.set(center.x, 0.08, center.z);
    this.scene.add(ringMesh);
    const voidVfx = createUnlimitedVoidDomainVfx(center, q.radius);
    this.scene.add(voidVfx.root);
    const trapped =
      this.playerRespawnTimer <= 0 &&
      Math.hypot(this.playerPos.x - center.x, this.playerPos.z - center.z) <= q.radius;
    this.npcDomain = {
      casterId: u.id,
      center,
      radius: q.radius,
      ageSec: 0,
      remainingSec: q.durationMs / 1000,
      tickSec: 0.95,
      playerTrapped: trapped,
      purpleFired: false,
      ringMesh,
      voidVfx,
      color: q.color
    };
    this.spawnImpactRing(center.clone().add(new THREE.Vector3(0, 0.2, 0)), '#a855f7', q.radius);
  }

  private endNpcDomain() {
    const dom = this.npcDomain;
    if (!dom) return;
    this.scene.remove(dom.ringMesh);
    this.scene.remove(dom.voidVfx.root);
    this.npcDomain = null;
  }

  private updateNpcDomain(dt: number) {
    const dom = this.npcDomain;
    if (!dom) return;
    dom.ageSec += dt;
    dom.remainingSec -= dt;
    dom.tickSec -= dt;
    dom.voidVfx.update(dt, this.clock.getElapsedTime(), dom.ageSec, this.camera.position);
    dom.ringMesh.rotation.y -= dt * 0.6;

    const caster = this.units.find((x) => x.id === dom.casterId);
    if (!caster || !caster.alive || dom.remainingSec <= 0) {
      this.endNpcDomain();
      return;
    }
    if (this.playerRespawnTimer > 0) dom.playerTrapped = false;

    // Trapped player is pinned inside (and slowed 90% in updatePlayer); others cannot walk in
    if (dom.playerTrapped && dom.tickSec <= 0) {
      dom.tickSec = 0.95;
      this.spawnPillarEffect(this.playerPos, 0.9, 10, '#a855f7', 0.45);
      this.applyDamageToPlayer(10, `${caster.name} (Unlimited Void)`, caster.team);
    }
  }

  /** Keeps the player inside (if trapped) or outside (if not) an active NPC Domain shell. */
  private clampPlayerToNpcDomain(x: number, z: number): { x: number; z: number } {
    const dom = this.npcDomain;
    if (!dom) return { x, z };
    const dx = x - dom.center.x;
    const dz = z - dom.center.z;
    const dist = Math.hypot(dx, dz);
    if (dom.playerTrapped) {
      const maxR = Math.max(1.0, dom.radius - 0.75);
      if (dist > maxR && dist > 0.0001) {
        return { x: dom.center.x + (dx / dist) * maxR, z: dom.center.z + (dz / dist) * maxR };
      }
    } else {
      const minR = dom.radius + 0.75;
      if (dist < minR) {
        if (dist > 0.0001) {
          return { x: dom.center.x + (dx / dist) * minR, z: dom.center.z + (dz / dist) * minR };
        }
        return { x, z: dom.center.z + minR };
      }
    }
    return { x, z };
  }

  private pickRandomRoamTarget(radius: number): THREE.Vector3 {
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = (Math.random() * 2 - 1) * 34;
      const z = -54 + Math.random() * 116;
      const resolved = this.mapBuilder.resolveHorizontalCollision(x, z, radius, 0);
      if (Math.hypot(resolved.x - x, resolved.z - z) < 0.5) {
        return new THREE.Vector3(resolved.x, 0, resolved.z);
      }
    }
    return new THREE.Vector3((Math.random() * 2 - 1) * 8, 0, (Math.random() * 2 - 1) * 20);
  }

  private rotateUnitToward(unit: MobaUnit, dx: number, dz: number, dt: number) {
    if (dx * dx + dz * dz < 0.0001) return;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - unit.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    unit.group.rotation.y += diff * Math.min(1, dt * 10);
  }

  /**
   * Drives autonomous ability casting & weapon firing for NPC Hero units in the arena (Gojo & Mr. Biomaster).
   */
  private updateNpcHeroAbilities(u: MobaUnit, dt: number, elapsed: number) {
    const hero = u.heroDef;
    if (!hero || !u.alive) return;

    // Update active NPC Infinity / Barrier shield distortion visual
    if (u.npcShieldTimer && u.npcShieldTimer > 0) {
      u.npcShieldTimer = Math.max(0, u.npcShieldTimer - dt);
      if (u.npcShieldMesh && u.npcShieldMat) {
        u.npcShieldMesh.visible = u.npcShieldTimer > 0;
        u.npcShieldMat.uniforms.uTime.value = elapsed;
        u.npcShieldMat.uniforms.uDeployRatio.value = Math.min(1, u.npcShieldTimer * 3.5);
        u.npcShieldMat.uniforms.uPoolRatio.value = Math.min(1, u.npcShieldTimer / 2.2);
      }
    } else if (u.npcShieldMesh) {
      u.npcShieldMesh.visible = false;
    }

    // Limitless Teleport cast (800ms): stands still, streaks gather, then blinks to the marked point
    if (u.npcCast) {
      const cast = u.npcCast;
      cast.t += dt;
      const k = Math.min(1, cast.t / cast.dur);
      const morph = Math.min(1, Math.max(0, (k - 0.7) / 0.3));
      u.group.scale.set(1 - morph * 0.75, 1 + morph * 2.2, 1 - morph * 0.75);
      u.roamPhase = 'idle';
      u.roamTimer = Math.max(u.roamTimer ?? 0, 0.2);
      this.placeIndicator(cast.marker, cast.target.x, cast.target.z, 1.6 * (1 - 0.55 * k * k));
      cast.marker.rotation.y += dt * (3 + k * 14);
      if (cast.t >= cast.dur) {
        const color = hero.abilities.SHIFT.color;
        const startPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnTransmissionStreaks(u.group.position, 'burst', 0.55);
        u.group.position.copy(cast.target);
        this.clampUnitToDomainBarrier(u);
        this.spawnTransmissionStreaks(u.group.position, 'burst', 0.7);
        const endPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnBeamTracer(startPos, endPos, color, 0.5, 0.22);
        this.spawnImpactRing(startPos, color, 2.4);
        this.spawnImpactRing(endPos, color, hero.abilities.SHIFT.radius);
        this.damageTargetsAroundNpc(u, u.group.position, hero.abilities.SHIFT.radius, 22, 'Limitless Teleport');
        this.scene.remove(cast.marker);
        u.group.scale.set(1, 1, 1);
        u.npcCast = undefined;
      }
      return;
    }

    u.npcAbilityTimer = (u.npcAbilityTimer ?? 3.0) - dt;
    // Gojo is driven by updateNpcGojoAi (full kit); the timed rotation below is for other NPC heroes
    if (hero.id === 'gojo') return;
    if (u.npcAbilityTimer > 0) return;

    // Determine target point (aim toward player if within 36m and alive, otherwise toward another NPC or forward)
    const origin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const distToPlayer =
      this.playerRespawnTimer <= 0 ? u.group.position.distanceTo(this.playerPos) : Infinity;

    let targetPos: THREE.Vector3;
    if (distToPlayer <= 36) {
      targetPos = this.playerPos.clone().add(new THREE.Vector3(0, 1.25, 0));
    } else {
      const otherNpc = this.units.find((other) => other.alive && other !== u);
      if (otherNpc && u.group.position.distanceTo(otherNpc.group.position) <= 36) {
        targetPos = otherNpc.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      } else {
        const yaw = u.group.rotation.y;
        targetPos = origin.clone().add(new THREE.Vector3(Math.sin(yaw) * 14, 0, Math.cos(yaw) * 14));
      }
    }

    const toTarget = targetPos.clone().sub(origin);
    const flatDir = new THREE.Vector3(toTarget.x, 0, toTarget.z);
    if (flatDir.lengthSq() > 0.001) {
      flatDir.normalize();
      u.group.rotation.y = Math.atan2(flatDir.x, flatDir.z);
    } else {
      flatDir.set(Math.sin(u.group.rotation.y), 0, Math.cos(u.group.rotation.y));
    }
    const aimDir = toTarget.lengthSq() > 0.001 ? toTarget.clone().normalize() : flatDir.clone();

    const stepIndex = u.npcAbilityIndex ?? 0;
    u.npcAbilityIndex = (stepIndex + 1) % 5;

    if (hero.id === 'gojo') {
      if (stepIndex === 0) {
        // 1. Reversal Red (M1): charges at his hand (growing orb), then fires scaled by the charge
        const chargeSec = 0.35 + Math.random() * 0.75;
        u.npcAbilityTimer = 2.8 + chargeSec;
        this.npcChargeOrb(u, 'RED', chargeSec, 900, (ratio) => {
          const o = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
          const tgt =
            this.playerRespawnTimer <= 0
              ? this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0))
              : o.clone().addScaledVector(flatDir, 10);
          const d = tgt.sub(o).normalize();
          this.launchNpcGojoRedOrb(u, o.clone().addScaledVector(d, 0.9), d, ratio);
        });
      } else if (stepIndex === 1) {
        // 2. Lapse Blue (M2): same shared implementation the player uses — charged radius,
        // ground indicator once launched, gradual swirling pull, then an explosion
        const chargeSec = 0.5 + Math.random() * 1.0;
        u.npcAbilityTimer = 4.2 + chargeSec;
        this.npcChargeOrb(u, 'BLUE', chargeSec, BLUE_MAX_CHARGE_MS, (ratio) => {
          const radius = BLUE_MIN_RADIUS + (BLUE_MAX_RADIUS - BLUE_MIN_RADIUS) * ratio;
          const o = u.group.position.clone().add(new THREE.Vector3(0, 1.5, 0));
          const tgt =
            this.playerRespawnTimer <= 0
              ? this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0))
              : o.clone().addScaledVector(flatDir, 10);
          const d = tgt.clone().sub(o).normalize();
          const distToTarget = tgt.distanceTo(o);
          this.launchTwoStageBlueOrb({
            forward: d,
            startPos: o.clone().addScaledVector(d, 1.0),
            caster: u,
            radius,
            damage: Math.round(30 * (1 + ratio * 0.9)),
            durationMs: 3200,
            name: 'Lapse Blue',
            color: hero.secondaryFire.color,
            // Detonate roughly when the orb reaches the target
            autoTriggerSec: Math.min(2.4, Math.max(0.6, (distToTarget - 1.0) / 14.5)),
            onCooldownStart: () => {}
          });
        });
      } else if (stepIndex === 2) {
        // 3. Infinity Shield (E Spatial Distortion Barrier) — 4m x 3m wall that also covers allies
        u.npcAbilityTimer = 3.4;
        u.npcShieldTimer = 2.8;
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '#e0f2fe', 3.2);
      } else if (stepIndex === 3) {
        // 4. Limitless Teleport (SHIFT): 800ms cast with transmission streaks at departure & arrival
        u.npcAbilityTimer = 2.6 + 0.8;
        const castSec = hero.abilities.SHIFT.durationMs / 1000;
        let dx = flatDir.x * 11;
        let dz = flatDir.z * 11;
        if (distToPlayer <= 36) {
          // Land ~5m beside the player
          const side = Math.random() < 0.5 ? -1 : 1;
          const away = new THREE.Vector3(
            u.group.position.x - this.playerPos.x,
            0,
            u.group.position.z - this.playerPos.z
          ).normalize();
          const perp = new THREE.Vector3(-away.z, 0, away.x).multiplyScalar(side * 4.5);
          dx = this.playerPos.x + away.x * 3 + perp.x - u.group.position.x;
          dz = this.playerPos.z + away.z * 3 + perp.z - u.group.position.z;
        }
        const resolved = this.mapBuilder.resolveHorizontalCollision(
          u.group.position.x + dx,
          u.group.position.z + dz,
          u.radius,
          u.group.position.y
        );
        const target = new THREE.Vector3(
          resolved.x,
          this.mapBuilder.getFloorHeight(resolved.x, resolved.z, u.group.position.y),
          resolved.z
        );
        const marker = this.createRadiusIndicator(hero.abilities.SHIFT.color);
        this.placeIndicator(marker, target.x, target.z, 1.6);
        u.npcCast = { t: 0, dur: castSec, target, marker };
        u.roamPhase = 'idle';
        u.roamTimer = Math.max(u.roamTimer ?? 0, castSec + 0.3);
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)), hero.abilities.SHIFT.color, 2.6);
        this.spawnTransmissionStreaks(u.group.position, 'converge', castSec);
        this.spawnTransmissionStreaks(target, 'converge', castSec);
      } else {
        // 5. Hollow Technique: Purple (Q Fusion of Red & Blue -> Massive Singularity Projectile)
        u.npcAbilityTimer = 5.2;
        this.launchNpcGojoHollowPurple(u, origin.clone(), aimDir);
      }
      return;
    }

    // Mr. Biomaster (or any other NPC Hero) ability rotation
    if (stepIndex === 0) {
      // 1. Primary Fire: Bio-Rupture Gauntlet (M1)
      u.npcAbilityTimer = 2.4;
      const endPt = origin.clone().addScaledVector(aimDir, Math.min(hero.weapon.range, 20));
      this.spawnBeamTracer(origin, endPt, hero.weapon.projectileColor, 0.22, 0.08);
      this.spawnImpactRing(endPt, hero.weapon.projectileColor, 1.8);
      if (distToPlayer <= 20) {
        this.applyDamageToPlayer(18, u.name, u.team);
      }
    } else if (stepIndex === 1) {
      // 2. SHIFT: Bio-Thruster Surge (Dash + Impact Shockwave)
      u.npcAbilityTimer = 3.0;
      const startPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      const dashDist = 11.5;
      for (let s = 1; s <= 8; s++) {
        const nx = u.group.position.x + flatDir.x * (dashDist / 8);
        const nz = u.group.position.z + flatDir.z * (dashDist / 8);
        const resolved = this.mapBuilder.resolveHorizontalCollision(nx, nz, u.radius, u.group.position.y);
        u.group.position.x = resolved.x;
        u.group.position.z = resolved.z;
        this.clampUnitToDomainBarrier(u);
      }
      u.group.position.y = this.mapBuilder.getFloorHeight(
        u.group.position.x,
        u.group.position.z,
        u.group.position.y
      );
      const endPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      this.spawnBeamTracer(startPos, endPos, hero.abilities.SHIFT.color, 0.45, 0.24);
      this.spawnImpactRing(endPos, hero.abilities.SHIFT.color, hero.abilities.SHIFT.radius);
      this.damageTargetsAroundNpc(u, u.group.position, hero.abilities.SHIFT.radius, 24, hero.abilities.SHIFT.name);
    } else if (stepIndex === 2) {
      // 3. E: Cellular Siphon Ray (Siphon Beam + Self-Heal)
      u.npcAbilityTimer = 3.2;
      const beamEnd =
        distToPlayer <= hero.abilities.E.radius
          ? this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0))
          : origin.clone().addScaledVector(aimDir, 14);
      this.spawnBeamTracer(origin, beamEnd, hero.abilities.E.color, 0.65, 0.16);
      this.spawnImpactRing(beamEnd, hero.abilities.E.color, 2.2);
      u.hp = Math.min(u.maxHp, u.hp + 45);
      if (distToPlayer <= hero.abilities.E.radius) {
        this.applyDamageToPlayer(25, u.name, u.team);
      }
    } else if (stepIndex === 3) {
      // 4. Secondary Fire: Helix Spore Volley (M2)
      u.npcAbilityTimer = 3.0;
      const sporeTarget =
        distToPlayer <= 28
          ? this.playerPos.clone().add(new THREE.Vector3(0, 0.3, 0))
          : u.group.position.clone().addScaledVector(flatDir, 10);
      this.spawnBeamTracer(origin, sporeTarget, hero.secondaryFire.color, 0.35, 0.14);
      this.spawnImpactRing(sporeTarget, hero.secondaryFire.color, 4.5);
      this.spawnPillarEffect(sporeTarget, 1.1, 4.2, hero.secondaryFire.color, 0.45);
      this.damageTargetsAroundNpc(u, sporeTarget, 4.5, 28, hero.secondaryFire.name);
    } else {
      // 5. Q Ultimate: Domain: Pandemic Garden
      u.npcAbilityTimer = 5.0;
      const center = u.group.position.clone();
      this.spawnImpactRing(center.clone().add(new THREE.Vector3(0, 0.15, 0)), hero.abilities.Q.color, 9.5);
      this.spawnPillarEffect(center, 3.2, 9.0, hero.abilities.Q.color, 1.35);
      this.damageTargetsAroundNpc(u, center, 8.5, 32, hero.abilities.Q.name);
    }
  }

  private damageTargetsAroundNpc(
    caster: MobaUnit,
    center: THREE.Vector3,
    radius: number,
    playerDmg: number,
    abilityName: string
  ) {
    if (this.playerRespawnTimer <= 0 && this.playerPos.distanceTo(center) <= radius + 0.75) {
      this.applyDamageToPlayer(playerDmg, `${caster.name} (${abilityName})`, caster.team);
    }
    for (const other of this.units) {
      if (!other.alive || other === caster) continue;
      if (other.group.position.distanceTo(center) <= radius + other.radius) {
        other.hp = Math.max(1, other.hp - playerDmg);
      }
    }
  }

  private launchNpcGojoRedOrb(caster: MobaUnit, startPos: THREE.Vector3, dir: THREE.Vector3, ratio = 0.3) {
    const orbRadius = 0.28 + ratio * 0.42;
    const speed = 26 + ratio * 12;
    const splash = 2.0 + ratio * 2.4;
    const damage = Math.round(22 + ratio * 24);
    const vel = dir.clone().multiplyScalar(speed);
    const redOrb = createCursedEnergyOrb({ variant: 'RED', radius: orbRadius });
    redOrb.group.position.copy(startPos);
    this.scene.add(redOrb.group);

    let exploded = false;
    const detonate = (impactPos: THREE.Vector3) => {
      if (exploded) return;
      exploded = true;
      this.spawnImpactRing(impactPos, '#ff2a55', splash);
      this.spawnPillarEffect(impactPos, 0.55 + ratio * 0.5, 3.8 + ratio * 2, '#f43f5e', 0.38);
      this.damageTargetsAroundNpc(caster, impactPos, splash, damage, 'Reversal Red');
    };

    this.vfxList.push({
      mesh: redOrb.group,
      age: 0,
      maxAge: 2.1,
      onUpdate: (dt, progress) => {
        if (exploded) {
          redOrb.group.scale.multiplyScalar(0.65);
          return;
        }
        redOrb.update(dt, this.clock.getElapsedTime());
        redOrb.group.position.addScaledVector(vel, dt);

        if (
          this.playerRespawnTimer <= 0 &&
          redOrb.group.position.distanceTo(this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0))) <= 1.35
        ) {
          detonate(redOrb.group.position.clone());
          return;
        }
        if (redOrb.group.position.y <= 0.25 || progress >= 0.95) {
          detonate(redOrb.group.position.clone());
        }
      }
    });
  }

  /**
   * NPC charge phase: a hand-held orb (same shader as the player's) condenses and grows, then `onRelease(ratio)` fires.
   */
  private npcChargeOrb(
    caster: MobaUnit,
    variant: 'RED' | 'BLUE',
    chargeSec: number,
    fullChargeMs: number,
    onRelease: (ratio: number) => void
  ) {
    const ratio = Math.min(1, (chargeSec * 1000) / fullChargeMs);
    const orb = createCursedEnergyOrb({ variant, radius: 0.18, withLight: false });
    this.scene.add(orb.group);
    caster.roamPhase = 'idle';
    caster.roamTimer = Math.max(caster.roamTimer ?? 0, chargeSec + 0.4);
    let released = false;
    this.vfxList.push({
      mesh: orb.group,
      age: 0,
      maxAge: chargeSec,
      onUpdate: (dt, p) => {
        if (!caster.alive) {
          orb.group.visible = false;
          return;
        }
        const yaw = caster.group.rotation.y;
        orb.group.position
          .copy(caster.group.position)
          .add(new THREE.Vector3(Math.sin(yaw) * 0.7, 1.45, Math.cos(yaw) * 0.7));
        orb.setScale(0.5 + p * ratio * 2.4 + p * 0.6);
        orb.update(dt, this.clock.getElapsedTime());
        if (p >= 0.98 && !released) {
          released = true;
          onRelease(ratio);
        }
      }
    });
  }

  private launchNpcGojoHollowPurple(
    caster: MobaUnit,
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    domainFinisher = false
  ) {
    const fusionGroup = new THREE.Group();
    const redOrb = createCursedEnergyOrb({ variant: 'RED', radius: 0.42, withLight: false });
    const blueOrb = createCursedEnergyOrb({ variant: 'BLUE', radius: 0.42, withLight: false });
    const purpleOrb = createCursedEnergyOrb({ variant: 'PURPLE', radius: 1.35 });
    purpleOrb.group.visible = false;
    fusionGroup.add(redOrb.group, blueOrb.group, purpleOrb.group);
    fusionGroup.position.copy(origin).addScaledVector(dir, 1.4);
    this.scene.add(fusionGroup);

    const fusionDuration = 0.75;
    const totalDuration = 2.6;
    let launched = false;
    let hitPlayer = false;
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    this.vfxList.push({
      mesh: fusionGroup,
      age: 0,
      maxAge: totalDuration,
      onUpdate: (dt, progress) => {
        const now = this.clock.getElapsedTime();
        const ageSec = progress * totalDuration;
        if (ageSec < fusionDuration) {
          const t = ageSec / fusionDuration;
          const anchor = caster.group.position
            .clone()
            .add(new THREE.Vector3(0, 1.45, 0))
            .addScaledVector(dir, 1.5);
          fusionGroup.position.copy(anchor);
          const sep = (1 - t * t) * 1.3;
          const angle = t * Math.PI * 2.5;
          const ox = Math.cos(angle) * sep;
          const oy = Math.sin(angle) * sep * 0.45;
          redOrb.group.position.set(0, oy, 0).addScaledVector(right, -ox);
          blueOrb.group.position.set(0, -oy, 0).addScaledVector(right, ox);
          redOrb.update(dt, now);
          blueOrb.update(dt, now);
          if (t > 0.6) {
            purpleOrb.group.visible = true;
            purpleOrb.setScale(Math.max(0.08, ((t - 0.6) / 0.4) * 0.8));
            purpleOrb.update(dt, now);
          }
        } else {
          if (!launched) {
            launched = true;
            redOrb.group.visible = false;
            blueOrb.group.visible = false;
            purpleOrb.group.visible = true;
            purpleOrb.setScale(1.0);
            this.spawnImpactRing(fusionGroup.position.clone(), '#a855f7', 5.0);
            if (domainFinisher) {
              // Re-aim at the (heavily slowed) trapped player and end Unlimited Void on launch
              if (this.playerRespawnTimer <= 0) {
                dir
                  .copy(this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0)))
                  .sub(fusionGroup.position)
                  .normalize();
              }
              if (this.npcDomain?.casterId === caster.id) this.endNpcDomain();
            }
          }
          purpleOrb.update(dt, now);
          fusionGroup.position.addScaledVector(dir, 22.0 * dt);
          if (fusionGroup.position.y < 1.35) fusionGroup.position.y = 1.35;

          if (
            !hitPlayer &&
            this.playerRespawnTimer <= 0 &&
            fusionGroup.position.distanceTo(this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0))) <= 3.2
          ) {
            hitPlayer = true;
            this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0)), '#a855f7', 4.8);
            this.applyDamageToPlayer(domainFinisher ? 9999 : 65, `${caster.name} (Hollow Purple)`, caster.team);
          }
        }
      }
    });
  }

  private applyDamageToPlayer(dmg: number, attackerName: string, attackerTeam: MobaTeam) {
    if (this.playerRespawnTimer > 0 || this.winner) return;

    let remaining = dmg;

    // 1. Active Barrier Shield (Reinhardt / Brigitte M2) absorbs incoming damage first!
    if (this.isBarrierActive() && this.barrierHp > 0) {
      const absorbedByBarrier = Math.min(this.barrierHp, remaining);
      this.barrierHp -= absorbedByBarrier;
      remaining -= absorbedByBarrier;
      if (remaining <= 0) return;
    }

    // 2. Overhealth / Armor Shield absorbs next
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }

    this.hp = Math.max(0, this.hp - remaining);

    if (this.hp <= 0) {
      this.deaths++;
      this.playerRespawnTimer = 6.0;
      this.addKillFeed(attackerName, attackerTeam, this.hero.name, 'blue', 'Fatal Strike');
    }
  }

  private updateVfx(dt: number) {
    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.age += dt;
      const p = Math.min(1, v.age / v.maxAge);
      v.onUpdate(dt, p);
      if (v.age >= v.maxAge) {
        this.scene.remove(v.mesh);
        this.vfxList.splice(i, 1);
      }
    }

    const maxPopupAgeSec = 0.9;
    const fadeStartSec = 0.35;
    for (let i = this.damagePopups.length - 1; i >= 0; i--) {
      const pop = this.damagePopups[i];
      const nextAge = (pop.ageSec ?? 0) + dt;
      pop.ageSec = nextAge;
      pop.y -= dt * 6.5;
      pop.opacity = Math.max(
        0,
        1 - Math.max(0, nextAge - fadeStartSec) / (maxPopupAgeSec - fadeStartSec)
      );
      if (nextAge >= maxPopupAgeSec) {
        this.damagePopups.splice(i, 1);
      }
    }
  }

  private emitHud() {
    const blueCore = this.units.find((u) => u.id === 'blue_core');
    const redCore = this.units.find((u) => u.id === 'red_core');

    const minimapBlips: MinimapBlip[] = this.units
      .filter((u) => u.alive)
      .map((u) => ({
        id: u.id,
        x: u.group.position.x,
        z: u.group.position.z,
        team: u.team,
        type: u.type,
        hpRatio: u.hp / u.maxHp
      }));

    const maxCharge = this.hero.secondaryFire.maxChargeMs ?? 1000;
    const maxPrimaryCharge = this.hero.weapon.maxChargeMs ?? 900;

    this.onHudUpdate({
      hero: this.hero,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      shield: Math.round(this.shield),
      mana: Math.round(this.mana),
      maxMana: this.maxMana,
      ceRegenPerSec: Number(this.getCeRegenPerSec().toFixed(1)),
      manaExhaustedTimerSec: Number(this.manaExhaustedTimerSec.toFixed(1)),
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      isReloading: this.isReloading,
      isUsingSecondary: this.isBarrierActive() || this.isChargingPunch,
      barrierHp: Math.round(this.barrierHp),
      barrierMaxHp: this.barrierMaxHp,
      primaryChargeRatio: this.isChargingPrimary ? Math.min(1, this.primaryChargeMs / maxPrimaryCharge) : 0,
      punchChargeRatio: this.isChargingPunch ? Math.min(1, this.punchChargeMs / maxCharge) : 0,
      blueChargeRatio: this.isChargingBlue ? Math.min(1, this.blueChargeMs / BLUE_MAX_CHARGE_MS) : 0,
      teleportPhase: this.teleportPhase,
      teleportCastRatio:
        this.teleportPhase === 'CASTING'
          ? Math.min(1, this.teleportCastMs / this.hero.abilities.SHIFT.durationMs)
          : 0,
      hasActiveBlueOrb: Boolean(this.activeBlueOrb),
      secondaryCooldownMs: Math.round(this.secondaryCooldownMs),
      isPowerEmpowered: this.isPowerEmpowered,
      inspireTimerSec: Number(this.inspireTimerSec.toFixed(1)),
      level: this.level,
      xp: this.xp,
      nextLevelXp: this.nextLevelXp,
      gold: this.gold,
      kills: this.kills,
      deaths: this.deaths,
      assists: this.assists,
      minionKills: this.minionKills,
      matchTimeSec: Math.floor(this.matchTimeSec),
      pointerLocked: this.pointerLocked,
      hitMarkerAlpha: this.hitMarkerAlpha,
      hitMarkerCrit: this.hitMarkerCrit,
      activeDomainName:
        this.activeDomain?.name ??
        (this.npcDomain
          ? this.npcDomain.playerTrapped
            ? `ENEMY DOMAIN: UNLIMITED VOID · TRAPPED (${Math.ceil(this.npcDomain.remainingSec)}s)`
            : 'ENEMY DOMAIN: UNLIMITED VOID'
          : null) ??
        (this.executionerTimerSec > 0
          ? `DEADLY SENTENCING · EXECUTIONER'S SWORD (${this.executionerTimerSec.toFixed(1)}s)`
          : null),
      domainBarrierHp:
        this.activeDomain && !this.activeDomain.isRally
          ? Math.round(this.activeDomain.hp)
          : undefined,
      domainBarrierMaxHp:
        this.activeDomain && !this.activeDomain.isRally
          ? this.activeDomain.maxHp
          : undefined,
      canCastHollowPurple: Boolean(
        this.activeDomain?.isGojoDomain && !this.activeDomain.purpleTriggered
      ),
      blueCoreHp: blueCore ? Math.round(blueCore.hp) : 0,
      blueCoreMaxHp: blueCore?.maxHp ?? 1600,
      redCoreHp: redCore ? Math.round(redCore.hp) : 0,
      redCoreMaxHp: redCore?.maxHp ?? 1600,
      winner: this.winner,
      cooldowns: {
        SHIFT: { ...this.cooldowns.SHIFT },
        E: { ...this.cooldowns.E },
        Q: { ...this.cooldowns.Q }
      },
      killFeed: [...this.killFeed],
      damagePopups: this.damagePopups.map((p) => ({ ...p })),
      minimapBlips,
      playerPos: {
        x: this.playerPos.x,
        z: this.playerPos.z,
        yaw: this.yaw
      }
    });
  }

  public destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    document.exitPointerLock?.();
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
    window.removeEventListener('contextmenu', this.onContextMenuBound);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
