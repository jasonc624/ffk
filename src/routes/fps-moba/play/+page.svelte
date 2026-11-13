<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { FpsMobaEngine } from '$lib/games/fps-moba/FpsMobaEngine';
  import {
    getSelectedFpsHero,
    getMouseSensitivity,
    setMouseSensitivity
  } from '$lib/games/fps-moba/storage';
  import type { FpsHudState, FpsAbilityKey } from '$lib/games/fps-moba/types';

  let container: HTMLDivElement;
  let engine: FpsMobaEngine | null = null;
  let hud = $state<FpsHudState | null>(null);
  let sensitivity = $state<number>(1.0);

  const abilityKeys: FpsAbilityKey[] = ['Q', 'E', 'F', 'R'];

  function startMatch() {
    engine?.destroy();
    const hero = getSelectedFpsHero();
    engine = new FpsMobaEngine(container, hero, (state) => {
      hud = state;
    });
  }

  function onSensChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    sensitivity = val;
    setMouseSensitivity(val);
  }

  onMount(() => {
    sensitivity = getMouseSensitivity();
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

      <!-- Reinhardt / Brigitte Active Barrier Shield Meter -->
      {#if hud.isUsingSecondary && hud.barrierMaxHp > 0}
        <div class="mt-8 w-44 bg-slate-950/85 border border-sky-400/50 rounded-xl px-3 py-1.5">
          <div class="flex justify-between font-['Share_Tech_Mono'] text-[10px] text-sky-300 mb-1">
            <span>BARRIER SHIELD</span>
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
        class="absolute -translate-x-1/2 -translate-y-1/2 font-['Share_Tech_Mono'] font-bold transition-all"
        style="left: {pop.x}%; top: {pop.y}%; color: {pop.color}; font-size: {pop.isCrit ? '20px' : '15px'}; text-shadow: 0 2px 6px rgba(0,0,0,0.9);"
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
    <div class="font-['Share_Tech_Mono'] text-[10px] tracking-widest text-slate-400 uppercase mb-1.5 flex justify-between">
      <span>TACTICAL RADAR</span>
      <span class="text-emerald-400">LVL {hud.level} · {hud.gold}G</span>
    </div>
    <div class="relative w-32 h-48 bg-slate-900/90 border border-white/10 rounded-lg overflow-hidden">
      <!-- Center line -->
      <div class="absolute inset-x-0 top-1/2 h-[1px] bg-white/10"></div>
      <div class="absolute inset-y-2 left-1/2 w-2 -translate-x-1/2 bg-white/5"></div>

      <!-- Units & Towers -->
      {#each hud.minimapBlips as blip (blip.id)}
        {@const mx = ((blip.x + 42) / 84) * 100}
        {@const my = ((blip.z + 78) / 156) * 100}
        <div
          class="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style="
            left: {mx}%;
            top: {my}%;
            width: {blip.type === 'CORE' ? '10px' : blip.type === 'TOWER' || blip.type === 'HERO' ? '7px' : '4px'};
            height: {blip.type === 'CORE' ? '10px' : blip.type === 'TOWER' || blip.type === 'HERO' ? '7px' : '4px'};
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
    <div class="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
      <div
        class="px-6 py-1.5 rounded-full font-['Cinzel_Decorative'] text-sm font-bold tracking-[0.25em] uppercase text-white border animate-pulse"
        style="background: {hud.hero.color}33; border-color: {hud.hero.color}; box-shadow: 0 0 25px {hud.hero.color}66;"
      >
        {hud.activeDomainName} ACTIVE
      </div>
    </div>
  {/if}

  <!-- ── 7. BOTTOM HUD: HP/MANA, Q/E/F/R COOLDOWNS, AND AMMO ── -->
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

      <div class="flex items-center justify-between font-['Share_Tech_Mono'] text-[11px] mb-1 text-sky-300">
        <span>CURSED ENERGY</span>
        <span>{hud.mana} / {hud.maxMana}</span>
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-sky-400 transition-all"
          style="width: {(hud.mana / hud.maxMana) * 100}%;"
        ></div>
      </div>
    </div>

    <!-- Center: Q / E / F / R Ability Bar -->
    <div class="flex items-center gap-3 bg-slate-950/85 border border-white/15 p-3 rounded-2xl backdrop-blur-md">
      {#each abilityKeys as key}
        {@const ab = hud.hero.abilities[key]}
        {@const cd = hud.cooldowns[key]}
        {@const onCooldown = cd.remainingMs > 0}
        {@const noMana = hud.mana < ab.manaCost}
        <div
          class="relative w-20 h-20 rounded-xl border flex flex-col items-center justify-between p-2 overflow-hidden {onCooldown || noMana
            ? 'border-white/10 bg-slate-900/80 opacity-60'
            : 'border-white/30 bg-slate-900'}"
          style={!onCooldown && !noMana ? `border-color: ${ab.color}; box-shadow: 0 0 15px ${ab.color}33;` : ''}
        >
          <div class="w-full flex justify-between font-['Share_Tech_Mono'] text-[10px]">
            <span class="font-bold text-white">[{key}]</span>
            <span class="text-sky-300">{ab.manaCost}</span>
          </div>
          <div class="text-[11px] font-bold text-center text-white leading-tight line-clamp-2">
            {ab.name}
          </div>
          {#if onCooldown}
            <div class="absolute inset-0 bg-black/75 flex items-center justify-center font-['Share_Tech_Mono'] text-sm font-bold text-white">
              {(cd.remainingMs / 1000).toFixed(1)}s
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
      <div class="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
        <span class="text-sky-300">[M2] {hud.hero.secondaryFire.name.split('[')[0]}</span>
        {#if hud.barrierMaxHp > 0}
          <span class="text-white font-bold">{hud.barrierHp} HP</span>
        {:else if hud.secondaryCooldownMs > 0}
          <span class="text-rose-400 font-bold">{(hud.secondaryCooldownMs / 1000).toFixed(1)}s CD</span>
        {:else}
          <span class="text-emerald-400 font-bold">READY</span>
        {/if}
      </div>
      <div class="text-[10px] text-slate-500 mt-1">[V] QUICK MELEE · [ESC] MENU</div>
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

        <!-- Sensitivity slider inside ESC menu -->
        <div class="bg-black/40 border border-white/10 rounded-xl p-3.5 mb-5 flex items-center justify-between font-['Share_Tech_Mono'] text-xs">
          <span class="text-slate-300">MOUSE SENSITIVITY: {sensitivity.toFixed(1)}x</span>
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

