import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { FpsHeroDef } from '../types';
import {
  applyAnimeToonToScene,
  getAnimeToonGradient,
  getMahoganyWoodTexture,
  loadCachedGlb
} from './ProceduralHeroBuilder';
import {
  createCursedEnergyOrb,
  createInfinityDistortionMaterial,
  createSkyVeilDistortionMaterial,
  type CursedOrbController
} from '../vfx/CursedShaderVfx';
import { getHandDistanceOffset } from '../storage';

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
  private gojoPovGroup?: THREE.Group;
  private gojoHolder?: THREE.Group;
  private gojoLeftArmMat?: THREE.Material;
  private gojoLeftNailMat?: THREE.Material;
  private gojoMixer?: THREE.AnimationMixer;
  private gojoIdleAction?: THREE.AnimationAction;
  private gojoChargeAction?: THREE.AnimationAction;
  private gojoFireAction?: THREE.AnimationAction;
  private gojoPurpleAction?: THREE.AnimationAction;
  private gojoRedChargeOrb?: CursedOrbController;
  private gojoBlueChargeOrb?: CursedOrbController;
  private infinityDistortionMat?: THREE.ShaderMaterial;
  private primaryChargeRatio = 0;
  private blueChargeRatio = 0;
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
  private handDistanceOffset = getHandDistanceOffset();

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
    if (hero.id === 'gojo') {
      this.buildGojoPovViewModel(darkMetalMat, glowMat);
    } else if (vmType === 'JOGO_HANDS') {
      this.buildJogoHandsViewModel();
    } else if (vmType === 'MEGUMI_SHADOW') {
      this.buildMegumiShadowViewModel();
    } else if (vmType === 'URO_SKY_HANDS') {
      this.buildUroSkyHandsViewModel();
    } else if (vmType === 'HAMMER') {
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

  private buildJogoHandsViewModel() {
    const ashSkinMat = new THREE.MeshToonMaterial({
      color: 0x5c534c,
      emissive: 0x451205,
      emissiveIntensity: 0.25,
      gradientMap: getAnimeToonGradient()
    });
    const sleeveMat = new THREE.MeshToonMaterial({
      color: 0x241d18,
      gradientMap: getAnimeToonGradient()
    });
    const lavaVeinMat = new THREE.MeshBasicMaterial({
      color: 0xff4500
    });
    const emberCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15
    });

    const handRoot = new THREE.Group();
    handRoot.position.set(0.02, -0.02, 0.08);
    handRoot.rotation.set(0.18, 0.28, 0.22);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.24, 14), sleeveMat);
    sleeve.rotation.x = Math.PI * 0.5;
    sleeve.position.set(0.02, -0.04, 0.2);
    handRoot.add(sleeve);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.06, 0.22, 14), ashSkinMat);
    forearm.rotation.x = Math.PI * 0.5;
    forearm.position.set(0, -0.02, 0.04);
    handRoot.add(forearm);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.04, 0.11), ashSkinMat);
    palm.position.set(0, 0.0, -0.09);
    handRoot.add(palm);

    const wristVein = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 16), lavaVeinMat);
    wristVein.position.set(0, -0.015, -0.02);
    handRoot.add(wristVein);

    const fingerOffsets = [-0.036, -0.012, 0.012, 0.036];
    for (let i = 0; i < fingerOffsets.length; i++) {
      const fx = fingerOffsets[i];
      const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.09, 8), ashSkinMat);
      finger.rotation.x = Math.PI * 0.42;
      finger.position.set(fx, 0.012, -0.175);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.036, 8), lavaVeinMat);
      tip.rotation.x = -Math.PI * 0.58;
      tip.position.set(fx, 0.026, -0.225);
      handRoot.add(finger, tip);
    }

    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, 0.075, 8), ashSkinMat);
    thumb.rotation.set(Math.PI * 0.44, 0, -0.55);
    thumb.position.set(-0.062, 0.01, -0.115);
    handRoot.add(thumb);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), emberCoreMat);
    core.position.set(-0.01, 0.075, -0.14);
    const auraRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.006, 8, 20),
      new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending
      })
    );
    auraRing.rotation.x = Math.PI * 0.35;
    core.add(auraRing);
    handRoot.add(core);
    this.coreMesh = core;

    this.rightWeaponGroup.add(handRoot);

    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.064, 0.28, 12), sleeveMat);
    leftForearm.rotation.x = Math.PI * 0.5;
    leftForearm.position.set(0, 0, 0.14);
    const leftFist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.068, 0), ashSkinMat);
    leftFist.position.set(0, 0.01, -0.05);
    this.leftHandGroup.add(leftForearm, leftFist);
    this.leftHandGroup.position.set(-0.32, -0.32, -0.4);
  }

  private buildMegumiShadowViewModel() {
    const sleeveMat = new THREE.MeshToonMaterial({
      color: 0x0f172a,
      gradientMap: getAnimeToonGradient()
    });
    const skinMat = new THREE.MeshToonMaterial({
      color: 0xf6d5c0,
      gradientMap: getAnimeToonGradient()
    });
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      emissive: 0x312e81,
      emissiveIntensity: 0.65,
      metalness: 0.85,
      roughness: 0.22
    });
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x818cf8
    });

    const swordRoot = new THREE.Group();
    swordRoot.position.set(0.05, -0.05, 0.05);
    swordRoot.rotation.set(0.18, 0.22, 0.16);

    // Navy Jujutsu High sleeve & hand gripping hilt
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.24, 12), sleeveMat);
    sleeve.rotation.x = Math.PI * 0.5;
    sleeve.position.set(0.04, -0.1, 0.16);
    const gripHand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.09), skinMat);
    gripHand.position.set(0.01, -0.04, 0.02);

    // Cursed-Tool Broadsword hilt, guard, and wide dark-steel blade
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.24, 10), sleeveMat);
    hilt.position.set(0, -0.05, 0);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.032, 0.06), edgeMat);
    guard.position.set(0, 0.06, -0.02);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.78, 0.024), bladeMat);
    blade.position.set(0, 0.46, -0.03);
    const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.16, 4), bladeMat);
    bladeTip.rotation.y = Math.PI * 0.25;
    bladeTip.position.set(0, 0.92, -0.03);
    const shadowEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.114, 0.78, 0.01),
      new THREE.MeshBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending
      })
    );
    shadowEdge.position.set(0, 0.46, -0.03);

    // Subtle cursed shadow seal floating near the guard
    const seal = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), edgeMat);
    seal.position.set(0, 0.06, -0.06);
    this.coreMesh = seal;

    swordRoot.add(sleeve, gripHand, hilt, guard, blade, bladeTip, shadowEdge, seal);
    this.rightWeaponGroup.add(swordRoot);

    // Left quick-melee / shadow sign hand
    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.06, 0.28, 12), sleeveMat);
    leftForearm.rotation.x = Math.PI * 0.5;
    leftForearm.position.set(0, 0, 0.14);
    const leftFist = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.095), skinMat);
    leftFist.position.set(0, 0.01, -0.05);
    this.leftHandGroup.add(leftForearm, leftFist);
    this.leftHandGroup.position.set(-0.32, -0.32, -0.4);
  }

  private buildUroSkyHandsViewModel() {
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xf7dcd0,
      roughness: 0.56,
      metalness: 0.03
    });
    const skyGlassMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const skyRimMat = new THREE.MeshBasicMaterial({
      color: 0xf0f9ff,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // Right open-palm Sky Manipulation hand
    const handRoot = new THREE.Group();
    handRoot.position.set(0.0, 0.02, -0.04);

    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.34, 14), skinMat);
    forearm.rotation.x = Math.PI * 0.46;
    forearm.position.set(0.04, -0.06, 0.16);
    handRoot.add(forearm);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.032, 0.105), skinMat);
    palm.position.set(0.02, 0.01, -0.04);
    palm.rotation.set(0.28, -0.22, 0.35);
    handRoot.add(palm);

    // Articulated splayed fingers catching the fabric of the sky
    const fingerOffsets = [
      [-0.032, 0.015, -0.105, -0.22],
      [-0.011, 0.024, -0.118, -0.07],
      [0.012, 0.025, -0.120, 0.06],
      [0.033, 0.018, -0.108, 0.19]
    ];
    for (const [fx, fy, fz, spreadY] of fingerOffsets) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.088, 8), skinMat);
      f.rotation.x = Math.PI * 0.42;
      f.rotation.z = spreadY;
      f.position.set(0.02 + fx, fy, fz);
      handRoot.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.07, 8), skinMat);
    thumb.position.set(-0.035, 0.004, -0.052);
    thumb.rotation.set(0.55, 0.35, 0.95);
    handRoot.add(thumb);

    // Translucent warped-sky cuff & floating crystalline spatial distortion prism above palm
    const wristVeil = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 8, 22), skyGlassMat);
    wristVeil.position.set(0.032, -0.022, 0.04);
    wristVeil.rotation.set(Math.PI * 0.48, 0.12, 0.25);
    handRoot.add(wristVeil);

    const skyOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), skyRimMat);
    skyOrb.position.set(-0.02, 0.085, -0.11);
    const skyHalo = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.008, 8, 24), skyGlassMat);
    skyHalo.rotation.x = Math.PI * 0.38;
    skyOrb.add(skyHalo);
    handRoot.add(skyOrb);
    this.coreMesh = skyOrb;

    this.rightWeaponGroup.add(handRoot);

    // Left quick-melee / sky-grab hand
    const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.3, 12), skinMat);
    leftForearm.rotation.x = Math.PI * 0.5;
    leftForearm.position.set(0, 0, 0.14);
    const leftPalm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.034, 0.1), skinMat);
    leftPalm.position.set(0, 0.01, -0.05);
    const leftRing = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.01, 8, 20), skyGlassMat);
    leftRing.position.set(0, 0.01, -0.06);
    this.leftHandGroup.add(leftForearm, leftPalm, leftRing);
    this.leftHandGroup.position.set(-0.32, -0.32, -0.4);
  }

  private buildGojoPovViewModel(darkMat: THREE.Material, glowMat: THREE.Material) {
    this.rightWeaponGroup.visible = false;
    this.leftHandGroup.visible = false;

    this.gojoPovGroup = new THREE.Group();
    this.root.add(this.gojoPovGroup);

    // Pre-create fallback charge orbs in case GLB load is pending
    const fallbackRedOrb = createCursedEnergyOrb({
      variant: 'RED',
      radius: 0.025,
      withLight: false,
      isViewModel: true
    });
    fallbackRedOrb.group.position.set(0.18, -0.13, -0.43);
    fallbackRedOrb.group.visible = false;
    this.gojoPovGroup.add(fallbackRedOrb.group);
    this.gojoRedChargeOrb = fallbackRedOrb;

    const fallbackBlueOrb = createCursedEnergyOrb({
      variant: 'BLUE',
      radius: 0.026,
      withLight: false,
      isViewModel: true
    });
    fallbackBlueOrb.group.position.set(0.18, -0.13, -0.43);
    fallbackBlueOrb.group.visible = false;
    this.gojoPovGroup.add(fallbackBlueOrb.group);
    this.gojoBlueChargeOrb = fallbackBlueOrb;

    if (typeof window === 'undefined') return;
    const toonGrad = getAnimeToonGradient();
    void loadCachedGlb('/models/gojo_pov.glb')
      .then((gltf) => {
        const handScene = cloneSkeleton(gltf.scene) as THREE.Group;

        // Apply authentic Gojo Jujutsu High uniform (black sleeves) and calibrated anime skin tone
        // Separate Left and Right arm groups so Left arm is hidden by default (Genji single-hand stance)
        // and only becomes visible during Hollow Purple
        handScene.traverse((obj) => {
          if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
            const sm = obj as THREE.SkinnedMesh;
            const geom = sm.geometry;
            const skinIndex = geom.attributes.skinIndex;
            const skinWeight = geom.attributes.skinWeight;
            const skeleton = sm.skeleton;

            if (!geom.index || !skinIndex || !skinWeight || !skeleton) return;

            const isLeftVertex = (i: number) => {
              let lW = 0;
              for (let k = 0; k < 4; k++) {
                const jIdx = skinIndex.getComponent(i, k);
                const w = skinWeight.getComponent(i, k);
                const bName = skeleton.bones[jIdx]?.name || '';
                if (bName.includes('L_') || bName.includes('L001') || bName.includes('L.')) lW += w;
              }
              return lW > 0.5;
            };

            const oldIndices = Array.from(geom.index.array);
            const rightIndices: number[] = [];
            const leftIndices: number[] = [];
            for (let i = 0; i < oldIndices.length; i += 3) {
              if (isLeftVertex(oldIndices[i])) {
                leftIndices.push(oldIndices[i], oldIndices[i + 1], oldIndices[i + 2]);
              } else {
                rightIndices.push(oldIndices[i], oldIndices[i + 1], oldIndices[i + 2]);
              }
            }

            const newIndices = new Uint16Array([...rightIndices, ...leftIndices]);
            geom.setIndex(new THREE.BufferAttribute(newIndices, 1));
            geom.clearGroups();
            geom.addGroup(0, rightIndices.length, 0); // Group 0 = Right arm
            geom.addGroup(rightIndices.length, leftIndices.length, 1); // Group 1 = Left arm

            // Use proper sRGB-to-Linear colors via THREE.Color so skin & nails look warm and healthy (never pale zombie grey or dark brown nails)
            const sleeveCol = new THREE.Color(0x161824);
            const skinCol = new THREE.Color(0xd89878).multiplyScalar(0.42);
            const nailCol = new THREE.Color(0xe6b5a0).multiplyScalar(0.46);

            // Fingernails mesh
            if (geom.attributes.position.count < 1000) {
              const rightNailMat = new THREE.MeshToonMaterial({
                color: nailCol,
                gradientMap: toonGrad,
                toneMapped: true
              });
              const leftNailMat = new THREE.MeshToonMaterial({
                color: nailCol,
                gradientMap: toonGrad,
                toneMapped: true,
                visible: false // Hidden by default (Genji single-hand stance)
              });
              sm.material = [rightNailMat, leftNailMat];
              this.gojoLeftNailMat = leftNailMat;
              return;
            }

            // Arm/Hand mesh: assign black sleeve to upper arm & forearm, warm anime peach skin to hands/fingers
            const count = geom.attributes.position.count;
            const colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
              let armW = 0;
              for (let k = 0; k < 4; k++) {
                const jIdx = skinIndex.getComponent(i, k);
                const w = skinWeight.getComponent(i, k);
                const bName = skeleton.bones[jIdx]?.name || '';
                if (
                  bName.includes('forearm') ||
                  bName.includes('upper_arm') ||
                  bName.includes('deltoid') ||
                  bName.includes('clavicle')
                ) {
                  if (!bName.includes('001')) armW += w;
                }
              }

              if (armW > 0.35) {
                // Jujutsu High uniform black sleeve (deep matte fabric)
                colors[i * 3] = sleeveCol.r;
                colors[i * 3 + 1] = sleeveCol.g;
                colors[i * 3 + 2] = sleeveCol.b;
              } else {
                // Gojo warm anime peach skin tone (linear space, calibrated below HDR bloom threshold)
                colors[i * 3] = skinCol.r;
                colors[i * 3 + 1] = skinCol.g;
                colors[i * 3 + 2] = skinCol.b;
              }
            }

            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const rightBodyMat = new THREE.MeshToonMaterial({
              vertexColors: true,
              gradientMap: toonGrad,
              toneMapped: true
            });
            const leftBodyMat = new THREE.MeshToonMaterial({
              vertexColors: true,
              gradientMap: toonGrad,
              toneMapped: true,
              visible: false // Hidden by default (Genji single-hand stance)
            });
            sm.material = [rightBodyMat, leftBodyMat];
            this.gojoLeftArmMat = leftBodyMat;
          }
        });

        // Setup Animation Mixer & Actions
        this.gojoMixer = new THREE.AnimationMixer(handScene);
        const idleClip = gltf.animations.find((a) => a.name === 'Idle');
        const chargeClip = gltf.animations.find((a) => a.name === 'FingerGun_Charge');
        const fireClip = gltf.animations.find((a) => a.name === 'FingerGun_Fire');
        const purpleClip = gltf.animations.find((a) => a.name === 'Hollow_Purple');

        if (idleClip) {
          const action = this.gojoMixer.clipAction(idleClip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          this.gojoIdleAction = action;
        }

        if (chargeClip) {
          const action = this.gojoMixer.clipAction(chargeClip);
          action.setLoop(THREE.LoopOnce, 0);
          action.clampWhenFinished = true;
          this.gojoChargeAction = action;
        }

        if (fireClip) {
          const action = this.gojoMixer.clipAction(fireClip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.gojoFireAction = action;
        }

        if (purpleClip) {
          const action = this.gojoMixer.clipAction(purpleClip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          this.gojoPurpleAction = action;
        }

        // Genji single-hand FPS positioning: enters from far bottom-right and slants up-left straight toward crosshair
        const holder = new THREE.Group();
        holder.scale.setScalar(0.0125);
        holder.rotation.order = 'YXZ';
        holder.rotation.set(
          THREE.MathUtils.degToRad(-52),
          Math.PI + THREE.MathUtils.degToRad(45),
          THREE.MathUtils.degToRad(-12)
        );
        holder.position.set(-0.401, -0.885, -0.627);
        holder.add(handScene);
        this.gojoPovGroup?.add(holder);
        this.gojoHolder = holder;

        // Attach BOTH Red and Blue Cursed Energy Orbs to the Right Index Fingertip (single-hand caster)
        const rightIndexTip =
          (handScene.getObjectByName('f_index03R_end_057') as THREE.Bone | undefined) ||
          (handScene.getObjectByName('f_index03R_029') as THREE.Bone | undefined);

        if (rightIndexTip && this.gojoPovGroup) {
          this.gojoPovGroup.remove(fallbackRedOrb.group);
          this.gojoPovGroup.remove(fallbackBlueOrb.group);

          const redOrbCtrl = createCursedEnergyOrb({
            variant: 'RED',
            radius: 0.018,
            withLight: false,
            isViewModel: true
          });
          redOrbCtrl.group.visible = false;
          // Pure +Y along the index fingertip bone axis so the orb sits cleanly past the very tip of the finger
          redOrbCtrl.group.position.set(0, 0.042, 0);
          rightIndexTip.add(redOrbCtrl.group);
          this.gojoRedChargeOrb = redOrbCtrl;

          const blueOrbCtrl = createCursedEnergyOrb({
            variant: 'BLUE',
            radius: 0.019,
            withLight: false,
            isViewModel: true
          });
          blueOrbCtrl.group.visible = false;
          blueOrbCtrl.group.position.set(0, 0.042, 0);
          rightIndexTip.add(blueOrbCtrl.group);
          this.gojoBlueChargeOrb = blueOrbCtrl;
        }
      })
      .catch((err) => {
        console.warn('Failed to load gojo_pov.glb:', err);
      });
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

    this.barrierBorderMat = new THREE.MeshBasicMaterial({
      color: shieldCol,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    if (this.hero.id === 'gojo') {
      // Gojo Infinity: organic spatial distortion lens, 4m wide x 3m tall wall projected ahead of him
      this.infinityDistortionMat = createInfinityDistortionMaterial();
      const lensGeo = new THREE.PlaneGeometry(4, 3, 32, 24);
      const lensMesh = new THREE.Mesh(lensGeo, this.infinityDistortionMat);
      this.barrierShieldGroup.add(lensMesh);
    } else if (this.hero.secondaryFire.kind === 'SKY_DEFLECT') {
      // Uro Takako Sky Veil Deflect: translucent grabbed sky-cloth rippling in front of her
      this.infinityDistortionMat = createSkyVeilDistortionMaterial();
      const veilGeo = new THREE.PlaneGeometry(3.2, 2.2, 32, 24);
      const veilMesh = new THREE.Mesh(veilGeo, this.infinityDistortionMat);
      this.barrierShieldGroup.add(veilMesh);
    } else {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.barrierShieldMat);
      const gridPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 8, 6), this.barrierBorderMat);
      gridPlane.position.z = 0.01;
      this.barrierShieldGroup.add(plane, gridPlane);
    }
    if (this.hero.id === 'gojo') {
      this.barrierShieldGroup.position.set(0, 0.05, -2.4 - 0.8);
    } else if (this.hero.secondaryFire.kind === 'SKY_DEFLECT') {
      this.barrierShieldGroup.position.set(0, 0.02, -1.65);
    } else {
      this.barrierShieldGroup.position.set(0, 0, -0.82);
    }
    this.barrierShieldGroup.visible = false;
  }

  public onMouseLook(dx: number, dy: number) {
    this.swayX = THREE.MathUtils.clamp(this.swayX - dx * 0.00018, -0.04, 0.04);
    this.swayY = THREE.MathUtils.clamp(this.swayY + dy * 0.00018, -0.04, 0.04);
  }

  public setHandDistanceOffset(offsetMeters: number) {
    this.handDistanceOffset = THREE.MathUtils.clamp(offsetMeters, -0.16, 0.35);
    if (this.gojoPovGroup) {
      this.gojoPovGroup.position.z = -this.handDistanceOffset;
    }
  }

  public triggerMeleeSlash() {
    this.swingProgress = 1.0;
    this.swingDir *= -1;
    this.muzzleLight.intensity = 4.2;
  }

  public triggerFireRecoil() {
    if (this.hero.id === 'gojo' && this.gojoFireAction) {
      if (this.gojoIdleAction) this.gojoIdleAction.stop();
      if (this.gojoChargeAction) this.gojoChargeAction.stop();
      this.gojoFireAction.reset().play();
      this.recoilOffset = 0.08;
      this.muzzleLight.intensity = 5.0;
      return;
    }

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

  public triggerHollowPurple() {
    if (this.gojoPurpleAction) {
      if (this.gojoIdleAction) this.gojoIdleAction.stop();
      if (this.gojoChargeAction) this.gojoChargeAction.stop();
      if (this.gojoFireAction) this.gojoFireAction.stop();
      this.gojoPurpleAction.reset().play();
    }
    this.castAnimProgress = 1.0;
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
    primaryChargeRatio?: number;
    blueChargeRatio?: number;
    isExecutionerActive?: boolean;
  }) {
    this.punchChargeRatio = opts.punchChargeRatio;
    this.primaryChargeRatio = opts.primaryChargeRatio ?? 0;
    this.blueChargeRatio = opts.blueChargeRatio ?? 0;

    if (this.gavelHeadGroup && this.executionerSwordGroup) {
      const execActive = Boolean(opts.isExecutionerActive);
      this.gavelHeadGroup.visible = !execActive;
      this.executionerSwordGroup.visible = execActive;
    }

    if (opts.isBarrierActive) {
      this.shieldDeployRatio = THREE.MathUtils.lerp(this.shieldDeployRatio, 1.0, 0.25);
      this.barrierShieldGroup.visible = true;
      if (this.infinityDistortionMat) {
        if (this.infinityDistortionMat.uniforms.uDeployRatio) {
          this.infinityDistortionMat.uniforms.uDeployRatio.value = this.shieldDeployRatio;
        }
        if (this.infinityDistortionMat.uniforms.uPoolRatio) {
          this.infinityDistortionMat.uniforms.uPoolRatio.value = opts.barrierHpRatio;
        }
      } else {
        this.barrierShieldMat.opacity = 0.18 * this.shieldDeployRatio;
        this.barrierBorderMat.opacity = (0.35 + (1 - opts.barrierHpRatio) * 0.35) * this.shieldDeployRatio;
      }
      this.barrierShieldGroup.scale.setScalar(0.5 + 0.5 * this.shieldDeployRatio);
    } else {
      this.shieldDeployRatio = THREE.MathUtils.lerp(this.shieldDeployRatio, 0.0, 0.25);
      if (this.shieldDeployRatio < 0.02) {
        this.barrierShieldGroup.visible = false;
      } else if (this.infinityDistortionMat) {
        if (this.infinityDistortionMat.uniforms.uDeployRatio) {
          this.infinityDistortionMat.uniforms.uDeployRatio.value = this.shieldDeployRatio;
        }
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
      -0.58 + this.recoilOffset + chargePullZ + lungeZ - this.handDistanceOffset
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

    if (this.infinityDistortionMat) {
      this.infinityDistortionMat.uniforms.uTime.value = elapsed;
    }

    if (this.gojoMixer) {
      this.gojoMixer.update(dt);
    }

    if (this.hero.id === 'gojo') {
      const isPurplePlaying = Boolean(this.gojoPurpleAction?.isRunning());
      const isFirePlaying = Boolean(this.gojoFireAction?.isRunning());

      // Genji single-hand stance: left arm is hidden during normal movement/firing,
      // and only becomes visible when casting the 2-handed Hollow Purple technique
      if (this.gojoLeftArmMat) this.gojoLeftArmMat.visible = isPurplePlaying;
      if (this.gojoLeftNailMat) this.gojoLeftNailMat.visible = isPurplePlaying;

      if (this.gojoHolder) {
        // Smoothly interpolate between Genji single-hand diagonal slant and centered 2-hand Hollow Purple pose (both in YXZ order)
        const lerpRate = Math.min(1, dt * 10);
        if (isPurplePlaying) {
          this.gojoHolder.position.x = THREE.MathUtils.lerp(this.gojoHolder.position.x, 0.0, lerpRate);
          this.gojoHolder.position.y = THREE.MathUtils.lerp(this.gojoHolder.position.y, -0.74, lerpRate);
          this.gojoHolder.position.z = THREE.MathUtils.lerp(this.gojoHolder.position.z, -0.76, lerpRate);
          this.gojoHolder.scale.x = THREE.MathUtils.lerp(this.gojoHolder.scale.x, 0.0082, lerpRate);
          this.gojoHolder.scale.y = THREE.MathUtils.lerp(this.gojoHolder.scale.y, 0.009, lerpRate);
          this.gojoHolder.scale.z = THREE.MathUtils.lerp(this.gojoHolder.scale.z, 0.009, lerpRate);
          this.gojoHolder.rotation.x = THREE.MathUtils.lerp(this.gojoHolder.rotation.x, THREE.MathUtils.degToRad(-48), lerpRate);
          this.gojoHolder.rotation.y = THREE.MathUtils.lerp(this.gojoHolder.rotation.y, Math.PI, lerpRate);
          this.gojoHolder.rotation.z = THREE.MathUtils.lerp(this.gojoHolder.rotation.z, 0, lerpRate);
        } else {
          this.gojoHolder.position.x = THREE.MathUtils.lerp(this.gojoHolder.position.x, -0.401, lerpRate);
          this.gojoHolder.position.y = THREE.MathUtils.lerp(this.gojoHolder.position.y, -0.885, lerpRate);
          this.gojoHolder.position.z = THREE.MathUtils.lerp(this.gojoHolder.position.z, -0.627, lerpRate);
          this.gojoHolder.scale.x = THREE.MathUtils.lerp(this.gojoHolder.scale.x, 0.0125, lerpRate);
          this.gojoHolder.scale.y = THREE.MathUtils.lerp(this.gojoHolder.scale.y, 0.0125, lerpRate);
          this.gojoHolder.scale.z = THREE.MathUtils.lerp(this.gojoHolder.scale.z, 0.0125, lerpRate);
          this.gojoHolder.rotation.x = THREE.MathUtils.lerp(this.gojoHolder.rotation.x, THREE.MathUtils.degToRad(-52), lerpRate);
          this.gojoHolder.rotation.y = THREE.MathUtils.lerp(
            this.gojoHolder.rotation.y,
            Math.PI + THREE.MathUtils.degToRad(45),
            lerpRate
          );
          this.gojoHolder.rotation.z = THREE.MathUtils.lerp(this.gojoHolder.rotation.z, THREE.MathUtils.degToRad(-12), lerpRate);
        }
      }

      const activeChargeRatio = Math.max(this.primaryChargeRatio, this.blueChargeRatio);

      if (!isPurplePlaying && !isFirePlaying) {
        // Release finished clamped one-shot clips so they don't fight with Idle or Charge
        if (this.gojoFireAction?.enabled) this.gojoFireAction.stop();
        if (this.gojoPurpleAction?.enabled) this.gojoPurpleAction.stop();

        if (activeChargeRatio > 0.01 && this.gojoChargeAction) {
          if (this.gojoIdleAction?.isRunning()) this.gojoIdleAction.stop();
          if (!this.gojoChargeAction.enabled) {
            this.gojoChargeAction.reset().play();
            this.gojoChargeAction.paused = true;
          }
          this.gojoChargeAction.time = Math.min(0.99, Math.max(0, activeChargeRatio));
        } else {
          if (this.gojoChargeAction?.enabled) this.gojoChargeAction.stop();
          if (this.gojoIdleAction && !this.gojoIdleAction.isRunning()) {
            this.gojoIdleAction.reset().fadeIn(0.16).play();
          }
        }
      }

      if (this.gojoPovGroup) {
        const gojoChargeShake =
          activeChargeRatio > 0 ? (Math.random() - 0.5) * 0.008 * activeChargeRatio : 0;
        const gojoPullZ = activeChargeRatio * 0.08;

        this.gojoPovGroup.position.set(
          bobX + this.swayX + gojoChargeShake,
          bobY + this.swayY - this.recoilOffset * 0.12 + gojoChargeShake,
          this.recoilOffset * 0.3 + gojoPullZ - this.handDistanceOffset
        );
        this.gojoPovGroup.rotation.set(
          this.recoilOffset * 0.35,
          this.swayX * 1.2,
          0
        );
      }

      if (this.gojoRedChargeOrb) {
        if (this.primaryChargeRatio > 0.02) {
          this.gojoRedChargeOrb.group.visible = true;
          const s = 0.45 + this.primaryChargeRatio * 0.45;
          this.gojoRedChargeOrb.setScale(s);
          this.gojoRedChargeOrb.update(dt, elapsed);
        } else {
          this.gojoRedChargeOrb.group.visible = false;
        }
      }

      if (this.gojoBlueChargeOrb) {
        if (this.blueChargeRatio > 0.02) {
          this.gojoBlueChargeOrb.group.visible = true;
          const s = 0.45 + this.blueChargeRatio * 0.45;
          this.gojoBlueChargeOrb.setScale(s);
          this.gojoBlueChargeOrb.update(dt, elapsed);
        } else {
          this.gojoBlueChargeOrb.group.visible = false;
        }
      }
    } else {
      // Left hand is only visible when actively performing a Quick Melee strike for non-Gojo heroes
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
}
