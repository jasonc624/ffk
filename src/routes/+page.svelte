<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter, saveCharacter, type CharacterData } from '$lib/games/fighter/storage';
  import { ROSTER } from '$lib/games/fighter/data/roster';
  import { FPS_MOBA_HEROES } from '$lib/games/fps-moba/data/heroes';
  import { getSelectedFpsHero, setSelectedFpsHero } from '$lib/games/fps-moba/storage';
  import type { FpsHeroDef, FpsAbilityKey } from '$lib/games/fps-moba/types';

  type MenuTab = 'home' | 'heroes' | 'play';

  let activeTab = $state<MenuTab>('home');
  let savedFighter = $state<CharacterData | null>(null);
  let selectedFighterId = $state<string>(ROSTER[0].id ?? 'jason');
  let selectedFpsHero = $state<FpsHeroDef>(FPS_MOBA_HEROES[0]);
  const abilityKeys: FpsAbilityKey[] = ['SHIFT', 'E', 'Q'];

  onMount(() => {
    savedFighter = getCharacter();
    if (savedFighter?.id) {
      selectedFighterId = savedFighter.id;
    }
    selectedFpsHero = getSelectedFpsHero();
  });

  function ensureFighterSaved() {
    if (!getCharacter()) {
      const preset = ROSTER.find((r) => r.id === selectedFighterId) ?? ROSTER[0];
      saveCharacter(preset);
    }
  }

  function pickPresetFighter(char: CharacterData) {
    saveCharacter(char);
    savedFighter = char;
    selectedFighterId = char.id ?? char.name;
  }

  function startFighterBattle() {
    ensureFighterSaved();
    goto('/game');
  }

  function openFighterHub() {
    ensureFighterSaved();
    goto('/home');
  }

  function openFighterAnalysis() {
    ensureFighterSaved();
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
  <title>Nexus Protocol & Fufutsu Kaisen — Main Menu</title>
</svelte:head>

<div class="min-h-screen bg-[#070b14] text-white flex flex-col relative overflow-hidden">
  <!-- Subtle Atmospheric Backdrop -->
  <div class="pointer-events-none fixed inset-0">
    <div
      class="absolute inset-0 opacity-60"
      style="background: radial-gradient(circle at 22% 55%, rgba(244, 63, 94, 0.14), transparent 45%), radial-gradient(circle at 78% 55%, rgba(56, 189, 248, 0.16), transparent 45%), linear-gradient(180deg, #0b1222 0%, #050811 100%);"
    ></div>
    <div
      class="absolute inset-0 opacity-[0.06]"
      style="background-image: linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px); background-size: 48px 48px;"
    ></div>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════ -->
  <!-- TOP OVERWATCH-STYLE NAVIGATION BAR                                 -->
  <!-- ══════════════════════════════════════════════════════════════════ -->
  <header class="relative z-30 h-16 bg-[#0a101d]/90 backdrop-blur-md border-b border-white/10 px-5 md:px-8 flex items-center justify-between">
    <!-- Left: Home Icon + Heroes -->
    <nav class="flex items-center gap-6 h-full">
      <button
        onclick={() => (activeTab = 'home')}
        aria-label="Home"
        title="Home"
        class="relative h-full px-2 flex items-center justify-center transition-colors cursor-pointer {activeTab === 'home'
          ? 'text-white'
          : 'text-slate-400 hover:text-white'}"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3.172 2.293 12.88a1 1 0 1 0 1.414 1.414L5 13.001V20a1 1 0 0 0 1 1h4.5a.5.5 0 0 0 .5-.5v-4.5h2v4.5a.5.5 0 0 0 .5.5H18a1 1 0 0 0 1-1v-6.999l1.293 1.293a1 1 0 0 0 1.414-1.414L12 3.172Z" />
        </svg>
        {#if activeTab === 'home'}
          <span class="absolute bottom-0 inset-x-0 h-[3px] bg-sky-400 shadow-[0_0_10px_#38bdf8]"></span>
        {/if}
      </button>

      <button
        onclick={() => (activeTab = 'heroes')}
        class="relative h-full px-2 flex items-center font-['Share_Tech_Mono'] text-sm font-bold tracking-[0.18em] uppercase transition-colors cursor-pointer {activeTab === 'heroes'
          ? 'text-white'
          : 'text-slate-300 hover:text-white'}"
      >
        HEROES
        {#if activeTab === 'heroes'}
          <span class="absolute bottom-0 inset-x-0 h-[3px] bg-sky-400 shadow-[0_0_10px_#38bdf8]"></span>
        {/if}
      </button>
    </nav>

    <!-- Center: Overwatch-style Trapezoidal PLAY Button -->
    <div class="absolute left-1/2 -translate-x-1/2 top-0 h-full flex items-start">
      <button
        onclick={() => (activeTab = activeTab === 'play' ? 'home' : 'play')}
        class="play-trapezoid group relative h-[68px] px-12 md:px-16 flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-150 {activeTab === 'play'
          ? 'brightness-110 scale-[1.02]'
          : 'hover:brightness-110'}"
      >
        <svg class="w-5 h-5 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.29-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
        </svg>
        <span class="font-['Share_Tech_Mono'] text-2xl font-black italic tracking-[0.14em] text-white drop-shadow">
          PLAY
        </span>
      </button>
    </div>

    <!-- Right: Options Cog -->
    <div class="flex items-center gap-3 h-full">
      <button
        onclick={() => goto('/options')}
        aria-label="Options"
        title="Options"
        class="h-10 w-10 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 hover:border-sky-400/50 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer group"
      >
        <svg class="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>
    </div>
  </header>

  <!-- ══════════════════════════════════════════════════════════════════ -->
  <!-- MAIN CONTENT AREA                                                  -->
  <!-- ══════════════════════════════════════════════════════════════════ -->
  <main class="relative z-20 flex-1 flex flex-col items-center px-6 md:px-10">
    {#if activeTab === 'play'}
      <!-- PLAY SCREEN: TWO GAME MODES DIRECTLY UNDER THE PLAY BUTTON -->
      <div class="w-full max-w-5xl flex flex-col items-center pt-5 pb-10 animate-fade-in">
        <!-- Small pointer stem connecting directly under the PLAY button -->
        <div class="w-px h-5 bg-gradient-to-b from-sky-400 to-transparent"></div>
        <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.35em] text-sky-300 uppercase mb-4">
          SELECT GAME MODE
        </div>

        <div class="w-full grid md:grid-cols-2 gap-6 items-stretch">
          <!-- MODE 1: FUFUTSU KAISEN (2D ARENA FIGHTER) -->
          <div class="bg-[#0c1424]/90 border border-rose-500/35 hover:border-rose-400/70 rounded-2xl p-6 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <span class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.25em] uppercase px-2.5 py-1 rounded bg-rose-500/15 text-rose-300 border border-rose-400/30">
                  MODE 01 · 2D ARENA FIGHTER
                </span>
                <span class="font-['Share_Tech_Mono'] text-[11px] text-slate-400">
                  {savedFighter ? savedFighter.name.toUpperCase() : 'NO SORCERER'}
                </span>
              </div>

              <h2 class="font-['Cinzel_Decorative'] text-3xl font-black italic tracking-wide text-white mb-2">
                FUFUTSU KAISEN
              </h2>
              <p class="text-xs text-slate-400 leading-relaxed mb-5">
                2D cursed-technique arena fighter with 3D WebGL stage VFX, AI-awakened sorcerers, shikigami summons, and Domain Expansions.
              </p>

              <!-- Quick Fighter Preset Picker -->
              <div class="grid grid-cols-2 gap-2 mb-5">
                {#each ROSTER as char}
                  {@const isActive = savedFighter?.name === char.name || (!savedFighter && selectedFighterId === char.id)}
                  <button
                    onclick={() => pickPresetFighter(char)}
                    class="text-left p-2.5 rounded-xl border transition-all cursor-pointer {isActive
                      ? 'bg-rose-500/15 border-rose-400 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'}"
                  >
                    <div class="font-['Share_Tech_Mono'] text-xs font-bold truncate" style="color: {char.color};">
                      {char.name}
                    </div>
                    <div class="text-[10px] text-slate-400 truncate">{char.technique.name}</div>
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2.5">
              <button
                onclick={startFighterBattle}
                class="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 hover:brightness-110 text-white font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all shadow-[0_0_25px_rgba(244,63,94,0.35)] cursor-pointer flex items-center justify-between"
              >
                <span>PLAY 2D FIGHTER</span>
                <span>→</span>
              </button>
              <div class="grid grid-cols-3 gap-2">
                <button
                  onclick={() => goto('/create')}
                  class="py-2 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-['Share_Tech_Mono'] text-[10px] text-slate-300 cursor-pointer"
                >
                  AI AWAKEN
                </button>
                <button
                  onclick={openFighterHub}
                  class="py-2 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-['Share_Tech_Mono'] text-[10px] text-slate-300 cursor-pointer"
                >
                  HUB
                </button>
                <button
                  onclick={openFighterAnalysis}
                  class="py-2 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-['Share_Tech_Mono'] text-[10px] text-slate-300 cursor-pointer"
                >
                  TECHNIQUE
                </button>
              </div>
            </div>
          </div>

          <!-- MODE 2: NEXUS PROTOCOL (3D FPS / MOBA) -->
          <div class="bg-[#0c1424]/90 border border-sky-400/35 hover:border-sky-300/70 rounded-2xl p-6 flex flex-col justify-between shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all">
            <div>
              <div class="flex items-center justify-between gap-2 mb-3">
                <span class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.25em] uppercase px-2.5 py-1 rounded bg-sky-500/15 text-sky-300 border border-sky-400/30">
                  MODE 02 · 3D FPS / MOBA
                </span>
                <span class="font-['Share_Tech_Mono'] text-[11px]" style="color: {selectedFpsHero.accentColor};">
                  {selectedFpsHero.name.toUpperCase()}
                </span>
              </div>

              <h2 class="font-['Cinzel_Decorative'] text-3xl font-black italic tracking-wide text-white mb-2">
                NEXUS PROTOCOL
              </h2>
              <p class="text-xs text-slate-400 leading-relaxed mb-5">
                First-person 3D hero arena with PointerLock aim, SHIFT &amp; E cooldowns, Q Ultimates, and custom character rigs.
              </p>

              <!-- Quick 3D Operative Picker -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {#each FPS_MOBA_HEROES as hero}
                  {@const isSelected = selectedFpsHero.id === hero.id}
                  <button
                    onclick={() => selectMobaHero(hero)}
                    class="text-left p-2.5 rounded-xl border transition-all cursor-pointer {isSelected
                      ? 'bg-sky-500/15 border-sky-400 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'}"
                  >
                    <div class="font-['Share_Tech_Mono'] text-[11px] font-bold truncate" style="color: {hero.color};">
                      {hero.name}
                    </div>
                    <div class="font-['Share_Tech_Mono'] text-[9px] text-slate-400 truncate">{hero.role}</div>
                  </button>
                {/each}
              </div>
            </div>

            <div class="space-y-2.5">
              <button
                onclick={startMobaMatchNow}
                class="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 hover:brightness-110 text-slate-950 font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.2em] uppercase transition-all shadow-[0_0_25px_rgba(56,189,248,0.4)] cursor-pointer flex items-center justify-between"
              >
                <span>PLAY 3D FPS ARENA</span>
                <span>→</span>
              </button>
              <button
                onclick={() => goto('/fps-moba')}
                class="w-full py-2 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-['Share_Tech_Mono'] text-[10px] tracking-widest text-sky-200 cursor-pointer"
              >
                OPEN HERO LOADOUT &amp; KIT INSPECTOR
              </button>
            </div>
          </div>
        </div>
      </div>
    {:else if activeTab === 'heroes'}
      <!-- HEROES SCREEN -->
      <div class="w-full max-w-6xl py-8 space-y-6">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.3em] text-sky-400 uppercase">
              HERO GALLERY
            </div>
            <h1 class="font-['Cinzel_Decorative'] text-3xl font-black text-white">
              OPERATIVES &amp; SORCERERS
            </h1>
          </div>
          <div class="flex gap-3">
            <button
              onclick={() => goto('/fps-moba')}
              class="px-4 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 font-['Share_Tech_Mono'] text-xs text-sky-300 cursor-pointer"
            >
              FULL 3D LOADOUT (/fps-moba)
            </button>
            <button
              onclick={() => goto('/create')}
              class="px-4 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/40 font-['Share_Tech_Mono'] text-xs text-rose-300 cursor-pointer"
            >
              AI AWAKENING (/create)
            </button>
          </div>
        </div>

        <div class="grid lg:grid-cols-12 gap-6 items-start">
          <!-- 3D FPS Operatives List -->
          <div class="lg:col-span-5 grid gap-2.5">
            <div class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-slate-400 uppercase">
              3D FPS OPERATIVES
            </div>
            {#each FPS_MOBA_HEROES as hero}
              {@const isSelected = selectedFpsHero.id === hero.id}
              <button
                onclick={() => selectMobaHero(hero)}
                class="text-left p-4 rounded-xl border transition-all flex items-center justify-between cursor-pointer {isSelected
                  ? 'bg-slate-900/90 border-sky-400 shadow-lg'
                  : 'bg-slate-900/50 border-white/10 hover:border-white/25'}"
                style="border-left: 4px solid {hero.color};"
              >
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-['Cinzel_Decorative'] text-lg font-bold text-white">{hero.name}</span>
                    <span
                      class="font-['Share_Tech_Mono'] text-[10px] px-2 py-0.5 rounded uppercase"
                      style="background: {hero.color}22; color: {hero.accentColor}; border: 1px solid {hero.color}55;"
                    >
                      {hero.role}
                    </span>
                  </div>
                  <p class="text-[11px] text-slate-400 italic mt-0.5">"{hero.epithet}"</p>
                </div>
                <div class="text-right font-['Share_Tech_Mono'] text-[11px] text-slate-400">
                  <div>{hero.maxHp} HP</div>
                </div>
              </button>
            {/each}
          </div>

          <!-- Selected Hero Kit Preview -->
          <div class="lg:col-span-7 bg-[#0c1424]/85 border border-white/10 rounded-2xl p-6 space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div class="font-['Share_Tech_Mono'] text-xs uppercase tracking-widest" style="color: {selectedFpsHero.accentColor};">
                  {selectedFpsHero.archetypeLabel}
                </div>
                <h2 class="font-['Cinzel_Decorative'] text-3xl font-bold mt-1">{selectedFpsHero.name}</h2>
              </div>
              <button
                onclick={startMobaMatchNow}
                class="px-6 py-3 rounded-xl font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.18em] uppercase text-black cursor-pointer"
                style="background: {selectedFpsHero.color}; box-shadow: 0 0 20px {selectedFpsHero.color}55;"
              >
                DEPLOY {selectedFpsHero.name.toUpperCase()} →
              </button>
            </div>

            <div class="grid sm:grid-cols-3 gap-3">
              {#each abilityKeys as key}
                {@const ab = selectedFpsHero.abilities[key]}
                <div class="bg-black/40 border border-white/10 rounded-xl p-3.5">
                  <div class="flex items-center justify-between mb-1.5 font-['Share_Tech_Mono'] text-[11px]">
                    <span class="font-bold px-2 py-0.5 rounded" style="background: {ab.color}28; color: {selectedFpsHero.accentColor};">
                      [{key}] {key === 'Q' ? 'ULT' : 'SKILL'}
                    </span>
                    <span class="text-slate-400">{(ab.cooldownMs / 1000).toFixed(1)}s</span>
                  </div>
                  <div class="text-sm font-bold text-white mb-1">{ab.name}</div>
                  <p class="text-[11px] text-slate-400 leading-relaxed">{ab.description}</p>
                </div>
              {/each}
            </div>

            <!-- 2D Fighter Presets Strip -->
            <div class="pt-3 border-t border-white/10">
              <div class="flex items-center justify-between mb-2">
                <span class="font-['Share_Tech_Mono'] text-[11px] tracking-widest text-rose-300 uppercase">
                  2D FIGHTER SORCERERS
                </span>
                <button
                  onclick={startFighterBattle}
                  class="font-['Share_Tech_Mono'] text-[11px] text-rose-300 hover:text-white cursor-pointer"
                >
                  ENTER 2D BATTLE →
                </button>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {#each ROSTER as char}
                  {@const isActive = savedFighter?.name === char.name || (!savedFighter && selectedFighterId === char.id)}
                  <button
                    onclick={() => pickPresetFighter(char)}
                    class="text-left p-2.5 rounded-xl border transition-all cursor-pointer {isActive
                      ? 'bg-rose-500/15 border-rose-400 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'}"
                  >
                    <div class="font-['Share_Tech_Mono'] text-xs font-bold truncate" style="color: {char.color};">
                      {char.name}
                    </div>
                    <div class="text-[10px] text-slate-400 truncate">{char.technique.name}</div>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <!-- HOME SCREEN (CLEAN OVERWATCH-STYLE MAIN MENU) -->
      <div class="flex-1 w-full max-w-6xl flex flex-col justify-between py-10">
        <div></div>

        <!-- Center Split Faction / Mode Showcase -->
        <div class="grid md:grid-cols-2 gap-10 items-center text-center my-auto py-8">
          <div class="space-y-3">
            <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.35em] text-rose-400 uppercase">
              2D CURSED ARENA
            </div>
            <h1 class="font-['Cinzel_Decorative'] text-4xl md:text-5xl font-black italic tracking-wider text-white">
              FUFUTSU KAISEN
            </h1>
            <p class="text-xs text-slate-400 font-['Share_Tech_Mono'] max-w-sm mx-auto">
              ACTIVE SORCERER: <span class="text-rose-300 font-bold">{(savedFighter?.name ?? ROSTER[0].name).toUpperCase()}</span>
            </p>
          </div>

          <div class="space-y-3">
            <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.35em] text-sky-400 uppercase">
              3D HERO ARENA
            </div>
            <h1 class="font-['Cinzel_Decorative'] text-4xl md:text-5xl font-black italic tracking-wider text-white">
              NEXUS PROTOCOL
            </h1>
            <p class="text-xs text-slate-400 font-['Share_Tech_Mono'] max-w-sm mx-auto">
              ACTIVE OPERATIVE: <span class="text-sky-300 font-bold">{selectedFpsHero.name.toUpperCase()}</span>
            </p>
          </div>
        </div>

        <!-- Bottom Prompt -->
        <div class="text-center pb-2">
          <button
            onclick={() => (activeTab = 'play')}
            class="px-8 py-3 rounded-xl bg-sky-500/20 hover:bg-sky-400/30 border border-sky-400/50 font-['Share_Tech_Mono'] text-xs font-bold tracking-[0.25em] text-sky-200 uppercase transition-all cursor-pointer"
          >
            PRESS PLAY ABOVE TO CHOOSE GAME MODE
          </button>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  .play-trapezoid {
    background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%);
    clip-path: polygon(0 0, 100% 0, 89% 100%, 11% 100%);
    box-shadow: 0 8px 30px rgba(56, 189, 248, 0.45);
  }
</style>
