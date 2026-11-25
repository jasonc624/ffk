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
    ceRegenMultiplier: 0.85,
    moveSpeed: 9.3,
    weapon: {
      name: "Judge's Gavel (Giant Mallet)",
      fireMode: 'MELEE_CLEAVE',
      viewModelType: 'HAMMER',
      damage: 65,
      manaCost: 0,
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
        'Hold Right Click to project a 1000 HP golden courtroom barrier ward that blocks incoming attacks and drains Cursed Energy while held.',
      manaDrainPerSec: 15,
      barrierMaxHp: 1000,
      barrierRegenPerSec: 125,
      color: '#fbbf24'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
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
      Q: {
        key: 'Q',
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
    ceRegenMultiplier: 1.35,
    moveSpeed: 10.2,
    weapon: {
      name: 'Reversal Red [Hold / Click M1]',
      fireMode: 'BURST',
      viewModelType: 'RIFLE',
      damage: 38,
      maxDamage: 95,
      manaCost: 14,
      maxManaCost: 34,
      fireRateMs: 420,
      range: 95,
      knockback: 2.0,
      maxKnockback: 18.0,
      chargeable: true,
      maxChargeMs: 900,
      isProjectileOrb: true,
      magazineSize: 12,
      reloadTimeMs: 1100,
      projectileColor: '#f43f5e'
    },
    secondaryFire: {
      name: 'Lapse Blue [Right Click]',
      kind: 'LAPSE_BLUE_ORB',
      description:
        '1st Right Click (28 CE): Launch a Lapse Blue singularity orb forward. 2nd Right Click (Free): Attract anyone within radius into the orb.',
      manaCost: 28,
      maxDamage: 65,
      barrierMaxHp: 140,
      barrierDrainPerSec: 30,
      barrierRegenPerSec: 25,
      cooldownMs: 7000,
      color: '#0284c7'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
        name: 'Limitless Teleport',
        description:
          'Hold SHIFT to pull the camera into third person and place a teleport marker on the ground (only you can see it). Release to begin an 800ms cast, then blink to the marked spot, damaging enemies on arrival.',
        cooldownMs: 4500,
        manaCost: 22,
        kind: 'LIMITLESS_TELEPORT',
        damage: 35,
        radius: 5.0,
        durationMs: 800,
        color: '#38bdf8'
      },
      E: {
        key: 'E',
        name: 'Infinity [Hold E]',
        description:
          'Hold E to project a forward-facing spatial distortion field that warps reality and blocks incoming attacks. Continuously consumes Cursed Energy (30/s) while held.',
        cooldownMs: 1800,
        manaCost: 0,
        manaDrainPerSec: 30,
        kind: 'INFINITY_SHIELD',
        damage: 0,
        radius: 3.0,
        durationMs: 3200,
        color: '#38bdf8'
      },
      Q: {
        key: 'Q',
        name: 'Domain Expansion: Unlimited Void',
        description:
          'Manifest an inescapable 19m barrier (1200 HP, only breakable from outside) that slows trapped enemies by 90% and unlocks [Q] Hollow Purple (Red + Blue fusion 1-hit kill that ends the Domain).',
        cooldownMs: 24000,
        manaCost: 75,
        kind: 'DOMAIN_ULT',
        damage: 25,
        radius: 19.0,
        durationMs: 10000,
        color: '#38bdf8'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 3. JOGO — Disaster Flame Curse (Volcanic Zone Control Mage)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'jogo',
    name: 'Jogo',
    role: 'MAGE',
    archetypeLabel: 'DISASTER FLAME CURSE (VOLCANIC CONTROL MAGE)',
    epithet: 'Special Grade Disaster Curse of the Earth',
    passiveName: 'Disaster Flames',
    passiveDesc:
      'Born from humanity\'s fear of the earth. Landing volcanic abilities restores +15 Overhealth and +8 Cursed Energy.',
    color: '#f97316',
    accentColor: '#fde047',
    maxHp: 270,
    maxMana: 130,
    ceRegenMultiplier: 1.25,
    moveSpeed: 10.35,
    weapon: {
      name: 'Ember Insects',
      fireMode: 'EMBER_INSECTS',
      viewModelType: 'JOGO_HANDS',
      damage: 34,
      manaCost: 10,
      fireRateMs: 420,
      range: 55,
      magazineSize: 10,
      reloadTimeMs: 1100,
      projectileColor: '#f97316'
    },
    secondaryFire: {
      name: 'Unassigned',
      kind: 'NONE',
      description: 'No secondary fire — channel cursed flames through Ember Insects, Mini Volcanoes, and Coffin of the Iron Mountain.',
      color: '#f97316'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
        name: 'Flame Dash',
        description:
          'Burst rapidly in your movement direction on a jet of cursed flames. Holds 2 charges; each charge recharges in 4.0s.',
        cooldownMs: 4000,
        maxCharges: 2,
        manaCost: 14,
        kind: 'FLAME_DASH',
        damage: 0,
        radius: 0,
        durationMs: 220,
        color: '#f97316'
      },
      E: {
        key: 'E',
        name: 'Mini Volcano',
        description:
          'Launch a volcanic vent that sticks to walls or floors and fires magma bolts at enemies within its 180° frontal arc.',
        cooldownMs: 6500,
        manaCost: 22,
        kind: 'MINI_VOLCANO',
        damage: 24,
        radius: 16.0,
        durationMs: 12000,
        color: '#ea580c'
      },
      Q: {
        key: 'Q',
        name: 'Domain Expansion: Coffin of the Iron Mountain',
        description:
          'Manifest the scorching center of the earth (19m barrier). All trapped enemies burn for -20 HP/sec. Hold [Q] inside to aim and release to drop Maximum: Meteor from above (ends Domain).',
        cooldownMs: 24000,
        manaCost: 75,
        kind: 'DOMAIN_ULT',
        damage: 20,
        radius: 19.0,
        durationMs: 12000,
        color: '#ea580c'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 4. MEGUMI FUSHIGURO — Ten Shadows Technique (Melee Summoner / Utility)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'megumi',
    name: 'Megumi',
    role: 'BRAWLER',
    archetypeLabel: 'TEN SHADOWS MELEE (SUMMONER / UTILITY)',
    epithet: 'Inheritor of the Ten Shadows',
    passiveName: 'Shadow Storage',
    passiveDesc:
      'Sinking into shadows restores Overhealth & resets weapon flow; Shikigami takedowns restore +12 Cursed Energy and +15 Overhealth.',
    color: '#6366f1',
    accentColor: '#a5b4fc',
    maxHp: 290,
    maxMana: 135,
    ceRegenMultiplier: 1.25,
    moveSpeed: 10.5,
    weapon: {
      name: 'Cursed-Tool Broadsword',
      fireMode: 'MELEE_CLEAVE',
      viewModelType: 'MEGUMI_SHADOW',
      damage: 54,
      manaCost: 0,
      fireRateMs: 460,
      range: 5.5,
      cleaveArcDeg: 120,
      knockback: 5.5,
      magazineSize: 0,
      reloadTimeMs: 0,
      projectileColor: '#6366f1'
    },
    secondaryFire: {
      name: 'Rabbit Escape [Hold Right Click]',
      kind: 'RABBIT_ESCAPE',
      description:
        'Hold [M2] to unleash a rising column of white Shikigami rabbits (20 HP each) that lifts Megumi higher the longer you hold (spawning more rabbits and draining Cursed Energy) while the rabbits remain on the field attacking nearby enemies! Hold [SPACE] midair to have Nue carry you in any direction for 2.0s.',
      manaCost: 12,
      manaDrainPerSec: 22,
      cooldownMs: 6500,
      color: '#e2e8f0'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
        name: 'Shadow Step',
        description:
          'Sink into the floor shadows for 2.4s to move undetected (+45% speed) and restore +25 Overhealth from shadow storage.',
        cooldownMs: 6000,
        manaCost: 18,
        kind: 'SHADOW_STEP',
        damage: 0,
        radius: 2.5,
        durationMs: 2400,
        color: '#4f46e5'
      },
      E: {
        key: 'E',
        name: 'Nue / Toad (Gama)',
        description:
          'Summon Nue to swoop down from the sky and stun-shock enemies in an area, or aim at an ally to have Toad pull them to safety (+35 HP heal).',
        cooldownMs: 7000,
        manaCost: 24,
        kind: 'NUE_TOAD',
        damage: 65,
        radius: 5.5,
        durationMs: 1100,
        color: '#38bdf8'
      },
      Q: {
        key: 'Q',
        name: 'Domain Expansion: Chimera Shadow Garden',
        description:
          'Flood the ground with liquid shadow (19m) that sinks & heavily slows enemies while empowering multi-clone Shikigami. Press [Q] inside to summon Mahoraga (adapts to repeated moves; turns on your team if all enemies fall!).',
        cooldownMs: 24000,
        manaCost: 75,
        kind: 'DOMAIN_ULT',
        damage: 14,
        radius: 19.0,
        durationMs: 12000,
        color: '#4338ca'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 5. MR. BIOMASTER — Bio-Organic Mutagen Brawler
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'mr_biomaster',
    name: 'Mr. Biomaster',
    role: 'BRAWLER',
    archetypeLabel: 'BIO-ORGANIC MUTAGEN BRAWLER',
    epithet: 'Sovereign of Cellular Evolution',
    passiveName: 'Cellular Regeneration',
    passiveDesc: 'Landing abilities splices biomass to restore +25 Overhealth and +10 Bio-Energy.',
    color: '#22c55e',
    accentColor: '#86efac',
    maxHp: 320,
    maxMana: 120,
    ceRegenMultiplier: 1.1,
    moveSpeed: 10.2,
    weapon: {
      name: 'Bio-Plasmic Spore Cannon',
      fireMode: 'AUTO',
      viewModelType: 'RIFLE',
      damage: 23,
      manaCost: 4,
      fireRateMs: 145,
      range: 90,
      magazineSize: 26,
      reloadTimeMs: 1200,
      projectileColor: '#22c55e'
    },
    secondaryFire: {
      name: 'Mutagenic Surge [Right Click]',
      kind: 'HELIX_ROCKET',
      description: 'Launch an unstable bio-mutagenic orb that ruptures on impact for 82 AoE damage.',
      manaCost: 24,
      maxDamage: 82,
      cooldownMs: 4800,
      color: '#4ade80'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
        name: 'Bio-Leap Thruster',
        description: 'Catapult forward in a bio-boosted arc and slam down to rupture enemies in an 8m shockwave.',
        cooldownMs: 5500,
        manaCost: 20,
        kind: 'SEISMIC_SLAM',
        damage: 60,
        radius: 8.0,
        durationMs: 600,
        color: '#22c55e'
      },
      E: {
        key: 'E',
        name: 'Cellular Tendril Pull',
        description: 'Fire a gravity-warping bio-singularity that draws nearby foes inward before detonating.',
        cooldownMs: 8000,
        manaCost: 30,
        kind: 'GRAVITY_ORB',
        damage: 65,
        radius: 8.0,
        durationMs: 2400,
        color: '#16a34a'
      },
      Q: {
        key: 'Q',
        name: 'Domain Expansion: Primordial Biosphere',
        description: 'Manifest an overgrown mutagenic sphere for 8s that overwhelms and damages all foes inside.',
        cooldownMs: 24000,
        manaCost: 65,
        kind: 'DOMAIN_ULT',
        damage: 46,
        radius: 19.0,
        durationMs: 8000,
        color: '#22c55e'
      }
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // 6. URO TAKAKO — Sky Manipulation (Aerial Spatial Brawler & Deflector)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'uro',
    name: 'Uro Takako',
    role: 'BRAWLER',
    archetypeLabel: 'SKY MANIPULATION BRAWLER (AERIAL DEFLECT / SHATTER)',
    epithet: 'Captain of the Sun, Moon, and Stars Squad',
    passiveName: 'Surface of the Sky',
    passiveDesc:
      'Hold [SPACE] while airborne to float and glide effortlessly across the sky. Deflecting attacks or landing Thin Ice Breaker restores +20 Overhealth and +12 Cursed Energy.',
    color: '#67e8f9',
    accentColor: '#f0f9ff',
    maxHp: 295,
    maxMana: 135,
    ceRegenMultiplier: 1.25,
    moveSpeed: 10.65,
    weapon: {
      name: 'Sky-Warping Palm Strikes',
      fireMode: 'MELEE_CLEAVE',
      viewModelType: 'URO_SKY_HANDS',
      damage: 50,
      manaCost: 0, // Melee-based attacks require no Cursed Energy
      fireRateMs: 420,
      range: 6.2,
      cleaveArcDeg: 120,
      knockback: 6.5,
      magazineSize: 0,
      reloadTimeMs: 0,
      projectileColor: '#67e8f9'
    },
    secondaryFire: {
      name: 'Reality Wipe [Hold & Drag M2]',
      kind: 'REALITY_WIPE',
      description:
        'Hold & drag Right Click to paint a smoky Reality Wipe across space (up to 3 active at once, each lingering in place for 5.0s). Any move entering a wipe is deflected toward your cursor!',
      manaCost: 16,
      color: '#67e8f9'
    },
    abilities: {
      SHIFT: {
        key: 'SHIFT',
        name: 'Sky Flight',
        description:
          'Grab the sky to surge along your 3D look direction and enter Sky Flight (2.6s aerial hover; hold [SPACE] anytime airborne to keep gliding). Holds 2 charges.',
        cooldownMs: 4200,
        maxCharges: 2,
        manaCost: 14,
        kind: 'SKY_PULL',
        damage: 0,
        radius: 0,
        durationMs: 260,
        color: '#38bdf8'
      },
      E: {
        key: 'E',
        name: 'Thin Ice Breaker',
        description:
          'Grounded: Crack reality in front of you and fire a piercing Reality-Warping Beam outwards (28m). In Flight: Dive down to the surface and crack anyone in a 3m blast radius!',
        cooldownMs: 5500,
        manaCost: 24,
        kind: 'THIN_ICE_BREAKER',
        damage: 115,
        radius: 3.0,
        durationMs: 700,
        color: '#bae6fd'
      },
      Q: {
        key: 'Q',
        name: 'Domain Expansion: Sky Veil Horizon',
        description:
          'Wrap the sky inward into a luminous glass-mirror dome (20m) granting low-gravity aerial mastery and shearing trapped foes. Press [Q] inside to unleash Maximum: Shattered Sky (ends Domain).',
        cooldownMs: 24000,
        manaCost: 75,
        kind: 'DOMAIN_ULT',
        damage: 22,
        radius: 20.0,
        durationMs: 11000,
        color: '#67e8f9'
      }
    }
  }
];
