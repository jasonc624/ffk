import { ABILITY_TYPES } from '../abilities/types'
import { STATUS_EFFECTS } from '../abilities/statusEffects'
import { ABILITY_CONSTRAINTS } from '../abilities/constraints'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 1: BASE PROFILE (LORE & IDENTITY)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const BASE_PROFILE_SYSTEM = `
You are a Jujutsu Kaisen lore master and game designer.
Your goal is to generate a creative, lore-accurate sorcerer profile.
You focus on IDENTITY, TECHNIQUE, and VISUALS.
You ALWAYS respond with valid JSON only.

CORE CONCEPTS:
TECHNIQUE — Innate identity. The character IS the technique.
  Examples: 10 Shadows, Limitless, Ratio Technique.
  It MUST be a direct metaphorical extension of the user's personality/hobbies.

ABILITIES — 3 active signatures.
  Slot mapping: Ability1 (L/Quick), Ability2 (E/Signature), Ability3 (F/High-Risk).
  
VISUAL EFFECTS:
EMITTER: DRIFT_UP, BURST_RADIAL, TRAIL, PULSE_RING, RAIN_DOWN, CONVERGE
PARTICLE: GLYPH, ORB, SHARD, VAPOR, SPARK, RING
TARGET_FX: TINT_PULSE, CHROMATIC, GLITCH, HEAT_HAZE, FLICKER, FREEZE, INVERT
SCREEN_FX: VIGNETTE, SHOCKWAVE, SLOWMO, FLASH, SCREENSHAKE
HUD_FX: STACK_TICK, BAR_DRAIN, STATUS_ICON, TEXT_POP
`.trim()

export const buildBaseProfilePrompt = (answers: {
  name: string
  combatInstinct: string
  coreDrive: string
  hobbies: string
  mindType: string
  fear: string
  winDefinition: string
  ceAesthetic: string
}) => `
Generate the base lore profile for: ${answers.name}

CONTEXT:
Combat Instinct: ${answers.combatInstinct}
Core Drive: ${answers.coreDrive}
Hobbies: ${answers.hobbies}
Mind Type: ${answers.mindType}
Fear: ${answers.fear}
Winning: ${answers.winDefinition}
CE Aesthetic: ${answers.ceAesthetic}

Identify the archetype from: ${ABILITY_TYPES.join(', ')}

Return JSON:
{
  "perceived_grade": "string",
  "epithet": "string",
  "archetype": "ABILITY_TYPE",
  "color": "#HEX",
  "stats": { "cursedEnergy": 0-100, "technicalSkill": 0-100, ... },
  "technique": { "name": "string", "description": "string", "mechanic": "string", "visualProfile": { ...tokens } },
  "domain": { "name": "string", "description": "string", "mechanic": "string", "visualProfile": { ...tokens } },
  "abilities": [
    { "slot": "Ability1", "key": "L", "name": "string", "description": "string", "type": "ABILITY_TYPE", "targetTypes": ["TARGET_TYPE"] },
    ... exactly 3
  ],
  "extensions": [ ... ]
}
`.trim()

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP 2: MECHANICAL CALIBRATION (NUMBERS & PAYLOADS)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CALIBRATION_SYSTEM = `
You are a combat balancer for a Jujutsu Kaisen fighting game.
Your goal is to "calibrate" the mechanical values for a character's moveset.
You take the Lore Profile and assign concrete costs, cooldowns, and payloads.

PAYLOAD RULES:
PROJECTILE  → damage(${ABILITY_CONSTRAINTS.payload.damage.min}-${ABILITY_CONSTRAINTS.payload.damage.max}), speed(${ABILITY_CONSTRAINTS.payload.speed.min}-${ABILITY_CONSTRAINTS.payload.speed.max}), width(${ABILITY_CONSTRAINTS.payload.width.min}-${ABILITY_CONSTRAINTS.payload.width.max}), height(${ABILITY_CONSTRAINTS.payload.height.min}-${ABILITY_CONSTRAINTS.payload.height.max}), piercing, homing, count(${ABILITY_CONSTRAINTS.payload.count.min}-${ABILITY_CONSTRAINTS.payload.count.max}), archetype
MOVEMENT    → movementSubtype(FREE|FIXED|TARGET_RELATIVE), range(${ABILITY_CONSTRAINTS.payload.range.min}-${ABILITY_CONSTRAINTS.payload.range.max}), invincibleDuration(${ABILITY_CONSTRAINTS.payload.invincible.min}-${ABILITY_CONSTRAINTS.payload.invincible.max}), canTargetAlly, canTargetOpponent, relativePosition
MELEE       → hitboxWidth(${ABILITY_CONSTRAINTS.payload.hitbox.min}-${ABILITY_CONSTRAINTS.payload.hitbox.max}), hitboxHeight(${ABILITY_CONSTRAINTS.payload.hitbox.min}-${ABILITY_CONSTRAINTS.payload.hitbox.max}), hitboxOffsetX, knockback({x,y}), damage(${ABILITY_CONSTRAINTS.payload.damage.min}-${ABILITY_CONSTRAINTS.payload.damage.max}), archetype
BARRIER     → toggle, duration(${ABILITY_CONSTRAINTS.payload.duration.min}-${ABILITY_CONSTRAINTS.payload.duration.max}), radius(${ABILITY_CONSTRAINTS.payload.radius.min}-${ABILITY_CONSTRAINTS.payload.radius.max}), damageReduction(0-1), reflectProjectiles, ceDrainPerSecond, slowIncoming
SUMMON      → summonId, maxActive(1-5), recallable(bool), spawnPosition(NEAR_CASTER|NEAR_TARGET|DIRECTED)
AREA_DENIAL → shape(CIRCLE|RECTANGLE|CONE), radius(${ABILITY_CONSTRAINTS.payload.radius.min}-${ABILITY_CONSTRAINTS.payload.radius.max}), width(${ABILITY_CONSTRAINTS.payload.width.min}-${ABILITY_CONSTRAINTS.payload.width.max}), height(${ABILITY_CONSTRAINTS.payload.height.min}-${ABILITY_CONSTRAINTS.payload.height.max}), damage(${ABILITY_CONSTRAINTS.payload.damage.min}-${ABILITY_CONSTRAINTS.payload.damage.max}), tickRate(ms), duration(ms), persistent(bool), blocksMovement(bool), archetype(string)
BUFF        → duration(ms), statModifiers({speed,strength,damageReduction,cursedEnergyRegen}), healAmount(0-100), stackable(bool)
DEBUFF      → duration(ms), statusToApply, stackable(bool), maxStacks, onMaxStacks({burstDamage,statusToApply})
RESOURCE_DRAIN → resource(cursedEnergy|hp|throatStrain), amount, transferToSelf, suppressRegenDuration
COUNTER     → windowDuration(ms), triggerOn(ANY_HIT|PROJECTILE|MELEE|TECHNIQUE), onTrigger({damageMultiplier,forcedVelocity,ceSteal})
TERRAIN     → modification(DESTROY_PLATFORM|CREATE_PLATFORM|RESHAPE|HAZARD_ZONE), duration(ms), affectedZone, hazardDamage
TRANSFORMATION → duration(ms), statOverrides, abilityOverrides, formName
EXECUTION   → hpThreshold(0-0.5), onThresholdMet, onThresholdNotMet
TETHER      → maxRange(${ABILITY_CONSTRAINTS.payload.range.min}-${ABILITY_CONSTRAINTS.payload.range.max}), tetherEffect({damageTransfer,pullForce,ceLeech,moveRestriction}), breakConditions
COMMAND     → hearingRange(50-1000), penetration, inputOverride, throatStrainCost

STATUS EFFECTS:
${STATUS_EFFECTS.map(s => `${s.id}: ${s.description}`).join(', ')}
`.trim()

export const buildCalibrationPrompt = (baseProfile: any) => `
Calibrate the mechanics for: ${baseProfile.technique.name}

ABILITIES TO CALIBRATE:
${baseProfile.abilities.map((a: any) => `- ${a.slot} (${a.name}): Type ${a.type}`).join('\n')}

Rules:
1. Ability1: Cooldown 2000-5000ms. Low cost.
2. Ability2: Cooldown 6000-12000ms. Signature. 
3. Ability3: Cooldown 14000-25000ms. High risk.
4. Payload MUST match the type-specific rules in instructions. Use numbers only.

Return JSON:
{
  "abilities": [
    {
      "slot": "Ability1",
      "cost": { "cursedEnergy": 0 },
      "cooldown": 0,
      "castTime": 0,
      "payload": { ...type-specific fields },
      "statusEffects": [ { "statusId": "ID", "chance": 0-1, "duration": ms } ]
    },
    ...
  ],
  "domain": { "cost": 100, "damage": 25 }
}
`.trim()