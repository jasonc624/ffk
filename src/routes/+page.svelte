<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter, saveCharacter, type CharacterData } from '$lib/games/fighter/storage';
  import { ROSTER } from '$lib/games/fighter/data/roster';
  import { FPS_MOBA_HEROES } from '$lib/games/fps-moba/data/heroes';
  import { getSelectedFpsHero, setSelectedFpsHero } from '$lib/games/fps-moba/storage';
  import type { FpsHeroDef } from '$lib/games/fps-moba/types';

  let savedFighter = $state<CharacterData | null>(null);
  let selectedFighterId = $state<string>(ROSTER[0].id ?? 'jason');
  let selectedFpsHero = $state<FpsHeroDef>(FPS_MOBA_HEROES[0]);

  onMount(() => {
    savedFighter = getCharacter();
    if (savedFighter?.id) {
      selectedFighterId = savedFighter.id;
    }
    selectedFpsHero = getSelectedFpsHero();
  });

  function pickPresetFighter(char: CharacterData) {
    saveCharacter(char);
    savedFighter = char;
    selectedFighterId = char.id ?? char.name;
  }

  function startFighterBattle() {
    if (!getCharacter()) {
      const preset = ROSTER.find((r) => r.id === selectedFighterId) ?? ROSTER[0];
      saveCharacter(preset);
    }
    goto('/game');
  }

  function openFighterHub() {
    if (!getCharacter()) {
      const preset = ROSTER.find((r) => r.id === selectedFighterId) ?? ROSTER[0];
      saveCharacter(preset);
    }
    goto('/home');
  }

  function openFighterAnalysis() {
    if (!getCharacter()) {
      const preset = ROSTER.find((r) => r.id === selectedFighterId) ?? ROSTER[0];
      saveCharacter(preset);
    }
    goto('/character');
  }

  function selectMobaHero(hero: FpsHeroDef) {
    selectedFpsHero = hero;
    setSelectedFpsHero(hero.id);
  }

  function startMobaMatchNow() {
    setSelectedFpsHero(selectedFpsHero.id);
    goto('/fps-moba/play');
  }
</script>

<svelte:head>
  <title>Game Portal — Fufutsu Kaisen & Nexus Protocol</title>
</svelte:head>

<div class="min-h-screen bg-[#04060d] text-white flex flex-col justify-between p-6 md:p-10">
  <!-- Header -->
  <div class="max-w-6xl w-full mx-auto text-center mb-8">
    <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 font-['Share_Tech_Mono'] text-[11px] tracking-[0.35em] text-emerald-400 uppercase mb-3">
      DUAL-ENGINE WORKSPACE LAUNCHER
    </div>
    <h1 class="font-['Cinzel_Decorative'] text-4xl md:text-5xl font-black tracking-wide">
      CHOOSE YOUR GAME & FLOW
    </h1>
    <p class="text-slate-400 text-xs md:text-sm mt-2 font-['Share_Tech_Mono']">
      Test every flow of the 2D Fighter (`src/lib/games/fighter`) or the 3D Three.js FPS/MOBA (`src/lib/games/fps-moba`) directly from here
    </p>
  </div>

  <!-- Main Two-Game Grid -->
  <div class="max-w-6xl w-full mx-auto grid lg:grid-cols-2 gap-8 items-stretch">
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- GAME 1: FUFUTSU KAISEN (2D FIGHTER + 3D SHIBUYA STAGE)             -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <div class="bg-slate-900/60 border border-blue-500/30 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-[0_0_50px_rgba(59,130,246,0.08)]">
      <div>
        <!-- Badge & Folder -->
        <div class="flex items-center justify-between gap-2 mb-4">
          <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest uppercase px-3 py-1 rounded-full bg-blue-500/15 text-blue-300 border border-blue-400/30">
            GAME 1 · PHASER 3 + THREE.JS 3D STAGE
          </span>
          <code class="font-['Share_Tech_Mono'] text-[11px] text-slate-500">src/lib/games/fighter</code>
        </div>

        <h2 class="font-['Cinzel_Decorative'] text-3xl font-bold text-white mb-2">
          Fufutsu Kaisen
        </h2>
        <p class="text-slate-400 text-xs md:text-sm leading-relaxed mb-6">
          2D Cursed Technique Arena Fighter with AI-awakened sorcerers, 3D WebGL2 special moves, shikigami summons, and 3D Domain Expansions.
        </p>

        <!-- Active / Preset Sorcerer Selector -->
        <div class="bg-black/40 border border-white/10 rounded-2xl p-4 mb-6">
          <div class="flex items-center justify-between mb-3">
            <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-blue-300 uppercase">
              ACTIVE SORCERER PRESET
            </span>
            {#if savedFighter}
              <span class="font-['Share_Tech_Mono'] text-[11px] text-emerald-400">
                LOADED: {savedFighter.name.toUpperCase()}
              </span>
            {:else}
              <span class="font-['Share_Tech_Mono'] text-[11px] text-slate-500">
                SELECT PRESET OR AWAKEN NEW
              </span>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            {#each ROSTER as char}
              {@const isActive = savedFighter?.name === char.name || (!savedFighter && selectedFighterId === char.id)}
              <button
                onclick={() => pickPresetFighter(char)}
                class="text-left p-3 rounded-xl border transition-all cursor-pointer {isActive
                  ? 'bg-blue-500/15 border-blue-400 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'}"
              >
                <div class="font-['Share_Tech_Mono'] text-xs font-bold truncate" style="color: {char.color};">
                  {char.name}
                </div>
                <div class="text-[11px] text-slate-400 truncate mt-0.5">{char.technique.name}</div>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- All Fighter Flows -->
      <div class="space-y-3">
        <div class="font-['Share_Tech_Mono'] text-[10px] tracking-widest text-slate-400 uppercase">
          TRY FIGHTER FLOWS
        </div>

        <!-- Primary Action: Instant Battle -->
        <button
          onclick={startFighterBattle}
          class="w-full py-4 px-5 rounded-xl bg-blue-500 hover:bg-blue-400 text-black font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all shadow-[0_0_25px_rgba(59,130,246,0.4)] cursor-pointer flex items-center justify-between"
        >
          <span>1. ENTER 2D/3D ARENA BATTLE (/game)</span>
          <span>→</span>
        </button>

        <!-- Secondary Flows Grid -->
        <div class="grid grid-cols-3 gap-2.5">
          <button
            onclick={() => goto('/create')}
            class="py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 font-['Share_Tech_Mono'] text-[11px] text-blue-200 transition-all cursor-pointer text-center"
          >
            2. AI AWAKENING (/create)
          </button>
          <button
            onclick={openFighterHub}
            class="py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 font-['Share_Tech_Mono'] text-[11px] text-slate-200 transition-all cursor-pointer text-center"
          >
            3. FIGHTER HUB (/home)
          </button>
          <button
            onclick={openFighterAnalysis}
            class="py-3 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 font-['Share_Tech_Mono'] text-[11px] text-slate-200 transition-all cursor-pointer text-center"
          >
            4. TECH INSPECT (/character)
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════ -->
    <!-- GAME 2: NEXUS PROTOCOL (3D THREE.JS FIRST-PERSON MOBA)             -->
    <!-- ══════════════════════════════════════════════════════════════════ -->
    <div class="bg-slate-900/60 border border-emerald-500/30 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-[0_0_50px_rgba(16,185,129,0.08)]">
      <div>
        <!-- Badge & Folder -->
        <div class="flex items-center justify-between gap-2 mb-4">
          <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest uppercase px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
            GAME 2 · THREE.JS WEBGL2 FPS / MOBA
          </span>
          <code class="font-['Share_Tech_Mono'] text-[11px] text-slate-500">src/lib/games/fps-moba</code>
        </div>

        <h2 class="font-['Cinzel_Decorative'] text-3xl font-bold text-white mb-2">
          Nexus Protocol
        </h2>
        <p class="text-slate-400 text-xs md:text-sm leading-relaxed mb-6">
          First-Person 3D Hero Shooter & MOBA with PointerLock mouse-look, 3D hands & raycast weapons, Q/E/F abilities, R Domain Expansion, lane towers, and minion waves.
        </p>

        <!-- Quick Hero Picker -->
        <div class="bg-black/40 border border-white/10 rounded-2xl p-4 mb-6">
          <div class="flex items-center justify-between mb-3">
            <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-emerald-300 uppercase">
              SELECT 3D FPS OPERATIVE
            </span>
            <span class="font-['Share_Tech_Mono'] text-[11px]" style="color: {selectedFpsHero.accentColor};">
              {selectedFpsHero.name.toUpperCase()} ({selectedFpsHero.role})
            </span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {#each FPS_MOBA_HEROES as hero}
              {@const isSelected = selectedFpsHero.id === hero.id}
              <button
                onclick={() => selectMobaHero(hero)}
                class="text-left p-2.5 rounded-xl border transition-all cursor-pointer {isSelected
                  ? 'bg-emerald-500/15 border-emerald-400 text-white'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'}"
              >
                <div class="font-['Share_Tech_Mono'] text-xs font-bold" style="color: {hero.color};">
                  {hero.name}
                </div>
                <div class="font-['Share_Tech_Mono'] text-[10px] text-slate-400 truncate">{hero.role}</div>
              </button>
            {/each}
          </div>

          <!-- Selected Hero Mini Kit Summary -->
          <div class="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 font-['Share_Tech_Mono'] text-[11px] text-slate-300">
            <span>[M1] <strong class="text-white">{selectedFpsHero.weapon.name}</strong></span>
            <span>[M2] <strong class="text-sky-300">{selectedFpsHero.secondaryFire.name.split('[')[0]}</strong></span>
          </div>
        </div>
      </div>

      <!-- All FPS/MOBA Flows -->
      <div class="space-y-3">
        <div class="font-['Share_Tech_Mono'] text-[10px] tracking-widest text-slate-400 uppercase">
          TRY 3D FPS / MOBA FLOWS
        </div>

        <!-- Primary Action: Instant 3D Match -->
        <button
          onclick={startMobaMatchNow}
          class="w-full py-4 px-5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all shadow-[0_0_25px_rgba(16,185,129,0.4)] cursor-pointer flex items-center justify-between"
        >
          <span>1. INSTANT DEPLOY TO 3D MATCH (/fps-moba/play)</span>
          <span>→</span>
        </button>

        <!-- Secondary Flow: Hero Loadout & Settings Lobby -->
        <button
          onclick={() => goto('/fps-moba')}
          class="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/50 font-['Share_Tech_Mono'] text-[11px] text-emerald-200 transition-all cursor-pointer text-center"
        >
          2. HERO LOADOUT INSPECTOR & SENSITIVITY LOBBY (/fps-moba)
        </button>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="max-w-6xl w-full mx-auto mt-8 pt-4 border-t border-white/10 flex flex-wrap justify-between gap-4 font-['Share_Tech_Mono'] text-[11px] text-slate-500">
    <div>FIGHTER CONTROLS: WASD / SPACE + J (LIGHT) K (HEAVY) L/E/F (ABILITIES) Q (DOMAIN)</div>
    <div>FPS/MOBA CONTROLS: MOUSE AIM + LEFT CLICK FIRE + WASD/SHIFT/SPACE + Q/E/F/R ABILITIES</div>
  </div>
</div>
