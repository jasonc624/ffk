<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { FpsMobaEngine } from '$lib/games/fps-moba/FpsMobaEngine';
  import { FPS_MOBA_HEROES } from '$lib/games/fps-moba/data/heroes';
  import {
    getSelectedFpsHero,
    setSelectedFpsHero,
    getSelectedFpsMap,
    setSelectedFpsMap,
    MOBA_MAPS,
    type MobaMapId,
    getMouseSensitivity,
    setMouseSensitivity,
    getHandDistanceOffset,
    setHandDistanceOffset,
    getAiAttackingEnabled,
    setAiAttackingEnabled
  } from '$lib/games/fps-moba/storage';
  import {
    type FpsHeroDef,
    type FpsHudState,
    type FpsAbilityKey,
    CE_EXHAUSTION_LOCKOUT_SEC
  } from '$lib/games/fps-moba/types';

  let container: HTMLDivElement;
  let engine: FpsMobaEngine | null = null;
  let hud = $state<FpsHudState | null>(null);
  let sensitivity = $state<number>(1.0);
  let handDistance = $state<number>(0);
  let aiAttacking = $state<boolean>(true);
  let activeHero = $state<FpsHeroDef>(FPS_MOBA_HEROES[0]);
  let activeMapId = $state<MobaMapId>('orlando');

  const abilityKeys: FpsAbilityKey[] = ['SHIFT', 'E', 'Q'];

  function startMatch() {
    engine?.destroy();
    activeHero = getSelectedFpsHero();
    activeMapId = getSelectedFpsMap();
    engine = new FpsMobaEngine(
      container,
      activeHero,
      (state) => {
        hud = state;
      },
      activeMapId
    );
  }

  function switchHero(hero: FpsHeroDef) {
    activeHero = hero;
    setSelectedFpsHero(hero.id);
    startMatch();
    setTimeout(() => lockPointer(), 60);
  }

  function switchMap(mapId: MobaMapId) {
    activeMapId = mapId;
    setSelectedFpsMap(mapId);
    startMatch();
    setTimeout(() => lockPointer(), 60);
  }

  function onSensChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    sensitivity = val;
    setMouseSensitivity(val);
  }

  function onHandDistanceChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    handDistance = val;
    setHandDistanceOffset(val);
    engine?.setHandDistanceOffset(val);
  }

  function toggleAiAttacking() {
    aiAttacking = !aiAttacking;
    setAiAttackingEnabled(aiAttacking);
    engine?.setAiAttackingEnabled(aiAttacking);
  }

  onMount(() => {
    sensitivity = getMouseSensitivity();
    handDistance = getHandDistanceOffset();
    aiAttacking = getAiAttackingEnabled();
    startMatch();
    return () => {
      engine?.destroy();
      engine = null;
    };
  });

  onDestroy(() => {
    engine?.destroy();
    engine = null;
  });

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function lockPointer() {
    engine?.requestPointerLock();
  }
</script>

<svelte:head>
  <title>Nexus Protocol — 3D Arena Match</title>
</svelte:head>

<!-- 3D Three.js WebGL2 Viewport -->
<div bind:this={container} class="fixed inset-0 bg-black overflow-hidden select-none"></div>

{#if hud}
  <!-- Gojo Infinity Spatial Reality-Distortion Blur Lens Overlay -->
  {#if hud.hero.id === 'gojo' && hud.isUsingSecondary}
    <div
      class="fixed inset-0 pointer-events-none z-10 transition-opacity duration-150"
      style="
        backdrop-filter: blur(7px) saturate(1.3) contrast(1.06);
        -webkit-backdrop-filter: blur(7px) saturate(1.3) contrast(1.06);
        mask-image: radial-gradient(ellipse 46% 52% at 50% 50%, rgba(0,0,0,0.95) 25%, rgba(0,0,0,0.45) 68%, transparent 95%);
        -webkit-mask-image: radial-gradient(ellipse 46% 52% at 50% 50%, rgba(0,0,0,0.95) 25%, rgba(0,0,0,0.45) 68%, transparent 95%);
        background: radial-gradient(ellipse 46% 52% at 50% 50%, rgba(125, 211, 252, 0.08), rgba(192, 132, 252, 0.05) 60%, transparent 92%);
      "
    ></div>
  {/if}

  <!-- Megumi Shadow Step Submerged Vignette -->
  {#if hud.isShadowStepping}
    <div
      class="fixed inset-0 pointer-events-none z-10 transition-opacity duration-150"
      style="
        background: radial-gradient(ellipse 65% 65% at 50% 50%, rgba(15, 23, 42, 0.12) 20%, rgba(30, 27, 75, 0.72) 85%, rgba(2, 6, 23, 0.92) 100%);
      "
    ></div>
  {/if}

  <!-- ── 1. CENTER CROSSHAIR, MELEE BRACKETS, BARRIER & ROCKET PUNCH METERS ── -->
  <div class="fixed inset-0 pointer-events-none flex items-center justify-center z-20">
    <div class="relative flex flex-col items-center justify-center">
      <!-- Reticle -->
      <div class="relative flex items-center justify-center">
        <div
          class="w-1.5 h-1.5 rounded-full"
          style="background: {hud.hero.accentColor}; box-shadow: 0 0 8px {hud.hero.color};"
        ></div>
        {#if hud.hero.weapon.fireMode === 'MELEE_CLEAVE'}
          <!-- Wide Overwatch Melee Cleave Arc Brackets -->
          <div class="absolute w-14 h-8 border-x-2 border-white/55 rounded-full"></div>
        {:else}
          <div class="absolute w-5 h-[1.5px] bg-white/70 -left-7"></div>
          <div class="absolute w-5 h-[1.5px] bg-white/70 -right-7"></div>
          <div class="absolute h-5 w-[1.5px] bg-white/70 -top-7"></div>
          <div class="absolute h-5 w-[1.5px] bg-white/70 -bottom-7"></div>
        {/if}

        <!-- Hitmarker X -->
        {#if hud.hitMarkerAlpha > 0.05}
          <div
            class="absolute w-7 h-7 pointer-events-none"
            style="opacity: {hud.hitMarkerAlpha};"
          >
            <div
              class="absolute inset-0 rotate-45 border-t-2 border-b-2"
              style="border-color: {hud.hitMarkerCrit ? '#facc15' : '#ffffff'};"
            ></div>
          </div>
        {/if}
      </div>

      <!-- Gojo Reversal Red Charge Bar (Hold Left Click) -->
      {#if hud.primaryChargeRatio > 0}
        <div class="mt-8 w-36 bg-black/80 border border-rose-400/50 rounded-full p-1">
          <div
            class="h-2.5 rounded-full transition-all bg-rose-500"
            style="width: {hud.primaryChargeRatio * 100}%;"
          ></div>
          <div class="text-center font-['Share_Tech_Mono'] text-[10px] font-bold text-rose-200 mt-0.5">
            REVERSAL RED {Math.round(hud.primaryChargeRatio * 100)}%
          </div>
        </div>
      {/if}

      <!-- Gojo Limitless Teleport (hold SHIFT to aim, release to cast) -->
      {#if hud.teleportPhase === 'AIMING'}
        <div class="mt-8 px-3 py-0.5 rounded-full bg-sky-500/25 border border-sky-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-200 animate-pulse">
          [RELEASE SHIFT] LIMITLESS TELEPORT
        </div>
      {:else if hud.teleportPhase === 'CASTING'}
        <div class="mt-8 w-36 bg-black/80 border border-sky-400/60 rounded-full p-1">
          <div
            class="h-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.8)]"
            style="width: {(hud.teleportCastRatio ?? 0) * 100}%;"
          ></div>
          <div class="text-center font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-200 mt-0.5">
            TELEPORTING · INVULNERABLE
          </div>
        </div>
      {/if}

      <!-- Gojo Lapse Blue Charge Bar (Hold Right Click) -->
      {#if (hud.blueChargeRatio ?? 0) > 0}
        <div class="mt-8 w-36 bg-black/80 border border-sky-400/50 rounded-full p-1">
          <div
            class="h-2.5 rounded-full transition-all bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]"
            style="width: {(hud.blueChargeRatio ?? 0) * 100}%;"
          ></div>
          <div class="text-center font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-200 mt-0.5">
            LAPSE BLUE {Math.round((hud.blueChargeRatio ?? 0) * 100)}%
          </div>
        </div>
      {/if}

      <!-- Gojo Active Lapse Blue 2nd-Stage Prompt -->
      {#if hud.hasActiveBlueOrb}
        <div class="mt-4 px-3 py-0.5 rounded-full bg-sky-500/25 border border-sky-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-200 animate-pulse">
          [RIGHT CLICK] ACTIVATE LAPSE BLUE ATTRACTION (3m)
        </div>
      {/if}

      <!-- Gojo Domain-Only Hollow Purple Prompt -->
      {#if hud.canCastHollowPurple}
        <div class="mt-4 px-3.5 py-1 rounded-full bg-purple-500/30 border border-purple-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.5)] animate-pulse">
          [Q] HOLLOW PURPLE READY (RED + BLUE · 1-HIT KILL · ENDS DOMAIN)
        </div>
      {/if}

      <!-- Jogo Domain-Only Maximum: Meteor Prompt -->
      {#if hud.meteorAiming}
        <div class="mt-6 px-3.5 py-1 rounded-full bg-orange-500/35 border border-amber-300 font-['Share_Tech_Mono'] text-[10px] font-bold text-amber-100 shadow-[0_0_24px_rgba(249,115,22,0.7)] animate-pulse">
          [RELEASE Q] DROP MAXIMUM: METEOR ON MARKED SPOT
        </div>
      {:else if hud.canCastMeteor}
        <div class="mt-4 px-3.5 py-1 rounded-full bg-orange-600/30 border border-orange-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-amber-200 shadow-[0_0_20px_rgba(249,115,22,0.5)] animate-pulse">
          [HOLD Q] AIM MAXIMUM: METEOR · RELEASE TO DROP (ENDS DOMAIN)
        </div>
      {/if}

      <!-- Megumi Shadow Step, Rabbit Escape -> Nue Carry Flight, Toad Ally Lock, Mahoraga Domain Finisher & Rogue Alert -->
      {#if (hud.nueCarryRemainingSec ?? 0) > 0}
        <div class="mt-6 w-44 bg-black/80 border border-sky-400/70 rounded-full p-1">
          <div
            class="h-2.5 rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.8)]"
            style="width: {((hud.nueCarryRemainingSec ?? 0) / 2.0) * 100}%;"
          ></div>
          <div class="text-center font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-200 mt-0.5">
            NUE FLIGHT · {hud.nueCarryRemainingSec}s [HOLD SPACE]
          </div>
        </div>
      {:else if hud.canNueCarry}
        <div class="mt-6 px-3.5 py-1 rounded-full bg-sky-500/30 border border-sky-300 font-['Share_Tech_Mono'] text-[10px] font-bold text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.55)] animate-pulse">
          [HOLD SPACE] NUE FLIGHT CARRY (2.0s)
        </div>
      {/if}
      {#if hud.isShadowStepping}
        <div class="mt-6 px-3.5 py-1 rounded-full bg-indigo-950/80 border border-indigo-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-indigo-200 shadow-[0_0_20px_rgba(99,102,241,0.55)] animate-pulse">
          SHADOW STEP · UNDETECTED ({hud.shadowStepRemainingSec}s) · [SHIFT] TO EMERGE
        </div>
      {/if}
      {#if hud.nueToadPreview === 'TOAD'}
        <div class="mt-4 px-3 py-0.5 rounded-full bg-pink-500/25 border border-pink-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-pink-200">
          [E] TOAD RESCUE LOCKED ON ALLY
        </div>
      {/if}
      {#if hud.canSummonMahoraga}
        <div class="mt-4 px-3.5 py-1 rounded-full bg-amber-500/30 border border-amber-300 font-['Share_Tech_Mono'] text-[10px] font-bold text-amber-100 shadow-[0_0_22px_rgba(250,204,21,0.55)] animate-pulse">
          [Q] SUMMON MAHORAGA (ADAPTIVE TITAN · ENDS DOMAIN)
        </div>
      {/if}
      {#if hud.mahoragaRogue}
        <div class="mt-4 px-3.5 py-1 rounded-full bg-red-600/35 border border-red-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-red-100 shadow-[0_0_22px_rgba(239,68,68,0.65)] animate-pulse">
          ⚠ MAHORAGA HAS TURNED ON YOUR TEAM!
        </div>
      {/if}

      <!-- Uro Takako Sky Flight, Dual-Mode Thin Ice Breaker & Domain Finisher -->
      {#if hud.isUroFlying}
        <div class="mt-6 px-3.5 py-1 rounded-full bg-cyan-500/25 border border-cyan-300 font-['Share_Tech_Mono'] text-[10px] font-bold text-cyan-100 shadow-[0_0_18px_rgba(103,232,249,0.55)]">
          SKY FLIGHT ACTIVE · [E] AERIAL 3M THIN ICE SLAM · [HOLD SPACE] GLIDE
        </div>
      {/if}
      {#if hud.canCastShatteredSky}
        <div class="mt-4 px-3.5 py-1 rounded-full bg-cyan-500/30 border border-cyan-300 font-['Share_Tech_Mono'] text-[10px] font-bold text-cyan-100 shadow-[0_0_22px_rgba(103,232,249,0.6)] animate-pulse">
          [Q] MAXIMUM: SHATTERED SKY (THIN ICE CATACLYSM · ENDS DOMAIN)
        </div>
      {/if}

      <!-- Doomfist Rocket Punch Charge Bar (Hold Right Click) -->
      {#if hud.punchChargeRatio > 0}
        <div class="mt-8 w-36 bg-black/80 border border-white/25 rounded-full p-1">
          <div
            class="h-2.5 rounded-full transition-all"
            style="width: {hud.punchChargeRatio * 100}%; background: {hud.isPowerEmpowered ? '#facc15' : hud.hero.color};"
          ></div>
          <div class="text-center font-['Share_Tech_Mono'] text-[10px] font-bold text-white mt-0.5">
            ROCKET PUNCH {Math.round(hud.punchChargeRatio * 100)}%
          </div>
        </div>
      {/if}

      <!-- Reinhardt / Brigitte / Gojo Infinity Barrier Shield Meter -->
      {#if (hud.isUsingSecondary || hud.barrierHp < hud.barrierMaxHp) && hud.barrierMaxHp > 0}
        <div class="mt-8 w-44 bg-slate-950/85 border border-sky-400/50 rounded-xl px-3 py-1.5">
          <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-sky-300 mb-1">
            <span>{hud.hero.id === 'gojo' ? 'INFINITY [HOLD E]' : hud.hero.secondaryFire.name.split('[')[0].trim().toUpperCase()}</span>
            <span>{hud.barrierHp} / {hud.barrierMaxHp}</span>
          </div>
          <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-sky-400 transition-all"
              style="width: {(hud.barrierHp / hud.barrierMaxHp) * 100}%;"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Doomfist Empowered Punch / Brigitte Inspire Status Pill -->
      {#if hud.isPowerEmpowered}
        <div class="mt-6 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-amber-300">
          ⚡ EMPOWERED ROCKET PUNCH READY [M2]
        </div>
      {/if}
      {#if hud.inspireTimerSec > 0}
        <div class="mt-6 px-3 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-400 font-['Share_Tech_Mono'] text-[10px] font-bold text-yellow-200">
          ✦ INSPIRE HEALING ACTIVE ({hud.inspireTimerSec}s)
        </div>
      {/if}
    </div>
  </div>

  <!-- ── 2. FLOATING 3D PROJECTED DAMAGE POPUPS ── -->
  <div class="fixed inset-0 pointer-events-none z-20 overflow-hidden">
    {#each hud.damagePopups as pop (pop.id)}
      <div
        class="absolute -translate-x-1/2 -translate-y-1/2 font-['Share_Tech_Mono'] font-bold"
        style="left: {pop.x}%; top: {pop.y}%; opacity: {pop.opacity ?? 1}; color: {pop.color}; font-size: {pop.isCrit ? '20px' : '15px'}; text-shadow: 0 2px 6px rgba(0,0,0,0.9);"
      >
        {pop.label ? `${pop.label} -${pop.amount}` : pop.isCrit ? `CRIT ${pop.amount}!` : pop.amount}
      </div>
    {/each}
  </div>

  <!-- ── 3. TOP MOBA SCOREBOARD & CORE HEALTH BARS ── -->
  <div class="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 bg-slate-950/85 border border-white/10 px-6 py-2.5 rounded-2xl backdrop-blur-md pointer-events-none">
    <!-- Blue Core -->
    <div class="w-40">
      <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-sky-400 mb-1">
        <span>ALLIED CORE</span>
        <span>{hud.blueCoreHp} HP</span>
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-sky-400 transition-all"
          style="width: {(hud.blueCoreHp / hud.blueCoreMaxHp) * 100}%;"
        ></div>
      </div>
    </div>

    <!-- Match Clock & K/D/CS -->
    <div class="text-center px-3 border-x border-white/10 font-['Share_Tech_Mono']">
      <div class="text-base font-bold text-white">{formatTime(hud.matchTimeSec)}</div>
      <div class="text-[10px] text-slate-400">
        {hud.kills}K / {hud.deaths}D / {hud.minionKills}CS
      </div>
    </div>

    <!-- Red Core -->
    <div class="w-40">
      <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-rose-400 mb-1">
        <span>{hud.redCoreHp} HP</span>
        <span>ENEMY CORE</span>
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-rose-500 transition-all ml-auto"
          style="width: {(hud.redCoreHp / hud.redCoreMaxHp) * 100}%;"
        ></div>
      </div>
    </div>
  </div>

  <!-- ── 4. TOP-LEFT TACTICAL LANE MINIMAP ── -->
  <div class="fixed top-4 left-4 z-30 bg-slate-950/85 border border-white/15 rounded-2xl p-3 backdrop-blur-md pointer-events-none">
    <div class="font-['Share_Tech_Mono'] text-[10px] tracking-widest text-slate-400 uppercase mb-1.5 flex justify-between items-center gap-2">
      <span class="text-amber-300 font-bold">{hud.mapName ?? 'RADAR'}</span>
      <span class="text-emerald-400">LVL {hud.level} · {hud.gold}G</span>
    </div>
    <div class="relative w-32 h-48 bg-slate-900/90 border border-white/10 rounded-lg overflow-hidden">
      <!-- Center line -->
      <div class="absolute inset-x-0 top-1/2 h-[1px] bg-white/10"></div>
      <div class="absolute inset-y-2 left-1/2 w-2 -translate-x-1/2 bg-white/5"></div>

      <!-- WhirlyDome Marker (Orlando) -->
      {#if hud.mapId === 'orlando'}
        <div
          class="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-400/60 bg-amber-500/25 flex items-center justify-center text-[7px] text-amber-200 font-bold"
          style="left: 76%; top: 50%;"
          title="WhirlyDome"
        >
          WD
        </div>
      {/if}

      <!-- Units & Towers -->
      {#each hud.minimapBlips as blip (blip.id)}
        {@const mx = ((blip.x + 42) / 84) * 100}
        {@const my = ((blip.z + 78) / 156) * 100}
        <div
          class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style="
            left: {mx}%;
            top: {my}%;
            width: {blip.type === 'CORE' ? '10px' : blip.type === 'TOWER' || blip.type === 'HERO' ? '7px' : blip.type === 'SHIKIGAMI' ? '6px' : '4px'};
            height: {blip.type === 'CORE' ? '10px' : blip.type === 'TOWER' || blip.type === 'HERO' ? '7px' : blip.type === 'SHIKIGAMI' ? '6px' : '4px'};
            background: {blip.team === 'blue' ? '#38bdf8' : '#f43f5e'};
            box-shadow: 0 0 6px {blip.team === 'blue' ? '#38bdf8' : '#f43f5e'};
          "
        ></div>
      {/each}

      <!-- Player Position Marker -->
      <div
        class="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 border border-white"
        style="left: {((hud.playerPos.x + 42) / 84) * 100}%; top: {((hud.playerPos.z + 78) / 156) * 100}%;"
      ></div>
    </div>
  </div>

  <!-- ── 5. TOP-RIGHT KILL FEED & EXIT BUTTON ── -->
  <div class="fixed top-4 right-4 z-30 flex flex-col items-end gap-2">
    <button
      onclick={() => goto('/fps-moba')}
      class="bg-slate-950/85 border border-white/15 hover:border-white/40 px-4 py-2 rounded-xl font-['Share_Tech_Mono'] text-xs tracking-widest text-slate-300 cursor-pointer"
    >
      LEAVE MATCH
    </button>

    {#each hud.killFeed as entry (entry.id)}
      <div class="bg-slate-950/80 border border-white/10 px-3 py-1.5 rounded-lg font-['Share_Tech_Mono'] text-xs flex items-center gap-2 pointer-events-none">
        <span class={entry.killerTeam === 'blue' ? 'text-sky-400' : 'text-rose-400'}>{entry.killer}</span>
        <span class="text-slate-500">[{entry.weaponOrAbility}]</span>
        <span class={entry.victimTeam === 'blue' ? 'text-sky-400' : 'text-rose-400'}>{entry.victim}</span>
      </div>
    {/each}
  </div>

  <!-- ── 6. ACTIVE DOMAIN EXPANSION BANNER ── -->
  {#if hud.activeDomainName}
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1.5">
      <div
        class="px-6 py-1.5 rounded-full font-['Cinzel_Decorative'] text-sm font-bold tracking-[0.25em] uppercase text-white border animate-pulse"
        style="background: {hud.hero.color}33; border-color: {hud.hero.color}; box-shadow: 0 0 25px {hud.hero.color}66;"
      >
        {hud.activeDomainName} ACTIVE
      </div>
      {#if hud.domainBarrierHp !== undefined && hud.domainBarrierMaxHp}
        <div class="bg-slate-950/85 border border-white/15 rounded-full px-4 py-1 flex items-center gap-3 font-['Share_Tech_Mono'] text-[10px] text-sky-200">
          <span>BARRIER: {hud.domainBarrierHp} / {hud.domainBarrierMaxHp} HP</span>
          <span class="text-purple-300">90% INTERIOR SLOW</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- ── 7. BOTTOM HUD: HP/MANA, SHIFT/E/Q COOLDOWNS, AND AMMO ── -->
  <div class="fixed bottom-5 inset-x-6 z-30 flex flex-wrap items-end justify-between gap-4 pointer-events-none">
    <!-- Left: HP, Shield & Mana Bars -->
    <div class="w-72 bg-slate-950/85 border border-white/15 p-4 rounded-2xl backdrop-blur-md">
      <div class="flex items-center justify-between font-['Share_Tech_Mono'] text-xs mb-1.5">
        <span class="font-bold text-white">{hud.hero.name.toUpperCase()}</span>
        <span class="text-emerald-400">
          {hud.hp} / {hud.maxHp} HP {hud.shield > 0 ? `(+${hud.shield} SHD)` : ''}
        </span>
      </div>
      <div class="h-3 bg-slate-800 rounded-full overflow-hidden mb-2.5">
        <div
          class="h-full transition-all"
          style="width: {(hud.hp / hud.maxHp) * 100}%; background: {hud.hero.color};"
        ></div>
      </div>

      <div class="flex items-center justify-between font-['Share_Tech_Mono'] text-[11px] mb-1 {hud.manaExhaustedTimerSec > 0 ? 'text-rose-400' : 'text-sky-300'}">
        <div class="flex items-center gap-1.5">
          <span>CURSED ENERGY</span>
          {#if hud.manaExhaustedTimerSec <= 0}
            <span class="text-[10px] text-cyan-400/80">(+{hud.ceRegenPerSec}/s)</span>
          {/if}
        </div>
        {#if hud.manaExhaustedTimerSec > 0}
          <span class="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-400/50 text-rose-300 font-bold animate-pulse">
            BURNOUT · {hud.manaExhaustedTimerSec.toFixed(1)}s
          </span>
        {:else}
          <span>{hud.mana} / {hud.maxMana}</span>
        {/if}
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        {#if hud.manaExhaustedTimerSec > 0}
          <div
            class="h-full bg-rose-500/80 animate-pulse transition-all"
            style="width: {((CE_EXHAUSTION_LOCKOUT_SEC - hud.manaExhaustedTimerSec) / CE_EXHAUSTION_LOCKOUT_SEC) * 100}%;"
          ></div>
        {:else}
          <div
            class="h-full bg-sky-400 transition-all"
            style="width: {(hud.mana / hud.maxMana) * 100}%;"
          ></div>
        {/if}
      </div>
    </div>

    <!-- Center: SHIFT / E / Q Ability Bar -->
    <div class="flex items-center gap-3 bg-slate-950/85 border border-white/15 p-3 rounded-2xl backdrop-blur-md">
      {#each abilityKeys as key}
        {@const ab = hud.hero.abilities[key]}
        {@const cd = hud.cooldowns[key]}
        {@const isPurpleOverride = key === 'Q' && Boolean(hud.canCastHollowPurple)}
        {@const isMeteorOverride = key === 'Q' && Boolean(hud.canCastMeteor)}
        {@const isMahoragaOverride = key === 'Q' && Boolean(hud.canSummonMahoraga)}
        {@const isShatteredSkyOverride = key === 'Q' && Boolean(hud.canCastShatteredSky)}
        {@const isDomainFinisher =
          isPurpleOverride || isMeteorOverride || isMahoragaOverride || isShatteredSkyOverride}
        {@const hasCharges = Boolean(cd.maxCharges && cd.maxCharges > 1)}
        {@const currentCharges = cd.charges ?? cd.maxCharges ?? 1}
        {@const onCooldown = !isDomainFinisher && (hasCharges ? currentCharges <= 0 : cd.remainingMs > 0)}
        {@const isRechargingCharge = hasCharges && currentCharges < (cd.maxCharges ?? 1) && cd.remainingMs > 0}
        {@const noMana =
          hud.manaExhaustedTimerSec > 0 ||
          hud.mana <= 0 ||
          (!isDomainFinisher && hud.mana < ab.manaCost) ||
          (isDomainFinisher && hud.mana < 35)}
        {@const cardColor = isPurpleOverride
          ? '#a855f7'
          : isMeteorOverride
            ? '#f97316'
            : isMahoragaOverride
              ? '#facc15'
              : isShatteredSkyOverride
                ? '#67e8f9'
                : ab.color}
        <div
          class="relative w-22 h-20 rounded-xl border flex flex-col items-center justify-between p-2 overflow-hidden {onCooldown || noMana
            ? 'border-white/10 bg-slate-900/80 opacity-60'
            : 'border-white/30 bg-slate-900'}"
          style={!onCooldown && !noMana ? `border-color: ${cardColor}; box-shadow: 0 0 15px ${cardColor}44;` : ''}
        >
          <div class="w-full flex justify-between font-['Share_Tech_Mono'] text-[10px]">
            <span class="font-bold {isPurpleOverride ? 'text-purple-300' : isMeteorOverride ? 'text-orange-300' : isMahoragaOverride ? 'text-amber-300' : isShatteredSkyOverride ? 'text-cyan-300' : key === 'Q' ? 'text-amber-300' : 'text-white'}">[{key}]</span>
            <span class="{noMana ? 'text-rose-400' : 'text-sky-300'}">{isDomainFinisher ? '35' : ab.manaDrainPerSec ? `${ab.manaDrainPerSec}/s` : ab.manaCost}</span>
          </div>
          <div class="text-[11px] font-bold text-center {isPurpleOverride ? 'text-purple-200' : isMeteorOverride || isMahoragaOverride ? 'text-amber-200' : isShatteredSkyOverride ? 'text-cyan-200' : 'text-white'} leading-tight line-clamp-2">
            {isPurpleOverride
              ? 'Hollow Purple'
              : isMeteorOverride
                ? 'Maximum: Meteor'
                : isMahoragaOverride
                  ? 'Mahoraga'
                  : isShatteredSkyOverride
                    ? 'Shattered Sky'
                    : key === 'E' && hud.nueToadPreview === 'TOAD'
                      ? 'Toad Rescue'
                      : key === 'E' && hud.hero.id === 'uro'
                        ? hud.isUroFlying
                          ? 'Thin Ice Slam (3m)'
                          : 'Thin Ice Beam'
                        : ab.name}
          </div>
          {#if hasCharges}
            <div class="w-full flex items-center justify-between font-['Share_Tech_Mono'] text-[9px] pt-0.5">
              <div class="flex items-center gap-1">
                {#each Array(cd.maxCharges ?? 1) as _, idx}
                  <span
                    class="w-2 h-2 rounded-full"
                    style="background: {idx < currentCharges ? cardColor : 'rgba(255,255,255,0.18)'};"
                  ></span>
                {/each}
              </div>
              <span class="text-slate-300">
                {isRechargingCharge ? `${(cd.remainingMs / 1000).toFixed(1)}s` : `${currentCharges}/${cd.maxCharges}`}
              </span>
            </div>
          {/if}
          {#if onCooldown}
            <div class="absolute inset-0 bg-black/75 flex items-center justify-center font-['Share_Tech_Mono'] text-sm font-bold text-white">
              {(cd.remainingMs / 1000).toFixed(1)}s
            </div>
          {:else if hud.manaExhaustedTimerSec > 0}
            <div class="absolute inset-0 bg-rose-950/75 flex items-center justify-center font-['Share_Tech_Mono'] text-[11px] font-bold text-rose-300">
              {hud.manaExhaustedTimerSec.toFixed(1)}s
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Right: Weapon, Secondary Fire (M2) & Ammo / Barrier Counter -->
    <div class="w-68 bg-slate-950/85 border border-white/15 p-4 rounded-2xl backdrop-blur-md text-right font-['Share_Tech_Mono']">
      <div class="text-[10px] text-slate-400 uppercase tracking-widest mb-1">
        [M1] {hud.hero.weapon.name}
      </div>
      {#if hud.maxAmmo === 0}
        <div class="text-2xl font-bold text-amber-300">∞ MELEE CLEAVE</div>
      {:else if hud.isReloading}
        <div class="text-2xl font-bold text-amber-400 animate-pulse">RELOADING...</div>
      {:else if hud.activeDomainName}
        <div class="text-2xl font-bold text-emerald-400">∞ DOMAIN AMMO</div>
      {:else}
        <div class="text-3xl font-bold text-white">
          {hud.ammo} <span class="text-sm text-slate-500">/ {hud.maxAmmo}</span>
        </div>
      {/if}

      <!-- Secondary Fire (Right Click / M2) Status -->
      {#if hud.hero.secondaryFire.kind !== 'NONE'}
        <div class="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
          <span class="text-sky-300">[M2] {hud.hero.secondaryFire.name.split('[')[0]}</span>
          {#if hud.hasActiveBlueOrb}
            <span class="text-sky-300 font-bold animate-pulse">ATTRACT [M2]</span>
          {:else if hud.secondaryCooldownMs > 0}
            <span class="text-rose-400 font-bold">{(hud.secondaryCooldownMs / 1000).toFixed(1)}s CD</span>
          {:else if hud.hero.secondaryFire.kind === 'REALITY_WIPE'}
            <span class="text-cyan-300 font-bold">{hud.activeRealityWipes ?? 0} / 3 ACTIVE (5s)</span>
          {:else if (hud.hero.secondaryFire.kind === 'BARRIER_SHIELD' || hud.hero.secondaryFire.kind === 'SKY_DEFLECT') && hud.barrierMaxHp > 0}
            <span class="text-white font-bold">{hud.barrierHp} / {hud.barrierMaxHp}</span>
          {:else}
            <span class="text-emerald-400 font-bold">READY</span>
          {/if}
        </div>
      {/if}
      <div class="text-[10px] text-slate-500 mt-1">[R] RELOAD · [V] QUICK MELEE · [ESC] MENU</div>
    </div>
  </div>

  <!-- ── 8. ESC PAUSE & QUIT MENU OVERLAY ── -->
  {#if !hud.pointerLocked && !hud.winner}
    <div class="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-slate-900/95 border border-white/20 p-8 rounded-3xl text-center max-w-md w-full shadow-2xl">
        <div class="font-['Share_Tech_Mono'] text-xs tracking-[0.35em] text-emerald-400 uppercase mb-2">
          {hud.matchTimeSec > 0 ? 'MATCH PAUSED [ESC]' : 'FIRST-PERSON COMBAT READY'}
        </div>
        <h2 class="font-['Cinzel_Decorative'] text-3xl font-bold text-white mb-2">
          {hud.matchTimeSec > 0 ? 'TACTICAL PAUSE' : 'DEPLOY OPERATIVE'}
        </h2>
        <p class="text-xs text-slate-400 font-['Share_Tech_Mono'] leading-relaxed mb-6">
          Destroy the Enemy Outer Tower, Base Tower, and Ancient Core down the lane while defending your own.
        </p>

        <!-- Arena & Camera Options inside ESC menu -->
        <div class="bg-black/40 border border-white/10 rounded-xl p-3 mb-4 space-y-2.5 font-['Share_Tech_Mono'] text-xs">
          <div class="flex items-center justify-between">
            <span class="text-slate-300">MOUSE SENS: {sensitivity.toFixed(1)}x</span>
            <input
              type="range"
              min="0.3"
              max="2.5"
              step="0.1"
              value={sensitivity}
              oninput={onSensChange}
              class="w-28 accent-emerald-400 cursor-pointer"
            />
          </div>

          <div class="flex items-center justify-between">
            <span class="text-slate-300">
              HAND DIST: {handDistance === 0 ? 'STD' : `${handDistance > 0 ? '+' : ''}${Math.round(handDistance * 100)}cm`}
            </span>
            <input
              type="range"
              min="-0.16"
              max="0.35"
              step="0.01"
              value={handDistance}
              oninput={onHandDistanceChange}
              class="w-28 accent-sky-400 cursor-pointer"
            />
          </div>

          <div class="flex items-center justify-between pt-0.5 border-t border-white/10">
            <span class="text-slate-300">AI ATTACKING</span>
            <button
              onclick={toggleAiAttacking}
              class="px-3 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer {aiAttacking
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-rose-500/20 border-rose-400/70 text-rose-300'}"
            >
              {aiAttacking ? 'ON' : 'OFF (PASSIVE)'}
            </button>
          </div>
        </div>

        <!-- Operative & Map Switcher inside ESC menu -->
        <div class="bg-black/50 border border-white/10 rounded-2xl p-4 mb-5 text-left space-y-3">
          <div>
            <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
              <span>SELECT OPERATIVE</span>
              <span class="text-sky-300 font-bold">{activeHero.name}</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5">
              {#each FPS_MOBA_HEROES as h}
                {@const isCurrentHero = activeHero.id === h.id}
                <button
                  onclick={() => switchHero(h)}
                  class="py-1.5 px-2 rounded-lg border text-[11px] font-['Share_Tech_Mono'] truncate transition-all cursor-pointer {isCurrentHero
                    ? 'bg-sky-500/25 border-sky-400 text-white font-bold shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'}"
                  style={isCurrentHero ? `color: ${h.accentColor};` : ''}
                >
                  {h.name}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between">
              <span>SELECT MAP</span>
              <span class="text-amber-300 font-bold">
                {MOBA_MAPS.find((m) => m.id === activeMapId)?.name.toUpperCase()}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              {#each MOBA_MAPS as m}
                {@const isCurrentMap = activeMapId === m.id}
                <button
                  onclick={() => switchMap(m.id)}
                  class="py-2 px-3 rounded-xl border text-left font-['Share_Tech_Mono'] transition-all cursor-pointer {isCurrentMap
                    ? 'bg-amber-500/25 border-amber-400 text-white shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'}"
                >
                  <div class="text-xs font-bold" style="color: {m.accentColor};">{m.name}</div>
                  <div class="text-[9px] text-slate-400">{m.subtitle}</div>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="space-y-2.5">
          <button
            onclick={lockPointer}
            class="w-full py-3.5 px-6 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold uppercase tracking-widest text-black bg-emerald-400 hover:bg-emerald-300 transition-colors cursor-pointer"
          >
            {hud.matchTimeSec > 0 ? 'RESUME MATCH (LOCK MOUSE)' : 'ENTER ARENA (LOCK MOUSE)'}
          </button>

          <button
            onclick={() => {
              startMatch();
              setTimeout(() => lockPointer(), 50);
            }}
            class="w-full py-3 px-6 rounded-xl font-['Share_Tech_Mono'] text-xs uppercase tracking-widest text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
          >
            RESTART MATCH
          </button>

          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onclick={() => goto('/fps-moba')}
              class="py-3 px-4 rounded-xl font-['Share_Tech_Mono'] text-xs uppercase tracking-widest text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors cursor-pointer"
            >
              HERO LOBBY
            </button>

            <button
              onclick={() => goto('/')}
              class="py-3 px-4 rounded-xl font-['Share_Tech_Mono'] text-xs uppercase tracking-widest text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer"
            >
              QUIT TO PORTAL
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── 9. VICTORY / DEFEAT OVERLAY ── -->
  {#if hud.winner}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
      <div class="bg-slate-900 border border-white/20 p-10 rounded-3xl text-center max-w-md w-full">
        <div class="font-['Share_Tech_Mono'] text-xs tracking-[0.4em] uppercase mb-2 {hud.winner === 'blue' ? 'text-emerald-400' : 'text-rose-400'}">
          {hud.winner === 'blue' ? 'ENEMY ANCIENT CORE DESTROYED' : 'ALLIED ANCIENT CORE FALLEN'}
        </div>
        <h2 class="font-['Cinzel_Decorative'] text-5xl font-black text-white mb-6">
          {hud.winner === 'blue' ? 'VICTORY' : 'DEFEAT'}
        </h2>
        <div class="grid grid-cols-3 gap-3 bg-black/40 p-4 rounded-xl font-['Share_Tech_Mono'] text-xs mb-6">
          <div>
            <div class="text-slate-500">K / D</div>
            <div class="text-base font-bold text-white">{hud.kills} / {hud.deaths}</div>
          </div>
          <div>
            <div class="text-slate-500">MINIONS</div>
            <div class="text-base font-bold text-white">{hud.minionKills}</div>
          </div>
          <div>
            <div class="text-slate-500">GOLD</div>
            <div class="text-base font-bold text-amber-400">{hud.gold}</div>
          </div>
        </div>
        <div class="flex gap-3">
          <button
            onclick={startMatch}
            class="flex-1 py-3.5 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold uppercase tracking-widest bg-emerald-400 text-black cursor-pointer"
          >
            PLAY AGAIN
          </button>
          <button
            onclick={() => goto('/fps-moba')}
            class="flex-1 py-3.5 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold uppercase tracking-widest bg-white/10 text-white cursor-pointer"
          >
            HERO SELECT
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

