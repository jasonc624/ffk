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
  type MobaMapId,
  type MobaTeam,
  type MobaUnitType
} from './types';
import { MobaMapBuilder } from './world/MobaMapBuilder';
import { PhysicsWorld } from './world/PhysicsWorld';
import { FpsViewModel } from './entities/FpsViewModel';
import { buildProceduralHeroModel, type HeroAnimHint } from './entities/ProceduralHeroBuilder';
import {
  createCursedEnergyOrb,
  createCursedExplosionParticles,
  createDrawnRealityWipe,
  createInfinityDistortionMaterial,
  createNueLightningBolt,
  createRealityWarpBeamEffect,
  createShikigamiShadowCloud,
  createSkyVeilDistortionMaterial,
  createThinIceShatterEffect,
  createUnlimitedVoidDomainVfx,
  type DrawnRealityWipeController,
  type UnlimitedVoidDomainController
} from './vfx/CursedShaderVfx';
import {
  getAiAttackingEnabled,
  getGodModeEnabled,
  getHandDistanceOffset,
  getMouseSensitivity
} from './storage';
import { FPS_MOBA_HEROES } from './data/heroes';
import {
  MobaEntity,
  MobaUnitEntity,
  HeroUnit,
  MinionUnit,
  StructureUnit,
  MiniVolcanoUnit,
  DomainBarrierEntity,
  type NpcAiState
} from './entities/Entity';
import {
  ShikigamiEntity,
  DivineDogShikigami,
  RabbitEscapeShikigami,
  ToadShikigami,
  NueShikigami,
  NueCarryShikigami,
  MahoragaShikigami,
  type ShikigamiContext
} from './entities/Shikigami';
import {
  Projectile,
  ReversalRedProjectile,
  LapseBlueProjectile,
  HollowPurpleProjectile,
  EmberInsectProjectile,
  VolcanoSeedProjectile,
  FireBoltProjectile,
  MaximumMeteorProjectile,
  ShadowKunaiProjectile,
  type ProjectileContext
} from './entities/Projectile';
import {
  DomainExpansion,
  UnlimitedVoidDomain,
  RallyBannerDomain,
  type BarrierRaycastHit,
  type BarrierDamageResult
} from './entities/DomainExpansion';

const BLUE_MIN_RADIUS = 3;
const BLUE_MAX_RADIUS = 9;
const BLUE_MAX_CHARGE_MS = 1600;
const BLUE_CHARGE_DRAIN_PER_SEC = 26;
const TELEPORT_MAX_RANGE = 30;
const TELEPORT_CAM_DIST = 4.6;

export interface MobaUnit {
  id: string;
  name: string;
  team: MobaTeam;
  type: MobaUnitType;
  isDestructable?: boolean;
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
  npcShieldAudio?: THREE.PositionalAudio;
  npcCast?: { t: number; dur: number; target: THREE.Vector3; marker: THREE.Group };
  roamPhase?: HeroAnimHint;
  roamTimer?: number;
  roamTarget?: THREE.Vector3;
  animOverrideHint?: HeroAnimHint;
  animOverrideTimer?: number;
  npcDelayedBeam?: { timer: number; dir: THREE.Vector3 };
  outOfCombatTimer?: number;
  respawnTimer?: number;
  spawnPos?: THREE.Vector3;
  stunTimer?: number;
  verticalVel?: number;
  pullActiveTimer?: number;
  knockbackVel?: THREE.Vector3;
  hpBarRevealTimer?: number;
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
  private physicsWorld!: PhysicsWorld;
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
  private playerOutOfCombatTimer = 5.0;
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
  private projectiles: Projectile[] = [];
  private activeBlueOrb: LapseBlueProjectile | null = null;
  private isChargingBlue = false;
  private blueChargeMs = 0;
  private blueIndicator: THREE.Group | null = null;
  private teleportPhase: 'NONE' | 'AIMING' | 'CASTING' = 'NONE';
  private teleportCastMs = 0;
  private teleportTarget = new THREE.Vector3();
  private teleportMarker: THREE.Group | null = null;
  private teleportCamBlend = 0;
  private teleportMorph = 0;
  private activeDomains: DomainExpansion[] = [];
  private godModeEnabled: boolean = getGodModeEnabled();
  private isPlayerDestructable = !getGodModeEnabled();
  private aiAttackingEnabled: boolean = getAiAttackingEnabled();

  get activeDomain(): DomainExpansion | null {
    return this.activeDomains.find((d) => d.casterId === 'player') ?? null;
  }

  get npcDomain(): DomainExpansion | null {
    return this.activeDomains.find((d) => d.casterId !== 'player') ?? null;
  }

  getPrimaryActiveDomain(): DomainExpansion | null {
    const trappedEnemyDom = this.activeDomains.find(
      (d) => d.casterId !== 'player' && d.isPlayerTrapped
    );
    if (trappedEnemyDom) return trappedEnemyDom;
    const playerDom = this.activeDomain;
    if (playerDom) return playerDom;
    return this.activeDomains[0] ?? null;
  }
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

  // Cooldowns (supports single-use cooldowns and multi-charge abilities like Jogo's Flame Dash)
  private cooldowns: Record<
    FpsAbilityKey,
    { remainingMs: number; totalMs: number; charges?: number; maxCharges?: number }
  >;

  // Jogo abilities: Flame Dash, wall-sticking Mini Volcanoes, and Hold-Q Maximum: Meteor targeting
  private flameDashTimer = 0;
  private flameDashDir = new THREE.Vector3();
  // Uro Takako abilities: Sky Flight, up to 3 persistent 5s Drawn Reality Wipes, dual-mode Thin Ice Breaker, & 3rd-person anims
  private skyPullTimer = 0;
  private skyPullBoostTimer = 0;
  private skyPullDir = new THREE.Vector3();
  private uroFlightTimer = 0;
  private uroAerialSlamActive = false;
  private activeRealityWipes: Array<{
    id: number;
    casterId: string;
    team: MobaTeam;
    controller: DrawnRealityWipeController;
    points: THREE.Vector3[];
    viewForward: THREE.Vector3;
    isDrawing: boolean;
    drawElapsed: number;
    strokeLength: number;
    age: number;
    maxAge: number;
  }> = [];
  private realityWipeIdCounter = 1;
  private thinIceWindupTimer = 0;
  private thinIcePendingAb: FpsAbilityDef | null = null;
  private uroActionCamTimer = 0;
  private uroActionAnimHint: HeroAnimHint = 'idle';
  private isSkyHovering = false;
  private skyDeflectCounterCooldown = 0;
  private activeVolcanoes: MiniVolcanoUnit[] = [];
  private volcanoIdCounter = 1;
  private meteorAiming = false;
  private meteorTarget = new THREE.Vector3();
  private meteorMarker: THREE.Group | null = null;

  // Megumi Ten Shadows: Shadow Step submersion, Rabbit Escape -> Hold SPACE Nue carry, & low-HP scent markers
  private shadowStepTimer = 0;
  private shadowPuddleMesh: THREE.Mesh | null = null;
  private lowHpTrackers = new Map<string, THREE.Mesh>();
  private nueCarryAvailable = false;
  private nueCarryDelaySec = 0;
  private nueCarryTimer = 0;
  private rabbitLaunchBoostTimer = 0;
  private isHoldingRabbitEscape = false;
  private rabbitHoldElapsedSec = 0;
  private rabbitHoldSpawnAccSec = 0;
  private rabbitPileBasePos = new THREE.Vector3();
  private activeNueCarry: NueCarryShikigami | null = null;
  private npcMegumiShowcase: {
    mode: 'RABBIT_CLIMB' | 'NUE_CARRY' | 'SHADOW_STEP' | 'DOMAIN_MAHORAGA';
    timer: number;
    spawnAcc: number;
    dir: THREE.Vector3;
    pileBase?: THREE.Vector3;
  } | null = null;
  private npcMegumiPuddleMesh: THREE.Mesh | null = null;

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
  private readonly hpBarFrustum = new THREE.Frustum();
  private readonly hpBarProjScreenMat = new THREE.Matrix4();
  private readonly hpBarLosRay = new THREE.Raycaster();
  private readonly hpBarWorldPos = new THREE.Vector3();
  private readonly hpBarUpperPos = new THREE.Vector3();

  // Timers
  private clock = new THREE.Clock();
  private matchTimeSec = 0;
  private waveTimerSec = 2.0;
  private waveCount = 0;
  private hudThrottle = 0;
  private winner: MobaTeam | null = null;
  private destroyed = false;
  private animFrameId = 0;

  // ── Web Audio & 3D Spatial Audio System ──
  private audioListener!: THREE.AudioListener;
  private audioLoader = new THREE.AudioLoader();
  private audioBuffers = new Map<string, AudioBuffer>();
  private playerShieldAudio: THREE.Audio | null = null;
  private playerDomainAudio: THREE.Audio | null = null;
  private playerVoiceAudio: THREE.Audio | null = null;

  // Bound event listeners
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onMouseMoveBound: (e: MouseEvent) => void;
  private onMouseDownBound: (e: MouseEvent) => void;
  private onMouseUpBound: (e: MouseEvent) => void;
  private onContextMenuBound: (e: MouseEvent) => void;
  private onPointerLockChangeBound: () => void;
  private onResizeBound: () => void;
  public mapId: MobaMapId = 'arena';

  constructor(
    container: HTMLElement,
    hero: FpsHeroDef,
    onHudUpdate: (state: FpsHudState) => void,
    mapId: MobaMapId = 'arena'
  ) {
    this.container = container;
    this.hero = hero;
    this.onHudUpdate = onHudUpdate;
    this.mapId = mapId;

    this.maxHp = hero.maxHp;
    this.hp = hero.maxHp;
    this.maxMana = hero.maxMana;
    this.mana = hero.maxMana;
    this.maxAmmo = hero.weapon.magazineSize;
    this.ammo = hero.weapon.magazineSize;

    this.barrierMaxHp = hero.secondaryFire.barrierMaxHp ?? 0;
    this.barrierHp = this.barrierMaxHp;

    const makeCooldown = (ab: FpsAbilityDef) => ({
      remainingMs: 0,
      totalMs: ab.cooldownMs,
      ...(ab.maxCharges && ab.maxCharges > 1
        ? { charges: ab.maxCharges, maxCharges: ab.maxCharges }
        : {})
    });
    this.cooldowns = {
      SHIFT: makeCooldown(hero.abilities.SHIFT),
      E: makeCooldown(hero.abilities.E),
      Q: makeCooldown(hero.abilities.Q)
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
        this.cancelMeteorAim();
        this.finishHoldingRabbitEscape();
        this.endNueCarry();
        this.stopAllAudio();
      } else {
        this.resumeAudioContext();
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

    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.1, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // ── Attach 3D Spatial AudioListener to Camera ──
    // Guard against a closed singleton THREE.AudioContext across SPA match transitions
    try {
      const existingCtx = THREE.AudioContext.getContext() as unknown as globalThis.AudioContext | null;
      if (existingCtx && existingCtx.state === 'closed') {
        const AudioCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtor) {
          THREE.AudioContext.setContext(new AudioCtor());
        }
      }
    } catch {
      // Ignore audio context recovery errors
    }
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);

    // Preload Gojo audio buffers for zero-latency 3D playback
    this.loadAudioBuffer('/assets/sounds/gojo/infinity_shield_hum.mp3').catch(() => {});
    this.loadAudioBuffer('/assets/sounds/gojo/hollow_purple_start.mp3').catch(() => {});
    this.loadAudioBuffer('/assets/sounds/gojo/unlimited_void.mp3').catch(() => {});
    this.loadAudioBuffer('/assets/sounds/gojo/de_voice.mp3').catch(() => {});
    this.loadAudioBuffer('/assets/sounds/gojo/murasaki.mp3').catch(() => {});

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
    // High HDR threshold (1.28) + controlled strength (0.23) for crisp anime glow without blinding glare
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.23, 0.32, 1.28);
    this.composer.addPass(bloomPass);

    this.mapBuilder = new MobaMapBuilder(this.mapId);
    this.mapBuilder.build(this.scene);

    this.physicsWorld = new PhysicsWorld(this.scene, this.mapBuilder);
    void this.physicsWorld.init();

    this.viewModel = new FpsViewModel(this.camera, this.hero);
    this.viewModel.setHandDistanceOffset(getHandDistanceOffset());
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

    const unit = new StructureUnit({
      id,
      name,
      team,
      type,
      group,
      bodyMesh: baseMesh,
      headMesh: crystalMesh,
      hpBarFill,
      maxHp,
      radius,
      height,
      attackRange,
      attackDamage,
      attackCooldown: 1.25,
      moveSpeed: 0,
      goldValue: type === 'CORE' ? 500 : 250,
      xpValue: type === 'CORE' ? 300 : 180,
      isDestructable: true
    });
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

    const unit = new HeroUnit({
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
      maxHp: rivalHero.maxHp,
      radius: 0.72,
      height: 2.25,
      attackRange: 22,
      attackDamage: 18,
      attackCooldown: 0.9,
      moveSpeed: 6.75,
      goldValue: 300,
      xpValue: 160,
      isDestructable: true,
      spawnPos
    });
    unit.respawnTimer = 0;
    hitMeshes.forEach((m) => {
      m.userData.unit = unit;
    });
    headMesh.userData.unit = unit;
    headMesh.userData.isHead = true;
    this.units.push(unit);
  }

  /**
   * Spawns all 6 roster heroes (Higuruma, Jogo, Gojo, Megumi, Mr. Biomaster, Uro Takako) on the test map
   * roaming and periodically showcasing their signature abilities.
   */
  private spawnHeroTrainingDummies() {
    const layout: Array<{ id: string; x: number; z: number; yaw: number; delay: number }> = [
      { id: 'higuruma', x: -16.0, z: 40.0, yaw: 0.35, delay: 1.6 },
      { id: 'jogo', x: -9.5, z: 33.0, yaw: 0.2, delay: 2.3 },
      { id: 'gojo', x: -2.5, z: 44.0, yaw: 0.05, delay: 2.6 },
      { id: 'uro', x: 3.5, z: 36.0, yaw: -0.08, delay: 2.0 },
      { id: 'megumi', x: 10.0, z: 33.0, yaw: -0.2, delay: 1.2 },
      { id: 'mr_biomaster', x: 16.5, z: 40.0, yaw: -0.35, delay: 3.8 }
    ];

    layout.forEach(({ id, x, z, yaw, delay }) => {
      const hero = FPS_MOBA_HEROES.find((h) => h.id === id);
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

      const shieldMat =
        hero.id === 'uro' ? createSkyVeilDistortionMaterial() : createInfinityDistortionMaterial();
      const shieldGeo = new THREE.PlaneGeometry(4, 3, 32, 24);
      const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
      shieldMesh.position.set(0, 1.5, 2.4);
      shieldMesh.visible = false;
      group.add(shieldMesh);

      const unit = new HeroUnit({
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
        maxHp: hero.maxHp,
        radius: 0.75,
        height: 2.25,
        attackRange: hero.weapon.range,
        attackDamage: hero.weapon.damage,
        attackCooldown: hero.weapon.fireRateMs / 1000,
        moveSpeed: hero.moveSpeed,
        goldValue: 50,
        xpValue: 40,
        isDestructable: true,
        isDummy: true,
        isRoamer: true,
        heroDef: hero,
        npcAi:
          hero.id === 'gojo'
            ? {
                ce: hero.maxMana,
                maxCe: hero.maxMana,
                burnout: 0,
                regen: STANDARD_CE_REGEN_PER_SEC * hero.ceRegenMultiplier,
                cd: { red: 2, blue: 4, shift: 1, infinity: 3, domain: 1.5 },
                busy: 0,
                think: 0.5,
                infinityHold: 0,
                strafeDir: 1,
                strafeTimer: 1.5,
                wanderTimer: 0
              }
            : undefined,
        spawnPos
      });
      unit.attackTimer = 1.5;
      unit.npcAbilityTimer = delay;
      unit.npcAbilityIndex = 0;
      unit.npcShieldTimer = 0;
      unit.npcShieldMesh = shieldMesh;
      unit.npcShieldMat = shieldMat;
      unit.roamPhase = 'idle';
      unit.roamTimer = hero.id === 'gojo' ? 5.8 : 3.6 + Math.random() * 2.0;
      unit.respawnTimer = 0;

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
    mesh.visible = false; // Hidden by default until Overwatch visibility & LoS triggers are met
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

        const unit = new MinionUnit({
          id,
          name: `${team === 'blue' ? 'Allied' : 'Enemy'} Trooper`,
          team,
          type: 'MINION',
          group,
          bodyMesh,
          headMesh,
          hpBarFill,
          maxHp: 95 + this.waveCount * 6,
          radius: 0.55,
          height: 1.6,
          attackRange: 9,
          attackDamage: 10,
          attackCooldown: 1.2,
          moveSpeed: 4.8,
          goldValue: 45,
          xpValue: 35,
          isDestructable: true
        });
        unit.attackTimer = Math.random() * 0.5;
        bodyMesh.userData.unit = unit;
        headMesh.userData.unit = unit;
        headMesh.userData.isHead = true;
        this.units.push(unit);
      });
    });
  }

  private createFloatingHpBar(parent: THREE.Group, y: number, width: number, _team: MobaTeam): THREE.Mesh {
    const barGroup = new THREE.Group();
    barGroup.position.set(0, y, 0);
    barGroup.userData.isHpBarRoot = true;
    barGroup.visible = false; // Hidden by default until Overwatch visibility & LoS triggers are met
    parent.add(barGroup);

    const bgGeo = new THREE.PlaneGeometry(width, 0.18);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x020617, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    barGroup.add(bgMesh);

    const fillGeo = new THREE.PlaneGeometry(width * 0.96, 0.12);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, // 80-100%: White, 50-79%: Yellow, 1-49%: Red
      side: THREE.DoubleSide
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.z = 0.015;
    barGroup.add(fillMesh);
    return fillMesh;
  }

  /**
   * Overwatch-style Floating Health Bar & Nameplate Visibility Rules:
   * 1. Core Visibility Triggers:
   *    - Damage-dealt window: Damaging a target reveals their health bar for 3.6 seconds (refreshing on subsequent hits).
   *    - Low-health visibility: Automatically reveals targets below 45% HP so finishable targets can be spotted.
   *    - Character/ability exceptions: Megumi's Divine Dog scent passive reveals wounded enemies (<= 65% HP within 55m),
   *      and active Domain Expansions reveal trapped targets inside the barrier.
   * 2. Occlusion & Spatial Rules:
   *    - Camera Frustum: Only renders when the floating bar anchor is inside the player camera's view frustum.
   *    - Line of Sight (LoS) & Geometry: Raycasts from the camera to the bar anchor and upper character bounds against
   *      world obstacles so solid walls occlude bars (unless low cover/stairs expose the bar anchor or upper bounds).
   */
  private shouldRenderUnitHealthBar(
    u: MobaUnit,
    barAnchorWorld: THREE.Vector3,
    hasTrackingShikigami: boolean
  ): boolean {
    if (!u.alive) return false;

    const hpRatio = u.hp / Math.max(1, u.maxHp);
    const recentlyDamaged = (u.hpBarRevealTimer ?? 0) > 0;
    const isLowHealth = hpRatio <= 0.45 && u.hp < u.maxHp;
    const isDivineDogTracked =
      hasTrackingShikigami &&
      u.team === 'red' &&
      hpRatio <= 0.65 &&
      u.group.position.distanceTo(this.playerPos) <= 55;
    const isDomainTrapped = this.activeDomains.some(
      (d) => d.casterId === 'player' && d.isTrapped(u.id)
    );
    const isAlliedInjured = u.team === 'blue' && u.hp < u.maxHp;

    const triggerActive =
      recentlyDamaged ||
      isLowHealth ||
      isDivineDogTracked ||
      isDomainTrapped ||
      isAlliedInjured;

    if (!triggerActive) return false;

    // 1. Camera View Frustum Check
    if (!this.hpBarFrustum.containsPoint(barAnchorWorld)) {
      return false;
    }

    const camPos = this.camera.position;
    const distToAnchor = camPos.distanceTo(barAnchorWorld);
    if (distToAnchor > 72) return false;
    if (distToAnchor < 0.6) return true;

    // 2. Line of Sight (LoS) Check against solid walls/geometry:
    // Visible if either the floating bar anchor OR the character's upper bounds clears low cover/ledges.
    const checkPointClear = (pt: THREE.Vector3): boolean => {
      const dir = pt.clone().sub(camPos);
      const dist = dir.length();
      if (dist <= 0.4) return true;
      dir.divideScalar(dist);
      this.hpBarLosRay.set(camPos, dir);
      this.hpBarLosRay.near = 0.25;
      this.hpBarLosRay.far = Math.max(0.3, dist - 0.35);
      return (
        this.hpBarLosRay.intersectObjects(this.mapBuilder.raycastObstacles, false).length === 0
      );
    };

    if (checkPointClear(barAnchorWorld)) return true;

    this.hpBarUpperPos.set(
      u.group.position.x,
      u.group.position.y + u.height * 0.78,
      u.group.position.z
    );
    return checkPointClear(this.hpBarUpperPos);
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

  public setHandDistanceOffset(offsetMeters: number) {
    this.viewModel?.setHandDistanceOffset(offsetMeters);
  }

  public setAiAttackingEnabled(enabled: boolean) {
    this.aiAttackingEnabled = enabled;
  }

  public setGodModeEnabled(enabled: boolean) {
    this.godModeEnabled = enabled;
    this.isPlayerDestructable = !enabled;
    if (enabled) {
      this.hp = this.maxHp;
      this.playerRespawnTimer = 0;
    }
  }

  public requestPointerLock() {
    if (this.destroyed || this.winner) return;
    this.resumeAudioContext();
    this.renderer?.domElement.requestPointerLock?.();
  }

  private handleKeyDown(e: KeyboardEvent) {
    const code = e.code;
    this.keys.add(code);
    this.resumeAudioContext();

    if (!this.pointerLocked || this.playerRespawnTimer > 0 || this.winner) return;

    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.hero.abilities.SHIFT.kind === 'LIMITLESS_TELEPORT') {
        this.startTeleportAim();
      } else {
        this.tryCastAbility('SHIFT');
      }
    } else if (code === 'KeyE') {
      if (!e.repeat) this.tryCastAbility('E');
    } else if (code === 'KeyQ') {
      if (e.repeat) return;
      if (this.activeDomain?.isJogoDomain && !this.activeDomain.purpleTriggered) {
        this.startMeteorAim();
      } else {
        this.tryCastAbility('Q');
      }
    } else if (code === 'KeyV') this.executeQuickMelee();
    else if (code === 'KeyR' || code === 'KeyC') this.startReload();
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.teleportPhase === 'AIMING') {
      this.releaseTeleport();
    }
    if (e.code === 'KeyQ' && this.meteorAiming) {
      this.releaseMeteor();
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Limitless Teleport (SHIFT) & Jogo Maximum: Meteor (Hold Q in Domain) Third-Person Aiming
  // ─────────────────────────────────────────────────────────────
  private ensurePlayerAvatar() {
    if (
      this.playerAvatar ||
      (this.hero.abilities.SHIFT.kind !== 'LIMITLESS_TELEPORT' &&
        this.hero.id !== 'jogo' &&
        this.hero.id !== 'uro')
    ) {
      return;
    }
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
    for (const d of this.activeDomains) {
      const c = d.clampPosition({ x, z, y: this.playerPos.y }, 0.7, d.isPlayerTrapped);
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
    if ((this.playerRespawnTimer > 0 || !this.activeDomain?.isJogoDomain) && this.meteorAiming) {
      this.cancelMeteorAim();
    }

    if (this.uroActionCamTimer > 0) {
      this.uroActionCamTimer = Math.max(0, this.uroActionCamTimer - dt);
    }

    const target =
      this.teleportPhase !== 'NONE' || this.meteorAiming
        ? 1
        : this.uroActionCamTimer > 0
          ? 0.82
          : 0;
    this.teleportCamBlend += (target - this.teleportCamBlend) * Math.min(1, dt * 9);
    if (Math.abs(this.teleportCamBlend - target) < 0.002) this.teleportCamBlend = target;

    this.viewModel.root.visible = this.teleportCamBlend < 0.2 && this.shadowStepTimer <= 0;
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
        const avatarHint: HeroAnimHint =
          this.hero.id === 'uro' && this.uroActionCamTimer > 0 ? this.uroActionAnimHint : 'idle';
        avatar.animate(elapsed, false, false, avatarHint);
      }
    }

    if (this.meteorAiming) {
      this.computeMeteorTarget();
      if (this.meteorMarker) {
        const pulse = 6.2 + Math.sin(elapsed * 8) * 0.28;
        this.placeIndicator(this.meteorMarker, this.meteorTarget.x, this.meteorTarget.z, pulse);
        this.meteorMarker.rotation.y += dt * 2.1;
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

  // ─────────────────────────────────────────────────────────────
  //  Jogo Maximum: Meteor (Hold Q inside Coffin of the Iron Mountain -> Release to drop)
  // ─────────────────────────────────────────────────────────────
  private startMeteorAim() {
    if (this.meteorAiming || this.playerRespawnTimer > 0 || this.winner) return;
    const dom = this.activeDomain;
    if (!dom || !dom.isJogoDomain || dom.purpleTriggered) return;
    if (!this.canSpendCursedEnergy()) return;

    this.meteorAiming = true;
    this.ensurePlayerAvatar();
    if (!this.meteorMarker) {
      this.meteorMarker = this.createRadiusIndicator('#ff4500');
    }
    this.computeMeteorTarget();
    this.placeIndicator(this.meteorMarker, this.meteorTarget.x, this.meteorTarget.z, 6.2);
  }

  private computeMeteorTarget() {
    const dom = this.activeDomain;
    const f = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const flat = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const o = this.camera.position;
    const groundY = dom ? dom.center.y : this.playerPos.y;
    const maxRange = dom ? dom.radius * 1.85 : 22;

    let tx: number;
    let tz: number;
    if (f.y < -0.04) {
      const t = (groundY - o.y) / f.y;
      tx = o.x + f.x * t;
      tz = o.z + f.z * t;
    } else {
      tx = this.playerPos.x + flat.x * 12;
      tz = this.playerPos.z + flat.z * 12;
    }

    if (dom) {
      const dx = tx - dom.center.x;
      const dz = tz - dom.center.z;
      const d = Math.hypot(dx, dz);
      const maxInner = Math.max(2.0, dom.radius - 1.2);
      if (d > maxInner && d > 0.001) {
        tx = dom.center.x + (dx / d) * maxInner;
        tz = dom.center.z + (dz / d) * maxInner;
      }
    } else {
      const dx = tx - this.playerPos.x;
      const dz = tz - this.playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > maxRange && d > 0.001) {
        tx = this.playerPos.x + (dx / d) * maxRange;
        tz = this.playerPos.z + (dz / d) * maxRange;
      }
    }

    const floorY = this.mapBuilder.getFloorHeight(tx, tz, groundY);
    this.meteorTarget.set(tx, floorY, tz);
  }

  private releaseMeteor() {
    if (!this.meteorAiming) return;
    const dom = this.activeDomain;
    const target = this.meteorTarget.clone();
    this.cancelMeteorAim();
    if (!dom || !dom.isJogoDomain || dom.purpleTriggered || !this.canSpendCursedEnergy()) return;

    dom.purpleTriggered = true;
    this.consumeCursedEnergy(35);
    this.viewModel.triggerCastGesture();

    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 30,
      amount: 0,
      label: 'MAXIMUM: METEOR!',
      isCrit: true,
      color: '#ff4500',
      ageSec: 0,
      opacity: 1
    });

    const meteor = new MaximumMeteorProjectile({
      targetPos: target,
      blastRadius: 11.5,
      damage: 240,
      team: 'blue',
      casterId: 'player',
      casterName: this.hero.name,
      scene: this.scene
    });
    this.scene.add(meteor.mesh);
    this.projectiles.push(meteor);

    // Dropping Maximum: Meteor ends the Domain Expansion and triggers technique burnout
    this.endActiveDomain();
  }

  private cancelMeteorAim() {
    this.meteorAiming = false;
    if (this.meteorMarker) {
      this.scene.remove(this.meteorMarker);
      this.meteorMarker = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Jogo Ability E: Wall-Sticking Mini Volcanoes (180° frontal firing hemisphere)
  //  Not a Shikigami, but a destructible battlefield construct with its own health bar.
  // ─────────────────────────────────────────────────────────────
  private plantMiniVolcano(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    team: MobaTeam,
    casterId: string,
    damage: number,
    radius: number,
    durationMs: number
  ) {
    // Cap active volcanoes per caster to 3 (despawn oldest cleanly)
    const owned = this.activeVolcanoes.filter((v) => v.alive && v.casterId === casterId);
    if (owned.length >= 3) {
      const oldest = owned[0];
      oldest.alive = false;
      this.scene.remove(oldest.group);
      const vIdx = this.activeVolcanoes.indexOf(oldest);
      if (vIdx !== -1) this.activeVolcanoes.splice(vIdx, 1);
      const uIdx = this.units.indexOf(oldest);
      if (uIdx !== -1) this.units.splice(uIdx, 1);
    }

    const group = new THREE.Group();
    group.position.copy(pos);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, normal.clone().normalize());
    group.quaternion.copy(q);

    // Sculpted obsidian volcanic cone + molten glowing rim
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x261a15,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.45,
      roughness: 0.85,
      metalness: 0.1
    });
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.56, 0.62, 10), rockMat);
    cone.position.y = 0.28;
    group.add(cone);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.055, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4500 })
    );
    rim.rotation.x = Math.PI * 0.5;
    rim.position.y = 0.58;
    group.add(rim);

    const lavaMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    lavaMesh.scale.set(1, 0.55, 1);
    lavaMesh.position.y = 0.54;
    group.add(lavaMesh);

    const hpBarFill = this.createFloatingHpBar(group, 1.05, 0.85, team);

    const volcanoUnit = new MiniVolcanoUnit({
      id: `mini_volcano_${this.volcanoIdCounter++}`,
      team,
      casterId,
      pos: pos.clone(),
      normal: normal.clone().normalize(),
      damage,
      detectRadius: radius,
      durationMs,
      group,
      coneMesh: cone,
      lavaMesh,
      hpBarFill
    });

    this.scene.add(group);
    this.activeVolcanoes.push(volcanoUnit);
    this.units.push(volcanoUnit);
  }

  private updateVolcanoes(dt: number, elapsed: number) {
    const losRay = new THREE.Raycaster();
    for (let i = this.activeVolcanoes.length - 1; i >= 0; i--) {
      const v = this.activeVolcanoes[i];
      if (!v.alive) {
        this.scene.remove(v.group);
        this.activeVolcanoes.splice(i, 1);
        continue;
      }
      v.age += dt;
      if (v.age >= v.maxAge) {
        v.alive = false;
        this.spawnCursedBurst(v.pos.clone().addScaledVector(v.normal, 0.4), 'FIRE', 1.1, 24);
        this.scene.remove(v.group);
        this.activeVolcanoes.splice(i, 1);
        const uIdx = this.units.indexOf(v);
        if (uIdx !== -1) this.units.splice(uIdx, 1);
        continue;
      }

      const pulse = 1 + Math.sin(elapsed * 12 + i) * 0.14;
      v.lavaMesh.scale.set(pulse, 0.55 * pulse, pulse);

      v.fireCooldown -= dt;
      if (v.fireCooldown > 0) continue;

      // Scan for nearest enemy inside the volcano's 180° hemisphere (dot(toTarget, normal) >= 0)
      const nozzlePos = v.pos.clone().addScaledVector(v.normal, 0.65);
      let bestTargetPos: THREE.Vector3 | null = null;
      let bestDist = v.detectRadius;

      for (const u of this.units) {
        if (!u.alive || u === v || !this.canUnitTakeDamageFrom(u, v.casterId, v.team)) continue;
        const targetCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
        const toTarget = targetCenter.clone().sub(v.pos);
        const dist = toTarget.length();
        if (dist > bestDist || dist < 0.2) continue;

        const dir = toTarget.clone().divideScalar(dist);
        // 180-degree hemisphere check relative to surface normal
        if (dir.dot(v.normal) < 0) continue;

        // Verify clear line-of-sight from crater nozzle to target
        const nozzleToTarget = targetCenter.clone().sub(nozzlePos);
        const nozzleDist = nozzleToTarget.length();
        if (nozzleDist > 0.25) {
          losRay.set(nozzlePos, nozzleToTarget.divideScalar(nozzleDist));
          losRay.near = 0.05;
          losRay.far = nozzleDist - 0.3;
          if (losRay.intersectObjects(this.mapBuilder.raycastObstacles, false).length > 0) {
            continue;
          }
        }

        bestDist = dist;
        bestTargetPos = targetCenter;
      }

      // Also allow enemy NPC volcanoes to fire at the player if inside the 180° hemisphere
      if (
        v.team !== 'blue' &&
        this.playerRespawnTimer <= 0 &&
        this.shadowStepTimer <= 0
      ) {
        const playerCenter = this.playerPos.clone().add(new THREE.Vector3(0, 1.15, 0));
        const toPlayer = playerCenter.clone().sub(v.pos);
        const distP = toPlayer.length();
        if (distP <= bestDist && distP >= 0.2 && toPlayer.clone().divideScalar(distP).dot(v.normal) >= 0) {
          bestDist = distP;
          bestTargetPos = playerCenter;
        }
      }

      if (bestTargetPos) {
        v.fireCooldown = 0.68;
        const shootDir = bestTargetPos.clone().sub(nozzlePos).normalize();
        const bolt = new FireBoltProjectile({
          startPos: nozzlePos,
          forward: shootDir,
          damage: v.attackDamage,
          team: v.team,
          casterId: v.casterId,
          casterName: 'Mini Volcano'
        });
        this.scene.add(bolt.mesh);
        this.projectiles.push(bolt);
        this.spawnImpactRing(nozzlePos, '#ff6b00', 0.9);
      } else {
        v.fireCooldown = 0.12;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Megumi Fushiguro — Ten Shadows Shikigami, Shadow Step & Mahoraga
  // ─────────────────────────────────────────────────────────────
  private enterShadowStep(durationSec: number) {
    this.endNueCarry();
    this.nueCarryAvailable = false;
    this.shadowStepTimer = durationSec;
    // Instant shadow-storage reload + small Overhealth stored
    this.isReloading = false;
    this.reloadRemainingMs = 0;
    this.ammo = this.maxAmmo;
    this.shield = Math.min(200, this.shield + 20);

    if (!this.shadowPuddleMesh) {
      const geo = new THREE.CircleGeometry(1.35, 32);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1e1b4b,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      });
      this.shadowPuddleMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.shadowPuddleMesh);
    }
    this.shadowPuddleMesh.visible = true;
    this.shadowPuddleMesh.position.set(this.playerPos.x, this.playerPos.y + 0.08, this.playerPos.z);

    this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 0.12, 0)), '#6366f1', 3.2);
    this.spawnCursedBurst(this.playerPos.clone().add(new THREE.Vector3(0, 0.5, 0)), 'SHADOW', 1.6, 44);
    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 38,
      amount: 0,
      label: 'SHADOW STEP · INSTANT RELOAD',
      isCrit: false,
      color: '#a5b4fc',
      ageSec: 0,
      opacity: 1
    });
  }

  private exitShadowStep() {
    if (this.shadowStepTimer <= 0) return;
    this.shadowStepTimer = 0;
    if (this.shadowPuddleMesh) {
      this.shadowPuddleMesh.visible = false;
    }
    this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 0.15, 0)), '#818cf8', 2.4);
    this.spawnCursedBurst(this.playerPos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'SHADOW', 1.2, 28);
  }

  private getShikigamiContext(): ShikigamiContext {
    return {
      scene: this.scene,
      units: this.units,
      playerPos: this.playerPos,
      playerHp: this.playerRespawnTimer <= 0 ? this.hp : 0,
      playerMana: this.playerRespawnTimer <= 0 ? this.mana : 0,
      playerDetectable: this.playerRespawnTimer <= 0 && this.shadowStepTimer <= 0,
      damageUnit: (unit, amount, isCrit, sourceName, hitPos, customLabel) =>
        this.damageUnit(unit as MobaUnit, amount, isCrit, sourceName, hitPos, customLabel),
      grantAbilityPassive: (didHit) => this.grantAbilityPassive(didHit),
      spawnImpactRing: (pos, colorHex, maxRadius) => this.spawnImpactRing(pos, colorHex, maxRadius),
      spawnCursedBurst: (pos, variant, radius, count) =>
        this.spawnCursedBurst(pos, variant, radius, count),
      spawnShikigamiShadowCloud: (pos, radius) => this.spawnShikigamiShadowCloud(pos, radius),
      spawnLightningBolt: (start, end) => this.spawnLightningBolt(start, end),
      getFloorHeight: (x, z, currentY) => this.mapBuilder.getFloorHeight(x, z, currentY),
      spawnPopup: (label, color, y = 32, amount = 0, isCrit = false) => {
        this.damagePopups.push({
          id: this.popupCounter++,
          x: 50,
          y,
          amount,
          label,
          isCrit,
          color,
          ageSec: 0,
          opacity: 1
        });
      }
    };
  }

  private spawnRabbitEscapeBatch(spawnCount: number, stacked = false): number {
    const inShadowGarden = Boolean(this.activeDomain?.isMegumiDomain);
    const maxRabbits = inShadowGarden ? 64 : 46;

    const existingRabbits = this.units.filter(
      (u): u is RabbitEscapeShikigami =>
        u.alive && u instanceof RabbitEscapeShikigami && u.team === 'blue'
    );
    let excess = existingRabbits.length + spawnCount - maxRabbits;
    const shikiCtx = this.getShikigamiContext();
    // Prefer despawning oldest non-stacked field rabbits first so the active ground-up pile stays intact
    const despawnOrder = [
      ...existingRabbits.filter((r) => !r.stacked),
      ...existingRabbits.filter((r) => r.stacked)
    ];
    for (let i = 0; i < despawnOrder.length && excess > 0; i++) {
      const old = despawnOrder[i];
      old.onDespawn(shikiCtx);
      const idx = this.units.indexOf(old);
      if (idx !== -1) this.units.splice(idx, 1);
      excess--;
    }

    const stackedCount = this.units.filter(
      (u): u is RabbitEscapeShikigami =>
        u.alive && u instanceof RabbitEscapeShikigami && u.summonerId === 'player' && u.stacked
    ).length;
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    let pileTopY = this.rabbitPileBasePos.y;

    for (let i = 0; i < spawnCount; i++) {
      const stackIdx = stackedCount + i;
      const angle = stackIdx * 2.39996 + Math.random() * 0.32;
      if (stacked) {
        // Pile up densely from the ground (baseY) upward in tapered rings of 4 rabbits per 0.44m layer
        const rabbitsPerLayer = 4;
        const layer = Math.floor(stackIdx / rabbitsPerLayer);
        const slot = stackIdx % rabbitsPerLayer;
        const baseTaper = Math.max(0.42, 1.08 - layer * 0.055);
        const ringR = baseTaper * (0.48 + (slot / rabbitsPerLayer) * 0.65);
        const offX = Math.cos(angle) * ringR;
        const offZ = Math.sin(angle) * ringR;
        const layerY = this.rabbitPileBasePos.y + layer * 0.44 + (slot % 2) * 0.08;
        pileTopY = Math.max(pileTopY, layerY + 0.52);

        const rabbit = new RabbitEscapeShikigami({
          spawnPos: new THREE.Vector3(
            this.rabbitPileBasePos.x + offX,
            layerY,
            this.rabbitPileBasePos.z + offZ
          ),
          team: 'blue',
          summonerId: 'player',
          hopPhase: Math.random() * Math.PI * 2,
          scatterAngle: angle,
          stacked: true,
          createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
        });
        this.scene.add(rabbit.group);
        this.units.push(rabbit);
      } else {
        const dist = 1.2 + Math.random() * 2.4;
        const rawX = this.playerPos.x + Math.cos(angle) * dist + flatForward.x * 1.0;
        const rawZ = this.playerPos.z + Math.sin(angle) * dist + flatForward.z * 1.0;
        const resolved = this.mapBuilder.resolveHorizontalCollision(rawX, rawZ, 0.42, this.playerPos.y);
        const spawnPos = new THREE.Vector3(
          resolved.x,
          this.mapBuilder.getFloorHeight(resolved.x, resolved.z, this.playerPos.y),
          resolved.z
        );

        const rabbit = new RabbitEscapeShikigami({
          spawnPos,
          team: 'blue',
          summonerId: 'player',
          hopPhase: Math.random() * Math.PI * 2,
          scatterAngle: angle,
          createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
        });
        this.scene.add(rabbit.group);
        this.units.push(rabbit);
      }
    }
    return pileTopY;
  }

  private releaseStackedRabbits(summonerId: string) {
    const stackedRabbits = this.units.filter(
      (u): u is RabbitEscapeShikigami =>
        u.alive && u instanceof RabbitEscapeShikigami && u.summonerId === summonerId && u.stacked
    );
    if (stackedRabbits.length === 0) return;
    stackedRabbits.forEach((rabbit, idx) => {
      const burstAngle = (idx / stackedRabbits.length) * Math.PI * 2 + Math.random() * 0.45;
      rabbit.releaseFromStack(burstAngle);
    });
    const center = stackedRabbits[0].group.position.clone();
    this.spawnImpactRing(center, '#e2e8f0', 4.6);
  }

  private beginHoldingRabbitEscape() {
    if (this.isHoldingRabbitEscape) return;
    // Rabbit Escape can only pile up from the ground and launch Megumi upwards if he is on the ground!
    if (!this.grounded) return;
    const sec = this.hero.secondaryFire;
    if (this.secondaryCooldownMs > 0 || !this.canSpendCursedEnergy()) return;
    this.exitShadowStep();

    // Base activation cost; holding M2 piles rabbits up from the ground beneath Megumi until released
    this.consumeCursedEnergy(sec.manaCost ?? 12);
    this.viewModel.triggerCastGesture();

    this.isHoldingRabbitEscape = true;
    this.rabbitHoldElapsedSec = 0;
    this.rabbitHoldSpawnAccSec = 0;
    const floorY = this.mapBuilder.getFloorHeight(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    this.rabbitPileBasePos.set(this.playerPos.x, floorY, this.playerPos.z);

    const inShadowGarden = Boolean(this.activeDomain?.isMegumiDomain);
    const initialCount = inShadowGarden ? 10 : 8;
    const pileTopY = this.spawnRabbitEscapeBatch(initialCount, true);

    this.shield = Math.min(200, this.shield + 15);
    this.playerPos.y = Math.max(this.playerPos.y, pileTopY);
    this.playerVel.y = 5.5;
    this.grounded = false;
    this.rabbitLaunchBoostTimer = 0.65;
    this.nueCarryAvailable = true;
    this.nueCarryDelaySec = 0.22;

    this.spawnImpactRing(this.rabbitPileBasePos.clone().add(new THREE.Vector3(0, 0.2, 0)), '#e2e8f0', 4.6);
    this.spawnCursedBurst(this.rabbitPileBasePos.clone().add(new THREE.Vector3(0, 0.6, 0)), 'SHADOW', 2.2, 45);
  }

  private finishHoldingRabbitEscape() {
    if (!this.isHoldingRabbitEscape) return;
    this.isHoldingRabbitEscape = false;
    this.rabbitHoldElapsedSec = 0;
    this.rabbitHoldSpawnAccSec = 0;
    // Spring off the top of the rabbit pile & release all stacked rabbits to attack nearby enemies!
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.playerVel.y = Math.max(this.playerVel.y, 11.5);
    this.playerVel.x += flatForward.x * 4.0;
    this.playerVel.z += flatForward.z * 4.0;
    this.rabbitLaunchBoostTimer = 0.65;
    this.releaseStackedRabbits('player');
    const sec = this.hero.secondaryFire;
    const inShadowGarden = Boolean(this.activeDomain?.isMegumiDomain);
    this.secondaryCooldownMs = inShadowGarden ? 2500 : (sec.cooldownMs ?? 6500);
  }

  private summonRabbitEscape() {
    this.beginHoldingRabbitEscape();
    this.finishHoldingRabbitEscape();
  }

  private startNueCarry() {
    this.nueCarryAvailable = false;
    this.rabbitLaunchBoostTimer = 0;
    this.nueCarryTimer = 2.0;
    this.playerVel.y = 0;
    this.grounded = false;

    if (this.activeNueCarry) {
      this.endNueCarry();
      this.nueCarryTimer = 2.0;
    }

    const nue = new NueCarryShikigami({
      spawnPos: this.playerPos.clone().add(new THREE.Vector3(0, 2.75, 0)),
      team: 'blue',
      summonerId: 'player',
      getYaw: () => this.yaw,
      createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
    });
    this.scene.add(nue.group);
    this.units.push(nue);
    this.activeNueCarry = nue;

    this.spawnImpactRing(this.playerPos.clone().add(new THREE.Vector3(0, 1.8, 0)), '#38bdf8', 3.4);
    this.spawnCursedBurst(this.playerPos.clone().add(new THREE.Vector3(0, 2.0, 0)), 'BLUE', 1.5, 32);
  }

  private endNueCarry() {
    this.nueCarryTimer = 0;
    if (this.activeNueCarry) {
      const carry = this.activeNueCarry;
      this.activeNueCarry = null;
      carry.onDespawn(this.getShikigamiContext());
      const idx = this.units.indexOf(carry);
      if (idx !== -1) this.units.splice(idx, 1);
    }
  }

  private findToadRescueAlly(): MobaUnit | null {
    const camPos = this.camera.position;
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    let bestAlly: MobaUnit | null = null;
    let bestScore = 0.88;

    for (const u of this.units) {
      if (
        !u.alive ||
        u.team !== 'blue' ||
        u.type === 'TOWER' ||
        u.type === 'CORE' ||
        u instanceof MahoragaShikigami ||
        u instanceof ToadShikigami ||
        u instanceof NueShikigami ||
        u instanceof NueCarryShikigami ||
        u instanceof RabbitEscapeShikigami
      ) {
        continue;
      }
      const center = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
      const toAlly = center.clone().sub(camPos);
      const dist = toAlly.length();
      if (dist < 2.2 || dist > 30) continue;
      const dot = toAlly.divideScalar(dist).dot(camDir);
      if (dot > bestScore) {
        bestScore = dot;
        bestAlly = u;
      }
    }
    return bestAlly;
  }

  private castNueOrToad(ab: FpsAbilityDef) {
    const ally = this.findToadRescueAlly();
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    if (ally) {
      const safePos = this.playerPos.clone().addScaledVector(flatForward, 2.2);
      const resolvedSafe = this.mapBuilder.resolveHorizontalCollision(safePos.x, safePos.z, ally.radius, this.playerPos.y);
      safePos.set(
        resolvedSafe.x,
        this.mapBuilder.getFloorHeight(resolvedSafe.x, resolvedSafe.z, this.playerPos.y),
        resolvedSafe.z
      );

      const toadPos = this.playerPos.clone().addScaledVector(flatForward, 1.3);
      toadPos.y = this.mapBuilder.getFloorHeight(toadPos.x, toadPos.z, this.playerPos.y);

      const toad = new ToadShikigami({
        spawnPos: toadPos,
        safePos,
        ally,
        team: 'blue',
        summonerId: 'player',
        createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
      });
      this.scene.add(toad.group);
      this.units.push(toad);

      const tongueOrigin = toadPos.clone().add(new THREE.Vector3(0, 0.65, 0));
      this.spawnBeamTracer(
        tongueOrigin,
        ally.group.position.clone().add(new THREE.Vector3(0, ally.height * 0.5, 0)),
        '#f472b6',
        0.38,
        0.14
      );
      this.spawnImpactRing(ally.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), '#f472b6', 2.4);

      ally.hp = Math.min(ally.maxHp, ally.hp + 35);
      this.grantAbilityPassive(true);

      this.damagePopups.push({
        id: this.popupCounter++,
        x: 50,
        y: 38,
        amount: 35,
        label: `TOAD RESCUE · ${ally.name.toUpperCase()}`,
        isCrit: false,
        color: '#f472b6',
        ageSec: 0,
        opacity: 1
      });
      return;
    }

    // NUE: Winged lightning shikigami swoops down onto aimed spot to stun-shock enemies!
    const targetPt = this.getAimGroundPoint(28);
    const inShadowGarden = Boolean(this.activeDomain?.isMegumiDomain);
    const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const offsets = inShadowGarden ? [-3.0, 3.0] : [0];

    for (const lat of offsets) {
      const startPos = this.playerPos
        .clone()
        .add(new THREE.Vector3(0, 6.2, 0))
        .addScaledVector(rightVec, lat * 0.8);
      const tPos = targetPt.clone().addScaledVector(rightVec, lat);
      tPos.y = this.mapBuilder.getFloorHeight(tPos.x, tPos.z, targetPt.y);

      const nue = new NueShikigami({
        startPos,
        targetPos: tPos,
        shockRadius: ab.radius,
        damage: ab.damage,
        stunSec: ab.durationMs / 1000,
        team: 'blue',
        summonerId: 'player',
        createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
      });
      this.scene.add(nue.group);
      this.units.push(nue);
    }
  }

  private summonMahoraga() {
    const dom = this.activeDomain;
    if (!dom || !dom.isMegumiDomain || dom.purpleTriggered) return;
    dom.purpleTriggered = true;

    const shikiCtx = this.getShikigamiContext();
    for (let i = this.units.length - 1; i >= 0; i--) {
      const existing = this.units[i];
      if (existing instanceof MahoragaShikigami) {
        existing.onDespawn(shikiCtx);
        this.units.splice(i, 1);
      }
    }

    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const spawnPos = this.playerPos.clone().addScaledVector(flatForward, 4.2);
    const resolved = this.mapBuilder.resolveHorizontalCollision(spawnPos.x, spawnPos.z, 1.1, this.playerPos.y);
    spawnPos.set(
      resolved.x,
      this.mapBuilder.getFloorHeight(resolved.x, resolved.z, this.playerPos.y),
      resolved.z
    );

    const mahoraga = new MahoragaShikigami({
      spawnPos,
      ownerTeam: 'blue',
      summonerId: 'player',
      createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team),
      createNameplate: (parent, y, text, col) => this.createHeroNameplate(parent, y, text, col)
    });
    this.scene.add(mahoraga.group);
    this.units.push(mahoraga);

    this.spawnImpactRing(spawnPos.clone().add(new THREE.Vector3(0, 0.2, 0)), '#facc15', 7.5);
    this.spawnCursedBurst(spawnPos.clone().add(new THREE.Vector3(0, 1.6, 0)), 'SHADOW', 3.4, 95);

    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 28,
      amount: 0,
      label: 'WITH THIS TREASURE I SUMMON... MAHORAGA!',
      isCrit: true,
      color: '#facc15',
      ageSec: 0,
      opacity: 1
    });

    this.endActiveDomain();
  }

  private updateLowHpTrackers(elapsed: number) {
    const hasTrackingShikigami = this.units.some(
      (u) => u.alive && u instanceof ShikigamiEntity && u.tracksLowHpThroughWalls && u.team === 'blue'
    );
    const activeIds = new Set<string>();

    if (hasTrackingShikigami) {
      for (const u of this.units) {
        if (!u.alive || u.team !== 'red' || u.type === 'TOWER' || u.type === 'CORE') continue;
        if (u.hp / u.maxHp <= 0.65) {
          activeIds.add(u.id);
          let marker = this.lowHpTrackers.get(u.id);
          if (!marker) {
            marker = new THREE.Mesh(
              new THREE.OctahedronGeometry(0.32, 0),
              new THREE.MeshBasicMaterial({
                color: 0xf43f5e,
                transparent: true,
                opacity: 0.85,
                depthTest: false
              })
            );
            marker.renderOrder = 999;
            this.scene.add(marker);
            this.lowHpTrackers.set(u.id, marker);
          }
          marker.position.set(
            u.group.position.x,
            u.group.position.y + u.height + 0.95 + Math.sin(elapsed * 6) * 0.14,
            u.group.position.z
          );
          marker.rotation.y = elapsed * 3.5;
        }
      }
    }

    for (const [id, marker] of this.lowHpTrackers.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(marker);
        marker.geometry.dispose();
        this.lowHpTrackers.delete(id);
      }
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
      this.finishDrawingRealityWipe();
      this.finishHoldingRabbitEscape();
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

  private getPlayerRealityWipeCount(): number {
    let n = 0;
    for (const w of this.activeRealityWipes) {
      if (w.casterId === 'player') n++;
    }
    return n;
  }

  private isRealityWipeActive(): boolean {
    return this.getPlayerRealityWipeCount() > 0;
  }

  private triggerUroActionAnim(hint: HeroAnimHint, durationSec: number) {
    if (this.hero.id !== 'uro') return;
    this.ensurePlayerAvatar();
    this.uroActionAnimHint = hint;
    this.uroActionCamTimer = Math.max(this.uroActionCamTimer, durationSec);
  }

  private getUroCursorBrushPoint(): { point: THREE.Vector3; lookDir: THREE.Vector3 } {
    const lookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
    const eye = this.playerPos.clone().add(new THREE.Vector3(0, 1.42, 0));
    return {
      point: eye.addScaledVector(lookDir, 3.8),
      lookDir
    };
  }

  private removeRealityWipeAt(index: number) {
    const w = this.activeRealityWipes[index];
    if (!w) return;
    this.scene.remove(w.controller.group);
    w.controller.dispose();
    this.activeRealityWipes.splice(index, 1);
  }

  private enforceCasterWipeCap(casterId: string, maxWipes = 3) {
    while (true) {
      const idx = this.activeRealityWipes.findIndex((w) => w.casterId === casterId);
      let count = 0;
      for (const w of this.activeRealityWipes) {
        if (w.casterId === casterId) count++;
      }
      if (count <= maxWipes || idx === -1) break;
      const oldWipe = this.activeRealityWipes[idx];
      if (oldWipe && oldWipe.points.length > 0) {
        const midPt = oldWipe.points[Math.floor(oldWipe.points.length / 2)].clone();
        this.spawnThinIceShatterVfx(midPt, oldWipe.viewForward.clone(), 1.6, 0.42);
      }
      this.removeRealityWipeAt(idx);
    }
  }

  private beginDrawingRealityWipe() {
    const sec = this.hero.secondaryFire;
    if (this.secondaryCooldownMs > 0 || !this.canSpendCursedEnergy()) return;

    // Finish any in-progress stroke first
    this.finishDrawingRealityWipe();

    this.consumeCursedEnergy(sec.manaCost ?? 16);
    const { point, lookDir } = this.getUroCursorBrushPoint();
    const ctrl = createDrawnRealityWipe([point.clone()], lookDir, 0.72);
    this.scene.add(ctrl.group);

    this.activeRealityWipes.push({
      id: this.realityWipeIdCounter++,
      casterId: 'player',
      team: 'blue',
      controller: ctrl,
      points: [point.clone()],
      viewForward: lookDir.clone(),
      isDrawing: true,
      drawElapsed: 0,
      strokeLength: 0,
      age: 0,
      maxAge: 5.0
    });
    // Cap at 3 active Reality Wipes — oldest dissolves if drawing a 4th
    this.enforceCasterWipeCap('player', 3);

    this.viewModel.triggerCastGesture();
  }

  private finishDrawingRealityWipe() {
    for (const w of this.activeRealityWipes) {
      if (w.casterId === 'player' && w.isDrawing) {
        w.isDrawing = false;
        w.age = 0; // Stays at this exact spot for a full 5.0 seconds once drawn!
        // If player quick-clicked without dragging far, synthesize a graceful 2.9m curved wipe stroke
        if (w.strokeLength < 0.6) {
          const center = w.points[0].clone();
          const right = new THREE.Vector3().crossVectors(w.viewForward, new THREE.Vector3(0, 1, 0));
          if (right.lengthSq() < 0.001) right.set(1, 0, 0);
          right.normalize();
          const up = new THREE.Vector3(0, 1, 0);
          w.points = [
            center.clone().addScaledVector(right, -1.4).addScaledVector(up, -0.28),
            center.clone().addScaledVector(right, -0.45).addScaledVector(up, 0.14),
            center.clone().addScaledVector(right, 0.45).addScaledVector(up, -0.08),
            center.clone().addScaledVector(right, 1.4).addScaledVector(up, 0.26)
          ];
          w.controller.rebuild(w.points, w.viewForward);
        }
      }
    }
  }

  private spawnNpcRealityWipe(u: MobaUnit, forwardDir: THREE.Vector3) {
    const center = u.group.position.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(forwardDir, 2.8);
    const right = new THREE.Vector3().crossVectors(forwardDir, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.001) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const pts = [
      center.clone().addScaledVector(right, -1.55).addScaledVector(up, -0.25),
      center.clone().addScaledVector(right, -0.5).addScaledVector(up, 0.18),
      center.clone().addScaledVector(right, 0.5).addScaledVector(up, -0.12),
      center.clone().addScaledVector(right, 1.55).addScaledVector(up, 0.28)
    ];
    const ctrl = createDrawnRealityWipe(pts, forwardDir, 0.72);
    this.scene.add(ctrl.group);
    this.activeRealityWipes.push({
      id: this.realityWipeIdCounter++,
      casterId: u.id,
      team: u.team,
      controller: ctrl,
      points: pts,
      viewForward: forwardDir.clone(),
      isDrawing: false,
      drawElapsed: 0,
      strokeLength: 3.1,
      age: 0,
      maxAge: 5.0
    });
    this.enforceCasterWipeCap(u.id, 3);
  }

  private distanceToWipePolyline(pos: THREE.Vector3, pts: THREE.Vector3[]): number {
    if (pts.length === 0) return Infinity;
    if (pts.length === 1) return pos.distanceTo(pts[0]);
    let minDistSq = Infinity;
    const ab = new THREE.Vector3();
    const ap = new THREE.Vector3();
    const closest = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      ab.copy(pts[i + 1]).sub(pts[i]);
      const lenSq = ab.lengthSq();
      if (lenSq < 0.00001) {
        minDistSq = Math.min(minDistSq, pos.distanceToSquared(pts[i]));
        continue;
      }
      ap.copy(pos).sub(pts[i]);
      const t = THREE.MathUtils.clamp(ap.dot(ab) / lenSq, 0, 1);
      closest.copy(pts[i]).addScaledVector(ab, t);
      minDistSq = Math.min(minDistSq, pos.distanceToSquared(closest));
    }
    return Math.sqrt(minDistSq);
  }

  private updateRealityWipes(dt: number, elapsed: number) {
    for (let i = this.activeRealityWipes.length - 1; i >= 0; i--) {
      const w = this.activeRealityWipes[i];
      if (w.isDrawing && w.casterId === 'player') {
        if (!this.rightMouseDown || this.playerRespawnTimer > 0) {
          this.finishDrawingRealityWipe();
        } else {
          w.drawElapsed += dt;
          const { point, lookDir } = this.getUroCursorBrushPoint();
          const last = w.points[w.points.length - 1];
          const stepDist = point.distanceTo(last);
          if (stepDist >= 0.16) {
            w.points.push(point.clone());
            w.strokeLength += stepDist;
            w.viewForward.lerp(lookDir, 0.35).normalize();
            w.controller.rebuild(w.points, w.viewForward);
          }
          if (w.strokeLength >= 6.8 || w.drawElapsed >= 0.78) {
            w.isDrawing = false;
            w.age = 0;
          }
        }
      } else {
        w.age += dt;
      }

      w.controller.update(dt, elapsed, w.age, w.maxAge);
      if (!w.isDrawing && w.age >= w.maxAge) {
        this.removeRealityWipeAt(i);
      }
    }
  }

  private isBarrierActive(): boolean {
    if (this.playerRespawnTimer > 0 || !this.canSpendCursedEnergy() || this.teleportPhase !== 'NONE') return false;
    if (this.hero.abilities.E.kind === 'INFINITY_SHIELD') {
      return this.keys.has('KeyE') && this.cooldowns.E.remainingMs <= 0;
    }
    return (
      this.rightMouseDown &&
      (this.hero.secondaryFire.kind === 'BARRIER_SHIELD' ||
        this.hero.secondaryFire.kind === 'SKY_DEFLECT') &&
      this.barrierHp > 0 &&
      this.secondaryCooldownMs <= 0
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  Secondary Fire (M2): Barrier Shield, Drawn Reality Wipe, Rocket Punch, Helix Rocket, or Lapse Blue
  // ─────────────────────────────────────────────────────────────
  private startSecondaryFire() {
    if (this.playerRespawnTimer > 0 || this.winner || this.teleportPhase !== 'NONE' || this.meteorAiming) return;
    const sec = this.hero.secondaryFire;
    if (sec.kind === 'NONE') return;

    if (sec.kind === 'REALITY_WIPE') {
      this.beginDrawingRealityWipe();
      return;
    }

    if (sec.kind === 'RABBIT_ESCAPE') {
      this.beginHoldingRabbitEscape();
      return;
    }

    if (sec.kind === 'LAPSE_BLUE_ORB') {
      // 2nd Right Click: Detonate active Lapse Blue orb to attract enemies within radius (Free - already paid on cast)
      if (this.activeBlueOrb) {
        this.viewModel.triggerCastGesture();
        this.activeBlueOrb.triggerAttract(this.getProjectileContext());
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
    this.viewModel.triggerFireRecoil();
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
        if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue') || hitSet.has(u)) continue;
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
    if (unit.npcCast) return;
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
    if (this.playerRespawnTimer > 0 || this.winner || this.fireCooldownMs > 0) return;
    this.fireCooldownMs = 450;
    this.viewModel.triggerQuickMelee();
    this.performMeleeCleave(38, 4.2, 95, 3.5, 'Quick Melee');
  }

  private tryPrimaryFire(releasedChargeRatio?: number) {
    if (
      this.playerRespawnTimer > 0 ||
      this.winner ||
      this.isChargingPunch ||
      this.teleportPhase !== 'NONE' ||
      this.meteorAiming
    ) {
      return;
    }
    if (
      this.isBarrierActive() &&
      (this.hero.secondaryFire.kind !== 'REALITY_WIPE' || this.rightMouseDown)
    ) {
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      return;
    }
    if (this.isReloading || this.fireCooldownMs > 0) return;

    const wep = this.hero.weapon;
    if (this.shadowStepTimer > 0) {
      this.exitShadowStep();
    }

    // 1. MELEE CLEAVE HEROES (Megumi Broadsword / Higuruma Gavel / Executioner's Sword)
    // Melee-based attacks do not require or consume Cursed Energy.
    if (wep.fireMode === 'MELEE_CLEAVE') {
      const execActive = this.executionerTimerSec > 0;
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

    // 2. RANGED / CURSED-ENERGY WEAPONS (require Cursed Energy)
    if (!this.canSpendCursedEnergy()) {
      this.isChargingPrimary = false;
      this.primaryChargeMs = 0;
      return;
    }
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
    // Curve knockback with charge so quick taps give a subtle nudge while full-charge Red launches enemies far
    const knockbackT = wep.chargeable ? Math.pow(chargeRatio, 1.25) : chargeRatio;
    const shotKnockback = wep.knockback
      ? THREE.MathUtils.lerp(wep.knockback, wep.maxKnockback ?? wep.knockback, knockbackT)
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

    // Jogo Primary Fire (M1): Launch fiery homing Ember Insects
    if (wep.fireMode === 'EMBER_INSECTS') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      const insectDmg = Math.round(shotBaseDamage + (this.level - 1) * 2.5);
      const insect = new EmberInsectProjectile({
        startPos: muzzleWorld.clone().addScaledVector(forward, 0.35),
        forward,
        damage: insectDmg,
        team: 'blue',
        casterId: 'player',
        casterName: this.hero.name
      });
      this.scene.add(insect.mesh);
      this.projectiles.push(insect);
      this.spawnImpactRing(muzzleWorld, '#f97316', 0.65);
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

      // Check if ray strikes any active Domain Barrier from the outside
      let barrierHit: { dom: DomainExpansion; point: THREE.Vector3; distance: number } | null = null;
      for (const dom of this.activeDomains) {
        const b = dom.raycastBarrier(raycaster.ray.origin, raycaster.ray.direction, wep.range);
        if (b && (!barrierHit || b.distance < barrierHit.distance)) {
          barrierHit = { dom, point: b.point, distance: b.distance };
        }
      }

      const hits = raycaster.intersectObjects(allTargets, false);
      let endPoint = raycaster.ray.origin
        .clone()
        .add(raycaster.ray.direction.clone().multiplyScalar(wep.range));

      if (barrierHit && (!hits.length || barrierHit.distance < hits[0].distance)) {
        endPoint = barrierHit.point;
        const dmg = Math.round(shotBaseDamage + (this.level - 1) * 2.5);
        this.damageDomainBarrier(barrierHit.dom, dmg, barrierHit.point, this.hero.name);
      } else if (hits.length > 0) {
        const hit = hits[0];
        endPoint = hit.point;
        const unit = hit.object.userData.unit as MobaUnit | undefined;
        if (unit && unit.alive && this.canUnitTakeDamageFrom(unit, 'player', 'blue')) {
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
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const dmg = Math.round(shotBaseDamage + (this.level - 1) * 2.5);
    const proj = new ReversalRedProjectile({
      startPos,
      forward,
      chargeRatio,
      damage: dmg,
      knockback: shotKnockback,
      team: 'blue',
      casterId: 'player',
      casterName: this.hero.name
    });
    this.spawnProjectile(proj);
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
    const pullIndicator = this.createRadiusIndicator(opts.color);

    const blueProj = new LapseBlueProjectile({
      startPos: orbPos,
      forward: opts.forward,
      pullRadius: opts.radius,
      damage: opts.damage,
      durationMs: opts.durationMs,
      abilityName: opts.name,
      color: opts.color,
      team: caster?.team ?? 'blue',
      casterId: caster?.id ?? 'player',
      casterName: caster?.name ?? this.hero.name,
      caster: caster ?? null,
      autoTriggerSec: opts.autoTriggerSec,
      pullIndicator,
      placeIndicator: (ind, x, z, r) => this.placeIndicator(ind, x, z, r),
      onCooldownStart: opts.onCooldownStart,
      onClearActiveRef: () => {
        if (!caster && this.activeBlueOrb === blueProj) {
          this.activeBlueOrb = null;
        }
      }
    });

    if (!caster) this.activeBlueOrb = blueProj;
    this.spawnProjectile(blueProj);
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
    this.physicsWorld?.applyRadialImpulse(slashPos, range * 0.85, 16 + knockbackDist * 2.2, 0.35, 28);

    let hitAny = false;
    for (const u of this.units) {
      if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
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
    } else if (this.hero.id === 'jogo') {
      this.shield = Math.min(200, this.shield + 15);
      this.mana = Math.min(this.maxMana, this.mana + 8);
    } else if (this.hero.id === 'uro') {
      this.shield = Math.min(200, this.shield + 20);
      this.mana = Math.min(this.maxMana, this.mana + 12);
    }
  }

  /** Checks whether `unit` can take damage from `attackerId` on `attackerTeam` (respecting Shikigami/Construct rules). */
  private canUnitTakeDamageFrom(unit: MobaUnit, attackerId: string, attackerTeam: MobaTeam): boolean {
    if (!unit.alive || unit.isDestructable === false) return false;
    if (unit instanceof MobaEntity) {
      return unit.canTakeDamageFrom(attackerId, attackerTeam);
    }
    return unit.team !== attackerTeam;
  }

  /** Collects raycastable target meshes for all living units that the player can damage (including Mahoraga & enemy constructs). */
  private getEnemyHitMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const u of this.units) {
      if (u.alive && this.canUnitTakeDamageFrom(u, 'player', 'blue')) {
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
    if (this.teleportPhase !== 'NONE' || this.meteorAiming) return;
    const ab = this.hero.abilities[key];
    const cd = this.cooldowns[key];

    // Pressing SHIFT again while submerged in Shadow Step emerges early
    if (key === 'SHIFT' && ab.kind === 'SHADOW_STEP' && this.shadowStepTimer > 0) {
      this.exitShadowStep();
      return;
    }

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

    // Megumi inside Chimera Shadow Garden: pressing Q summons Mahoraga (ends Domain)
    if (
      key === 'Q' &&
      this.activeDomain?.isMegumiDomain &&
      !this.activeDomain.purpleTriggered
    ) {
      if (!this.canSpendCursedEnergy()) return;
      this.exitShadowStep();
      this.consumeCursedEnergy(35);
      this.viewModel.triggerCastGesture();
      this.summonMahoraga();
      return;
    }

    // Uro Takako inside Sky Veil Horizon: pressing Q unleashes Maximum: Shattered Sky (ends Domain)
    if (
      key === 'Q' &&
      this.activeDomain?.isUroDomain &&
      !this.activeDomain.purpleTriggered
    ) {
      if (!this.canSpendCursedEnergy()) return;
      this.consumeCursedEnergy(35);
      this.viewModel.triggerCastGesture();
      this.triggerShatteredSky();
      return;
    }

    // Gojo's E is Infinity [Hold E], managed continuously via isBarrierActive()
    if (ab.kind === 'INFINITY_SHIELD') {
      return;
    }

    // Two-stage GRAVITY_ORB: 2nd press detonates active orb & attracts within radius (Free - already paid on cast)
    if (ab.kind === 'GRAVITY_ORB' && this.activeBlueOrb) {
      this.viewModel.triggerCastGesture();
      this.activeBlueOrb.triggerAttract(this.getProjectileContext());
      return;
    }

    const hasCharge =
      cd.maxCharges && cd.maxCharges > 1 ? (cd.charges ?? 0) > 0 : cd.remainingMs <= 0;
    if (!hasCharge || !this.canSpendCursedEnergy()) return;

    if (ab.kind !== 'SHADOW_STEP') {
      this.exitShadowStep();
    }

    this.consumeCursedEnergy(ab.manaCost);
    const isDomainWithFinisher =
      ab.kind === 'DOMAIN_ULT' &&
      (this.hero.id === 'gojo' ||
        this.hero.id === 'jogo' ||
        this.hero.id === 'megumi' ||
        this.hero.id === 'uro');
    if (cd.maxCharges && cd.maxCharges > 1) {
      cd.charges = Math.max(0, (cd.charges ?? cd.maxCharges) - 1);
      if (cd.remainingMs <= 0) {
        cd.remainingMs =
          ab.kind === 'SKY_PULL' && this.activeDomain?.isUroDomain
            ? Math.round(ab.cooldownMs * 0.6)
            : ab.cooldownMs;
      }
    } else if (ab.kind !== 'GRAVITY_ORB' && !isDomainWithFinisher) {
      cd.remainingMs =
        (ab.kind === 'NUE_TOAD' || ab.kind === 'RABBIT_ESCAPE_NUE') && this.activeDomain?.isMegumiDomain
          ? 2500
          : ab.kind === 'THIN_ICE_BREAKER' && this.activeDomain?.isUroDomain
            ? 2800
            : ab.cooldownMs;
    }
    this.viewModel.triggerCastGesture();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    switch (ab.kind) {
      // ── MEGUMI: SHADOW STEP (sink into floor shadows, undetected + instant reload) ──
      case 'SHADOW_STEP': {
        this.enterShadowStep(ab.durationMs / 1000);
        break;
      }

      // ── MEGUMI: RABBIT ESCAPE -> HOLD SPACE NUE FLIGHT COMBO ──
      case 'RABBIT_ESCAPE_NUE': {
        this.summonRabbitEscape();
        break;
      }

      // ── MEGUMI: NUE (AOE STUN SWOOP) / TOAD (ALLY TONGUE RESCUE PULL) ──
      case 'NUE_TOAD': {
        this.castNueOrToad(ab);
        break;
      }
      // ── JOGO: FLAME DASH (2-charge mobility burst, 4s recharge per charge) ──
      case 'FLAME_DASH': {
        let moveForward = 0;
        let moveRight = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveForward += 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveForward -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;
        const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const dashDir = new THREE.Vector3()
          .addScaledVector(flatForward, moveForward)
          .addScaledVector(rightVec, moveRight);
        if (dashDir.lengthSq() < 0.01) {
          dashDir.copy(flatForward);
        } else {
          dashDir.normalize();
        }
        this.flameDashDir.copy(dashDir);
        this.flameDashTimer = ab.durationMs / 1000;
        const origin = this.playerPos.clone().add(new THREE.Vector3(0, 0.9, 0));
        this.spawnImpactRing(origin, ab.color, 2.2);
        this.spawnCursedBurst(origin, 'FIRE', 1.35, 36);
        break;
      }

      // ── JOGO: WALL-STICKING MINI VOLCANO (180° frontal firing turret) ──
      case 'MINI_VOLCANO': {
        const muzzle = new THREE.Vector3(0.28, -0.18, -0.75).applyMatrix4(this.camera.matrixWorld);
        const seed = new VolcanoSeedProjectile({
          startPos: muzzle,
          forward,
          damage: ab.damage,
          detectRadius: ab.radius,
          volcanoDurationMs: ab.durationMs,
          team: 'blue',
          casterId: 'player',
          casterName: this.hero.name
        });
        this.scene.add(seed.mesh);
        this.projectiles.push(seed);
        this.spawnImpactRing(muzzle, ab.color, 0.9);
        break;
      }
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
            if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue') || hitUnits.has(u)) continue;
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
              if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue') || pierced.has(u)) continue;
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
          if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
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
          if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
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

      // ── URO TAKAKO: SKY FLIGHT (grab the sky, surge in 3D, and enter controllable flight) ──
      case 'SKY_PULL': {
        const pullDir = forward.clone().normalize();
        // If standing on the floor and looking flat/slightly down, lift cleanly into the sky
        if (this.grounded && pullDir.y < 0.34) {
          pullDir.y = 0.42;
          pullDir.normalize();
        }
        this.skyPullDir.copy(pullDir);
        this.skyPullTimer = Math.max(0.22, ab.durationMs / 1000);
        this.skyPullBoostTimer = 0.85;
        this.uroFlightTimer = 2.6;
        this.uroAerialSlamActive = false;
        this.grounded = false;
        const originRing = this.playerPos.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnImpactRing(originRing, ab.color, 3.6);
        this.spawnCursedBurst(originRing, 'SKY', 1.9, 44);
        break;
      }

      // ── URO TAKAKO: THIN ICE BREAKER (Grounded: Reality-Warping Beam | In Flight: 3m Dive Slam) ──
      case 'THIN_ICE_BREAKER': {
        this.executeThinIceBreaker(ab, forward);
        break;
      }

      case 'RALLY_ULT':
      case 'DOMAIN_ULT': {
        this.activateDomainExpansion(ab, ab.kind === 'RALLY_ULT');
        break;
      }
    }
  }

  private spawnThinIceShatterVfx(pos: THREE.Vector3, normal: THREE.Vector3, radius: number, durationSec = 0.72) {
    const shatter = createThinIceShatterEffect(pos, normal, radius);
    this.scene.add(shatter.group);
    this.vfxList.push({
      mesh: shatter.group,
      age: 0,
      maxAge: durationSec,
      onUpdate: (dt, progress) => {
        shatter.update(dt, progress);
      }
    });
  }

  private spawnRealityWarpBeamVfx(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    radius = 0.72,
    durationSec = 0.68
  ) {
    const beam = createRealityWarpBeamEffect(startPos, endPos, radius);
    this.scene.add(beam.group);
    this.vfxList.push({
      mesh: beam.group,
      age: 0,
      maxAge: durationSec,
      onUpdate: (dt, progress) => {
        beam.update(dt, progress);
      }
    });
  }

  private detonateUroAerialThinIceSlam() {
    this.uroAerialSlamActive = false;
    const blastRadius = 3.0; // Exact 3-meter aerial blast radius
    const impactPos = this.playerPos.clone().add(new THREE.Vector3(0, 0.22, 0));
    const inDomain = Boolean(this.activeDomain?.isUroDomain);

    // Horizontal & vertical Thin Ice glass-shatter fractures at landing spot
    this.spawnThinIceShatterVfx(impactPos, new THREE.Vector3(0, 1, 0), blastRadius * 1.15, 0.9);
    const flatForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.spawnThinIceShatterVfx(impactPos.clone().add(new THREE.Vector3(0, 1.0, 0)), flatForward, blastRadius, 0.85);
    this.spawnImpactRing(impactPos, '#67e8f9', blastRadius);
    this.spawnCursedBurst(impactPos, 'SKY', blastRadius * 0.7, 92);
    this.physicsWorld?.applyRadialImpulse(impactPos, blastRadius * 1.8, 52, 0.65, 160);

    // 2x barrier-shatter damage if slamming onto an enemy Domain shell
    const baseDmg = this.hero.abilities.E.damage || 115;
    for (const dom of this.activeDomains) {
      if (dom.isCollapsed || dom.casterTeam === 'blue') continue;
      if (impactPos.distanceTo(dom.center) <= dom.radius + blastRadius) {
        const barrierDmg = Math.round((baseDmg + 25 + (this.level - 1) * 8) * 2.0);
        this.damageDomainBarrier(dom, barrierDmg, impactPos, `${this.hero.name} (Thin Ice Slam)`);
      }
    }

    const slamDmg = Math.round((baseDmg + 25 + (this.level - 1) * 8) * (inDomain ? 1.25 : 1.0));
    let anyHit = false;
    for (const u of this.units) {
      if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
      const dx = u.group.position.x - impactPos.x;
      const dz = u.group.position.z - impactPos.z;
      const horizDist = Math.hypot(dx, dz);
      const vertDiff = Math.abs(u.group.position.y - this.playerPos.y);
      if (horizDist <= blastRadius + u.radius && vertDiff <= 4.0) {
        anyHit = true;
        if (u.npcShieldTimer && u.npcShieldTimer > 0) {
          u.npcShieldTimer = 0;
        }
        u.stunTimer = Math.max(u.stunTimer ?? 0, 0.85);
        const uCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.5, 0));
        this.damageUnit(u, slamDmg, true, 'Thin Ice Breaker (Aerial Slam)', uCenter, 'Thin Ice Breaker');
        const push = new THREE.Vector3(dx, 0, dz);
        if (push.lengthSq() > 0.001) {
          push.normalize();
          this.KnockbackUnitWithWallSlam(u, push, 5.5, 22);
        }
        u.verticalVel = Math.max(u.verticalVel ?? 0, 7.5);
      }
    }
    this.grantAbilityPassive(anyHit);
  }

  private executeThinIceBreaker(ab: FpsAbilityDef, forward: THREE.Vector3) {
    const inFlight = !this.grounded || this.uroFlightTimer > 0;
    this.triggerUroActionAnim('thin_ice_breaker', inFlight ? 1.85 : 2.15);

    // ── MODE A: IN FLIGHT -> Dive down and crack anyone in a 3-meter blast radius ──
    if (inFlight) {
      this.uroFlightTimer = 0;
      this.skyPullTimer = 0;
      this.skyPullBoostTimer = 0;
      this.isSkyHovering = false;
      this.uroAerialSlamActive = true;

      const diveForward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      const forwardBoost = forward.y < -0.15 ? 16.0 : 8.5;
      this.playerVel.set(diveForward.x * forwardBoost, -40.0, diveForward.z * forwardBoost);
      const startFlash = this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
      this.spawnThinIceShatterVfx(startFlash, new THREE.Vector3(0, -1, 0), 2.2, 0.55);
      this.spawnCursedBurst(startFlash, 'SKY', 1.5, 42);
      return;
    }

    // ── MODE B: GROUNDED -> 0.83s windup synced to ThinIceBreaker strike frame, then fire beam ──
    this.thinIcePendingAb = ab;
    this.thinIceWindupTimer = 0.83;
    const chargePos = this.playerPos.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(forward, 1.15);
    this.spawnImpactRing(chargePos, '#67e8f9', 2.0);
    this.spawnCursedBurst(chargePos, 'SKY', 0.9, 24);
  }

  private releaseGroundedThinIceBeam(ab: FpsAbilityDef, forward: THREE.Vector3) {
    const beamDir = forward.clone().normalize();
    const beamOrigin = this.playerPos
      .clone()
      .add(new THREE.Vector3(0, 1.42, 0))
      .addScaledVector(beamDir, 1.35);
    const maxBeamRange = 28.0;
    let beamLength = maxBeamRange;

    // 1. Check enemy Domain barriers first — deals 2x barrier-shatter damage & stops on outer shell
    for (const dom of this.activeDomains) {
      if (dom.isCollapsed || dom.casterTeam === 'blue') continue;
      const hit = dom.raycastBarrier(beamOrigin, beamDir, beamLength);
      if (hit && hit.distance < beamLength) {
        beamLength = hit.distance;
        const barrierDmg = Math.round((ab.damage + (this.level - 1) * 8) * 2.0);
        this.damageDomainBarrier(dom, barrierDmg, hit.point, `${this.hero.name} (Thin Ice Beam)`);
      }
    }

    // 2. Clamp beam endpoint on solid world obstacles
    const worldRay = new THREE.Raycaster(beamOrigin, beamDir, 0, beamLength);
    const worldHits = worldRay.intersectObjects(this.mapBuilder.raycastObstacles, false);
    if (worldHits.length > 0 && worldHits[0].distance < beamLength) {
      beamLength = Math.max(1.2, worldHits[0].distance);
    }

    const beamEnd = beamOrigin.clone().addScaledVector(beamDir, beamLength);
    const inDomain = Boolean(this.activeDomain?.isUroDomain);
    const beamHitRadius = inDomain ? 1.65 : 1.35;

    // Origin reality-crack glass fracture + outward spiraling Reality-Warping Beam + impact crack
    this.spawnThinIceShatterVfx(beamOrigin, beamDir, 2.7, 0.78);
    this.spawnRealityWarpBeamVfx(beamOrigin, beamEnd, inDomain ? 0.85 : 0.68, 0.72);
    this.spawnThinIceShatterVfx(beamEnd, beamDir.clone().negate(), 2.2, 0.68);
    this.spawnImpactRing(beamEnd, '#67e8f9', 2.8);
    this.spawnCursedBurst(beamOrigin, 'SKY', 1.6, 52);
    this.spawnCursedBurst(beamEnd, 'SKY', 1.8, 56);

    // Demolish destructible physics objects along the Reality-Warping Beam
    for (let d = 3.5; d <= beamLength; d += 5.5) {
      const samplePt = beamOrigin.clone().addScaledVector(beamDir, d);
      this.physicsWorld?.applyRadialImpulse(samplePt, 3.8, 34, 0.45, 95);
    }
    this.physicsWorld?.applyRadialImpulse(beamEnd, 4.5, 40, 0.5, 120);

    // Pierce & crack all enemy units intersecting the beam cylinder
    const dmg = Math.round((ab.damage + (this.level - 1) * 7) * (inDomain ? 1.25 : 1.0));
    let anyHit = false;
    const segVec = beamEnd.clone().sub(beamOrigin);
    const segLenSq = Math.max(0.0001, segVec.lengthSq());

    for (const u of this.units) {
      if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
      const uCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.55, 0));
      const t = THREE.MathUtils.clamp(uCenter.clone().sub(beamOrigin).dot(segVec) / segLenSq, 0, 1);
      const closestPt = beamOrigin.clone().addScaledVector(segVec, t);
      const distToBeam = uCenter.distanceTo(closestPt);

      if (distToBeam <= beamHitRadius + u.radius) {
        anyHit = true;
        if (u.npcShieldTimer && u.npcShieldTimer > 0) {
          u.npcShieldTimer = 0;
        }
        this.spawnThinIceShatterVfx(uCenter, beamDir, 1.9, 0.55);
        this.damageUnit(u, dmg, distToBeam <= beamHitRadius * 0.55, 'Thin Ice Breaker (Beam)', uCenter, 'Thin Ice Breaker');
        const pushDir = new THREE.Vector3(beamDir.x, 0, beamDir.z);
        if (pushDir.lengthSq() > 0.001) {
          pushDir.normalize();
          this.KnockbackUnitWithWallSlam(u, pushDir, 6.0, 22);
        }
        u.verticalVel = Math.max(u.verticalVel ?? 0, 4.5);
      }
    }
    this.grantAbilityPassive(anyHit);
  }

  private triggerShatteredSky() {
    const dom = this.activeDomain;
    if (!dom || !dom.isUroDomain) return;
    dom.purpleTriggered = true;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const targetPt = this.getAimGroundPoint(22);
    // Keep cataclysm within Uro's domain perimeter
    const dx = targetPt.x - dom.center.x;
    const dz = targetPt.z - dom.center.z;
    const dist = Math.hypot(dx, dz);
    if (dist > dom.radius * 0.85) {
      targetPt.x = dom.center.x + (dx / dist) * (dom.radius * 0.85);
      targetPt.z = dom.center.z + (dz / dist) * (dom.radius * 0.85);
    }
    const burstPos = targetPt.clone().add(new THREE.Vector3(0, 1.8, 0));

    // Massive triple-plane Thin Ice Breaker cataclysm
    const shatterRadius = 15.5;
    this.spawnThinIceShatterVfx(burstPos, forward, shatterRadius, 1.1);
    this.spawnThinIceShatterVfx(burstPos.clone().add(new THREE.Vector3(0, 1.4, 0)), new THREE.Vector3(0, 1, 0), shatterRadius * 0.9, 1.0);
    this.spawnImpactRing(targetPt.clone().add(new THREE.Vector3(0, 0.25, 0)), '#67e8f9', shatterRadius);
    this.spawnCursedBurst(burstPos, 'SKY', 4.6, 130);
    this.physicsWorld?.applyRadialImpulse(burstPos, shatterRadius * 1.35, 68, 0.75, 240);

    const dmg = Math.round(240 + (this.level - 1) * 14);
    let anyHit = false;
    for (const u of this.units) {
      if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
      const uCenter = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.5, 0));
      const d = Math.hypot(u.group.position.x - targetPt.x, u.group.position.z - targetPt.z);
      if (d <= shatterRadius + u.radius) {
        anyHit = true;
        u.stunTimer = Math.max(u.stunTimer ?? 0, 1.4);
        this.damageUnit(u, dmg, true, 'Maximum: Shattered Sky', uCenter, 'Maximum: Shattered Sky');
        const push = uCenter.clone().sub(burstPos);
        push.y = 0;
        if (push.lengthSq() > 0.01) {
          push.normalize();
          this.KnockbackUnitWithWallSlam(u, push, 9.5, 35);
        }
        u.verticalVel = Math.max(u.verticalVel ?? 0, 11.0);
      }
    }
    this.grantAbilityPassive(anyHit);

    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 35,
      amount: 0,
      label: 'MAXIMUM: SHATTERED SKY!',
      isCrit: true,
      color: '#67e8f9',
      ageSec: 0,
      opacity: 1
    });
    if (this.damagePopups.length > 10) this.damagePopups.shift();

    this.endActiveDomain();
  }

  private activateDomainExpansion(ab: FpsAbilityDef, isRally = false) {
    if (this.activeDomain) {
      this.endActiveDomain();
    }

    // Whenever a domain is expanded, their cursed energy bar gets filled up
    this.mana = this.maxMana;
    this.manaExhaustedTimerSec = 0;
    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 40,
      amount: 0,
      label: 'DOMAIN EXPANSION: CURSED ENERGY MAXED',
      isCrit: true,
      color: '#38bdf8',
      ageSec: 0,
      opacity: 1
    });

    const isGojoDomain = this.hero.id === 'gojo' && !isRally;
    const isJogoDomain = this.hero.id === 'jogo' && !isRally;
    const isMegumiDomain = this.hero.id === 'megumi' && !isRally;
    const isUroDomain = this.hero.id === 'uro' && !isRally;
    const dom = new DomainExpansion({
      name: ab.name,
      casterId: 'player',
      casterName: this.hero.name,
      casterTeam: 'blue',
      center: new THREE.Vector3(this.playerPos.x, isRally ? this.playerPos.y : 0, this.playerPos.z),
      radius: ab.radius,
      durationMs: ab.durationMs,
      color: ab.color,
      barrierHp: 1200,
      barrierMaxHp: 1200,
      isDestructable: true,
      isGojoDomain,
      isJogoDomain,
      isMegumiDomain,
      isUroDomain,
      isRally,
      scene: this.scene,
      initialUnits: this.units,
      playerPos: this.playerPos,
      isPlayerAlive: this.playerRespawnTimer <= 0
    });
    this.activeDomains.push(dom);
    if (isUroDomain) {
      this.triggerUroActionAnim('domain_expansion', 2.15);
    }
    if (isGojoDomain) {
      if (this.playerDomainAudio) {
        try { this.playerDomainAudio.stop(); } catch {}
      }
      if (this.playerVoiceAudio) {
        try { this.playerVoiceAudio.stop(); } catch {}
      }
      this.playerVoiceAudio = this.playGlobalSound('/assets/sounds/gojo/de_voice.mp3', { volume: 1.0 });
      this.playerDomainAudio = this.playGlobalSound('/assets/sounds/gojo/unlimited_void.mp3', { volume: 0.85 });
    }
  }

  /**
   * Whenever a domain is over (expired naturally, shattered by damage, or ended via finisher),
   * the caster loses all cursed energy and enters technique burnout.
   */
  private onDomainEnded(dom: DomainExpansion) {
    if (dom.casterId === 'player') {
      this.cancelMeteorAim();
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
      this.cooldowns.Q.remainingMs = this.hero.abilities.Q.cooldownMs;
      this.damagePopups.push({
        id: this.popupCounter++,
        x: 50,
        y: 40,
        amount: 0,
        label: 'BURNOUT · TECHNIQUE EXHAUSTED',
        isCrit: false,
        color: '#f43f5e',
        ageSec: 0,
        opacity: 1
      });
    } else {
      const casterUnit = this.units.find((u) => u.id === dom.casterId);
      if (casterUnit && casterUnit.npcAi) {
        casterUnit.npcAi.ce = 0;
        casterUnit.npcAi.burnout = CE_EXHAUSTION_LOCKOUT_SEC;
        casterUnit.npcAi.infinityHold = 0;
        casterUnit.npcShieldTimer = 0;
        casterUnit.npcAi.cd.domain = (casterUnit.heroDef?.abilities.Q.cooldownMs ?? 24000) / 1000;
        casterUnit.npcAi.busy = Math.max(casterUnit.npcAi.busy, 0.5);
      }
    }
  }

  private endActiveDomain() {
    const dom = this.activeDomain;
    if (!dom) return;
    const wasGojoDomain = dom.isGojoDomain;
    if (wasGojoDomain) {
      if (this.playerDomainAudio) {
        try {
          this.playerDomainAudio.stop();
          this.playerDomainAudio.disconnect();
        } catch {}
        this.playerDomainAudio = null;
      }
      if (this.playerVoiceAudio && !dom.purpleTriggered) {
        try {
          this.playerVoiceAudio.stop();
          this.playerVoiceAudio.disconnect();
        } catch {}
        this.playerVoiceAudio = null;
      }
    }
    this.onDomainEnded(dom);
    dom.cleanup(this.scene);
    const idx = this.activeDomains.indexOf(dom);
    if (idx !== -1) {
      this.activeDomains.splice(idx, 1);
    }
  }

  /**
   * Enforces the Domain barrier boundary: units trapped inside cannot escape, and outside units cannot walk in.
   * Returns true if the unit collided against the barrier shell.
   */
  private clampUnitToDomainBarrier(unit: MobaUnit): boolean {
    let collided = false;
    for (const dom of this.activeDomains) {
      const isTrapped = dom.isTrapped(unit.id);
      const c = dom.clampPosition(
        { x: unit.group.position.x, z: unit.group.position.z },
        unit.radius,
        isTrapped
      );
      if (c.collided) {
        unit.group.position.x = c.x;
        unit.group.position.z = c.z;
        collided = true;
      }
    }
    return collided;
  }

  /** Returns 0.10 (90% slow) for any enemy caught inside an active Domain barrier, or 1.0 otherwise. */
  private getDomainSlowMultiplier(unit: MobaUnit): number {
    let mult = 1.0;
    for (const dom of this.activeDomains) {
      mult = Math.min(mult, dom.getSlowMultiplier(unit.id, unit.team));
    }
    return mult;
  }

  /**
   * Outside attacks deal damage directly to the barrier HP of a Domain Expansion.
   */
  private damageDomainBarrier(
    dom: DomainExpansion,
    damage: number,
    hitPoint: THREE.Vector3,
    attackerName: string
  ) {
    const res = dom.takeBarrierDamage(damage);
    this.spawnImpactRing(hitPoint, dom.color, 1.8);
    this.spawnCursedBurst(hitPoint, 'BLUE', 1.1, 32);
    this.hitMarkerAlpha = 1.0;

    const projected = hitPoint.clone().project(this.camera);
    if (projected.z < 1) {
      const sx = (projected.x * 0.5 + 0.5) * 100;
      const sy = (-projected.y * 0.5 + 0.5) * 100;
      this.damagePopups.push({
        id: this.popupCounter++,
        x: THREE.MathUtils.clamp(sx + (Math.random() - 0.5) * 3, 10, 90),
        y: THREE.MathUtils.clamp(sy + (Math.random() - 0.5) * 3, 10, 90),
        amount: damage,
        label: 'BARRIER',
        isCrit: false,
        color: '#38bdf8',
        ageSec: 0,
        opacity: 1
      });
      if (this.damagePopups.length > 10) this.damagePopups.shift();
    }

    if (res.shattered) {
      this.shatterDomain(dom, attackerName);
    }
  }

  /**
   * Shatters a domain barrier: triggers collapse effects, inflicts 10s burnout on the caster, and frees everyone.
   */
  private shatterDomain(dom: DomainExpansion, breakerName?: string) {
    dom.isCollapsed = true;
    if (dom.isGojoDomain && dom.casterId === 'player') {
      if (this.playerDomainAudio) {
        try {
          this.playerDomainAudio.stop();
          this.playerDomainAudio.disconnect();
        } catch {}
        this.playerDomainAudio = null;
      }
      if (this.playerVoiceAudio && !dom.purpleTriggered) {
        try {
          this.playerVoiceAudio.stop();
          this.playerVoiceAudio.disconnect();
        } catch {}
        this.playerVoiceAudio = null;
      }
    }
    this.spawnImpactRing(dom.center.clone().add(new THREE.Vector3(0, 0.2, 0)), dom.color, dom.radius * 1.35);
    this.spawnTransmissionStreaks(dom.center, 'burst', 1.0);
    this.spawnTransmissionStreaks(dom.center.clone().add(new THREE.Vector3(0, 4.5, 0)), 'burst', 0.85);

    this.damagePopups.push({
      id: this.popupCounter++,
      x: 50,
      y: 35,
      amount: 0,
      label: 'DOMAIN SHATTERED!',
      isCrit: true,
      color: '#f43f5e',
      ageSec: 0,
      opacity: 1
    });

    this.onDomainEnded(dom);

    dom.cleanup(this.scene);
    const idx = this.activeDomains.indexOf(dom);
    if (idx !== -1) {
      this.activeDomains.splice(idx, 1);
    }
  }

  /**
   * Gojo's Domain-only finisher: fuses Reversal Red + Lapse Blue in an animation to form
   * a massive Hollow Purple orb (1-hit kill), ending Unlimited Void upon launch.
   */
  private triggerHollowPurple() {
    if (!this.activeDomain || this.activeDomain.purpleTriggered) return;
    this.activeDomain.purpleTriggered = true;
    this.viewModel.triggerHollowPurple();
    if (this.playerVoiceAudio) {
      try {
        this.playerVoiceAudio.stop();
        this.playerVoiceAudio.disconnect();
      } catch {}
      this.playerVoiceAudio = null;
    }
    this.playerVoiceAudio = this.playGlobalSound('/assets/sounds/gojo/murasaki.mp3', { volume: 0.5 });

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const startPos = this.camera.position.clone().addScaledVector(forward, 2.8);
    const purpleProj = new HollowPurpleProjectile({
      startPos,
      forward,
      team: 'blue',
      casterId: 'player',
      casterName: this.hero.name
    });
    this.spawnProjectile(purpleProj);
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
      if (!u.alive || !this.canUnitTakeDamageFrom(u, 'player', 'blue')) continue;
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
    if (unit.isDestructable === false) return;
    if (unit.npcCast) {
      const projected = hitWorldPos.clone().project(this.camera);
      if (projected.z < 1) {
        const sx = (projected.x * 0.5 + 0.5) * 100;
        const sy = (-projected.y * 0.5 + 0.5) * 100;
        this.damagePopups.push({
          id: this.popupCounter++,
          x: THREE.MathUtils.clamp(sx, 10, 90),
          y: THREE.MathUtils.clamp(sy, 10, 90),
          amount: 0,
          label: 'INVULNERABLE',
          isCrit: false,
          color: '#38bdf8',
          ageSec: 0,
          opacity: 1
        });
        if (this.damagePopups.length > 10) this.damagePopups.shift();
      }
      return;
    }
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
    let finalAmount = amount;
    let effectiveLabel = customLabel;
    if (unit instanceof ShikigamiEntity) {
      const mod = unit.modifyIncomingDamage(amount, sourceName, hitWorldPos, this.getShikigamiContext());
      finalAmount = mod.finalDamage;
      if (mod.popupLabel) {
        effectiveLabel = mod.popupLabel;
      }
    }

    unit.hp = Math.max(0, unit.hp - finalAmount);
    unit.outOfCombatTimer = 5.0;
    // Overwatch damage-dealt window: reveal target's health bar for 3.6 seconds, refreshing on subsequent hits
    unit.hpBarRevealTimer = 3.6;

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
        amount: finalAmount,
        label: effectiveLabel,
        isCrit,
        color: effectiveLabel?.startsWith('ADAPTED') ? '#facc15' : isCrit ? '#facc15' : this.hero.color,
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
      } else if (this.hero.id === 'megumi') {
        this.shield = Math.min(200, this.shield + 15);
        this.mana = Math.min(this.maxMana, this.mana + 12);
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
        if (unit instanceof ShikigamiEntity) {
          const yOff = unit.shikigamiKind === 'NUE' ? 0 : unit.height * 0.45;
          const cloudCenter = unit.group.position
            .clone()
            .add(new THREE.Vector3(0, yOff, 0));
          const cloudRadius = Math.max(0.85, Math.max(unit.radius, unit.height * 0.65));
          this.spawnShikigamiShadowCloud(cloudCenter, cloudRadius);
        }
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

  private spawnCursedBurst(
    pos: THREE.Vector3,
    variant: 'RED' | 'BLUE' | 'PURPLE' | 'FIRE' | 'SHADOW' | 'SKY',
    radius = 1.8,
    count = 72
  ) {
    const burst = createCursedExplosionParticles({ variant, radius, count });
    burst.group.position.copy(pos);
    this.scene.add(burst.group);
    this.vfxList.push({
      mesh: burst.group,
      age: 0,
      maxAge: variant === 'PURPLE' ? 1.15 : 0.85,
      onUpdate: (dt, progress) => {
        burst.update(dt, progress);
      }
    });
  }

  private spawnShikigamiShadowCloud(pos: THREE.Vector3, radius = 1.6) {
    const cloud = createShikigamiShadowCloud(radius);
    cloud.group.position.copy(pos);
    this.scene.add(cloud.group);
    this.vfxList.push({
      mesh: cloud.group,
      age: 0,
      maxAge: 1.25,
      onUpdate: (dt, progress) => {
        cloud.update(dt, progress);
      }
    });
  }

  private spawnLightningBolt(start: THREE.Vector3, end: THREE.Vector3) {
    const bolt = createNueLightningBolt(start, end);
    this.scene.add(bolt.group);
    this.vfxList.push({
      mesh: bolt.group,
      age: 0,
      maxAge: 0.24,
      onUpdate: (dt, progress) => {
        bolt.update(dt, progress);
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
      this.updateDomains(dt, elapsed);
      this.updateMobaUnits(dt, elapsed);
      this.resolveUnitBodyBlocking();
      this.physicsWorld?.nudgeBodiesAroundPoint(this.playerPos, this.playerVel, 0.9, dt);
      this.physicsWorld?.step(dt);
    }

    this.updateAudio(dt);
    this.updateVfx(dt);
    this.mapBuilder.updateSky(
      elapsed,
      this.activeDomains.length > 0,
      this.activeDomains[0]?.color
    );
    this.composer.render();

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.05) {
      this.hudThrottle = 0;
      this.emitHud();
    }
  };

  /**
   * Character-vs-character horizontal body blocking (circle separation):
   * Prevents heroes, minions, Divine Dogs, and Mahoraga from walking through each other or the player,
   * while allowing jumps cleanly over shorter targets and ignoring intangible shadow/aerial summons.
   */
  private resolveUnitBodyBlocking() {
    const isSolidBody = (u: MobaUnit) =>
      u.alive &&
      u.type !== 'TOWER' &&
      u.type !== 'CORE' &&
      !(u instanceof ToadShikigami) &&
      !(u instanceof NueShikigami) &&
      !(u instanceof NueCarryShikigami) &&
      !(u instanceof RabbitEscapeShikigami);

    const solidUnits = this.units.filter(isSolidBody);

    // 1. Unit-vs-Unit separation
    for (let i = 0; i < solidUnits.length; i++) {
      const a = solidUnits[i];
      for (let j = i + 1; j < solidUnits.length; j++) {
        const b = solidUnits[j];
        if (Math.abs(a.group.position.y - b.group.position.y) > Math.max(a.height, b.height) * 0.85) {
          continue;
        }
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (a.radius + b.radius) * 0.85;
        if (dist < minDist && dist > 0.0001) {
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;

          const aMovable = a.moveSpeed > 0 && !(a.isDummy && !a.isRoamer && !a.npcAi);
          const bMovable = b.moveSpeed > 0 && !(b.isDummy && !b.isRoamer && !b.npcAi);

          if (aMovable) {
            const pushA = bMovable ? overlap : overlap * 2;
            const resA = this.mapBuilder.resolveHorizontalCollision(
              a.group.position.x - nx * pushA,
              a.group.position.z - nz * pushA,
              a.radius,
              a.group.position.y
            );
            a.group.position.x = resA.x;
            a.group.position.z = resA.z;
            this.clampUnitToDomainBarrier(a);
          }
          if (bMovable) {
            const pushB = aMovable ? overlap : overlap * 2;
            const resB = this.mapBuilder.resolveHorizontalCollision(
              b.group.position.x + nx * pushB,
              b.group.position.z + nz * pushB,
              b.radius,
              b.group.position.y
            );
            b.group.position.x = resB.x;
            b.group.position.z = resB.z;
            this.clampUnitToDomainBarrier(b);
          }
        }
      }
    }

    // 2. Player-vs-Unit body blocking (skipped while submerged in Shadow Step, casting Teleport, or flying on Nue)
    if (
      this.playerRespawnTimer > 0 ||
      this.shadowStepTimer > 0 ||
      this.teleportPhase === 'CASTING' ||
      this.nueCarryTimer > 0
    ) {
      return;
    }

    const playerRadius = 0.65;
    for (const u of solidUnits) {
      // Allow jumping cleanly over enemies
      if (this.playerPos.y > u.group.position.y + u.height * 0.85 || this.playerPos.y + 1.7 < u.group.position.y) {
        continue;
      }
      const dx = this.playerPos.x - u.group.position.x;
      const dz = this.playerPos.z - u.group.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = (playerRadius + u.radius) * 0.88;
      if (dist < minDist && dist > 0.0001) {
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const uMovable = u.moveSpeed > 0 && !(u.isDummy && !u.isRoamer && !u.npcAi);
        const playerPush = uMovable ? overlap * 0.62 : overlap;
        const unitPush = uMovable ? overlap * 0.38 : 0;

        const resP = this.mapBuilder.resolveHorizontalCollision(
          this.playerPos.x + nx * playerPush,
          this.playerPos.z + nz * playerPush,
          playerRadius,
          this.playerPos.y
        );
        this.playerPos.x = resP.x;
        this.playerPos.z = resP.z;

        for (const dom of this.activeDomains) {
          const c = dom.clampPosition(
            { x: this.playerPos.x, z: this.playerPos.z, y: this.playerPos.y },
            playerRadius,
            dom.isPlayerTrapped
          );
          this.playerPos.x = c.x;
          this.playerPos.z = c.z;
        }

        if (unitPush > 0) {
          const resU = this.mapBuilder.resolveHorizontalCollision(
            u.group.position.x - nx * unitPush,
            u.group.position.z - nz * unitPush,
            u.radius,
            u.group.position.y
          );
          u.group.position.x = resU.x;
          u.group.position.z = resU.z;
          this.clampUnitToDomainBarrier(u);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Web Audio & 3D Spatial Audio System
  // ─────────────────────────────────────────────────────────────
  private resumeAudioContext() {
    if (this.audioListener && this.audioListener.context && this.audioListener.context.state === 'suspended') {
      this.audioListener.context.resume().catch(() => {});
    }
  }

  private loadAudioBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.audioBuffers.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
      this.audioLoader.load(
        url,
        (buffer) => {
          this.audioBuffers.set(url, buffer);
          resolve(buffer);
        },
        undefined,
        (err) => {
          console.warn('Failed to load spatial audio buffer:', url, err);
          reject(err);
        }
      );
    });
  }

  /**
   * Plays a 3D localized sound attached to a scene Object3D (e.g. NPC hero or domain mesh).
   * Web Audio HRTF panner calculates true 3D spatial panning and distance rolloff.
   */
  private playSpatialSound(
    url: string,
    parent: THREE.Object3D,
    opts: {
      volume?: number;
      loop?: boolean;
      refDistance?: number;
      maxDistance?: number;
      rolloff?: number;
    } = {}
  ): THREE.PositionalAudio | null {
    if (!this.audioListener) return null;
    this.resumeAudioContext();

    const sound = new THREE.PositionalAudio(this.audioListener);
    sound.setRefDistance(opts.refDistance ?? 8);
    sound.setMaxDistance(opts.maxDistance ?? 45);
    sound.setRolloffFactor(opts.rolloff ?? 1.2);
    sound.setVolume(opts.volume ?? 1.0);
    sound.setLoop(opts.loop ?? false);

    parent.add(sound);

    const onPlay = (buf: AudioBuffer) => {
      if (this.destroyed || sound.userData.cancelled) return;
      const start = () => {
        if (this.destroyed || sound.userData.cancelled || sound.isPlaying) return;
        try {
          sound.setBuffer(buf);
          sound.play();
        } catch {}
      };
      if (this.audioListener?.context?.state === 'suspended') {
        this.audioListener.context.resume().then(start).catch(() => {});
      } else {
        start();
      }
    };

    const cached = this.audioBuffers.get(url);
    if (cached) {
      onPlay(cached);
    } else {
      this.loadAudioBuffer(url).then(onPlay).catch(() => {});
    }

    if (!opts.loop) {
      const origOnEnded = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        origOnEnded();
        parent.remove(sound);
        try {
          sound.disconnect();
        } catch {}
      };
    }

    return sound;
  }

  /**
   * Plays a non-positional global sound (for the local player's own perspective).
   */
  private playGlobalSound(
    url: string,
    opts: {
      volume?: number;
      loop?: boolean;
    } = {}
  ): THREE.Audio | null {
    if (!this.audioListener) return null;
    this.resumeAudioContext();

    const sound = new THREE.Audio(this.audioListener);
    sound.setVolume(opts.volume ?? 1.0);
    sound.setLoop(opts.loop ?? false);

    const onPlay = (buf: AudioBuffer) => {
      if (this.destroyed || sound.userData.cancelled) return;
      const start = () => {
        if (this.destroyed || sound.userData.cancelled || sound.isPlaying) return;
        try {
          sound.setBuffer(buf);
          sound.play();
        } catch {}
      };
      if (this.audioListener?.context?.state === 'suspended') {
        this.audioListener.context.resume().then(start).catch(() => {});
      } else {
        start();
      }
    };

    const cached = this.audioBuffers.get(url);
    if (cached) {
      onPlay(cached);
    } else {
      this.loadAudioBuffer(url).then(onPlay).catch(() => {});
    }

    return sound;
  }

  private stopSoundSafe(sound: THREE.Audio | THREE.PositionalAudio | null | undefined) {
    if (!sound) return;
    sound.userData.cancelled = true;
    try {
      if (sound.isPlaying) sound.stop();
      sound.disconnect();
    } catch {}
  }

  private stopAllAudio() {
    if (this.playerShieldAudio) {
      this.stopSoundSafe(this.playerShieldAudio);
      this.playerShieldAudio = null;
    }
    if (this.playerDomainAudio) {
      this.stopSoundSafe(this.playerDomainAudio);
      this.playerDomainAudio = null;
    }
    if (this.playerVoiceAudio) {
      this.stopSoundSafe(this.playerVoiceAudio);
      this.playerVoiceAudio = null;
    }
    for (const u of this.units) {
      if (u.npcShieldAudio) {
        this.stopSoundSafe(u.npcShieldAudio);
        try {
          u.group.remove(u.npcShieldAudio);
        } catch {}
        u.npcShieldAudio = undefined;
      }
    }
    for (const dom of this.activeDomains) {
      if (dom.audio) {
        this.stopSoundSafe(dom.audio);
        dom.audio = undefined;
      }
    }
  }

  private updateAudio(dt: number) {
    if (this.destroyed) return;

    // ── Local Player Infinity Shield Hum ──
    const playerShieldActive =
      !this.winner &&
      this.pointerLocked &&
      this.playerRespawnTimer <= 0 &&
      this.hero.abilities.E.kind === 'INFINITY_SHIELD' &&
      this.isBarrierActive();

    if (playerShieldActive) {
      if (!this.playerShieldAudio) {
        this.playerShieldAudio = this.playGlobalSound('/assets/sounds/gojo/infinity_shield_hum.mp3', {
          volume: 0.5,
          loop: true
        });
      }
    } else if (this.playerShieldAudio) {
      this.stopSoundSafe(this.playerShieldAudio);
      this.playerShieldAudio = null;
    }

    // ── Local Player Domain Cleanup Check ──
    if (this.playerDomainAudio && this.playerDomainAudio.isPlaying) {
      const pDom = this.activeDomain;
      if (!pDom || !pDom.isGojoDomain || this.winner || !this.pointerLocked) {
        this.stopSoundSafe(this.playerDomainAudio);
        this.playerDomainAudio = null;
      }
    }
  }

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
    } else if (
      !this.isBarrierActive() &&
      !this.isChargingPrimary &&
      !this.isChargingPunch &&
      !this.isHoldingRabbitEscape
    ) {
      this.mana = Math.min(this.maxMana, this.mana + this.getCeRegenPerSec() * dt);
    }

    // Out-of-combat Health Regeneration (regenerate after 5 seconds of not sustaining damage)
    this.playerOutOfCombatTimer += dt;
    if (this.playerOutOfCombatTimer >= 5.0 && this.hp < this.maxHp && this.playerRespawnTimer <= 0) {
      const regenRate = Math.max(25, this.maxHp * 0.08);
      this.hp = Math.min(this.maxHp, this.hp + regenRate * dt);
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
      const cd = this.cooldowns[k];
      if (cd.maxCharges && cd.maxCharges > 1) {
        const charges = cd.charges ?? cd.maxCharges;
        if (charges < cd.maxCharges) {
          cd.remainingMs = Math.max(0, cd.remainingMs - dtMs);
          if (cd.remainingMs <= 0) {
            cd.charges = charges + 1;
            cd.remainingMs = cd.charges < cd.maxCharges ? cd.totalMs : 0;
          }
        }
      } else if (cd.remainingMs > 0) {
        cd.remainingMs = Math.max(0, cd.remainingMs - dtMs);
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
        this.playerOutOfCombatTimer = 5.0;
      }
      this.syncCameraToPlayer();
      return;
    }

    // Megumi Shadow Step duration & floor puddle tracking
    if (this.shadowStepTimer > 0) {
      this.shadowStepTimer -= dt;
      if (this.shadowPuddleMesh) {
        this.shadowPuddleMesh.position.set(this.playerPos.x, this.playerPos.y + 0.08, this.playerPos.z);
        this.shadowPuddleMesh.rotation.y += dt * 2.5;
      }
      if (this.shadowStepTimer <= 0) {
        this.exitShadowStep();
      }
    }

    // Continuous fire / melee swing when holding Left Click
    if (
      this.mouseDown &&
      this.pointerLocked &&
      (this.hero.weapon.fireMode === 'AUTO' ||
        this.hero.weapon.fireMode === 'BURST' ||
        this.hero.weapon.fireMode === 'MELEE_CLEAVE' ||
        this.hero.weapon.fireMode === 'HAND_CANNON' ||
        this.hero.weapon.fireMode === 'EMBER_INSECTS' ||
        this.hero.weapon.fireMode === 'HYBRID_SHADOW')
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
    const shadowStepSpeedBonus = this.shadowStepTimer > 0 ? 1.45 : 1.0;
    const shieldPenalty = this.isBarrierActive() || this.isChargingPunch ? 0.72 : 1.0;
    const teleportSlow = this.teleportPhase !== 'NONE' || this.meteorAiming ? 0 : 1.0;
    let npcDomainSlow = 1.0;
    for (const dom of this.activeDomains) {
      if (dom.casterId !== 'player' && dom.isPlayerTrapped) {
        npcDomainSlow = Math.min(npcDomainSlow, 0.45);
      }
    }
    const speed =
      this.hero.moveSpeed * domainSpeedBonus * shadowStepSpeedBonus * shieldPenalty * teleportSlow * npcDomainSlow;

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
    if (this.flameDashTimer > 0) {
      this.flameDashTimer = Math.max(0, this.flameDashTimer - dt);
      const dashSpeed = 54.0;
      this.playerVel.x = this.flameDashDir.x * dashSpeed;
      this.playerVel.z = this.flameDashDir.z * dashSpeed;
    }
    let isSkyPulling = false;
    if (this.skyPullTimer > 0) {
      this.skyPullTimer = Math.max(0, this.skyPullTimer - dt);
      isSkyPulling = true;
      const pullSpeed = 42.0;
      this.playerVel.set(
        this.skyPullDir.x * pullSpeed,
        this.skyPullDir.y * pullSpeed,
        this.skyPullDir.z * pullSpeed
      );
      this.grounded = false;
    }
    if (this.uroFlightTimer > 0) {
      this.uroFlightTimer = Math.max(0, this.uroFlightTimer - dt);
    }
    if (this.uroAerialSlamActive) {
      // Plunge rapidly downward until ground touchdown triggers the 3m Thin Ice Breaker slam!
      this.playerVel.y = Math.min(this.playerVel.y, -40.0);
    }
    if (this.skyDeflectCounterCooldown > 0) {
      this.skyDeflectCounterCooldown = Math.max(0, this.skyDeflectCounterCooldown - dt);
    }
    if (this.thinIceWindupTimer > 0) {
      this.thinIceWindupTimer = Math.max(0, this.thinIceWindupTimer - dt);
      if (this.thinIceWindupTimer <= 0 && this.thinIcePendingAb) {
        const pendingAb = this.thinIcePendingAb;
        this.thinIcePendingAb = null;
        if (this.playerRespawnTimer <= 0 && !this.winner) {
          const aimForward = new THREE.Vector3(
            -Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            -Math.cos(this.yaw) * Math.cos(this.pitch)
          ).normalize();
          this.releaseGroundedThinIceBeam(pendingAb, aimForward);
        }
      }
    }
    if (this.teleportPhase !== 'NONE' || this.meteorAiming) {
      // Movement is locked while aiming Limitless Teleport or Maximum: Meteor
      this.playerVel.x = 0;
      this.playerVel.z = 0;
    }

    if (this.nueCarryDelaySec > 0) {
      this.nueCarryDelaySec = Math.max(0, this.nueCarryDelaySec - dt);
    }

    if (this.isHoldingRabbitEscape) {
      const maxHoldSec = 1.45;
      if (
        !this.rightMouseDown ||
        !this.canSpendCursedEnergy() ||
        this.playerRespawnTimer > 0 ||
        this.winner ||
        this.teleportPhase !== 'NONE'
      ) {
        this.finishHoldingRabbitEscape();
      } else {
        this.rabbitHoldElapsedSec += dt;
        this.rabbitHoldSpawnAccSec += dt;

        // Continuously deplete Cursed Energy while holding M2
        const drainPerSec = this.hero.secondaryFire.manaDrainPerSec ?? 22;
        this.consumeCursedEnergy(drainPerSec * dt);

        // Keep Megumi riding directly atop the rabbit pile as it builds up from the ground
        this.playerPos.x = THREE.MathUtils.lerp(this.playerPos.x, this.rabbitPileBasePos.x, Math.min(1, dt * 8));
        this.playerPos.z = THREE.MathUtils.lerp(this.playerPos.z, this.rabbitPileBasePos.z, Math.min(1, dt * 8));
        this.playerVel.x *= 0.6;
        this.playerVel.z *= 0.6;
        this.playerVel.y = 5.2;
        this.grounded = false;
        this.rabbitLaunchBoostTimer = 0.55;
        this.nueCarryAvailable = true;

        // Pile additional dense waves of persistent 20-HP rabbits every 0.095s while M2 is held
        const spawnInterval = 0.095;
        if (this.rabbitHoldSpawnAccSec >= spawnInterval) {
          this.rabbitHoldSpawnAccSec -= spawnInterval;
          const inShadowGarden = Boolean(this.activeDomain?.isMegumiDomain);
          const pileTopY = this.spawnRabbitEscapeBatch(inShadowGarden ? 5 : 4, true);
          this.playerPos.y = Math.max(this.playerPos.y, pileTopY);
          this.spawnCursedBurst(
            new THREE.Vector3(this.rabbitPileBasePos.x, pileTopY, this.rabbitPileBasePos.z),
            'SHADOW',
            1.35,
            16
          );
        }

        if (this.rabbitHoldElapsedSec >= maxHoldSec || !this.canSpendCursedEnergy()) {
          this.finishHoldingRabbitEscape();
        }
      }
    }

    if (
      this.nueCarryAvailable &&
      !this.isHoldingRabbitEscape &&
      this.nueCarryDelaySec <= 0 &&
      !this.grounded &&
      this.keys.has('Space') &&
      this.teleportPhase === 'NONE' &&
      !this.meteorAiming &&
      this.shadowStepTimer <= 0
    ) {
      this.startNueCarry();
    }

    let isNueCarrying = false;
    if (this.nueCarryTimer > 0) {
      if (!this.keys.has('Space') || this.shadowStepTimer > 0 || this.playerRespawnTimer > 0 || this.winner) {
        this.endNueCarry();
      } else {
        isNueCarrying = true;
        this.nueCarryTimer = Math.max(0, this.nueCarryTimer - dt);
        const lookForward = new THREE.Vector3(
          -Math.sin(this.yaw) * Math.cos(this.pitch),
          Math.sin(this.pitch),
          -Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();
        const carryDir = new THREE.Vector3();
        if (moveForward !== 0 || moveRight !== 0) {
          carryDir.addScaledVector(lookForward, moveForward).addScaledVector(rightVec, moveRight);
          if (carryDir.lengthSq() > 0.001) carryDir.normalize();
          else carryDir.copy(lookForward);
        } else {
          carryDir.copy(lookForward);
        }
        const carrySpeed = 20.5;
        this.playerVel.set(carryDir.x * carrySpeed, carryDir.y * carrySpeed, carryDir.z * carrySpeed);
        this.grounded = false;
        if (this.nueCarryTimer <= 0) {
          this.endNueCarry();
        }
      }
    }

    this.isSkyHovering = false;
    if (!isNueCarrying && !isSkyPulling && !this.uroAerialSlamActive && !this.isHoldingRabbitEscape) {
      if (this.keys.has('Space') && this.grounded && this.teleportPhase === 'NONE' && !this.meteorAiming) {
        this.playerVel.y = this.hero.id === 'uro' ? 13.5 : 11.2;
        this.grounded = false;
      }

      const uroInDomain = this.hero.id === 'uro' && Boolean(this.activeDomain?.isUroDomain);
      if (
        this.hero.id === 'uro' &&
        !this.grounded &&
        this.uroFlightTimer > 0 &&
        this.teleportPhase === 'NONE' &&
        !this.meteorAiming &&
        this.playerVel.y <= 3.5
      ) {
        // Active Sky Flight from [SHIFT]: buoyant 3D hover/flight (aim up + W or hold SPACE to climb)
        this.isSkyHovering = true;
        const wantClimb = this.keys.has('Space') || (moveForward > 0 && Math.sin(this.pitch) > 0.18);
        const targetVy = wantClimb ? 5.2 : -0.6;
        this.playerVel.y = THREE.MathUtils.lerp(this.playerVel.y, targetVy, Math.min(1, dt * 8));
      } else if (
        this.hero.id === 'uro' &&
        !this.grounded &&
        this.keys.has('Space') &&
        this.teleportPhase === 'NONE' &&
        !this.meteorAiming &&
        this.playerVel.y <= 1.8
      ) {
        // Passive: Surface of the Sky — hold SPACE midair to glide & hover across the sky
        this.isSkyHovering = true;
        if (uroInDomain) {
          const lift = Math.sin(this.pitch) > 0.22 ? 6.5 : 0.0;
          this.playerVel.y = THREE.MathUtils.lerp(this.playerVel.y, lift, Math.min(1, dt * 10));
        } else {
          this.playerVel.y = Math.max(-1.6, this.playerVel.y - 6.0 * dt);
        }
      } else if (this.rabbitLaunchBoostTimer > 0) {
        this.rabbitLaunchBoostTimer = Math.max(0, this.rabbitLaunchBoostTimer - dt);
        // Lighter gravity during Rabbit Escape upward momentum so Megumi soars high with hang-time
        this.playerVel.y -= 13.5 * dt;
      } else if (this.skyPullBoostTimer > 0) {
        this.skyPullBoostTimer = Math.max(0, this.skyPullBoostTimer - dt);
        // Buoyant hang-time after Uro's Sky Pull
        this.playerVel.y -= 12.5 * dt;
      } else if (uroInDomain) {
        this.playerVel.y -= 15.0 * dt;
      } else {
        this.playerVel.y -= 28.0 * dt;
      }
    }

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    // Enforce Domain barrier boundary for player: trapped players cannot leave, outside players cannot enter
    for (const dom of this.activeDomains) {
      const c = dom.clampPosition(
        { x: this.playerPos.x, z: this.playerPos.z, y: this.playerPos.y },
        0.65,
        dom.isPlayerTrapped
      );
      this.playerPos.x = c.x;
      this.playerPos.z = c.z;
    }

    this.playerPos.y = Math.min(48, this.playerPos.y + this.playerVel.y * dt);
    const floorY = this.mapBuilder.getFloorHeight(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    if (this.playerPos.y <= floorY) {
      const wasAerialSlam = this.uroAerialSlamActive;
      this.playerPos.y = floorY;
      this.playerVel.y = 0;
      this.grounded = true;
      this.rabbitLaunchBoostTimer = 0;
      this.skyPullBoostTimer = 0;
      this.uroFlightTimer = 0;
      this.isSkyHovering = false;
      if (wasAerialSlam) {
        this.detonateUroAerialThinIceSlam();
      }
      if (this.nueCarryTimer <= 0) {
        this.nueCarryAvailable = false;
      }
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
    const eyeHeight = this.shadowStepTimer > 0 ? 0.62 : 1.72;
    const eye = new THREE.Vector3(this.playerPos.x, this.playerPos.y + eyeHeight, this.playerPos.z);
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

  private updateDomains(dt: number, elapsed: number) {
    for (let i = this.activeDomains.length - 1; i >= 0; i--) {
      const dom = this.activeDomains[i];

      // Check if caster is still alive
      if (dom.casterId === 'player') {
        if (this.playerRespawnTimer > 0) {
          if (dom.isGojoDomain) {
            if (this.playerDomainAudio) {
              try { this.playerDomainAudio.stop(); this.playerDomainAudio.disconnect(); } catch {}
              this.playerDomainAudio = null;
            }
            if (this.playerVoiceAudio && !dom.purpleTriggered) {
              try { this.playerVoiceAudio.stop(); this.playerVoiceAudio.disconnect(); } catch {}
              this.playerVoiceAudio = null;
            }
          }
          dom.cleanup(this.scene);
          this.activeDomains.splice(i, 1);
          continue;
        }
      } else {
        const caster = this.units.find((u) => u.id === dom.casterId);
        if (!caster || !caster.alive) {
          dom.cleanup(this.scene);
          this.activeDomains.splice(i, 1);
          continue;
        }
      }

      // Brigitte's Rally follows the player
      if (dom.isRally && dom.casterId === 'player') {
        dom.center.copy(this.playerPos);
        dom.domeMesh.position.copy(this.playerPos);
        dom.ringMesh.position.set(this.playerPos.x, this.playerPos.y + 0.08, this.playerPos.z);
        this.shield = Math.min(200, this.shield + 35 * dt);
        this.hp = Math.min(this.maxHp, this.hp + 25 * dt);
      }

      const res = dom.update(dt, elapsed, this.camera.position);

      if (res.isExpired) {
        if (dom.hp <= 0) {
          this.shatterDomain(dom);
        } else {
          if (dom.isGojoDomain && dom.casterId === 'player') {
            if (this.playerDomainAudio) {
              try { this.playerDomainAudio.stop(); this.playerDomainAudio.disconnect(); } catch {}
              this.playerDomainAudio = null;
            }
            if (this.playerVoiceAudio && !dom.purpleTriggered) {
              try { this.playerVoiceAudio.stop(); this.playerVoiceAudio.disconnect(); } catch {}
              this.playerVoiceAudio = null;
            }
          }
          this.onDomainEnded(dom);
          dom.cleanup(this.scene);
          const idx = this.activeDomains.indexOf(dom);
          if (idx !== -1) this.activeDomains.splice(idx, 1);
        }
        continue;
      }

      if (res.shouldTickDamage) {
        // Trapped player takes tick damage if inside an enemy domain
        if (dom.isPlayerTrapped && dom.isEnemy('blue') && this.playerRespawnTimer <= 0) {
          if (dom.isJogoDomain) {
            this.spawnCursedBurst(this.playerPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 'FIRE', 1.2, 22);
            this.applyDamageToPlayer(20, `${dom.casterName} (Burn)`, dom.casterTeam);
          } else {
            this.spawnPillarEffect(this.playerPos, 0.9, 10, dom.color, 0.45);
            this.applyDamageToPlayer(10, `${dom.casterName} (${dom.name})`, dom.casterTeam);
          }
        }

        // Trapped enemy units receive domain tick damage (Jogo burns -20 HP/sec; Megumi sinks enemies in shadow)
        for (const u of this.units) {
          if (!u.alive || !dom.isEnemy(u.team) || !dom.isTrapped(u.id)) continue;
          const hitPos = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.8, 0));
          if (dom.isJogoDomain) {
            this.spawnCursedBurst(hitPos, 'FIRE', 1.15, 22);
            this.damageUnit(u, 20, false, dom.name, hitPos, 'BURN');
          } else if (dom.isMegumiDomain) {
            this.spawnCursedBurst(u.group.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 'SHADOW', 1.2, 20);
            this.damageUnit(u, 14, false, dom.name, hitPos, 'SHADOW SINK');
          } else if (dom.isUroDomain) {
            this.spawnCursedBurst(hitPos, 'SKY', 1.25, 22);
            this.damageUnit(u, 22, false, dom.name, hitPos, 'SKY SHEAR');
          } else {
            this.spawnPillarEffect(u.group.position, 0.9, 10, dom.color, 0.45);
            const tickDmg = dom.isGojoDomain ? 18 : 12;
            this.damageUnit(u, tickDmg, false, dom.name, hitPos);
          }
        }
      }
    }
  }

  private updateMobaUnits(dt: number, elapsed: number) {
    this.camera.updateMatrixWorld();
    this.hpBarProjScreenMat.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.hpBarFrustum.setFromProjectionMatrix(this.hpBarProjScreenMat);
    const hasTrackingShikigami = this.units.some(
      (u) =>
        u.alive &&
        u instanceof ShikigamiEntity &&
        u.tracksLowHpThroughWalls &&
        u.team === 'blue'
    );

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];

      if (!u.alive) {
        if (u.npcAi) this.resetNpcAiOnDeath(u);
        if (u.heroDef?.id === 'megumi') this.resetNpcMegumiShowcase(u);
        if (u.type === 'HERO' && u.respawnTimer !== undefined) {
          u.respawnTimer -= dt;
          if (u.respawnTimer <= 0 && u.spawnPos) {
            u.alive = true;
            u.hp = u.maxHp;
            u.hpBarRevealTimer = 0;
            u.group.position.copy(u.spawnPos);
            u.group.visible = true;
            if (u.npcAi) {
              u.npcAi.ce = u.npcAi.maxCe;
              u.npcAi.burnout = 0;
              u.npcAi.busy = 0;
              u.npcAi.cd = { red: 2, blue: 4, shift: 1, infinity: 3, domain: 2.0 };
            }
          }
        } else if (u.type === 'MINION' || u.type === 'SHIKIGAMI' || u.type === 'CONSTRUCT') {
          this.units.splice(i, 1);
        }
        continue;
      }

      if (u.hpBarRevealTimer && u.hpBarRevealTimer > 0) {
        u.hpBarRevealTimer = Math.max(0, u.hpBarRevealTimer - dt);
      }

      const hpRatio = Math.max(0.001, u.hp / u.maxHp);
      u.hpBarFill.scale.x = hpRatio;
      const fillMat = u.hpBarFill.material as THREE.MeshBasicMaterial;
      if (fillMat && fillMat.color) {
        // 80–100%: White (0xffffff), 50–79%: Yellow (0xfacc15), 1–49%: Red (0xef4444)
        const hpPct = Math.round(hpRatio * 100);
        fillMat.color.setHex(hpPct >= 80 ? 0xffffff : hpPct >= 50 ? 0xfacc15 : 0xef4444);
      }
      const hpBarTarget = u.hpBarFill.parent?.userData.isHpBarRoot ? u.hpBarFill.parent : u.hpBarFill;
      this.hpBarWorldPos.set(
        u.group.position.x,
        u.group.position.y + hpBarTarget.position.y,
        u.group.position.z
      );
      const showHpBar = this.shouldRenderUnitHealthBar(
        u,
        this.hpBarWorldPos,
        hasTrackingShikigami
      );
      hpBarTarget.visible = showHpBar;
      if (showHpBar) {
        hpBarTarget.lookAt(this.camera.position);
      }
      if (u.nameplateMesh) {
        u.nameplateMesh.visible = showHpBar;
        if (showHpBar) {
          u.nameplateMesh.lookAt(this.camera.position);
        }
      }
      if (u.type === 'CONSTRUCT') {
        continue;
      }
      if (u.headMesh && (u.type === 'TOWER' || u.type === 'CORE')) {
        u.headMesh.rotation.y = elapsed * 1.8;
        u.headMesh.rotation.x = elapsed * 1.1;
      }

      // Polymorphic Shikigami tick (lifetime decay, Toad pull, Nue dive, Mahoraga Dharma Wheel & rogue transition)
      if (u instanceof ShikigamiEntity) {
        const expired = u.tickShikigami(dt, elapsed, this.getShikigamiContext());
        if (expired) {
          this.units.splice(i, 1);
          continue;
        }
        if (
          u instanceof ToadShikigami ||
          u instanceof NueShikigami ||
          u instanceof NueCarryShikigami ||
          (u instanceof RabbitEscapeShikigami && u.stacked)
        ) {
          continue;
        }
      }

      // Gravity for airborne units (e.g. lifted skyward by Lapse Blue) once active pull ends
      if (u.pullActiveTimer && u.pullActiveTimer > 0) {
        u.pullActiveTimer = Math.max(0, u.pullActiveTimer - dt);
      } else if (u.type !== 'TOWER' && u.type !== 'CORE') {
        const inMegumiShadowSink = this.activeDomains.some(
          (d) => d.isMegumiDomain && d.isEnemy(u.team) && d.isTrapped(u.id)
        );
        const sinkOffset = inMegumiShadowSink ? -0.52 : 0;
        const floorY =
          this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y) + sinkOffset;
        if (u.group.position.y > floorY) {
          u.verticalVel = (u.verticalVel ?? 0) - 28.0 * dt;
          u.group.position.y = Math.max(floorY, u.group.position.y + u.verticalVel * dt);
          if (u.group.position.y <= floorY) {
            u.verticalVel = 0;
          }
        } else {
          u.group.position.y = floorY;
          u.verticalVel = 0;
        }
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

      // Out-of-combat Health Regeneration after 5 seconds of not sustaining damage
      if (u.outOfCombatTimer && u.outOfCombatTimer > 0) {
        u.outOfCombatTimer = Math.max(0, u.outOfCombatTimer - dt);
      } else if (u.alive && u.hp < u.maxHp && (u.type === 'HERO' || u.isDummy)) {
        const regenRate = u.isDummy && !u.isRoamer ? 95 : Math.max(25, u.maxHp * 0.08);
        u.hp = Math.min(u.maxHp, u.hp + regenRate * dt);
      }

      // Hero Training Dummies stay at their sparring stations (or roam the map if isRoamer)
      if (u.isDummy) {
        if (!u.isRoamer && u.spawnPos && u.group.position.distanceTo(u.spawnPos) > 0.05) {
          u.group.position.lerp(u.spawnPos, Math.min(1, dt * 4.5));
        }

        // AI-driven combatant (Gojo): full move kit, CE pool, cooldowns, domain & purple
        if (u.npcAi) {
          this.updateNpcGojoAi(u, dt, elapsed);
          continue;
        }

        if (u.heroDef?.id === 'megumi' && this.updateNpcMegumiShowcase(u, dt, elapsed)) {
          this.updateNpcHeroAbilities(u, dt, elapsed);
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
              const activeSpeed = (phase === 'walk' ? 3.15 : u.moveSpeed) * domainSlow;
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
              const roamerFloorY = this.mapBuilder.getFloorHeight(
                u.group.position.x,
                u.group.position.z,
                u.group.position.y
              );
              if (u.group.position.y < roamerFloorY) {
                u.group.position.y = roamerFloorY;
              }
              this.rotateUnitToward(u, dx, dz, dt);

              const moved = Math.hypot(u.group.position.x - prevX, u.group.position.z - prevZ);
              if (moved < step * 0.25) {
                u.roamTarget = this.pickRandomRoamTarget(u.radius);
              }
            }
          } else {
            this.clampUnitToDomainBarrier(u);
          }
          if (u.animOverrideTimer && u.animOverrideTimer > 0) {
            u.animOverrideTimer = Math.max(0, u.animOverrideTimer - dt);
          }
          const activeAnimHint =
            u.animOverrideTimer && u.animOverrideTimer > 0 && u.animOverrideHint
              ? u.animOverrideHint
              : phase;
          u.animateRig?.(elapsed, movingNow, false, activeAnimHint);
          this.updateNpcHeroAbilities(u, dt, elapsed);
        } else {
          if (u.animOverrideTimer && u.animOverrideTimer > 0) {
            u.animOverrideTimer = Math.max(0, u.animOverrideTimer - dt);
          }
          const activeAnimHint =
            u.animOverrideTimer && u.animOverrideTimer > 0 ? u.animOverrideHint : undefined;
          u.animateRig?.(elapsed, false, false, activeAnimHint);
          this.updateNpcHeroAbilities(u, dt, elapsed);
        }
        continue;
      }

      let bestTargetUnit: MobaUnit | null = null;
      let bestDist = Infinity;
      let targetIsPlayer = false;
      const isShikigami = u instanceof ShikigamiEntity;

      if (isShikigami) {
        const chosen = u.selectTarget(this.getShikigamiContext());
        if (chosen) {
          bestTargetUnit = chosen.unit as MobaUnit | null;
          targetIsPlayer = chosen.targetPlayer;
          bestDist = chosen.distance;
        }
      } else {
        for (const other of this.units) {
          if (!other.alive || other.team === u.team || other.isDummy) continue;
          const d = u.group.position.distanceTo(other.group.position);
          if (d < bestDist) {
            bestDist = d;
            bestTargetUnit = other;
          }
        }

        const playerDetectable = this.playerRespawnTimer <= 0 && this.shadowStepTimer <= 0;
        if (u.team === 'red' && playerDetectable) {
          const distToPlayer = u.group.position.distanceTo(this.playerPos);
          if (distToPlayer < bestDist && distToPlayer <= Math.max(u.attackRange * 1.35, 28)) {
            bestDist = distToPlayer;
            targetIsPlayer = true;
            bestTargetUnit = null;
          }
        }
      }

      const isMovingUnit =
        u.moveSpeed > 0 &&
        bestDist > u.attackRange * 0.85 &&
        !(u instanceof MahoragaShikigami && !u.canMoveNow());
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
          const nextX = u.group.position.x + dir.x * u.moveSpeed * inDomainSlow * dt;
          const nextZ = u.group.position.z + dir.z * u.moveSpeed * inDomainSlow * dt;
          if (isShikigami) {
            const res = this.mapBuilder.resolveHorizontalCollision(
              nextX,
              nextZ,
              u.radius,
              u.group.position.y
            );
            u.group.position.x = res.x;
            u.group.position.z = res.z;
          } else {
            u.group.position.x = nextX;
            u.group.position.z = nextZ;
          }
          this.clampUnitToDomainBarrier(u);
          if (u.type === 'HERO' || isShikigami) {
            this.rotateUnitToward(u, dir.x, dir.z, dt);
          }
        }
      } else {
        if ((u.type === 'HERO' || isShikigami) && (targetIsPlayer || bestTargetUnit)) {
          const faceGoal = targetIsPlayer
            ? this.playerPos
            : bestTargetUnit!.group.position;
          const fdx = faceGoal.x - u.group.position.x;
          const fdz = faceGoal.z - u.group.position.z;
          if (fdx * fdx + fdz * fdz > 0.01) {
            this.rotateUnitToward(u, fdx, fdz, dt);
          }
        }
        this.clampUnitToDomainBarrier(u);
      }

      u.attackTimer -= dt;
      const canUnitAttack =
        (this.aiAttackingEnabled || isShikigami) &&
        !(u instanceof MahoragaShikigami && !u.canMoveNow());
      if (canUnitAttack && u.attackTimer <= 0 && bestDist <= u.attackRange) {
        u.attackTimer = u.attackCooldown;
        const origin = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.75, 0));
        const beamCol = isShikigami ? u.beamColor : u.team === 'blue' ? '#38bdf8' : '#f43f5e';
        const mahoragaAtk =
          u instanceof MahoragaShikigami ? u.triggerNextCombatAttack() : null;
        const attackSourceLabel = mahoragaAtk ? mahoragaAtk.attackName : u.name;

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
              this.shatterDomain(dom, u.name);
            }
          } else {
            const playerChest = this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
            if (mahoragaAtk) {
              this.spawnMeleeArcVfx(
                origin.clone().lerp(playerChest, 0.55),
                mahoragaAtk.isKick ? 3.2 : 3.8,
                '#facc15'
              );
            } else {
              this.spawnBeamTracer(origin, playerChest, beamCol, 0.18, 0.06);
            }
            if (u instanceof MahoragaShikigami) {
              u.notifyAttackLanded();
            }
            this.applyDamageToPlayer(u.attackDamage, attackSourceLabel, u.team);
            if (mahoragaAtk?.isKick) {
              const kickDir = this.playerPos.clone().sub(u.group.position);
              kickDir.y = 0;
              if (kickDir.lengthSq() > 0.01) {
                kickDir.normalize();
                this.playerVel.x += kickDir.x * 14.0;
                this.playerVel.z += kickDir.z * 14.0;
                this.playerVel.y = Math.max(this.playerVel.y, 7.5);
                this.grounded = false;
              }
            }
          }
        } else if (bestTargetUnit) {
          const targetCenter = bestTargetUnit.group.position
            .clone()
            .add(new THREE.Vector3(0, bestTargetUnit.height * 0.65, 0));
          if (mahoragaAtk) {
            this.spawnMeleeArcVfx(
              origin.clone().lerp(targetCenter, 0.55),
              mahoragaAtk.isKick ? 3.2 : 3.8,
              '#facc15'
            );
          } else {
            this.spawnBeamTracer(origin, targetCenter, beamCol, 0.16, 0.05);
          }

          if (
            isShikigami &&
            (u.isAlliedToSummoner || u instanceof MahoragaShikigami) &&
            (bestTargetUnit.team !== u.team || u instanceof MahoragaShikigami)
          ) {
            if (u instanceof MahoragaShikigami) {
              u.notifyAttackLanded();
            }
            this.damageUnit(
              bestTargetUnit,
              u.attackDamage,
              u instanceof MahoragaShikigami,
              attackSourceLabel,
              targetCenter,
              mahoragaAtk ? (mahoragaAtk.isKick ? 'SPARTAN KICK!' : 'SWORD OF EXTERMINATION!') : undefined
            );
            this.spawnCursedBurst(targetCenter, u.attackBurstVariant, 0.9, 18);
            if (mahoragaAtk && bestTargetUnit.alive && bestTargetUnit.moveSpeed > 0) {
              const pushDir = bestTargetUnit.group.position.clone().sub(u.group.position);
              pushDir.y = 0;
              if (pushDir.lengthSq() > 0.01) {
                pushDir.normalize();
                this.KnockbackUnitWithWallSlam(
                  bestTargetUnit,
                  pushDir,
                  mahoragaAtk.knockback,
                  mahoragaAtk.isKick ? 28 : 16
                );
              }
            }
          } else {
            let dealt = u.attackDamage;
            if (bestTargetUnit instanceof ShikigamiEntity) {
              dealt = bestTargetUnit.modifyIncomingDamage(
                dealt,
                u.name,
                targetCenter,
                this.getShikigamiContext()
              ).finalDamage;
            }
            bestTargetUnit.hp = Math.max(0, bestTargetUnit.hp - dealt);

            if (bestTargetUnit.hp <= 0) {
              bestTargetUnit.alive = false;
              if (bestTargetUnit.type === 'HERO') {
                bestTargetUnit.respawnTimer = 8.0;
                bestTargetUnit.group.visible = false;
              } else {
                if (bestTargetUnit instanceof ShikigamiEntity) {
                  const yOff = bestTargetUnit.shikigamiKind === 'NUE' ? 0 : bestTargetUnit.height * 0.45;
                  const cloudCenter = bestTargetUnit.group.position
                    .clone()
                    .add(new THREE.Vector3(0, yOff, 0));
                  const cloudRadius = Math.max(
                    0.85,
                    Math.max(bestTargetUnit.radius, bestTargetUnit.height * 0.65)
                  );
                  this.spawnShikigamiShadowCloud(cloudCenter, cloudRadius);
                }
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
    if (u.npcShieldAudio) {
      try {
        u.npcShieldAudio.stop();
        u.group.remove(u.npcShieldAudio);
        u.npcShieldAudio.disconnect();
      } catch {}
      u.npcShieldAudio = undefined;
    }
    if (u.npcAi) u.npcAi.infinityHold = 0;
    this.endNpcDomain(u.id);
  }

  private resetNpcMegumiShowcase(u: MobaUnit) {
    this.npcMegumiShowcase = null;
    this.releaseStackedRabbits(u.id);
    if (this.npcMegumiPuddleMesh) {
      this.npcMegumiPuddleMesh.visible = false;
    }
    u.group.scale.set(1, 1, 1);
    u.pullActiveTimer = 0;
    const shikiCtx = this.getShikigamiContext();
    for (let i = this.units.length - 1; i >= 0; i--) {
      const carry = this.units[i];
      if (carry instanceof NueCarryShikigami && carry.summonerId === u.id) {
        carry.onDespawn(shikiCtx);
        this.units.splice(i, 1);
      }
    }
    this.endNpcDomain(u.id);
  }

  private spawnNpcMegumiRabbitBatch(
    u: MobaUnit,
    spawnCount: number,
    stacked = true,
    pileBase?: THREE.Vector3
  ): number {
    const maxNpcRabbits = 44;
    const existingRabbits = this.units.filter(
      (r): r is RabbitEscapeShikigami =>
        r.alive && r instanceof RabbitEscapeShikigami && r.summonerId === u.id
    );
    let excess = existingRabbits.length + spawnCount - maxNpcRabbits;
    const shikiCtx = this.getShikigamiContext();
    const despawnOrder = [
      ...existingRabbits.filter((r) => !r.stacked),
      ...existingRabbits.filter((r) => r.stacked)
    ];
    for (let i = 0; i < despawnOrder.length && excess > 0; i++) {
      const old = despawnOrder[i];
      old.onDespawn(shikiCtx);
      const idx = this.units.indexOf(old);
      if (idx !== -1) this.units.splice(idx, 1);
      excess--;
    }

    const stackedCount = this.units.filter(
      (r): r is RabbitEscapeShikigami =>
        r.alive && r instanceof RabbitEscapeShikigami && r.summonerId === u.id && r.stacked
    ).length;
    const base =
      pileBase ??
      new THREE.Vector3(
        u.group.position.x,
        this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y),
        u.group.position.z
      );
    let pileTopY = base.y;

    for (let i = 0; i < spawnCount; i++) {
      const stackIdx = stackedCount + i;
      const angle = stackIdx * 2.39996 + Math.random() * 0.32;
      if (stacked) {
        const rabbitsPerLayer = 4;
        const layer = Math.floor(stackIdx / rabbitsPerLayer);
        const slot = stackIdx % rabbitsPerLayer;
        const baseTaper = Math.max(0.42, 1.08 - layer * 0.055);
        const ringR = baseTaper * (0.48 + (slot / rabbitsPerLayer) * 0.65);
        const offX = Math.cos(angle) * ringR;
        const offZ = Math.sin(angle) * ringR;
        const layerY = base.y + layer * 0.44 + (slot % 2) * 0.08;
        pileTopY = Math.max(pileTopY, layerY + 0.52);

        const rabbit = new RabbitEscapeShikigami({
          spawnPos: new THREE.Vector3(base.x + offX, layerY, base.z + offZ),
          team: u.team,
          summonerId: u.id,
          hopPhase: Math.random() * Math.PI * 2,
          scatterAngle: angle,
          stacked: true,
          createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
        });
        this.scene.add(rabbit.group);
        this.units.push(rabbit);
      } else {
        const dist = 1.0 + Math.random() * 1.9;
        const rx = u.group.position.x + Math.cos(angle) * dist;
        const rz = u.group.position.z + Math.sin(angle) * dist;
        const res = this.mapBuilder.resolveHorizontalCollision(rx, rz, 0.42, 0);
        const groundY = this.mapBuilder.getFloorHeight(res.x, res.z, 0);
        const rabbit = new RabbitEscapeShikigami({
          spawnPos: new THREE.Vector3(res.x, groundY, res.z),
          team: u.team,
          summonerId: u.id,
          hopPhase: Math.random() * Math.PI * 2,
          scatterAngle: angle,
          createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
        });
        this.scene.add(rabbit.group);
        this.units.push(rabbit);
      }
    }
    return pileTopY;
  }

  private updateNpcMegumiShowcase(u: MobaUnit, dt: number, elapsed: number): boolean {
    const st = this.npcMegumiShowcase;
    if (!st) return false;

    st.timer -= dt;

    // 1. [Hold M2] Rabbit Escape: piles up densely from the ground beneath Megumi until released
    if (st.mode === 'RABBIT_CLIMB') {
      u.pullActiveTimer = 0.15;
      const pileBase = st.pileBase ?? u.group.position.clone();
      u.group.position.x = pileBase.x;
      u.group.position.z = pileBase.z;
      this.clampUnitToDomainBarrier(u);
      this.rotateUnitToward(u, st.dir.x, st.dir.z, dt);
      u.animateRig?.(elapsed, true, false, 'megumi_upward_slash');

      st.spawnAcc += dt;
      const spawnInterval = 0.095;
      if (st.spawnAcc >= spawnInterval) {
        st.spawnAcc -= spawnInterval;
        const inShadowGarden = this.activeDomains.some((d) => d.casterId === u.id && d.isMegumiDomain);
        const pileTopY = this.spawnNpcMegumiRabbitBatch(u, inShadowGarden ? 5 : 4, true, pileBase);
        u.group.position.y = Math.max(u.group.position.y, pileTopY);
        this.spawnCursedBurst(
          new THREE.Vector3(pileBase.x, pileTopY, pileBase.z),
          'SHADOW',
          1.35,
          16
        );
      } else {
        u.group.position.y = Math.min(12.0, u.group.position.y + 4.2 * dt);
      }

      if (st.timer <= 0) {
        // Release the stacked rabbit pile so all rabbits burst apart and swarm nearby enemies!
        this.releaseStackedRabbits(u.id);
        u.group.position.y += 1.2;
        // Transition midair into [Hold SPACE] Nue Carry Flight (2.0s duration, exact same as player startNueCarry)
        st.mode = 'NUE_CARRY';
        st.timer = 2.0;
        const nueCarry = new NueCarryShikigami({
          spawnPos: u.group.position.clone().add(new THREE.Vector3(0, 2.75, 0)),
          team: u.team,
          summonerId: u.id,
          getCarrierPos: () => u.group.position,
          getYaw: () => u.group.rotation.y + Math.PI,
          lifetimeSec: 2.0,
          createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
        });
        this.scene.add(nueCarry.group);
        this.units.push(nueCarry);
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 1.8, 0)), '#38bdf8', 3.4);
        this.spawnCursedBurst(u.group.position.clone().add(new THREE.Vector3(0, 2.0, 0)), 'BLUE', 1.5, 32);
      }
      return true;
    }

    // 2. [Hold SPACE] Nue Carry Flight: Nue hovers overhead gripping Megumi and carries him for 2.0s
    if (st.mode === 'NUE_CARRY') {
      u.pullActiveTimer = 0.15;
      const toCenter = new THREE.Vector3(-u.group.position.x, 0, 26 - u.group.position.z);
      if (toCenter.lengthSq() > 64) {
        toCenter.normalize();
        st.dir.lerp(toCenter, dt * 1.4).normalize();
      }
      const carrySpeed = 20.5;
      const res = this.mapBuilder.resolveHorizontalCollision(
        u.group.position.x + st.dir.x * carrySpeed * 0.65 * dt,
        u.group.position.z + st.dir.z * carrySpeed * 0.65 * dt,
        u.radius,
        u.group.position.y
      );
      u.group.position.x = res.x;
      u.group.position.z = res.z;
      u.group.position.y = Math.max(4.5, u.group.position.y + Math.sin(elapsed * 3.5) * 1.2 * dt);
      this.clampUnitToDomainBarrier(u);
      this.rotateUnitToward(u, st.dir.x, st.dir.z, dt);
      u.animateRig?.(elapsed, false, false, 'idle');

      if (st.timer <= 0) {
        u.pullActiveTimer = 0;
        u.verticalVel = -2.0;
        this.npcMegumiShowcase = null;
      }
      return true;
    }

    // 3. [SHIFT] Shadow Step: sink into floor shadows for 2.4s (+45% speed), then emerge
    if (st.mode === 'SHADOW_STEP') {
      const floorY = this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y);
      u.group.position.y = floorY;
      u.group.scale.set(1.05, 0.14, 1.05);
      const glideSpeed = u.moveSpeed * 1.45 * this.getDomainSlowMultiplier(u);
      const res = this.mapBuilder.resolveHorizontalCollision(
        u.group.position.x + st.dir.x * glideSpeed * dt,
        u.group.position.z + st.dir.z * glideSpeed * dt,
        u.radius,
        floorY
      );
      u.group.position.x = res.x;
      u.group.position.z = res.z;
      this.clampUnitToDomainBarrier(u);
      this.rotateUnitToward(u, st.dir.x, st.dir.z, dt);
      if (this.npcMegumiPuddleMesh) {
        this.npcMegumiPuddleMesh.visible = true;
        this.npcMegumiPuddleMesh.position.set(u.group.position.x, floorY + 0.08, u.group.position.z);
        this.npcMegumiPuddleMesh.rotation.y += dt * 2.5;
      }

      if (st.timer <= 0) {
        u.group.scale.set(1, 1, 1);
        if (this.npcMegumiPuddleMesh) {
          this.npcMegumiPuddleMesh.visible = false;
        }
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 0.15, 0)), '#818cf8', 2.4);
        this.spawnCursedBurst(u.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 'SHADOW', 1.2, 28);
        this.npcMegumiShowcase = null;
      }
      return true;
    }

    // 4. [Q] Chimera Shadow Garden -> [Q] Summon Mahoraga (ends Domain)
    if (st.mode === 'DOMAIN_MAHORAGA') {
      u.animateRig?.(elapsed, false, false, 'megumi_thrust_slash');
      if (st.timer <= 0) {
        this.npcMegumiShowcase = null;
        const ownDomain = this.activeDomains.find((d) => d.casterId === u.id);
        if (ownDomain) {
          ownDomain.purpleTriggered = true;
          this.endNpcDomain(u.id);
        }

        const hasLivingMahoraga = this.units.some(
          (m) => m.alive && m instanceof MahoragaShikigami
        );
        if (!hasLivingMahoraga) {
          const rawSpawn = u.group.position.clone().addScaledVector(st.dir, 4.2);
          const res = this.mapBuilder.resolveHorizontalCollision(rawSpawn.x, rawSpawn.z, 1.1, u.group.position.y);
          const spawnPos = new THREE.Vector3(
            res.x,
            this.mapBuilder.getFloorHeight(res.x, res.z, u.group.position.y),
            res.z
          );
          const mahoraga = new MahoragaShikigami({
            spawnPos,
            ownerTeam: u.team,
            summonerId: u.id,
            createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team),
            createNameplate: (parent, y, text, col) => this.createHeroNameplate(parent, y, text, col)
          });
          this.scene.add(mahoraga.group);
          this.units.push(mahoraga);
          this.spawnImpactRing(spawnPos.clone().add(new THREE.Vector3(0, 0.2, 0)), '#facc15', 7.5);
          this.spawnCursedBurst(spawnPos.clone().add(new THREE.Vector3(0, 1.6, 0)), 'SHADOW', 3.4, 95);
        }
      }
      return true;
    }

    return false;
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
      if (ai.burnout === 0) ai.ce = Math.min(ai.maxCe, 80);
    } else if (ai.infinityHold > 0) {
      ai.infinityHold -= dt;
      this.npcSpendCe(u, (hero.abilities.E.manaDrainPerSec ?? 30) * dt);
      u.npcShieldTimer = 0.3;
      if (ai.infinityHold <= 0 || ai.ce <= 25) {
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

    const playerAlive = this.playerRespawnTimer <= 0 && !this.winner && this.shadowStepTimer <= 0;
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
          spd = 3.15;
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
          spd = 3.15;
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
    const ownDomain = this.activeDomains.find((d) => d.casterId === u.id) ?? null;
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
    const npcFloorY = this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y);
    if (u.group.position.y < npcFloorY) {
      u.group.position.y = npcFloorY;
    }
    u.animateRig?.(elapsed, movedNow && spd > 0, false, casting || busy ? 'idle' : phase);

    // ── Decisions ──
    if (!this.aiAttackingEnabled || busy || ai.burnout > 0 || ai.think > 0) return;
    ai.think = 0.25 + Math.random() * 0.25;

    // Inside his own Domain: let the player feel the void, then finish with Hollow Purple
    if (ownDomain) {
      if (!ownDomain.purpleTriggered && ownDomain.ageSec >= 2.4 && ai.ce >= 35 && playerAlive) {
        this.npcCastPurple(u, ownDomain);
      } else if (ai.cd.red <= 0 && ai.ce >= 20 && playerAlive) {
        this.npcCastRed(u);
      }
      return;
    }
    if (!playerAlive || d > 60) return;
    if (ai.infinityHold > 0) return;

    const q = hero.abilities.Q;
    // 1. Ready to cast Domain Expansion: Unlimited Void
    if (ai.cd.domain <= 0 && ai.ce >= q.manaCost) {
      if (d <= 24) {
        this.npcCastDomain(u);
        return;
      } else if (d <= 38 && ai.cd.shift <= 0) {
        // Teleport into engage range and then expand domain
        this.npcCastTeleport(u, 'approach');
        return;
      }
    }

    // 2. Conserve Cursed Energy when Domain is off cooldown or almost ready
    const savingForDomain = ai.cd.domain <= 4.0 && ai.ce < q.manaCost;
    if (savingForDomain) {
      if (ai.cd.red <= 0 && ai.ce >= 55 && d <= 45) {
        this.npcCastRed(u);
      }
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
    // Same cost model as the player: base launch + continuous charge drain (attract is free)
    this.npcSpendCe(u, 12 + BLUE_CHARGE_DRAIN_PER_SEC * chargeSec);
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

  private npcCastPurple(u: MobaUnit, dom: DomainExpansion) {
    const ai = u.npcAi;
    if (!ai) return;
    this.npcSpendCe(u, 35);
    dom.purpleTriggered = true;
    ai.busy = 5.0;
    const origin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = this.npcAimPoint(u).sub(origin).normalize();
    this.launchNpcGojoHollowPurple(u, origin, dir, true);
  }

  private activateNpcDomain(u: MobaUnit) {
    const q = u.heroDef?.abilities.Q;
    if (!q) return;
    this.endNpcDomain(u.id);

    // Whenever a domain is expanded, their cursed energy bar gets filled up
    if (u.npcAi) {
      u.npcAi.ce = u.npcAi.maxCe;
      u.npcAi.burnout = 0;
    }

    const dom = new DomainExpansion({
      name: q.name,
      casterId: u.id,
      casterName: u.name,
      casterTeam: u.team,
      center: new THREE.Vector3(u.group.position.x, 0, u.group.position.z),
      radius: q.radius,
      durationMs: q.durationMs,
      color: q.color,
      barrierHp: 1200,
      barrierMaxHp: 1200,
      isDestructable: true,
      isGojoDomain: u.heroDef?.id === 'gojo',
      isJogoDomain: u.heroDef?.id === 'jogo',
      isMegumiDomain: u.heroDef?.id === 'megumi',
      isUroDomain: u.heroDef?.id === 'uro',
      scene: this.scene,
      initialUnits: this.units,
      playerPos: this.playerPos,
      isPlayerAlive: this.playerRespawnTimer <= 0
    });
    this.activeDomains.push(dom);
    this.spawnImpactRing(dom.center.clone().add(new THREE.Vector3(0, 0.2, 0)), '#a855f7', q.radius);

    if (u.heroDef?.id === 'gojo') {
      this.playSpatialSound(
        '/assets/sounds/gojo/de_voice.mp3',
        u.group,
        {
          volume: 1.0,
          refDistance: 14,
          maxDistance: 68,
          rolloff: 1.1
        }
      );
      dom.audio = this.playSpatialSound(
        '/assets/sounds/gojo/unlimited_void.mp3',
        dom.domeMesh,
        {
          volume: 0.9,
          refDistance: dom.radius * 0.9,
          maxDistance: dom.radius + 38,
          rolloff: 1.2
        }
      ) ?? undefined;
    }
  }

  private endNpcDomain(casterId?: string) {
    const toRemove = casterId
      ? this.activeDomains.filter((d) => d.casterId === casterId)
      : this.activeDomains.filter((d) => d.casterId !== 'player');
    for (const dom of toRemove) {
      this.onDomainEnded(dom);
      dom.cleanup(this.scene);
      const idx = this.activeDomains.indexOf(dom);
      if (idx !== -1) {
        this.activeDomains.splice(idx, 1);
      }
    }
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

    // Update active NPC Infinity / Barrier shield distortion visual + 3D localized hum
    if (u.npcShieldTimer && u.npcShieldTimer > 0) {
      u.npcShieldTimer = Math.max(0, u.npcShieldTimer - dt);
      if (u.npcShieldMesh && u.npcShieldMat) {
        u.npcShieldMesh.visible = u.npcShieldTimer > 0;
        u.npcShieldMat.uniforms.uTime.value = elapsed;
        u.npcShieldMat.uniforms.uDeployRatio.value = Math.min(1, u.npcShieldTimer * 3.5);
        u.npcShieldMat.uniforms.uPoolRatio.value = Math.min(1, u.npcShieldTimer / 2.2);
      }
      if (!u.npcShieldAudio && u.heroDef?.abilities?.E?.kind === 'INFINITY_SHIELD') {
        u.npcShieldAudio = this.playSpatialSound(
          '/assets/sounds/gojo/infinity_shield_hum.mp3',
          u.group,
          { volume: 0.85, loop: true, refDistance: 6, maxDistance: 36, rolloff: 1.3 }
        ) ?? undefined;
      }
    } else {
      if (u.npcShieldMesh) {
        u.npcShieldMesh.visible = false;
      }
      if (u.npcShieldAudio) {
        try {
          u.npcShieldAudio.stop();
          u.group.remove(u.npcShieldAudio);
          u.npcShieldAudio.disconnect();
        } catch {}
        u.npcShieldAudio = undefined;
      }
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

    if (u.npcDelayedBeam) {
      u.npcDelayedBeam.timer -= dt;
      if (u.npcDelayedBeam.timer <= 0) {
        const dir = u.npcDelayedBeam.dir;
        u.npcDelayedBeam = undefined;
        const beamOrigin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
        const beamStart = beamOrigin.clone().addScaledVector(dir, 1.2);
        const beamEnd = beamStart.clone().addScaledVector(dir, 16.5);
        this.spawnThinIceShatterVfx(beamStart, dir, 2.5, 0.78);
        this.spawnRealityWarpBeamVfx(beamStart, beamEnd, 0.65, 0.72);
        this.spawnThinIceShatterVfx(beamEnd, dir.clone().negate(), 2.0, 0.68);
        this.spawnCursedBurst(beamEnd, 'SKY', 1.7, 48);
        this.physicsWorld?.applyRadialImpulse(beamEnd, 4.2, 30, 0.45, 75);
      }
    }

    u.npcAbilityTimer = (u.npcAbilityTimer ?? 3.0) - dt;
    if (u.npcAbilityTimer > 0) return;

    // Gojo uses his full combat AI when AI Attacking is enabled; when passive, he still showcases moves forward
    if (hero.id === 'gojo') {
      if (this.aiAttackingEnabled) return;
      const yaw = u.group.rotation.y + (Math.random() - 0.5) * 0.7;
      const showcaseDir = new THREE.Vector3(Math.sin(yaw), 0.04, Math.cos(yaw)).normalize();
      u.group.rotation.y = Math.atan2(showcaseDir.x, showcaseDir.z);
      const origin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const idx = u.npcAbilityIndex ?? 0;
      u.npcAbilityIndex = (idx + 1) % 3;
      if (idx === 0) {
        u.npcAbilityTimer = 4.2;
        this.launchNpcGojoRedOrb(u, origin.clone().addScaledVector(showcaseDir, 0.9), showcaseDir, 0.65);
      } else if (idx === 1) {
        u.npcAbilityTimer = 4.6;
        u.npcShieldTimer = 2.0;
        this.spawnImpactRing(origin, '#38bdf8', 3.2);
      } else {
        u.npcAbilityTimer = 5.0;
        const orbDir = showcaseDir.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
        const blue = new LapseBlueProjectile({
          startPos: origin.clone().addScaledVector(orbDir, 1.0),
          forward: orbDir,
          pullRadius: 6.5,
          damage: 0,
          durationMs: 2800,
          abilityName: 'Lapse Blue',
          color: '#0284c7',
          team: u.team,
          casterId: u.id,
          casterName: u.name,
          caster: u,
          autoTriggerSec: 0.9,
          pullIndicator: this.createRadiusIndicator('#0284c7'),
          placeIndicator: (ind, x, z, r) => this.placeIndicator(ind, x, z, r),
          onCooldownStart: () => {},
          onClearActiveRef: () => {}
        });
        this.scene.add(blue.mesh);
        this.projectiles.push(blue);
      }
      return;
    }

    // Showcase direction: cast along their current facing/roaming direction (not aimed straight at the player)
    const origin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const showcaseYaw = u.group.rotation.y + (Math.random() - 0.5) * 0.9;
    const flatDir = new THREE.Vector3(Math.sin(showcaseYaw), 0, Math.cos(showcaseYaw)).normalize();
    u.group.rotation.y = Math.atan2(flatDir.x, flatDir.z);
    const aimDir = flatDir.clone();

    const stepIndex = u.npcAbilityIndex ?? 0;
    u.npcAbilityIndex = (stepIndex + 1) % 4;

    // ── 1. JOGO SHOWCASE: Ember Insects, Flame Dash, Mini Volcano, Maximum: Meteor ──
    if (hero.id === 'jogo') {
      if (stepIndex === 0) {
        u.npcAbilityTimer = 3.2;
        const insect = new EmberInsectProjectile({
          startPos: origin.clone().addScaledVector(aimDir, 1.0),
          forward: aimDir,
          damage: this.aiAttackingEnabled ? 22 : 0,
          team: u.team,
          casterId: u.id,
          casterName: u.name,
          caster: u
        });
        this.scene.add(insect.mesh);
        this.projectiles.push(insect);
        this.spawnImpactRing(origin, '#f97316', 1.2);
      } else if (stepIndex === 1) {
        u.npcAbilityTimer = 3.6;
        const startPos = u.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
        const dashDist = 10.0;
        for (let s = 1; s <= 6; s++) {
          const resolved = this.mapBuilder.resolveHorizontalCollision(
            u.group.position.x + flatDir.x * (dashDist / 6),
            u.group.position.z + flatDir.z * (dashDist / 6),
            u.radius,
            u.group.position.y
          );
          u.group.position.x = resolved.x;
          u.group.position.z = resolved.z;
          this.clampUnitToDomainBarrier(u);
        }
        this.spawnImpactRing(startPos, '#f97316', 2.4);
        this.spawnCursedBurst(startPos, 'FIRE', 1.4, 34);
      } else if (stepIndex === 2) {
        u.npcAbilityTimer = 4.5;
        const seedDir = flatDir.clone().add(new THREE.Vector3(0, 0.14, 0)).normalize();
        const seed = new VolcanoSeedProjectile({
          startPos: origin.clone().addScaledVector(seedDir, 0.9),
          forward: seedDir,
          damage: this.aiAttackingEnabled ? 14 : 0,
          detectRadius: 14,
          volcanoDurationMs: 7500,
          team: u.team,
          casterId: u.id,
          casterName: u.name
        });
        this.scene.add(seed.mesh);
        this.projectiles.push(seed);
      } else {
        u.npcAbilityTimer = 6.5;
        const rawTarget = u.group.position.clone().addScaledVector(flatDir, 12.0);
        const resolved = this.mapBuilder.resolveHorizontalCollision(rawTarget.x, rawTarget.z, 1.5, u.group.position.y);
        const targetPos = new THREE.Vector3(
          resolved.x,
          this.mapBuilder.getFloorHeight(resolved.x, resolved.z, u.group.position.y),
          resolved.z
        );
        const meteor = new MaximumMeteorProjectile({
          targetPos,
          blastRadius: 8.5,
          damage: this.aiAttackingEnabled ? 35 : 0,
          team: u.team,
          casterId: u.id,
          casterName: u.name,
          scene: this.scene
        });
        this.scene.add(meteor.mesh);
        this.projectiles.push(meteor);
      }
      return;
    }

    // ── 2. MEGUMI SHOWCASE: Exact same ability kit as the playable Megumi character (heroes.ts) ──
    //    0: [M1] Cursed-Tool Broadsword (MELEE_CLEAVE: 54 dmg, 5.5m range, 120° arc)
    //    1: [Hold M2] Rabbit Escape [Hold Right Click] -> [Hold SPACE] Midair Nue Carry (2.0s flight)
    //    2: [SHIFT] Shadow Step (2.4s floor shadow submersion at +45% speed)
    //    3: [E] Nue / Toad (Gama) (Nue 5.5m lightning stun swoop, or Toad ally tongue rescue pull)
    //    4: [Q] Domain Expansion: Chimera Shadow Garden (19m) -> [Q] Summon Mahoraga (ends Domain)
    if (hero.id === 'megumi') {
      const megumiStep = u.npcAbilityIndex ?? 0;
      u.npcAbilityIndex = (megumiStep + 1) % 5;

      if (megumiStep === 0) {
        // [M1] Cursed-Tool Broadsword (hero.weapon) — cycles through Megumi's melee animations
        u.npcAbilityTimer = 2.4;
        const meleeAnims: HeroAnimHint[] = [
          'megumi_attack',
          'megumi_charged_slash',
          'megumi_thrust_slash',
          'megumi_punch_combo'
        ];
        u.animOverrideHint = meleeAnims[Math.floor(elapsed) % meleeAnims.length];
        u.animOverrideTimer = 1.65;
        const wep = hero.weapon;
        const slashPos = u.group.position
          .clone()
          .add(new THREE.Vector3(0, 1.35, 0))
          .addScaledVector(flatDir, wep.range * 0.42);
        this.spawnMeleeArcVfx(slashPos, wep.range * 0.6, hero.color);
        this.physicsWorld?.applyRadialImpulse(
          slashPos,
          wep.range * 0.85,
          16 + (wep.knockback ?? 5.5) * 2.2,
          0.35,
          28
        );
        if (this.aiAttackingEnabled) {
          this.damageTargetsAroundNpc(u, slashPos, wep.range * 0.6, wep.damage, wep.name);
        }
      } else if (megumiStep === 1) {
        // [Hold M2] Rabbit Escape [Hold Right Click] (only launches if on the ground!) -> [Hold SPACE] Nue Carry (2.0s)
        const npcFloorY = this.mapBuilder.getFloorHeight(u.group.position.x, u.group.position.z, u.group.position.y);
        if (u.group.position.y > npcFloorY + 0.25) {
          u.npcAbilityTimer = 0.5;
          u.npcAbilityIndex = 1; // Retry once Megumi NPC has landed
          return;
        }
        u.npcAbilityTimer = 4.6;
        u.pullActiveTimer = 0.2;
        const inShadowGarden = this.activeDomains.some((d) => d.casterId === u.id && d.isMegumiDomain);
        const pileBase = new THREE.Vector3(u.group.position.x, npcFloorY, u.group.position.z);
        this.npcMegumiShowcase = {
          mode: 'RABBIT_CLIMB',
          timer: 1.45,
          spawnAcc: 0,
          dir: flatDir.clone(),
          pileBase
        };
        const pileTopY = this.spawnNpcMegumiRabbitBatch(u, inShadowGarden ? 10 : 8, true, pileBase);
        u.group.position.y = Math.max(u.group.position.y, pileTopY);
        this.spawnImpactRing(pileBase.clone().add(new THREE.Vector3(0, 0.2, 0)), '#e2e8f0', 4.6);
        this.spawnCursedBurst(pileBase.clone().add(new THREE.Vector3(0, 0.6, 0)), 'SHADOW', 2.2, 45);
      } else if (megumiStep === 2) {
        // [SHIFT] Shadow Step (hero.abilities.SHIFT: 2.4s floor shadow submersion at +45% speed)
        const shiftAb = hero.abilities.SHIFT;
        const durationSec = shiftAb.durationMs / 1000;
        u.npcAbilityTimer = durationSec + 1.2;
        this.npcMegumiShowcase = {
          mode: 'SHADOW_STEP',
          timer: durationSec,
          spawnAcc: 0,
          dir: flatDir.clone()
        };
        if (!this.npcMegumiPuddleMesh) {
          const geo = new THREE.CircleGeometry(1.35, 32);
          geo.rotateX(-Math.PI / 2);
          const mat = new THREE.MeshBasicMaterial({
            color: 0x1e1b4b,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
          });
          this.npcMegumiPuddleMesh = new THREE.Mesh(geo, mat);
          this.scene.add(this.npcMegumiPuddleMesh);
        }
        this.npcMegumiPuddleMesh.visible = true;
        this.npcMegumiPuddleMesh.position.set(
          u.group.position.x,
          u.group.position.y + 0.08,
          u.group.position.z
        );
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 0.12, 0)), '#6366f1', 3.2);
        this.spawnCursedBurst(u.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 'SHADOW', 1.6, 44);
      } else if (megumiStep === 3) {
        // [E] Nue / Toad (Gama) (hero.abilities.E: exact same castNueOrToad rules as player)
        const eAb = hero.abilities.E;
        u.npcAbilityTimer = 3.8;
        u.animOverrideHint = 'megumi_upward_slash';
        u.animOverrideTimer = 1.65;
        const ally = this.units.find(
          (other) =>
            other.alive &&
            other !== u &&
            other.team === u.team &&
            other.type === 'HERO' &&
            other.hp < other.maxHp &&
            other.group.position.distanceTo(u.group.position) <= 24
        );

        if (ally) {
          const safePos = u.group.position.clone().addScaledVector(flatDir, 2.2);
          const resolvedSafe = this.mapBuilder.resolveHorizontalCollision(
            safePos.x,
            safePos.z,
            ally.radius,
            u.group.position.y
          );
          safePos.set(
            resolvedSafe.x,
            this.mapBuilder.getFloorHeight(resolvedSafe.x, resolvedSafe.z, u.group.position.y),
            resolvedSafe.z
          );
          const toadPos = u.group.position.clone().addScaledVector(flatDir, 1.3);
          toadPos.y = this.mapBuilder.getFloorHeight(toadPos.x, toadPos.z, u.group.position.y);

          const toad = new ToadShikigami({
            spawnPos: toadPos,
            safePos,
            ally,
            team: u.team,
            summonerId: u.id,
            createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
          });
          this.scene.add(toad.group);
          this.units.push(toad);

          const tongueOrigin = toadPos.clone().add(new THREE.Vector3(0, 0.65, 0));
          this.spawnBeamTracer(
            tongueOrigin,
            ally.group.position.clone().add(new THREE.Vector3(0, ally.height * 0.5, 0)),
            '#f472b6',
            0.38,
            0.14
          );
          this.spawnImpactRing(ally.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)), '#f472b6', 2.4);
          ally.hp = Math.min(ally.maxHp, ally.hp + 35);
        } else {
          const tRaw = u.group.position.clone().addScaledVector(flatDir, 11.0);
          const res = this.mapBuilder.resolveHorizontalCollision(tRaw.x, tRaw.z, 1.0, u.group.position.y);
          const targetPt = new THREE.Vector3(
            res.x,
            this.mapBuilder.getFloorHeight(res.x, res.z, u.group.position.y),
            res.z
          );
          const inShadowGarden = this.activeDomains.some((d) => d.casterId === u.id && d.isMegumiDomain);
          const rightVec = new THREE.Vector3(flatDir.z, 0, -flatDir.x);
          const offsets = inShadowGarden ? [-3.0, 3.0] : [0];

          for (const lat of offsets) {
            const startPos = u.group.position
              .clone()
              .add(new THREE.Vector3(0, 6.2, 0))
              .addScaledVector(rightVec, lat * 0.8);
            const tPos = targetPt.clone().addScaledVector(rightVec, lat);
            tPos.y = this.mapBuilder.getFloorHeight(tPos.x, tPos.z, targetPt.y);

            const nue = new NueShikigami({
              startPos,
              targetPos: tPos,
              shockRadius: eAb.radius,
              damage: this.aiAttackingEnabled ? eAb.damage : 0,
              stunSec: eAb.durationMs / 1000,
              team: u.team,
              summonerId: u.id,
              createHpBar: (parent, y, w, team) => this.createFloatingHpBar(parent, y, w, team)
            });
            this.scene.add(nue.group);
            this.units.push(nue);
          }
        }
      } else {
        // [Q] Domain Expansion: Chimera Shadow Garden (hero.abilities.Q) -> [Q] Summon Mahoraga (ends Domain)
        u.npcAbilityTimer = 6.2;
        this.activateNpcDomain(u);
        this.npcMegumiShowcase = {
          mode: 'DOMAIN_MAHORAGA',
          timer: 2.8,
          spawnAcc: 0,
          dir: flatDir.clone()
        };
      }
      return;
    }

    // ── 3. HIGURUMA SHOWCASE: Judge's Gavel Cleave, Gavel Rush, Verdict Wave, Earthshatter ──
    if (hero.id === 'higuruma') {
      if (stepIndex === 0) {
        u.npcAbilityTimer = 3.0;
        const slashPos = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(flatDir, 2.8);
        this.spawnMeleeArcVfx(slashPos, 4.4, '#f59e0b');
        this.physicsWorld?.applyRadialImpulse(slashPos, 5.5, 22, 0.4, 30);
      } else if (stepIndex === 1) {
        u.npcAbilityTimer = 3.8;
        const startPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
        const dashDist = 11.0;
        for (let s = 1; s <= 7; s++) {
          const res = this.mapBuilder.resolveHorizontalCollision(
            u.group.position.x + flatDir.x * (dashDist / 7),
            u.group.position.z + flatDir.z * (dashDist / 7),
            u.radius,
            u.group.position.y
          );
          u.group.position.x = res.x;
          u.group.position.z = res.z;
          this.clampUnitToDomainBarrier(u);
        }
        const endPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
        this.spawnBeamTracer(startPos, endPos, '#f59e0b', 0.48, 0.28);
        this.spawnImpactRing(endPos, '#f59e0b', 4.2);
      } else if (stepIndex === 2) {
        u.npcAbilityTimer = 4.0;
        const wavePos = origin.clone().addScaledVector(flatDir, 1.8);
        const waveVel = flatDir.clone().multiplyScalar(24);
        const waveMesh = new THREE.Mesh(
          new THREE.TorusGeometry(1.3, 0.2, 8, 22, Math.PI * 1.15),
          new THREE.MeshBasicMaterial({ color: '#fbbf24', side: THREE.DoubleSide })
        );
        waveMesh.position.copy(wavePos);
        waveMesh.lookAt(wavePos.clone().add(flatDir));
        this.scene.add(waveMesh);
        this.vfxList.push({
          mesh: waveMesh,
          age: 0,
          maxAge: 1.4,
          onUpdate: (vdt) => {
            waveMesh.position.addScaledVector(waveVel, vdt);
          }
        });
      } else {
        u.npcAbilityTimer = 5.4;
        for (let k = 1; k <= 4; k++) {
          const stepPos = u.group.position.clone().addScaledVector(flatDir, k * 3.8);
          this.spawnImpactRing(stepPos.clone().add(new THREE.Vector3(0, 0.15, 0)), '#facc15', k * 2.0);
          this.spawnPillarEffect(stepPos, 0.7 + k * 0.2, 3.8, '#facc15', 0.85);
        }
        this.physicsWorld?.applyRadialImpulse(
          u.group.position.clone().addScaledVector(flatDir, 6.0),
          8.5,
          30,
          0.55,
          45
        );
      }
      return;
    }

    // ── 3b. URO TAKAKO SHOWCASE: Drawn Reality Wipe, Grounded Thin Ice Beam, Sky Flight + 3m Slam, Domain Anim ──
    if (hero.id === 'uro') {
      if (stepIndex === 0) {
        // Draws a persistent 5s smoky Reality Wipe ribbon in front of her + plays RealityWipe animation
        u.npcAbilityTimer = 3.2;
        u.animOverrideHint = 'reality_wipe';
        u.animOverrideTimer = 1.65;
        this.spawnNpcRealityWipe(u, flatDir);
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#67e8f9', 3.0);
      } else if (stepIndex === 1) {
        // Grounded Thin Ice Breaker: 0.83s windup synced to ThinIceBreaker strike frame, then fires Reality-Warping Beam
        u.npcAbilityTimer = 4.4;
        u.animOverrideHint = 'thin_ice_breaker';
        u.animOverrideTimer = 2.25;
        u.npcDelayedBeam = { timer: 0.83, dir: flatDir.clone() };
        this.spawnImpactRing(origin.clone().addScaledVector(flatDir, 1.0), '#67e8f9', 1.8);
      } else if (stepIndex === 2) {
        // Sky Flight leap -> airborne Thin Ice Breaker dive cracking a 3m blast radius
        u.npcAbilityTimer = 4.0;
        u.animOverrideHint = 'thin_ice_breaker';
        u.animOverrideTimer = 2.4;
        const startPos = u.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
        const res = this.mapBuilder.resolveHorizontalCollision(
          u.group.position.x + flatDir.x * 7.5,
          u.group.position.z + flatDir.z * 7.5,
          u.radius,
          u.group.position.y
        );
        u.group.position.x = res.x;
        u.group.position.z = res.z;
        u.verticalVel = 15.5;
        u.group.position.y = Math.max(u.group.position.y, 0.25);
        this.clampUnitToDomainBarrier(u);
        const slamGround = new THREE.Vector3(res.x, 0.22, res.z);
        this.spawnBeamTracer(startPos, slamGround.clone().add(new THREE.Vector3(0, 3.8, 0)), '#67e8f9', 0.35, 0.16);
        this.spawnThinIceShatterVfx(slamGround, new THREE.Vector3(0, 1, 0), 3.0, 0.9);
        this.spawnImpactRing(slamGround, '#bae6fd', 3.0);
        this.spawnCursedBurst(slamGround, 'SKY', 2.0, 62);
        this.physicsWorld?.applyRadialImpulse(slamGround, 4.8, 36, 0.55, 90);
        if (this.aiAttackingEnabled) {
          this.damageTargetsAroundNpc(u, slamGround, 3.0, 28, 'Thin Ice Breaker (Aerial Slam)');
        }
      } else {
        // Domain Expansion animation showcase
        u.npcAbilityTimer = 4.6;
        u.animOverrideHint = 'domain_expansion';
        u.animOverrideTimer = 2.15;
        const burstOrigin = u.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
        this.spawnImpactRing(u.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), '#67e8f9', 5.2);
        this.spawnCursedBurst(burstOrigin, 'SKY', 2.4, 58);
      }
      return;
    }

    // ── 4. MR. BIOMASTER SHOWCASE: Bio-Rupture, Thruster Surge, Siphon Ray, Pandemic Garden ──
    const distToPlayer =
      this.playerRespawnTimer <= 0 ? u.group.position.distanceTo(this.playerPos) : Infinity;

    if (stepIndex === 0) {
      u.npcAbilityTimer = 3.2;
      const endPt = origin.clone().addScaledVector(aimDir, 16);
      this.spawnBeamTracer(origin, endPt, hero.weapon.projectileColor, 0.25, 0.09);
      this.spawnImpactRing(endPt, hero.weapon.projectileColor, 2.0);
    } else if (stepIndex === 1) {
      u.npcAbilityTimer = 3.8;
      const startPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      const dashDist = 10.5;
      for (let s = 1; s <= 7; s++) {
        const nx = u.group.position.x + flatDir.x * (dashDist / 7);
        const nz = u.group.position.z + flatDir.z * (dashDist / 7);
        const resolved = this.mapBuilder.resolveHorizontalCollision(nx, nz, u.radius, u.group.position.y);
        u.group.position.x = resolved.x;
        u.group.position.z = resolved.z;
        this.clampUnitToDomainBarrier(u);
      }
      const endPos = u.group.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      this.spawnBeamTracer(startPos, endPos, hero.abilities.SHIFT.color, 0.45, 0.24);
      this.spawnImpactRing(endPos, hero.abilities.SHIFT.color, hero.abilities.SHIFT.radius);
      if (this.aiAttackingEnabled) {
        this.damageTargetsAroundNpc(u, u.group.position, hero.abilities.SHIFT.radius, 20, hero.abilities.SHIFT.name);
      }
    } else if (stepIndex === 2) {
      u.npcAbilityTimer = 3.8;
      const sporeTarget = u.group.position.clone().addScaledVector(flatDir, 10);
      this.spawnBeamTracer(origin, sporeTarget, hero.secondaryFire.color, 0.35, 0.14);
      this.spawnImpactRing(sporeTarget, hero.secondaryFire.color, 4.5);
      this.spawnPillarEffect(sporeTarget, 1.1, 4.2, hero.secondaryFire.color, 0.45);
      if (this.aiAttackingEnabled) {
        this.damageTargetsAroundNpc(u, sporeTarget, 4.5, 22, hero.secondaryFire.name);
      }
    } else {
      u.npcAbilityTimer = 5.2;
      const center = u.group.position.clone();
      this.spawnImpactRing(center.clone().add(new THREE.Vector3(0, 0.15, 0)), hero.abilities.Q.color, 9.0);
      this.spawnPillarEffect(center, 3.0, 8.5, hero.abilities.Q.color, 1.25);
      if (this.aiAttackingEnabled && distToPlayer <= 8.5) {
        this.damageTargetsAroundNpc(u, center, 8.5, 24, hero.abilities.Q.name);
      }
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
      if (!other.alive || other === caster || other.isDestructable === false) continue;
      if (!this.canUnitTakeDamageFrom(other, caster.id, caster.team)) continue;
      if (other.group.position.distanceTo(center) <= radius + other.radius) {
        if (other.type === 'SHIKIGAMI' || other.type === 'CONSTRUCT') {
          this.damageUnit(
            other,
            playerDmg,
            false,
            `${caster.name} (${abilityName})`,
            other.group.position.clone().add(new THREE.Vector3(0, other.height * 0.5, 0))
          );
        } else {
          other.hp = Math.max(1, other.hp - playerDmg);
        }
      }
    }
  }

  private launchNpcGojoRedOrb(caster: MobaUnit, startPos: THREE.Vector3, dir: THREE.Vector3, ratio = 0.3) {
    const damage = Math.round(22 + ratio * 24);
    const proj = new ReversalRedProjectile({
      startPos,
      forward: dir,
      chargeRatio: ratio,
      damage,
      knockback: THREE.MathUtils.lerp(1.5, 11.0, Math.pow(ratio, 1.25)),
      team: caster.team,
      casterId: caster.id,
      casterName: caster.name,
      caster
    });
    this.spawnProjectile(proj);
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
    const startPos = origin.clone().addScaledVector(dir, 1.4);
    const purpleProj = new HollowPurpleProjectile({
      startPos,
      forward: dir,
      team: caster.team,
      casterId: caster.id,
      casterName: caster.name,
      caster,
      domainFinisher,
      fusionDuration: 4.85,
      maxAge: 7.8
    });
    this.spawnProjectile(purpleProj);

    // ── 3D Spatial Audio: Localized to the spiraling orbs & flying singularity ──
    this.playSpatialSound('/assets/sounds/gojo/murasaki.mp3', purpleProj.mesh, {
      volume: 0.95,
      refDistance: 12,
      maxDistance: 65,
      rolloff: 1.0
    });
  }

  private applyDamageToPlayer(dmg: number, attackerName: string, attackerTeam: MobaTeam) {
    if (this.playerRespawnTimer > 0 || this.winner || this.godModeEnabled || !this.isPlayerDestructable) return;

    // Gojo is invulnerable during the 800ms Limitless Teleport cast phase; Megumi is undetected during Shadow Step
    if (this.teleportPhase === 'CASTING' || this.shadowStepTimer > 0) {
      this.damagePopups.push({
        id: this.popupCounter++,
        x: 50,
        y: 40,
        amount: 0,
        label: this.shadowStepTimer > 0 ? 'SHADOW UNDETECTED' : 'INVULNERABLE',
        isCrit: false,
        color: this.shadowStepTimer > 0 ? '#a5b4fc' : '#38bdf8',
        ageSec: 0,
        opacity: 1
      });
      if (this.damagePopups.length > 10) this.damagePopups.shift();
      return;
    }

    let remaining = dmg;

    // 1. Active Barrier Shield / Uro Sky Veil Deflect absorbs incoming damage first!
    if (this.isBarrierActive() && this.barrierHp > 0) {
      const absorbedByBarrier = Math.min(this.barrierHp, remaining);
      this.barrierHp -= absorbedByBarrier;
      remaining -= absorbedByBarrier;
      if (
        (this.hero.secondaryFire.kind === 'SKY_DEFLECT' ||
          this.hero.secondaryFire.kind === 'REALITY_WIPE') &&
        this.skyDeflectCounterCooldown <= 0
      ) {
        this.skyDeflectCounterCooldown = 0.55;
        this.grantAbilityPassive(true);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        const ripplePos = this.camera.position.clone().addScaledVector(forward, 2.0);
        this.spawnImpactRing(ripplePos, '#67e8f9', 3.2);
        this.spawnCursedBurst(ripplePos, 'SKY', 1.4, 28);
        this.damagePopups.push({
          id: this.popupCounter++,
          x: 50,
          y: 42,
          amount: 0,
          label: 'REALITY WIPE DEFLECT',
          isCrit: true,
          color: '#67e8f9',
          ageSec: 0,
          opacity: 1
        });
        if (this.damagePopups.length > 10) this.damagePopups.shift();
      }
      if (remaining <= 0) return;
    }

    // 2. Overhealth / Armor Shield absorbs next
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }

    if (remaining > 0) {
      this.playerOutOfCombatTimer = 0;
    }

    this.hp = Math.max(0, this.hp - remaining);

    if (this.hp <= 0) {
      this.deaths++;
      this.playerRespawnTimer = 6.0;
      this.addKillFeed(attackerName, attackerTeam, this.hero.name, 'blue', 'Fatal Strike');
    }
  }

  private getProjectileContext(): ProjectileContext {
    return {
      elapsed: this.clock.getElapsedTime(),
      scene: this.scene,
      camera: this.camera,
      units: this.units,
      activeDomains: this.activeDomains,
      raycastObstacles: this.mapBuilder.raycastObstacles,
      playerPos: this.playerPos,
      playerAlive: this.playerRespawnTimer <= 0 && this.shadowStepTimer <= 0,
      playerTeam: 'blue',
      resolveHorizontalCollision: (nextX, nextZ, radius, y) =>
        this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, radius, y),
      getFloorHeight: (x, z, currentY) => this.mapBuilder.getFloorHeight(x, z, currentY),
      clampUnitToDomainBarrier: (unit) => this.clampUnitToDomainBarrier(unit as MobaUnit),
      damageUnit: (unit, amount, isCrit, sourceName, hitPos, killVerb) =>
        this.damageUnit(unit as MobaUnit, amount, isCrit, sourceName, hitPos, killVerb),
      damageDomainBarrier: (dom, damage, hitPoint, attackerName) =>
        this.damageDomainBarrier(dom, damage, hitPoint, attackerName),
      damageTargetsAroundNpc: (caster, center, radius, damage, sourceName) =>
        this.damageTargetsAroundNpc(caster as MobaUnit, center, radius, damage, sourceName),
      applyDamageToPlayer: (damage, sourceName, attackerTeam) =>
        this.applyDamageToPlayer(damage, sourceName, attackerTeam),
      knockbackUnitWithWallSlam: (unit, dir, dist, bonusDmg) =>
        this.KnockbackUnitWithWallSlam(unit as MobaUnit, dir, dist, bonusDmg),
      grantAbilityPassive: (didHit) => this.grantAbilityPassive(didHit),
      spawnImpactRing: (pos, colorHex, maxRadius) => this.spawnImpactRing(pos, colorHex, maxRadius),
      spawnCursedBurst: (pos, variant, radius, count) =>
        this.spawnCursedBurst(pos, variant, radius, count),
      playSpatialSound: (url, target, opts) => {
        this.playSpatialSound(url, target, opts);
      },
      playGlobalSound: (url, opts) => {
        this.playGlobalSound(url, opts);
      },
      onPlayerPurpleLaunch: () => {
        this.viewModel.triggerFireRecoil();
        this.endActiveDomain();
      },
      onNpcPurpleLaunch: (casterId) => {
        if (this.npcDomain?.casterId === casterId) {
          this.endNpcDomain();
        }
      },
      onPullPlayerVertical: () => {
        this.playerVel.y = 0;
        this.grounded = false;
      },
      onVolcanoPlant: (pos, normal, team, casterId, damage, radius, durationMs) => {
        this.plantMiniVolcano(pos, normal, team, casterId, damage, radius, durationMs);
      },
      applyPhysicsImpulse: (center, radius, strength, upwardLift, shatterDamage) => {
        this.physicsWorld?.applyRadialImpulse(center, radius, strength, upwardLift, shatterDamage);
      },
      applyPhysicsVortex: (center, radius, pullStrength, swirlStrength, dt) => {
        this.physicsWorld?.applyVortexForce(center, radius, pullStrength, swirlStrength, dt);
      },
      spawnPhysicsDebris: (center, count, colorHex, speed) => {
        this.physicsWorld?.spawnRubbleBurst(center, count, colorHex, speed);
      }
    };
  }

  private spawnProjectile(proj: Projectile) {
    this.scene.add(proj.mesh);
    this.projectiles.push(proj);
  }

  private updateProjectiles(dt: number) {
    const ctx = this.getProjectileContext();
    const playerLookDir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.alive && this.activeRealityWipes.length > 0) {
        for (const w of this.activeRealityWipes) {
          if (w.team === p.team) continue;
          const dist = this.distanceToWipePolyline(p.position, w.points);
          if (dist <= 1.35 + p.radius) {
            const redirectDir = w.casterId === 'player' ? playerLookDir : w.viewForward;
            const deflectName =
              w.casterId === 'player' ? `${this.hero.name} (Reality Wipe)` : 'Uro Takako (Reality Wipe)';
            if (p.deflect(w.team, redirectDir, w.casterId, deflectName, 1.4)) {
              this.spawnImpactRing(p.position.clone(), '#67e8f9', 3.2);
              this.spawnCursedBurst(p.position.clone(), 'SKY', 1.5, 34);
              if (w.casterId === 'player') {
                this.grantAbilityPassive(true);
                this.damagePopups.push({
                  id: this.popupCounter++,
                  x: 50,
                  y: 38,
                  amount: 0,
                  label: 'REALITY WIPE DEFLECT!',
                  isCrit: true,
                  color: '#67e8f9',
                  ageSec: 0,
                  opacity: 1
                });
                if (this.damagePopups.length > 10) this.damagePopups.shift();
              }
              break;
            }
          }
        }
      }
      p.update(dt, ctx);
      if (p.finished) {
        p.dispose(this.scene);
        this.projectiles.splice(i, 1);
      }
    }

    // Check orb-to-orb midair collisions (Red & Blue only; Hollow Purple has canCollideWithOrbs = false)
    for (let i = 0; i < this.projectiles.length; i++) {
      const a = this.projectiles[i];
      if (!a.alive || !a.canCollideWithOrbs) continue;
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const b = this.projectiles[j];
        if (!b.alive || !b.canCollideWithOrbs) continue;
        if (a.position.distanceTo(b.position) <= a.radius + b.radius + 0.45) {
          const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
          a.onCollideWithProjectile(b, mid, ctx);
          b.onCollideWithProjectile(a, mid, ctx);
          if (a.kind !== b.kind) {
            this.spawnImpactRing(mid, '#a855f7', 5.2);
            this.spawnCursedBurst(mid, 'PURPLE', 2.8, 92);
            this.physicsWorld?.applyRadialImpulse(mid, 11.5, 58, 0.7, 130);
          }
          break;
        }
      }
    }
  }

  private updateVfx(dt: number) {
    const elapsed = this.clock.getElapsedTime();
    this.updateRealityWipes(dt, elapsed);
    this.updateProjectiles(dt);
    this.updateVolcanoes(dt, elapsed);
    this.updateLowHpTrackers(elapsed);

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
        (this.getPrimaryActiveDomain()
          ? this.getPrimaryActiveDomain()!.isPlayerTrapped && this.getPrimaryActiveDomain()!.casterId !== 'player'
            ? `ENEMY DOMAIN: ${this.getPrimaryActiveDomain()!.name.toUpperCase()} · TRAPPED (${Math.ceil(this.getPrimaryActiveDomain()!.remainingSec)}s)`
            : this.getPrimaryActiveDomain()!.name.toUpperCase()
          : null) ??
        (this.executionerTimerSec > 0
          ? `DEADLY SENTENCING · EXECUTIONER'S SWORD (${this.executionerTimerSec.toFixed(1)}s)`
          : null),
      domainBarrierHp:
        this.getPrimaryActiveDomain() && !this.getPrimaryActiveDomain()!.isRally
          ? Math.round(this.getPrimaryActiveDomain()!.hp)
          : undefined,
      domainBarrierMaxHp:
        this.getPrimaryActiveDomain() && !this.getPrimaryActiveDomain()!.isRally
          ? this.getPrimaryActiveDomain()!.maxHp
          : undefined,
      canCastHollowPurple: Boolean(
        this.activeDomain?.isGojoDomain && !this.activeDomain.purpleTriggered
      ),
      canCastMeteor: Boolean(
        this.activeDomain?.isJogoDomain && !this.activeDomain.purpleTriggered
      ),
      meteorAiming: this.meteorAiming,
      canSummonMahoraga: Boolean(
        this.activeDomain?.isMegumiDomain && !this.activeDomain.purpleTriggered
      ),
      canCastShatteredSky: Boolean(
        this.activeDomain?.isUroDomain && !this.activeDomain.purpleTriggered
      ),
      isSkyHovering: this.isSkyHovering,
      isUroFlying: this.hero.id === 'uro' && (!this.grounded || this.uroFlightTimer > 0),
      isRealityWiping: this.isRealityWipeActive(),
      activeRealityWipes: this.getPlayerRealityWipeCount(),
      isShadowStepping: this.shadowStepTimer > 0,
      shadowStepRemainingSec: Number(Math.max(0, this.shadowStepTimer).toFixed(1)),
      canNueCarry: this.nueCarryAvailable && !this.grounded && this.nueCarryTimer <= 0,
      nueCarryRemainingSec: Number(Math.max(0, this.nueCarryTimer).toFixed(1)),
      nueToadPreview:
        this.hero.abilities.E.kind === 'NUE_TOAD'
          ? this.findToadRescueAlly()
            ? 'TOAD'
            : 'NUE'
          : undefined,
      mahoragaRogue: this.units.some((u) => u.alive && u instanceof MahoragaShikigami && u.rogue),
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
      },
      mapId: this.mapId,
      mapName: this.mapId === 'orlando' ? 'ORLANDO // FLORIDA' : 'CYBER SHIBUYA // TOKYO'
    });
  }

  public destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    for (const p of this.projectiles) {
      p.dispose(this.scene);
    }
    this.projectiles.length = 0;
    for (const v of this.activeVolcanoes) {
      this.scene.remove(v.group);
    }
    this.activeVolcanoes.length = 0;
    if (this.shadowPuddleMesh) {
      this.scene.remove(this.shadowPuddleMesh);
      this.shadowPuddleMesh.geometry.dispose();
      this.shadowPuddleMesh = null;
    }
    if (this.npcMegumiPuddleMesh) {
      this.scene.remove(this.npcMegumiPuddleMesh);
      this.npcMegumiPuddleMesh.geometry.dispose();
      this.npcMegumiPuddleMesh = null;
    }
    this.npcMegumiShowcase = null;
    while (this.activeRealityWipes.length > 0) {
      this.removeRealityWipeAt(0);
    }
    for (const marker of this.lowHpTrackers.values()) {
      this.scene.remove(marker);
      marker.geometry.dispose();
    }
    this.lowHpTrackers.clear();
    this.endNueCarry();
    this.cancelMeteorAim();
    this.physicsWorld?.dispose();
    this.activeBlueOrb = null;
    this.stopAllAudio();
    if (this.audioListener) {
      try {
        this.camera.remove(this.audioListener);
      } catch {
        // Ignore audio listener cleanup error (never close shared THREE.AudioContext singleton!)
      }
    }
    this.audioBuffers.clear();
    this.playerShieldAudio = null;
    this.playerDomainAudio = null;
    this.playerVoiceAudio = null;
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
