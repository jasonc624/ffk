import * as THREE from 'three';
import type { FpsHeroDef } from '../types';
import { getMahoganyWoodTexture } from './ProceduralHeroBuilder';

/**
 * FpsViewModel — Renders Overwatch-style First-Person 3D Weapons, Melee Hammers/Flails,
 * Doom Gauntlets, and Deployable Barrier Shields directly in camera space.
 */
export class FpsViewModel {
  public root: THREE.Group;
  private hero: FpsHeroDef;
  private rightWeaponGroup: THREE.Group;
  private leftHandGroup: THREE.Group;
  private barrierShieldGroup: THREE.Group;
  private barrierShieldMat!: THREE.MeshBasicMaterial;
  private barrierBorderMat!: THREE.MeshBasicMaterial;
  private coreMesh!: THREE.Mesh;
  private gavelHeadGroup?: THREE.Group;
  private executionerSwordGroup?: THREE.Group;
  private muzzleLight: THREE.PointLight;

  // Animation states
  private recoilOffset = 0;
  private swingProgress = 0; // 0..1 during melee swing
  private swingDir = 1; // Alternates +1 (right-to-left) and -1 (left-to-right)
  private punchChargeRatio = 0; // 0..1 while charging Doomfist Rocket Punch
  private punchLungeProgress = 0; // 0..1 when releasing Rocket Punch
  private shieldDeployRatio = 0; // 0..1 when holding M2 Barrier Shield
  private castAnimProgress = 0;
  private quickMeleeProgress = 0; // 0..1 when performing a left-hand Quick Melee strike
  private reloadTimer = 0;
  private walkTime = 0;
  private swayX = 0;
  private swayY = 0;

  constructor(camera: THREE.PerspectiveCamera, hero: FpsHeroDef) {
    this.hero = hero;
    this.root = new THREE.Group();
    camera.add(this.root);

    const primaryCol = new THREE.Color(hero.color);
    const accentCol = new THREE.Color(hero.accentColor);

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.8
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.65
    });

    const glowMat = new THREE.MeshBasicMaterial({
      color: primaryCol,
      transparent: true,
      opacity: 0.95
    });

    const accentMat = new THREE.MeshBasicMaterial({
      color: accentCol,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });

    this.rightWeaponGroup = new THREE.Group();
    this.leftHandGroup = new THREE.Group();
    this.leftHandGroup.visible = false; // Hidden unless performing a melee strike
    this.barrierShieldGroup = new THREE.Group();

    this.root.add(this.rightWeaponGroup);
    this.root.add(this.leftHandGroup);
    this.root.add(this.barrierShieldGroup);

    this.muzzleLight = new THREE.PointLight(primaryCol, 0, 7, 2);
    this.muzzleLight.position.set(0, 0.05, -0.75);
    this.rightWeaponGroup.add(this.muzzleLight);

    const vmType = hero.weapon.viewModelType;
    if (vmType === 'HAMMER') {
      this.buildHammerViewModel(darkMetalMat, trimMat, glowMat, accentMat);
    } else if (vmType === 'FLAIL') {
      this.buildFlailViewModel(darkMetalMat, trimMat, glowMat, accentMat);
    } else if (vmType === 'DOOM_GAUNTLET') {
      this.buildDoomGauntletViewModel(darkMetalMat, trimMat, glowMat, accentMat);
    } else {
      this.buildRifleViewModel(darkMetalMat, trimMat, glowMat, accentMat);
    }

    this.buildBarrierShieldOverlay();
  }

  private buildHammerViewModel(
    darkMat: THREE.Material,
    trimMat: THREE.Material,
    glowMat: THREE.Material,
    accentMat: THREE.Material
  ) {
    const woodMat = new THREE.MeshStandardMaterial({
      map: getMahoganyWoodTexture(),
      roughness: 0.42,
      metalness: 0.16
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd9a038,
      roughness: 0.28,
      metalness: 0.86,
      emissive: 0x451a03,
      emissiveIntensity: 0.18
    });
    const darkRimMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.85
    });

    // High-Poly Mahogany Gavel Shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.96, 28), woodMat);
    shaft.position.set(0, 0.08, -0.14);
    shaft.rotation.x = -0.35;
    shaft.rotation.z = 0.24;
    this.rightWeaponGroup.add(shaft);

    // 1. HIGURUMA'S HIGH-POLY MAHOGANY & BRASS JUDGE'S GAVEL HEAD
    const headGroup = new THREE.Group();
    headGroup.position.set(-0.09, 0.40, -0.32);
    headGroup.rotation.z = 0.24;
    this.gavelHeadGroup = headGroup;

    // Main Cylindrical Mahogany Barrel (48 segments)
    const barrelGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.46, 48);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, woodMat);
    headGroup.add(barrelMesh);

    // Chamfered Wooden Striking End-Caps
    [-1, 1].forEach((side) => {
      const bevelGeo = new THREE.CylinderGeometry(0.105, 0.125, 0.032, 48);
      bevelGeo.rotateZ(side * (Math.PI / 2));
      const bevel = new THREE.Mesh(bevelGeo, woodMat);
      bevel.position.x = side * 0.246;
      headGroup.add(bevel);
    });

    // 3 Brushed Brass Bands + Dark Edge Trims + 3D Rivet Studs
    const bandGeo = new THREE.CylinderGeometry(0.132, 0.132, 0.048, 48);
    bandGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.008, 48);
    rimGeo.rotateZ(Math.PI / 2);
    const rivetGeo = new THREE.SphereGeometry(0.0085, 10, 10);

    [-0.19, 0, 0.19].forEach((offsetX) => {
      const band = new THREE.Mesh(bandGeo, brassMat);
      band.position.x = offsetX;
      headGroup.add(band);

      [-0.025, 0.025].forEach((rimOff) => {
        const rim = new THREE.Mesh(rimGeo, darkRimMat);
        rim.position.x = offsetX + rimOff;
        headGroup.add(rim);
      });

      for (let r = 0; r < 8; r++) {
        const a = (r / 8) * Math.PI * 2;
        const rivet = new THREE.Mesh(rivetGeo, brassMat);
        rivet.position.set(offsetX, Math.cos(a) * 0.133, Math.sin(a) * 0.133);
        headGroup.add(rivet);
      }
    });

    // Subtle Cursed-Energy Courtroom Seal floating on Gavel Top
    this.coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), accentMat);
    this.coreMesh.position.set(0, 0.155, 0);
    headGroup.add(this.coreMesh);

    this.rightWeaponGroup.add(headGroup);

    // 2. GOLDEN EXECUTIONER'S SWORD (Morphs during R Ultimate!)
    const swordGroup = new THREE.Group();
    swordGroup.position.set(-0.08, 0.38, -0.30);
    swordGroup.rotation.x = -0.35;
    swordGroup.rotation.z = 0.22;
    swordGroup.visible = false;
    this.executionerSwordGroup = swordGroup;

    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a
    });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.025), bladeMat);
    blade.position.y = 0.22;
    const crossGuard = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.065, 0.045), glowMat);
    crossGuard.position.y = 0.12;
    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 24), accentMat);
    haloRing.position.y = 0.12;
    swordGroup.add(blade, crossGuard, haloRing);

    this.rightWeaponGroup.add(swordGroup);

    // Left Non-Violence Pact Ward Bracer (Attorney Badge & Scales Emblem)
    const bracer = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.36), darkMat);
    const attorneyBadge = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glowMat);
    attorneyBadge.position.set(0.05, 0.06, -0.1);
    const goldCuff = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), brassMat);
    goldCuff.position.z = -0.14;
    this.leftHandGroup.add(bracer, attorneyBadge, goldCuff);
  }

  private buildFlailViewModel(
    darkMat: THREE.Material,
    trimMat: THREE.Material,
    glowMat: THREE.Material,
    accentMat: THREE.Material
  ) {
    // Handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.52, 10), trimMat);
    handle.position.set(0, -0.02, -0.1);
    handle.rotation.x = -0.3;
    this.rightWeaponGroup.add(handle);

    // Energy Chain Link
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), glowMat);
    chain.position.set(0, 0.22, -0.22);
    chain.rotation.x = -0.5;
    this.rightWeaponGroup.add(chain);

    // Spiked Morningstar Flail Head
    const flailHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), darkMat);
    flailHead.position.set(0, 0.34, -0.32);
    this.rightWeaponGroup.add(flailHead);

    this.coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), accentMat);
    this.coreMesh.position.copy(flailHead.position);
    this.rightWeaponGroup.add(this.coreMesh);

    // Left Riot Shield Arm
    const bracer = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.36), trimMat);
    const trimStrip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.32), glowMat);
    trimStrip.position.y = 0.07;
    this.leftHandGroup.add(bracer, trimStrip);
  }

  private buildDoomGauntletViewModel(
    darkMat: THREE.Material,
    trimMat: THREE.Material,
    glowMat: THREE.Material,
    accentMat: THREE.Material
  ) {
    // Massive Right-Hand Cyber-Cursed Doom Gauntlet
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.52), darkMat);
    forearm.position.set(0.05, 0, -0.05);
    this.rightWeaponGroup.add(forearm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.26, 0.28), trimMat);
    fist.position.set(0.05, 0.02, -0.36);
    this.rightWeaponGroup.add(fist);

    // Glowing Knuckle Ridges
    for (let i = -1; i <= 1; i++) {
      const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), glowMat);
      knuckle.position.set(0.05 + i * 0.075, 0.08, -0.5);
      this.rightWeaponGroup.add(knuckle);
    }

    this.coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 1), accentMat);
    this.coreMesh.position.set(0.05, 0.14, -0.22);
    this.rightWeaponGroup.add(this.coreMesh);

    // Left-Hand 4-Barrel Knuckle Hand Cannon
    const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.34), darkMat);
    this.leftHandGroup.add(leftGlove);
    for (let b = 0; b < 4; b++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), glowMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(-0.04 + b * 0.028, 0.055, -0.18);
      this.leftHandGroup.add(barrel);
    }
  }

  private buildRifleViewModel(
    darkMat: THREE.Material,
    trimMat: THREE.Material,
    glowMat: THREE.Material,
    accentMat: THREE.Material
  ) {
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.56), darkMat);
    const shroudMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.48), trimMat);
    shroudMesh.position.set(0, 0.08, -0.04);

    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.42, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const topBarrel = new THREE.Mesh(barrelGeo, trimMat);
    topBarrel.position.set(0, 0.035, -0.34);
    const botBarrel = new THREE.Mesh(barrelGeo, glowMat);
    botBarrel.position.set(0, -0.02, -0.32);

    const sightMesh = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.038, 16), glowMat);
    sightMesh.position.set(0, 0.135, -0.14);

    this.coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), accentMat);
    this.coreMesh.position.set(0, 0.02, -0.05);

    this.rightWeaponGroup.add(bodyMesh, shroudMesh, topBarrel, botBarrel, sightMesh, this.coreMesh);

    const bracerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.34), darkMat);
    bracerMesh.rotation.set(0.12, -0.18, 0);
    const leftOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), glowMat);
    leftOrb.position.set(0.04, 0.11, -0.14);
    this.leftHandGroup.add(bracerMesh, leftOrb);
  }

  private buildBarrierShieldOverlay() {
    const shieldCol = new THREE.Color(this.hero.secondaryFire.color || this.hero.color);
    const isWide = this.hero.id === 'higuruma' || this.hero.id === 'titan';
    const w = isWide ? 2.4 : 1.35;
    const h = isWide ? 1.55 : 1.35;

    this.barrierShieldMat = new THREE.MeshBasicMaterial({
      color: shieldCol,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.barrierShieldMat);

    this.barrierBorderMat = new THREE.MeshBasicMaterial({
      color: shieldCol,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 6), this.barrierBorderMat);
    gridPlane.position.z = 0.01;

    this.barrierShieldGroup.add(plane, gridPlane);
    this.barrierShieldGroup.position.set(0, 0, -0.82);
    this.barrierShieldGroup.visible = false;
  }

  public onMouseLook(dx: number, dy: number) {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00018, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00018, -0.04, 0.04);
  }

  public triggerFireRecoil() {
    if (this.hero.weapon.fireMode === 'MELEE_CLEAVE') {
      this.swingProgress = 1.0;
      this.swingDir *= -1;
      this.muzzleLight.intensity = 4.5;
    } else if (this.hero.weapon.fireMode === 'HAND_CANNON') {
      // Left-hand knuckle blast + recoil
      this.castAnimProgress = 0.75;
      this.recoilOffset = 0.06;
      this.muzzleLight.intensity = 5.0;
    } else {
      this.recoilOffset = 0.11;
      this.muzzleLight.intensity = 6.0;
    }
  }

  public triggerRocketPunchLunge() {
    this.punchLungeProgress = 1.0;
    this.muzzleLight.intensity = 8.0;
  }

  public triggerCastGesture() {
    this.castAnimProgress = 1.0;
  }

  public triggerQuickMelee() {
    this.quickMeleeProgress = 1.0;
    this.muzzleLight.intensity = 3.5;
  }

  public triggerReload(durationSec: number) {
    this.reloadTimer = durationSec;
  }

  public setSecondaryState(opts: {
    isBarrierActive: boolean;
    barrierHpRatio: number;
    punchChargeRatio: number;
    isExecutionerActive?: boolean;
  }) {
    this.punchChargeRatio = opts.punchChargeRatio;

    if (this.gavelHeadGroup && this.executionerSwordGroup) {
      const execActive = Boolean(opts.isExecutionerActive);
      this.gavelHeadGroup.visible = !execActive;
      this.executionerSwordGroup.visible = execActive;
    }

    if (opts.isBarrierActive) {
      this.shieldDeployRatio = THREE.MathUtils.lerp(this.shieldDeployRatio, 1.0, 0.25);
      this.barrierShieldGroup.visible = true;
      this.barrierShieldMat.opacity = 0.18 * this.shieldDeployRatio;
      this.barrierBorderMat.opacity = (0.35 + (1 - opts.barrierHpRatio) * 0.35) * this.shieldDeployRatio;
      this.barrierShieldGroup.scale.setScalar(0.5 + 0.5 * this.shieldDeployRatio);
    } else {
      this.shieldDeployRatio = THREE.MathUtils.lerp(this.shieldDeployRatio, 0.0, 0.25);
      if (this.shieldDeployRatio < 0.02) {
        this.barrierShieldGroup.visible = false;
      } else {
        this.barrierShieldMat.opacity = 0.18 * this.shieldDeployRatio;
        this.barrierBorderMat.opacity = 0.35 * this.shieldDeployRatio;
      }
    }
  }

  public update(dt: number, elapsed: number, isMoving: boolean, isSprinting: boolean, grounded: boolean) {
    if (isMoving && grounded) {
      this.walkTime += dt * (isSprinting ? 13 : 9);
    } else {
      this.walkTime = THREE.MathUtils.lerp(this.walkTime, 0, dt * 6);
    }

    const bobX = isMoving && grounded ? Math.cos(this.walkTime) * 0.015 : 0;
    const bobY = isMoving && grounded ? Math.abs(Math.sin(this.walkTime)) * 0.018 : Math.sin(elapsed * 2) * 0.004;

    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, dt * 10);
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, dt * 10);
    this.recoilOffset = THREE.MathUtils.lerp(this.recoilOffset, 0, dt * 14);
    this.muzzleLight.intensity = THREE.MathUtils.lerp(this.muzzleLight.intensity, 0, dt * 20);
    this.castAnimProgress = Math.max(0, this.castAnimProgress - dt * 3.2);
    this.quickMeleeProgress = Math.max(0, this.quickMeleeProgress - dt * 4.2);
    this.swingProgress = Math.max(0, this.swingProgress - dt * 3.6);
    this.punchLungeProgress = Math.max(0, this.punchLungeProgress - dt * 4.2);

    let reloadPitch = 0;
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      reloadPitch = Math.sin(this.reloadTimer * Math.PI * 2.5) * 0.45;
    }

    // 1. Melee Cleave Swing Animation (Hammer / Flail)
    const swingSin = Math.sin((1 - this.swingProgress) * Math.PI);
    const swingArcX = this.swingProgress > 0 ? -this.swingDir * Math.cos((1 - this.swingProgress) * Math.PI) * 0.42 : 0;
    const swingYaw = this.swingProgress > 0 ? this.swingDir * swingSin * 1.35 : 0;
    const swingPitch = this.swingProgress > 0 ? -swingSin * 0.55 : 0;

    // 2. Doomfist Charge Pullback & Shake + Lunge Thrust
    const chargeShake = this.punchChargeRatio > 0 ? (Math.random() - 0.5) * 0.016 * this.punchChargeRatio : 0;
    const chargePullZ = this.punchChargeRatio * 0.18;
    const lungeZ = -Math.sin(this.punchLungeProgress * Math.PI) * 0.55;

    this.rightWeaponGroup.position.set(
      0.34 + bobX + this.swayX + swingArcX + chargeShake,
      -0.28 + bobY + this.swayY - this.recoilOffset * 0.15 + chargeShake,
      -0.58 + this.recoilOffset + chargePullZ + lungeZ
    );
    this.rightWeaponGroup.rotation.set(
      this.recoilOffset * 0.9 + reloadPitch + swingPitch,
      this.swayX * 1.5 + swingYaw,
      this.swingProgress > 0 ? -this.swingDir * 0.65 * swingSin : 0
    );

    if (this.coreMesh) {
      this.coreMesh.rotation.x = elapsed * (3.5 + this.punchChargeRatio * 12);
      this.coreMesh.rotation.y = elapsed * (5.0 + this.punchChargeRatio * 12);
    }

    // Left hand is only visible when actively performing a Quick Melee strike
    if (this.quickMeleeProgress > 0.01) {
      this.leftHandGroup.visible = true;
      const meleeThrust = Math.sin((1 - this.quickMeleeProgress) * Math.PI);
      this.leftHandGroup.position.set(
        -0.38 + meleeThrust * 0.32,
        -0.34 + meleeThrust * 0.24,
        -0.35 - meleeThrust * 0.45
      );
      this.leftHandGroup.rotation.set(meleeThrust * 0.55, meleeThrust * 0.35, -meleeThrust * 0.25);
    } else {
      this.leftHandGroup.visible = false;
    }
  }
}
