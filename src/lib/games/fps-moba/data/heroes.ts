import type { FpsHeroDef } from '../types';

export const FPS_MOBA_HEROES: FpsHeroDef[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // 1. HIGURUMA — Reinhardt-style Melee Gavel & Barrier Tank
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'higuruma',
    name: 'Higuruma',
    role: 'TANK',
    archetypeLabel: 'MELEE GAVEL TANK (REINHARDT STYLE)',
    epithet: 'Defense Attorney of Deadly Sentencing',
    passiveName: 'Judicial Precedent',
    passiveDesc:
      'Resistant to knockbacks; landing ability hits or gavel takedowns restores +15 Overhealth and +8 Cursed Energy.',
    color: '#f59e0b',
    accentColor: '#fde68a',
    maxHp: 450,
    maxMana: 100,
    moveSpeed: 12.4,
    weapon: {
      name: "Judge's Gavel (Giant Mallet)",
      fireMode: 'MELEE_CLEAVE',
      viewModelType: 'HAMMER',
      damage: 65,
      fireRateMs: 600,
      range: 6.5,
      cleaveArcDeg: 125,
      knockback: 8.5,
      magazineSize: 0, // Infinite melee swings
      reloadTimeMs: 0,
      projectileColor: '#f59e0b'
    },
    secondaryFire: {
      name: 'Non-Violence Pact Barrier [Hold Right Click]',
      kind: 'BARRIER_SHIELD',
      description:
        'Hold Right Click to project a 1000 HP golden courtroom barrier ward that blocks incoming attacks and regenerates 125 HP/s when lowered.',
      barrierMaxHp: 1000,
      barrierRegenPerSec: 125,
      color: '#fbbf24'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Extended Gavel Rush',
        description:
          'Morph and extend the gavel shaft to surge down the lane, pinning enemies and triggering a Wall Verdict Slam on terrain impact.',
        cooldownMs: 7000,
        manaCost: 20,
        kind: 'CRUSADER_CHARGE',
        damage: 95,
        radius: 4.5,
        durationMs: 900,
        color: '#f59e0b'
      },
      E: {
        key: 'E',
        name: 'Verdict Shockwave',
        description:
          'Whip the giant gavel downward to hurl a piercing golden cursed-energy crescent wave through all enemies in a line.',
        cooldownMs: 5000,
        manaCost: 15,
        kind: 'FLAME_STRIKE',
        damage: 85,
        radius: 3.2,
        durationMs: 2200,
        color: '#fbbf24'
      },
      F: {
        key: 'F',
        name: 'Confiscation (Guilty Verdict)',
        description:
          'Judgeman pronounces GUILTY: shocks nearby enemies, restores +200 Barrier HP, and grants +150 Overhealth Armor.',
        cooldownMs: 11000,
        manaCost: 25,
        kind: 'OVERCHARGE',
        damage: 40,
        radius: 7.5,
        durationMs: 5000,
        color: '#fde047'
      },
      R: {
        key: 'R',
        name: "Deadly Sentencing: Executioner's Sword",
        description:
          'Slam the gavel to shatter the ground in an 18m cone (2.5s stun) and morph your weapon into the golden Executioner’s Sword for 6s!',
        cooldownMs: 24000,
        manaCost: 50,
        kind: 'EARTHSHATTER',
        damage: 145,
        radius: 18.0,
        durationMs: 6000,
        color: '#facc15'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. GOJO — Limitless Sorcerer (Spatial Control Mage)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'gojo',
    name: 'Gojo',
    role: 'MAGE',
    archetypeLabel: 'LIMITLESS SORCERER (SPATIAL CONTROL MAGE)',
    epithet: 'The Strongest Modern Sorcerer',
    passiveName: 'Limitless Infinity',
    passiveDesc: 'Landing abilities restores +20 Infinity Overhealth and +10 Cursed Energy.',
    color: '#38bdf8',
    accentColor: '#e0f2fe',
    maxHp: 280,
    maxMana: 140,
    moveSpeed: 13.6,
    weapon: {
      name: 'Lapse Blue Bolt',
      fireMode: 'AUTO',
      viewModelType: 'RIFLE',
      damage: 24,
      fireRateMs: 150,
      range: 95,
      magazineSize: 24,
      reloadTimeMs: 1200,
      projectileColor: '#38bdf8'
    },
    secondaryFire: {
      name: 'Reversal Red Blast [Right Click]',
      kind: 'HELIX_ROCKET',
      description: 'Hurl a compressed Reversal Red singularity that detonates on impact for 85 AoE damage.',
      maxDamage: 85,
      cooldownMs: 5000,
      color: '#f43f5e'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Limitless Warp',
        description: 'Compress space to blink forward instantaneously, damaging enemies along your warp vector.',
        cooldownMs: 4500,
        manaCost: 20,
        kind: 'BLINK_DASH',
        damage: 35,
        radius: 5.0,
        durationMs: 350,
        color: '#38bdf8'
      },
      E: {
        key: 'E',
        name: 'Lapse: Maximum Blue',
        description: 'Project an attractive spatial orb that pulls all nearby enemies inward before imploding.',
        cooldownMs: 8000,
        manaCost: 35,
        kind: 'GRAVITY_ORB',
        damage: 65,
        radius: 8.0,
        durationMs: 2400,
        color: '#0284c7'
      },
      F: {
        key: 'F',
        name: 'Infinity Spatial Ward',
        description: 'Expand Infinity outward to knock back threats, heal +55 HP, and gain +95 Overhealth.',
        cooldownMs: 10000,
        manaCost: 25,
        kind: 'OVERCHARGE',
        damage: 40,
        radius: 7.0,
        durationMs: 4000,
        color: '#7dd3fc'
      },
      R: {
        key: 'R',
        name: 'Domain Expansion: Unlimited Void',
        description:
          'Manifest Unlimited Void across an 19m sphere for 8s, paralyzing foes with infinite sensory overload.',
        cooldownMs: 24000,
        manaCost: 65,
        kind: 'DOMAIN_ULT',
        damage: 48,
        radius: 19.0,
        durationMs: 8000,
        color: '#38bdf8'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 2. DOOM — Doomfist-style Combo Dive Brawler
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'doom',
    name: 'Doom',
    role: 'BRAWLER',
    archetypeLabel: 'MELEE COMBO DIVE (DOOMFIST STYLE)',
    epithet: 'Fist of the Cataclysm',
    passiveName: 'The Best Defense',
    passiveDesc: 'Dealing damage with abilities generates +35 temporary Overhealth shields (up to +200).',
    color: '#ef4444',
    accentColor: '#fca5a5',
    maxHp: 340,
    maxMana: 100,
    moveSpeed: 14.2,
    weapon: {
      name: 'Knuckle Hand Cannon',
      fireMode: 'HAND_CANNON',
      viewModelType: 'DOOM_GAUNTLET',
      damage: 11,
      pellets: 6,
      spread: 0.045,
      fireRateMs: 320,
      range: 38,
      magazineSize: 4,
      reloadTimeMs: 650,
      autoRegenAmmo: true,
      projectileColor: '#f87171'
    },
    secondaryFire: {
      name: 'Rocket Punch [Hold & Release Right Click]',
      kind: 'CHARGED_PUNCH',
      description: 'Hold Right Click to charge your Gauntlet, then release to lunge forward and punch enemies back. Enemies slammed into walls take +65 bonus Wall-Slam damage!',
      minDamage: 45,
      maxDamage: 95,
      wallSlamBonusDamage: 65,
      maxChargeMs: 1000,
      cooldownMs: 3800,
      color: '#ef4444'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Seismic Slam',
        description: 'Leap forward in a 3D arc and smash the ground, pulling and damaging enemies in a frontal shockwave cone.',
        cooldownMs: 5500,
        manaCost: 15,
        kind: 'SEISMIC_SLAM',
        damage: 55,
        radius: 8.5,
        durationMs: 600,
        color: '#ef4444'
      },
      E: {
        key: 'E',
        name: 'Rising Uppercut',
        description: 'Uppercut enemies in front of you high into the air while launching yourself upward for aerial combos.',
        cooldownMs: 6000,
        manaCost: 20,
        kind: 'RISING_UPPERCUT',
        damage: 50,
        radius: 5.5,
        durationMs: 600,
        color: '#fb7185'
      },
      F: {
        key: 'F',
        name: 'Power Block',
        description: 'Raise your Gauntlet to gain +90 Shield and instantly EMPOWER your next Rocket Punch (+50% damage & knockback).',
        cooldownMs: 8000,
        manaCost: 20,
        kind: 'POWER_BLOCK',
        damage: 0,
        radius: 4.0,
        durationMs: 3500,
        color: '#dc2626'
      },
      R: {
        key: 'R',
        name: 'Meteor Strike',
        description: 'Vault high into the air and crash down in a massive 3D shockwave crater, dealing heavy damage and generating full Overhealth.',
        cooldownMs: 22000,
        manaCost: 50,
        kind: 'METEOR_STRIKE_ULT',
        damage: 155,
        radius: 12.0,
        durationMs: 1500,
        color: '#ef4444'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. BRIGID — Brigitte-style Melee Flail Support-Brawler
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'brigid',
    name: 'Brigid',
    role: 'SUPPORT_BRIG',
    archetypeLabel: 'MELEE FLAIL PALADIN (BRIGITTE STYLE)',
    epithet: 'Shieldmaiden of the Dawn',
    passiveName: 'Inspire',
    passiveDesc: 'Striking enemies with Rocket Flail or Whip Shot triggers a 5s healing pulse (+22 HP/s to you and nearby allied minions).',
    color: '#eab308',
    accentColor: '#fef08a',
    maxHp: 280,
    maxMana: 110,
    moveSpeed: 13.4,
    weapon: {
      name: 'Rocket Flail',
      fireMode: 'MELEE_CLEAVE',
      viewModelType: 'FLAIL',
      damage: 40,
      fireRateMs: 420,
      range: 6.0,
      cleaveArcDeg: 115,
      knockback: 4.5,
      magazineSize: 0,
      reloadTimeMs: 0,
      projectileColor: '#eab308'
    },
    secondaryFire: {
      name: 'Riot Barrier [Hold Right Click]',
      kind: 'BARRIER_SHIELD',
      description: 'Hold Right Click to deploy a 450 HP personal energy shield. Press Left Click while shielding to perform Shield Bash!',
      barrierMaxHp: 450,
      barrierRegenPerSec: 85,
      color: '#facc15'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Shield Bash',
        description: 'Dash forward behind your Riot Barrier, bashing through enemies and knocking them back.',
        cooldownMs: 4500,
        manaCost: 15,
        kind: 'SHIELD_BASH',
        damage: 55,
        radius: 4.5,
        durationMs: 350,
        color: '#facc15'
      },
      E: {
        key: 'E',
        name: 'Whip Shot',
        description: 'Launch your Rocket Flail chain 22m forward, dealing 75 damage, triggering Inspire, and knocking the target far back.',
        cooldownMs: 4500,
        manaCost: 20,
        kind: 'WHIP_SHOT',
        damage: 75,
        radius: 22.0,
        durationMs: 400,
        color: '#eab308'
      },
      F: {
        key: 'F',
        name: 'Repair Pack Surge',
        description: 'Burst-heal yourself for +85 HP, grant +75 Overhealth Armor, and heal nearby allied minions.',
        cooldownMs: 7500,
        manaCost: 25,
        kind: 'OVERCHARGE',
        damage: 25,
        radius: 8.0,
        durationMs: 4000,
        color: '#fde047'
      },
      R: {
        key: 'R',
        name: 'Rally!',
        description: 'Expand a golden 3D Valkyrie banner aura for 8s that grants continuous Overhealth regeneration, +30% speed, and shockwaves!',
        cooldownMs: 24000,
        manaCost: 60,
        kind: 'RALLY_ULT',
        damage: 38,
        radius: 16.0,
        durationMs: 8000,
        color: '#eab308'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. VEX — Soldier: 76 / Sojourn Hitscan Striker
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'vex',
    name: 'Vex',
    role: 'STRIKER',
    archetypeLabel: 'HITSCAN RIFLE STRIKER (SOLDIER / SOJOURN STYLE)',
    epithet: 'Architect of the Null Vector',
    passiveName: 'Overclocked Targeting',
    passiveDesc: 'Critical headshots deal 1.6× damage and restore 4 Cursed Energy.',
    color: '#10b981',
    accentColor: '#6ee7b7',
    maxHp: 220,
    maxMana: 120,
    moveSpeed: 13.8,
    weapon: {
      name: 'Null Vector Pulse Rifle',
      fireMode: 'AUTO',
      viewModelType: 'RIFLE',
      damage: 18,
      fireRateMs: 120,
      range: 95,
      magazineSize: 28,
      reloadTimeMs: 1250,
      projectileColor: '#10b981'
    },
    secondaryFire: {
      name: 'Helix Rail Shot [Right Click]',
      kind: 'HELIX_ROCKET',
      description: 'Fire a high-velocity rail burst that explodes on impact for 75 AoE damage.',
      maxDamage: 75,
      cooldownMs: 5500,
      color: '#34d399'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Phase Blink',
        description: 'Warp instantaneously in your look direction, leaving a 3D spatial rift.',
        cooldownMs: 4500,
        manaCost: 20,
        kind: 'BLINK_DASH',
        damage: 25,
        radius: 4.5,
        durationMs: 350,
        color: '#10b981'
      },
      E: {
        key: 'E',
        name: 'Disruptor Singularity',
        description: 'Launch a 3D gravity sphere that pulls nearby enemies inward before detonating.',
        cooldownMs: 8500,
        manaCost: 35,
        kind: 'GRAVITY_ORB',
        damage: 58,
        radius: 7.5,
        durationMs: 2400,
        color: '#34d399'
      },
      F: {
        key: 'F',
        name: 'Biotic Aegis Field',
        description: 'Deploy a 3D hexagonal barrier wall in front of you that grants +60 shield and shocks enemies.',
        cooldownMs: 10000,
        manaCost: 30,
        kind: 'BARRIER_WALL',
        damage: 32,
        radius: 6.0,
        durationMs: 5000,
        color: '#059669'
      },
      R: {
        key: 'R',
        name: 'Domain: Tactical Horizon',
        description: 'Expand a 3D Domain dome around you for 8s. Grants infinite ammo, +40% fire rate, and calls down sure-hit void lightning.',
        cooldownMs: 25000,
        manaCost: 65,
        kind: 'DOMAIN_ULT',
        damage: 38,
        radius: 18.0,
        durationMs: 8000,
        color: '#10b981'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. KAEL — Aerial Artillery Mage (Pharah / Echo Style)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'kael',
    name: 'Kael',
    role: 'MAGE',
    archetypeLabel: 'AERIAL ARTILLERY MAGE (PHARAH / ECHO STYLE)',
    epithet: 'Sovereign of Cinders',
    passiveName: 'Thermal Draft',
    passiveDesc: 'Abilities scorch targets and grant brief aerial lift.',
    color: '#a855f7',
    accentColor: '#d8b4fe',
    maxHp: 210,
    maxMana: 140,
    moveSpeed: 13.0,
    weapon: {
      name: 'Voidfire Launcher',
      fireMode: 'BURST',
      viewModelType: 'RIFLE',
      damage: 36,
      fireRateMs: 280,
      range: 105,
      magazineSize: 16,
      reloadTimeMs: 1350,
      projectileColor: '#a855f7'
    },
    secondaryFire: {
      name: 'Concussive Nova [Right Click]',
      kind: 'HELIX_ROCKET',
      description: 'Detonate a high-impact plasma burst at your crosshair target for 70 AoE damage.',
      maxDamage: 70,
      cooldownMs: 5000,
      color: '#c084fc'
    },
    abilities: {
      Q: {
        key: 'Q',
        name: 'Jump Jet Surge',
        description: 'Propels you skyward and forward, igniting enemies beneath you.',
        cooldownMs: 5000,
        manaCost: 20,
        kind: 'METEOR_LEAP',
        damage: 42,
        radius: 6.0,
        durationMs: 600,
        color: '#a855f7'
      },
      E: {
        key: 'E',
        name: 'Solar Flare Pillar',
        description: 'Erupts a towering 3D pillar of plasma fire at your crosshair target.',
        cooldownMs: 7000,
        manaCost: 35,
        kind: 'SOLAR_PILLAR',
        damage: 68,
        radius: 5.5,
        durationMs: 2500,
        color: '#c084fc'
      },
      F: {
        key: 'F',
        name: 'Focusing Siphon Beam',
        description: 'Tethers the target in front of you with a 3D beam, draining HP to heal yourself.',
        cooldownMs: 9500,
        manaCost: 30,
        kind: 'SIPHON_BEAM',
        damage: 52,
        radius: 22.0,
        durationMs: 2000,
        color: '#9333ea'
      },
      R: {
        key: 'R',
        name: 'Domain: Shrine of Cinders',
        description: 'Manifest an infernal 3D Domain dome that rains continuous plasma pillars on all enemies inside.',
        cooldownMs: 26000,
        manaCost: 70,
        kind: 'DOMAIN_ULT',
        damage: 42,
        radius: 19.0,
        durationMs: 8000,
        color: '#a855f7'
      }
    }
  }
];
