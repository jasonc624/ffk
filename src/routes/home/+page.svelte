<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter, clearAll, getGradeName, type CharacterData } from '$lib/storage';

  let character = $state<CharacterData | null>(null);

  onMount(() => {
    character = getCharacter();
    if (!character) {
      goto('/create');
    }
  });

  function reset() {
    if (confirm('Are you sure you want to discard your current technique and reawaken?')) {
      clearAll();
      goto('/create');
    }
  }
</script>

{#if character}
<div class="h-screen flex flex-col items-center justify-center p-6">
  <div class="max-w-md w-full text-center">
    <div class="mb-12">
      <div class="flex flex-col items-center gap-1 mb-4">
        <div class="font-['Share_Tech_Mono'] text-[#c9a84c] tracking-[0.4em] uppercase text-xs">
          CURRENT RANK: {getGradeName(character.grade)}
        </div>
        <div class="font-['Share_Tech_Mono'] text-slate-600 tracking-[0.2em] uppercase text-[10px] italic">
          POTENTIAL: {character.perceived_grade}
        </div>
      </div>
      <h1 class="font-['Cinzel_Decorative'] text-5xl font-black mb-2 text-white">
        {character.name}
      </h1>
      <p class="italic text-slate-500 text-lg">"{character.epithet}"</p>
    </div>

    <div class="grid gap-4 w-full">
      <button 
        onclick={() => goto('/game')}
        class="group relative bg-blue-600/10 border border-blue-500/30 p-6 rounded-xl overflow-hidden transition-all hover:border-blue-500 hover:shadow-[0_0_30px_rgba(74,158,255,0.2)]"
      >
        <div class="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <span class="font-['Cinzel_Decorative'] text-xl text-blue-300">Enter Battle</span>
      </button>

      <button 
        onclick={() => goto('/character')}
        class="bg-white/5 border border-white/10 p-6 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all font-['Cinzel_Decorative'] text-xl text-slate-300"
      >
        Technique Analysis
      </button>

      <div class="grid grid-cols-2 gap-4">
        <button 
          onclick={() => goto('/options')}
          class="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 hover:border-white/20 transition-all font-['Share_Tech_Mono'] text-sm uppercase tracking-widest text-slate-400"
        >
          Options
        </button>
        <button 
          onclick={reset}
          class="border border-red-900/30 bg-red-950/5 p-4 rounded-xl hover:bg-red-900/20 hover:border-red-900/50 transition-all font-['Share_Tech_Mono'] text-sm uppercase tracking-widest text-red-400/70"
        >
          Reset
        </button>
      </div>
    </div>
  </div>

  <div class="mt-16 text-slate-700 font-['Share_Tech_Mono'] text-[10px] tracking-widest uppercase">
    Protocol: Fufutsu Kaisen — V1.0.0
  </div>
</div>
{/if}

<style>
  h1 {
    background: linear-gradient(to bottom, #fff, #888);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
</style>
