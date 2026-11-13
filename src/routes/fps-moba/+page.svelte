<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { FPS_MOBA_HEROES } from '$lib/games/fps-moba/data/heroes';
  import {
    getSelectedFpsHero,
    setSelectedFpsHero,
    getMouseSensitivity,
    setMouseSensitivity
  } from '$lib/games/fps-moba/storage';
  import type { FpsHeroDef, FpsAbilityKey } from '$lib/games/fps-moba/types';

  let selectedHero = $state<FpsHeroDef>(FPS_MOBA_HEROES[0]);
  let sensitivity = $state<number>(1.0);

  onMount(() => {
    selectedHero = getSelectedFpsHero();
    sensitivity = getMouseSensitivity();
  });

  function selectHero(hero: FpsHeroDef) {
    selectedHero = hero;
    setSelectedFpsHero(hero.id);
  }

  function onSensChange(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    sensitivity = val;
    setMouseSensitivity(val);
  }

  function deploy() {
    setSelectedFpsHero(selectedHero.id);
    goto('/fps-moba/play');
  }

  const abilityKeys: FpsAbilityKey[] = ['Q', 'E', 'F', 'R'];
</script>

<svelte:head>
  <title>Nexus Protocol — 3D FPS/MOBA Lobby</title>
</svelte:head>

<div class="min-h-screen bg-[#040711] text-white p-6 md:p-10 flex flex-col justify-between">
  <!-- Top Bar -->
  <div class="max-w-6xl w-full mx-auto flex items-center justify-between border-b border-white/10 pb-5">
    <div>
      <div class="font-['Share_Tech_Mono'] text-xs tracking-[0.35em] text-emerald-400 uppercase">
        THREE.JS WEBGL2 // FIRST-PERSON MOBA
      </div>
      <h1 class="font-['Cinzel_Decorative'] text-3xl font-bold mt-1">NEXUS PROTOCOL</h1>
    </div>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl font-['Share_Tech_Mono'] text-xs">
        <span class="text-slate-400">MOUSE SENS: {sensitivity.toFixed(1)}x</span>
        <input
          type="range"
          min="0.3"
          max="2.5"
          step="0.1"
          value={sensitivity}
          oninput={onSensChange}
          class="w-24 accent-emerald-400 cursor-pointer"
        />
      </div>
      <button
        onclick={() => goto('/')}
        class="bg-white/5 border border-white/10 hover:border-white/30 px-4 py-2.5 rounded-xl font-['Share_Tech_Mono'] text-xs tracking-widest text-slate-300"
      >
        ← SWITCH GAME
      </button>
    </div>
  </div>

  <!-- Hero Roster + Loadout Inspector -->
  <div class="max-w-6xl w-full mx-auto my-8 grid lg:grid-cols-12 gap-8 items-start">
    <!-- Left Column: Hero Cards -->
    <div class="lg:col-span-5 grid gap-3">
      <div class="font-['Share_Tech_Mono'] text-xs tracking-widest text-slate-400 uppercase mb-1">
        SELECT YOUR OPERATIVE
      </div>
      {#each FPS_MOBA_HEROES as hero}
        {@const isSelected = selectedHero.id === hero.id}
        <button
          onclick={() => selectHero(hero)}
          class="text-left p-5 rounded-2xl border transition-all flex items-center justify-between {isSelected
            ? 'bg-slate-900/90 border-white/40 shadow-lg'
            : 'bg-slate-900/40 border-white/10 hover:border-white/25'}"
          style="border-left: 4px solid {hero.color};"
        >
          <div>
            <div class="flex items-center gap-2.5">
              <span class="font-['Cinzel_Decorative'] text-2xl font-bold text-white">{hero.name}</span>
              <span
                class="font-['Share_Tech_Mono'] text-[10px] tracking-widest px-2.5 py-0.5 rounded uppercase"
                style="background: {hero.color}22; color: {hero.accentColor}; border: 1px solid {hero.color}55;"
              >
                {hero.role}
              </span>
            </div>
            <p class="text-xs text-slate-400 italic mt-1">"{hero.epithet}"</p>
          </div>
          <div class="text-right font-['Share_Tech_Mono'] text-xs text-slate-400">
            <div>HP {hero.maxHp}</div>
            <div class="text-[10px] text-slate-500">SPD {hero.moveSpeed}</div>
          </div>
        </button>
      {/each}
    </div>

    <!-- Right Column: Selected Hero Weapon & Q/E/F/R Kit -->
    <div class="lg:col-span-7 bg-slate-900/60 border border-white/10 rounded-2xl p-6 md:p-8">
      <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
        <div>
          <span
            class="font-['Share_Tech_Mono'] text-xs uppercase tracking-widest"
            style="color: {selectedHero.accentColor};"
          >
            {selectedHero.role} LOADOUT
          </span>
          <h2 class="font-['Cinzel_Decorative'] text-3xl font-bold mt-1">{selectedHero.name}</h2>
        </div>

        <button
          onclick={deploy}
          class="px-8 py-4 rounded-xl font-['Share_Tech_Mono'] text-sm font-bold tracking-[0.2em] uppercase text-black transition-transform active:scale-95 shadow-lg cursor-pointer"
          style="background: {selectedHero.color}; box-shadow: 0 0 30px {selectedHero.color}66;"
        >
          DEPLOY TO 3D ARENA →
        </button>
      </div>

      <!-- Primary Fire (M1) & Secondary Fire (M2) + Passive -->
      <div class="grid md:grid-cols-2 gap-3 mb-4">
        <div class="bg-black/40 border border-white/10 rounded-xl p-4">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-slate-400 uppercase">
              [M1] PRIMARY ({selectedHero.weapon.fireMode})
            </span>
            <span class="font-['Share_Tech_Mono'] text-[11px] text-emerald-300">
              {selectedHero.weapon.damage} DMG
            </span>
          </div>
          <div class="text-base font-bold text-white mb-1">{selectedHero.weapon.name}</div>
          <div class="font-['Share_Tech_Mono'] text-[11px] text-slate-400">
            {selectedHero.weapon.magazineSize === 0
              ? `Wide ${selectedHero.weapon.cleaveArcDeg}° Melee Cleave · Range ${selectedHero.weapon.range}m`
              : `${selectedHero.weapon.magazineSize} RDS · Range ${selectedHero.weapon.range}m`}
          </div>
        </div>

        <div class="bg-black/40 border border-white/10 rounded-xl p-4">
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-sky-400 uppercase">
              [M2] SECONDARY FIRE
            </span>
            <span class="font-['Share_Tech_Mono'] text-[11px] text-sky-200">
              {selectedHero.secondaryFire.kind}
            </span>
          </div>
          <div class="text-sm font-bold text-white mb-1">{selectedHero.secondaryFire.name}</div>
          <p class="text-[11px] text-slate-400 leading-relaxed">{selectedHero.secondaryFire.description}</p>
        </div>
      </div>

      <!-- Hero Passive Banner -->
      <div class="mb-4 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <span class="font-['Share_Tech_Mono'] text-xs font-bold text-amber-300">
          PASSIVE — {selectedHero.passiveName.toUpperCase()}
        </span>
        <span class="text-xs text-slate-300">{selectedHero.passiveDesc}</span>
      </div>

      <!-- Q / E / F / R Abilities -->
      <div class="grid sm:grid-cols-2 gap-3">
        {#each abilityKeys as key}
          {@const ab = selectedHero.abilities[key]}
          <div class="bg-black/40 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span
                  class="font-['Share_Tech_Mono'] text-xs font-bold px-2.5 py-1 rounded"
                  style="background: {ab.color}33; color: {selectedHero.accentColor}; border: 1px solid {ab.color}66;"
                >
                  [{key}] {key === 'R' ? 'ULTIMATE DOMAIN' : 'ABILITY'}
                </span>
                <span class="font-['Share_Tech_Mono'] text-[11px] text-slate-400">
                  {(ab.cooldownMs / 1000).toFixed(1)}s CD · {ab.manaCost} MP
                </span>
              </div>
              <div class="font-bold text-white text-sm mb-1">{ab.name}</div>
              <p class="text-xs text-slate-400 leading-relaxed">{ab.description}</p>
            </div>
            <div class="mt-3 pt-2 border-t border-white/5 font-['Share_Tech_Mono'] text-[11px] text-slate-400 flex justify-between">
              <span>DMG: {ab.damage}</span>
              <span>RADIUS: {ab.radius}m</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Footer Controls Summary -->
  <div class="max-w-6xl w-full mx-auto border-t border-white/10 pt-4 flex flex-wrap justify-between gap-4 font-['Share_Tech_Mono'] text-xs text-slate-500">
    <div>MOVE: WASD + SHIFT (SPRINT) + SPACE (JUMP)</div>
    <div>AIM & SHOOT: MOUSE + LEFT CLICK (HEADSHOTS = 1.6× CRIT)</div>
    <div>ABILITIES: [Q] [E] [F] · ULTIMATE DOMAIN: [R] · RELOAD: [C]</div>
  </div>
</div>

