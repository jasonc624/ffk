<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getOptions, saveOptions, type Options } from '$lib/games/fighter/storage';
  import { getMouseSensitivity, setMouseSensitivity } from '$lib/games/fps-moba/storage';

  let options = $state<Options>(getOptions());
  let fpsSensitivity = $state<number>(1.0);

  onMount(() => {
    fpsSensitivity = getMouseSensitivity();
  });

  function handleSave() {
    saveOptions($state.snapshot(options));
  }

  function handleFpsSensChange() {
    setMouseSensitivity(fpsSensitivity);
  }

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      goto('/');
    }
  }
</script>

<div class="max-w-xl mx-auto px-6 py-20">
  <div class="mb-12">
    <button onclick={goBack} class="btn btn-ghost mb-8">← Back</button>
    <h1 class="font-['Cinzel_Decorative'] text-4xl font-bold text-white mb-2">Protocol Options</h1>
    <p class="text-slate-500 font-['Share_Tech_Mono'] text-xs tracking-widest uppercase">Configuration Subsystem</p>
  </div>

  <div class="grid gap-10">
    <!-- Volume -->
    <div class="bg-white/5 border border-white/10 p-8 rounded-2xl">
      <div class="flex justify-between items-center mb-6">
        <label for="volume" class="font-['Cinzel_Decorative'] text-blue-300">Master Resonance</label>
        <span class="font-['Share_Tech_Mono'] text-blue-400">{Math.round(options.volume * 100)}%</span>
      </div>
      <input 
        id="volume"
        type="range" 
        min="0" 
        max="1" 
        step="0.01" 
        bind:value={options.volume} 
        onchange={handleSave}
        class="w-full h-1 bg-blue-500/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>

    <!-- 3D FPS Mouse Sensitivity -->
    <div class="bg-white/5 border border-white/10 p-8 rounded-2xl">
      <div class="flex justify-between items-center mb-6">
        <label for="fps-sens" class="font-['Cinzel_Decorative'] text-sky-300">3D Arena Mouse Sensitivity</label>
        <span class="font-['Share_Tech_Mono'] text-sky-400">{fpsSensitivity.toFixed(1)}x</span>
      </div>
      <input
        id="fps-sens"
        type="range"
        min="0.3"
        max="2.5"
        step="0.1"
        bind:value={fpsSensitivity}
        oninput={handleFpsSensChange}
        class="w-full h-1 bg-sky-500/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
      />
    </div>

    <!-- Keybindings -->
    <div class="bg-white/5 border border-white/10 p-8 rounded-2xl">
      <h2 class="font-['Cinzel_Decorative'] text-blue-300 mb-6">Combat Bindings</h2>
      <div class="grid gap-4">
        {#each Object.entries(options.keybindings) as [action, key]}
          <div class="flex justify-between items-center p-3 border-b border-white/5 last:border-0">
            <span class="text-slate-400 capitalize">{action}</span>
            <div class="bg-blue-500/10 border border-blue-500/30 px-3 py-1 rounded font-['Share_Tech_Mono'] text-blue-300 min-w-[40px] text-center">
              {key}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-6 text-xs text-slate-600 italic">Custom keybinding modification disabled in MVP.</p>
    </div>

    <!-- Version -->
    <div class="text-center opacity-30">
      <p class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.4em] uppercase">Version: {options.version}</p>
    </div>
  </div>
</div>

<style>
  @reference "tailwindcss";
  input[type='range']::-webkit-slider-thumb {
    @apply appearance-none w-4 h-4 bg-blue-400 rounded-full cursor-pointer shadow-[0_0_10px_#4a9eff];
  }
</style>
