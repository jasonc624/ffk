import * as THREE from 'three';
import type {
  DamagePopup,
  FpsAbilityDef,
  FpsAbilityKey,
  FpsHeroDef,
  FpsHudState,
  KillFeedEntry,
  MinimapBlip,
  MobaTeam,
  MobaUnitType
} from './types';
import { MobaMapBuilder } from './world/MobaMapBuilder';
import { FpsViewModel } from './entities/FpsViewModel';
import { buildProceduralHeroModel } from './entities/ProceduralHeroBuilder';
import { getMouseSensitivity } from './storage';
import { FPS_MOBA_HEROES } from './data/heroes';

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
  animateRig?: (elapsed: number, isMoving: boolean, isStunned: boolean) => void;
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
    center: THREE.Vector3;
    radius: number;
    remainingMs: number;
    tickTimerMs: number;
    color: string;
    domeMesh: THREE.Mesh;
    ringMesh: THREE.Mesh;
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
      Q: { remainingMs: 0, totalMs: hero.abilities.Q.cooldownMs },
      E: { remainingMs: 0, totalMs: hero.abilities.E.cooldownMs },
      F: { remainingMs: 0, totalMs: hero.abilities.F.cooldownMs },
      R: { remainingMs: 0, totalMs: hero.abilities.R.cooldownMs }
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
      }
      this.emitHud();
    };
    this.onResizeBound = () => this.handleResize();

    this.initScene();
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

    this.mapBuilder = new MobaMapBuilder();
    this.mapBuilder.build(this.scene);

    this.viewModel = new FpsViewModel(this.camera, this.hero);
    this.syncCameraToPlayer();
  }

  private spawnStructuresAndRival() {
    this.createStructureUnit('blue_core', 'Allied Ancient Core', 'blue', 'CORE', 0, 58, 1600, 3.2, 6.5, 22, 32);
    this.createStructureUnit('red_core', 'Enemy Ancient Core', 'red', 'CORE', 0, -58, 1600, 3.2, 6.5, 22, 32);

    this.createStructureUnit('blue_t1', 'Blue Outer Tower', 'blue', 'TOWER', 0, 26, 750, 1.9, 5.5, 20, 26);
    this.createStructureUnit('blue_t2', 'Blue Base Tower', 'blue', 'TOWER', 0, 44, 900, 2.0, 5.8, 20, 28);
    this.createStructureUnit('red_t1', 'Red Outer Tower', 'red', 'TOWER', 0, -26, 750, 1.9, 5.5, 20, 26);
    this.createStructureUnit('red_t2', 'Red Base Tower', 'red', 'TOWER', 0, -44, 900, 2.0, 5.8, 20, 28);

    this.createHeroBotUnit();
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
   * Spawns sculpted 3D Dummy Player Models for all heroes in the courtyard right in front
   * of the player's starting spawn so you can inspect their 3D rigs, weapons, and test damage/wall-slams.
   */
  private spawnHeroTrainingDummies() {
    const dummySpots: { hero: FpsHeroDef; x: number; z: number; yaw: number }[] = [
      { hero: FPS_MOBA_HEROES[0], x: -14.0, z: 55.5, yaw: 0.45 },
      { hero: FPS_MOBA_HEROES[1], x: -8.5, z: 51.0, yaw: 0.25 },
      { hero: FPS_MOBA_HEROES[2], x: -3.5, z: 48.5, yaw: 0.08 },
      { hero: FPS_MOBA_HEROES[3], x: 3.5, z: 48.5, yaw: -0.08 },
      { hero: FPS_MOBA_HEROES[4], x: 8.5, z: 51.0, yaw: -0.25 },
      { hero: FPS_MOBA_HEROES[5], x: 14.0, z: 55.5, yaw: -0.45 }
    ];

    dummySpots.forEach(({ hero, x, z, yaw }) => {
      if (!hero) return;
      const spawnPos = new THREE.Vector3(x, 0, z);

      // Glowing Hologram Target Pad on the floor so you see each dummy's station
      const padGroup = new THREE.Group();
      padGroup.position.set(x, 0.04, z);
      const padRing = new THREE.Mesh(
        new THREE.RingGeometry(1.05, 1.32, 28),
        new THREE.MeshBasicMaterial({
          color: hero.color,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide
        })
      );
      padRing.rotation.x = -Math.PI / 2;
      const innerDisc = new THREE.Mesh(
        new THREE.CircleGeometry(1.02, 24),
        new THREE.MeshBasicMaterial({
          color: hero.color,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide
        })
      );
      innerDisc.rotation.x = -Math.PI / 2;
      padGroup.add(padRing, innerDisc);
      this.scene.add(padGroup);

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

      const unit: MobaUnit = {
        id: `dummy_hero_${hero.id}`,
        name: `${hero.name} [Dummy]`,
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
        attackRange: 0,
        attackDamage: 0,
        attackCooldown: 999,
        attackTimer: 999,
        moveSpeed: 1.0, // Positive so knockbacks & Wall Slams push the dummy!
        goldValue: 50,
        xpValue: 40,
        alive: true,
        isDummy: true,
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
    const bgGeo = new THREE.PlaneGeometry(width, 0.18);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x020617, side: THREE.DoubleSide });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.position.y = y;
    parent.add(bgMesh);

    const fillGeo = new THREE.PlaneGeometry(width * 0.96, 0.12);
    const fillMat = new THREE.MeshBasicMaterial({
      color: team === 'blue' ? 0x38bdf8 : 0xf43f5e,
      side: THREE.DoubleSide
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(0, y, 0.01);
    parent.add(fillMesh);
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

    if (code === 'KeyQ') this.tryCastAbility('Q');
    else if (code === 'KeyE') this.tryCastAbility('E');
    else if (code === 'KeyF') this.tryCastAbility('F');
    else if (code === 'KeyR') this.tryCastAbility('R');
    else if (code === 'KeyV') this.executeQuickMelee();
    else if (code === 'KeyC') this.startReload();
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
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
      if (this.isBarrierActive() && this.hero.abilities.Q.kind === 'SHIELD_BASH' && this.cooldowns.Q.remainingMs <= 0) {
        this.tryCastAbility('Q');
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
    } else if (e.button === 2) {
      this.rightMouseDown = false;
      if (this.isChargingPunch) {
        this.releaseChargedPunch();
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
  }

  private isBarrierActive(): boolean {
    return (
      this.rightMouseDown &&
      this.hero.secondaryFire.kind === 'BARRIER_SHIELD' &&
      this.barrierHp > 0 &&
      this.playerRespawnTimer <= 0
    );
  }

  // ─────────────────────────────────────────────────────────────
  //  Secondary Fire (M2): Barrier Shield, Charged Rocket Punch, or Helix Rocket
  // ─────────────────────────────────────────────────────────────
  private startSecondaryFire() {
    if (this.playerRespawnTimer > 0 || this.winner) return;
    const sec = this.hero.secondaryFire;

    if (sec.kind === 'CHARGED_PUNCH') {
      if (this.secondaryCooldownMs > 0) return;
      this.isChargingPunch = true;
      this.punchChargeMs = 0;
    } else if (sec.kind === 'HELIX_ROCKET') {
      if (this.secondaryCooldownMs > 0) return;
      this.secondaryCooldownMs = sec.cooldownMs ?? 5000;
      this.viewModel.triggerFireRecoil();
      const targetPt = this.getAimGroundPoint(85);
      const muzzle = new THREE.Vector3(0.28, -0.22, -0.75).applyMatrix4(this.camera.matrixWorld);
      this.spawnBeamTracer(muzzle, targetPt, sec.color, 0.35, 0.14);
      this.spawnImpactRing(targetPt, sec.color, 5.0);
      this.damageEnemiesInRadius(targetPt, 5.0, sec.maxDamage ?? 75, sec.name);
    }
  }

  private releaseChargedPunch() {
    const sec = this.hero.secondaryFire;
    const maxCharge = sec.maxChargeMs ?? 1000;
    const ratio = Math.min(1, Math.max(0.2, this.punchChargeMs / maxCharge));
    this.isChargingPunch = false;
    this.punchChargeMs = 0;
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
    if (this.fireCooldownMs > 0) return;
    this.fireCooldownMs = 450;
    this.viewModel.triggerQuickMelee();
    this.performMeleeCleave(38, 4.2, 95, 3.5, 'Quick Melee');
  }

  private tryPrimaryFire() {
    if (this.playerRespawnTimer > 0 || this.winner || this.isChargingPunch) return;
    if (this.isBarrierActive()) return;
    if (this.isReloading || this.fireCooldownMs > 0) return;

    const wep = this.hero.weapon;

    // 1. MELEE CLEAVE HEROES (Higuruma Gavel / Executioner's Sword / Brigid Flail)
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

    // 2. RANGED / HAND CANNON HEROES
    if (this.ammo <= 0 && !this.activeDomain) {
      if (!wep.autoRegenAmmo) this.startReload();
      return;
    }

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
          const dmg = Math.round((wep.damage + (this.level - 1) * 2.5) * (isHeadshot ? 1.6 : 1.0));
          if (isHeadshot && this.hero.id === 'vex') {
            this.mana = Math.min(this.maxMana, this.mana + 4);
          }
          this.damageUnit(unit, dmg, isHeadshot, wep.name, hit.point);
        }
        this.spawnImpactRing(hit.point, wep.projectileColor, 0.35);
      }

      this.spawnBeamTracer(muzzleWorld, endPoint, wep.projectileColor, 0.14);
    }
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
  //  Overwatch-Style Special Abilities (Q / E / F / R)
  // ─────────────────────────────────────────────────────────────
  private tryCastAbility(key: FpsAbilityKey) {
    const ab = this.hero.abilities[key];
    const cd = this.cooldowns[key];
    if (cd.remainingMs > 0 || this.mana < ab.manaCost) return;

    this.mana -= ab.manaCost;
    cd.remainingMs = ab.cooldownMs;
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
        const orbPos = this.camera.position.clone().add(forward.clone().multiplyScalar(1.5));
        const orbVel = forward.clone().multiplyScalar(22);
        const orbMesh = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.65, 2),
          new THREE.MeshBasicMaterial({ color: ab.color, wireframe: true })
        );
        orbMesh.position.copy(orbPos);
        this.scene.add(orbMesh);

        let detonated = false;
        this.vfxList.push({
          mesh: orbMesh,
          age: 0,
          maxAge: ab.durationMs / 1000,
          onUpdate: (dt, progress) => {
            if (progress < 0.45) {
              orbMesh.position.addScaledVector(orbVel, dt);
              if (orbMesh.position.y < 1.1) orbMesh.position.y = 1.1;
            } else {
              for (const u of this.units) {
                if (!u.alive || u.team !== 'red' || u.moveSpeed === 0) continue;
                const d = u.group.position.distanceTo(orbMesh.position);
                if (d < ab.radius && d > 0.8) {
                  const pull = orbMesh.position.clone().sub(u.group.position).normalize();
                  u.group.position.addScaledVector(pull, dt * 8.5);
                }
              }
            }
            orbMesh.rotation.y += dt * 7;
            orbMesh.rotation.x += dt * 5;

            if (progress >= 0.92 && !detonated) {
              detonated = true;
              this.spawnImpactRing(orbMesh.position, ab.color, ab.radius);
              this.damageEnemiesInRadius(orbMesh.position, ab.radius, ab.damage, ab.name);
            }
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
      this.scene.remove(this.activeDomain.domeMesh);
      this.scene.remove(this.activeDomain.ringMesh);
    }

    const center = this.playerPos.clone();
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
    this.scene.add(domeMesh);

    const ringGeo = new THREE.RingGeometry(ab.radius * 0.94, ab.radius, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: ab.color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(center.x, 0.08, center.z);
    this.scene.add(ringMesh);

    this.activeDomain = {
      name: ab.name,
      isRally,
      center,
      radius: ab.radius,
      remainingMs: ab.durationMs,
      tickTimerMs: 250,
      color: ab.color,
      domeMesh,
      ringMesh
    };
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

  private damageUnit(
    unit: MobaUnit,
    amount: number,
    isCrit: boolean,
    sourceName: string,
    hitWorldPos: THREE.Vector3,
    customLabel?: string
  ) {
    if (!unit.alive || this.winner) return;
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
        color: isCrit ? '#facc15' : this.hero.color
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
      this.updateMobaUnits(dt, elapsed);
    }

    this.updateVfx(dt);
    this.mapBuilder.updateSky(elapsed, Boolean(this.activeDomain), this.activeDomain?.color);
    this.renderer.render(this.scene, this.camera);

    this.hudThrottle += dt;
    if (this.hudThrottle >= 0.05) {
      this.hudThrottle = 0;
      this.emitHud();
    }
  };

  private updatePlayer(dt: number, elapsed: number) {
    const dtMs = dt * 1000;
    this.mana = Math.min(this.maxMana, this.mana + 9.0 * dt);
    this.hitMarkerAlpha = Math.max(0, this.hitMarkerAlpha - dt * 4.5);

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

    // Barrier Shield regeneration when lowered
    if (this.barrierMaxHp > 0) {
      if (this.isBarrierActive()) {
        this.barrierRegenDelaySec = 1.4;
      } else {
        if (this.barrierRegenDelaySec > 0) {
          this.barrierRegenDelaySec = Math.max(0, this.barrierRegenDelaySec - dt);
        } else if (this.barrierHp < this.barrierMaxHp) {
          const regen = this.hero.secondaryFire.barrierRegenPerSec ?? 100;
          this.barrierHp = Math.min(this.barrierMaxHp, this.barrierHp + regen * dt);
        }
      }
    }

    // Doomfist Hand Cannon auto-ammo regeneration
    if (this.hero.weapon.autoRegenAmmo && this.ammo < this.maxAmmo) {
      this.autoRegenTimerMs -= dtMs;
      if (this.autoRegenTimerMs <= 0) {
        this.ammo++;
        this.autoRegenTimerMs = this.hero.weapon.reloadTimeMs;
      }
    }

    (['Q', 'E', 'F', 'R'] as FpsAbilityKey[]).forEach((k) => {
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
    const isSprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && !this.isBarrierActive();
    const domainSpeedBonus = this.activeDomain ? 1.28 : 1.0;
    const shieldPenalty = this.isBarrierActive() || this.isChargingPunch ? 0.72 : 1.0;
    const speed = this.hero.moveSpeed * (isSprinting ? 1.32 : 1.0) * domainSpeedBonus * shieldPenalty;

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

    if (this.keys.has('Space') && this.grounded) {
      this.playerVel.y = 11.2;
      this.grounded = false;
    }
    this.playerVel.y -= 28.0 * dt;

    const nextX = this.playerPos.x + this.playerVel.x * dt;
    const nextZ = this.playerPos.z + this.playerVel.z * dt;
    const resolved = this.mapBuilder.resolveHorizontalCollision(nextX, nextZ, 0.65, this.playerPos.y);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

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
    this.viewModel.setSecondaryState({
      isBarrierActive: this.isBarrierActive(),
      barrierHpRatio: this.barrierMaxHp > 0 ? this.barrierHp / this.barrierMaxHp : 1,
      punchChargeRatio: this.isChargingPunch ? this.punchChargeMs / maxCharge : 0,
      isExecutionerActive: this.executionerTimerSec > 0
    });
    this.viewModel.update(dt, elapsed, isMoving, isSprinting, this.grounded);
  }

  private syncCameraToPlayer() {
    this.camera.position.set(this.playerPos.x, this.playerPos.y + 1.72, this.playerPos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  private updateDomainExpansion(dt: number) {
    if (!this.activeDomain) return;
    const dom = this.activeDomain;
    dom.remainingMs -= dt * 1000;
    dom.tickTimerMs -= dt * 1000;

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
            this.hero.abilities.R.damage,
            false,
            dom.name,
            u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.8, 0))
          );
        }
      }
    }

    if (dom.remainingMs <= 0) {
      this.scene.remove(dom.domeMesh);
      this.scene.remove(dom.ringMesh);
      this.activeDomain = null;
    }
  }

  private updateMobaUnits(dt: number, elapsed: number) {
    this.waveTimerSec -= dt;
    if (this.waveTimerSec <= 0) {
      this.waveTimerSec = 14.0;
      this.spawnMinionWave();
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];

      if (!u.alive) {
        if (u.type === 'HERO' && u.respawnTimer !== undefined) {
          u.respawnTimer -= dt;
          if (u.respawnTimer <= 0 && u.spawnPos) {
            u.alive = true;
            u.hp = u.maxHp;
            u.group.position.copy(u.spawnPos);
            u.group.visible = true;
          }
        } else if (u.type === 'MINION') {
          this.units.splice(i, 1);
        }
        continue;
      }

      const hpRatio = Math.max(0.001, u.hp / u.maxHp);
      u.hpBarFill.scale.x = hpRatio;
      u.hpBarFill.lookAt(this.camera.position);
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

      // Hero Training Dummies stay at their sparring stations, return to pad & regen out of combat
      if (u.isDummy) {
        u.animateRig?.(elapsed, false, false);
        if (u.outOfCombatTimer && u.outOfCombatTimer > 0) {
          u.outOfCombatTimer = Math.max(0, u.outOfCombatTimer - dt);
        } else {
          if (u.spawnPos && u.group.position.distanceTo(u.spawnPos) > 0.05) {
            u.group.position.lerp(u.spawnPos, Math.min(1, dt * 4.5));
          }
          if (u.hp < u.maxHp) {
            u.hp = Math.min(u.maxHp, u.hp + 95 * dt);
          }
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
          const inDomainSlow =
            this.activeDomain &&
            u.team === 'red' &&
            u.group.position.distanceTo(this.activeDomain.center) <= this.activeDomain.radius
              ? 0.55
              : 1.0;
          u.group.position.addScaledVector(dir, u.moveSpeed * inDomainSlow * dt);
        }
      }

      u.attackTimer -= dt;
      if (u.attackTimer <= 0 && bestDist <= u.attackRange) {
        u.attackTimer = u.attackCooldown;
        const origin = u.group.position.clone().add(new THREE.Vector3(0, u.height * 0.75, 0));
        const beamCol = u.team === 'blue' ? '#38bdf8' : '#f43f5e';

        if (targetIsPlayer) {
          const playerChest = this.playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
          this.spawnBeamTracer(origin, playerChest, beamCol, 0.18, 0.06);
          this.applyDamageToPlayer(u.attackDamage, u.name, u.team);
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

    this.onHudUpdate({
      hero: this.hero,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      shield: Math.round(this.shield),
      mana: Math.round(this.mana),
      maxMana: this.maxMana,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      isReloading: this.isReloading,
      isUsingSecondary: this.isBarrierActive() || this.isChargingPunch,
      barrierHp: Math.round(this.barrierHp),
      barrierMaxHp: this.barrierMaxHp,
      punchChargeRatio: this.isChargingPunch ? Math.min(1, this.punchChargeMs / maxCharge) : 0,
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
        (this.executionerTimerSec > 0
          ? `DEADLY SENTENCING · EXECUTIONER'S SWORD (${this.executionerTimerSec.toFixed(1)}s)`
          : null),
      blueCoreHp: blueCore ? Math.round(blueCore.hp) : 0,
      blueCoreMaxHp: blueCore?.maxHp ?? 1600,
      redCoreHp: redCore ? Math.round(redCore.hp) : 0,
      redCoreMaxHp: redCore?.maxHp ?? 1600,
      winner: this.winner,
      cooldowns: {
        Q: { ...this.cooldowns.Q },
        E: { ...this.cooldowns.E },
        F: { ...this.cooldowns.F },
        R: { ...this.cooldowns.R }
      },
      killFeed: [...this.killFeed],
      damagePopups: [...this.damagePopups],
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
