<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter, getGradeName, type CharacterData } from '$lib/storage';

  let character = $state<CharacterData | null>(null);

  onMount(() => {
    character = getCharacter();
    if (!character) goto('/create');
  });

  const statLabels: Record<string, string> = {
    cursedEnergy: 'Cursed Energy',
    technicalSkill: 'Technique',
    speed: 'Speed',
    strength: 'Strength',
    adaptability: 'Adaptability',
    domainRefinement: 'Domain'
  };

  const statColors: Record<string, string> = {
    cursedEnergy: '#4a9eff',
    technicalSkill: '#7ab8ff',
    speed: '#ff6b6b',
    strength: '#cc2222',
    adaptability: '#c9a84c',
    domainRefinement: '#f0cc6e'
  };
</script>

{#if character}
<div class="max-w-[760px] mx-auto px-6 py-16">
  <div class="mb-12 text-center">
    <button onclick={() => goto('/home')} class="btn btn-ghost mb-8">← Back to Menu</button>
    <div class="flex flex-col items-center gap-1 mb-4">
      <div class="sorcerer-grade text-[#c9a84c] font-['Share_Tech_Mono'] text-[10px] tracking-[0.5em] uppercase">
        CURRENT RANK: {getGradeName(character.grade)}
      </div>
      <div class="font-['Share_Tech_Mono'] text-slate-600 tracking-[0.2em] uppercase text-[9px] italic">
        POTENTIAL: {character.perceived_grade}
      </div>
    </div>
    <h1 class="font-['Cinzel_Decorative'] text-4xl font-bold mb-2 text-white">
      {character.name}
    </h1>
    <p class="italic text-slate-500 text-lg">"{character.epithet}"</p>
    <div class="divider flex items-center gap-4 my-8 justify-center">
      <div class="h-[1px] w-20 bg-gradient-to-r from-transparent to-blue-500/30"></div>
      <span class="text-blue-500/60">⬡</span>
      <div class="h-[1px] w-20 bg-gradient-to-l from-transparent to-blue-500/30"></div>
    </div>
  </div>

  <div class="grid gap-6">
    <!-- Technique -->
    <div class="ability-card technique">
      <span class="ability-tag technique bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded">Innate Technique</span>
      <h2 class="font-['Cinzel_Decorative'] text-2xl text-blue-300 mt-4 mb-4">{character.technique.name}</h2>
      <p class="text-slate-300 leading-relaxed mb-6">{character.technique.description}</p>
      <div class="bg-white/5 border-l-2 border-blue-500/40 p-4 italic text-sm text-slate-400">
        ⬡ {character.technique.mechanic}
      </div>
    </div>

    <!-- Domain -->
    <div class="ability-card domain">
      <span class="ability-tag domain bg-red-900/20 text-red-400 border border-red-900/30 px-3 py-1 rounded">Domain Expansion</span>
      <h2 class="font-['Cinzel_Decorative'] text-2xl text-red-400 mt-4 mb-4">{character.domain.name}</h2>
      <p class="text-slate-300 leading-relaxed mb-6">{character.domain.description}</p>
      <div class="bg-white/5 border-l-2 border-red-900/40 p-4 italic text-sm text-slate-400">
        ⬡ {character.domain.mechanic}
      </div>
    </div>

    <!-- Extensions -->
    {#if character.extensions && character.extensions.length > 0}
      <div class="ability-card extensions">
        <span class="ability-tag extensions bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20 px-3 py-1 rounded">Secret Technique Extensions</span>
        <h2 class="font-['Cinzel_Decorative'] text-xl text-slate-300 mt-4 mb-6">Discovered Through Battle</h2>
        <div class="grid gap-6">
          {#each character.extensions as ext}
            <div class="border-b border-white/5 pb-4 last:border-0 last:pb-0">
              <h3 class="font-['Cinzel_Decorative'] text-[#f0cc6e] text-sm mb-2">{ext.name}</h3>
              <p class="text-slate-500 text-sm leading-relaxed">{ext.description}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Stats -->
    <div class="ability-card">
      <span class="ability-tag stats bg-slate-500/10 text-slate-400 border border-slate-500/20 px-3 py-1 rounded">Combat Profile</span>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-8 mt-6">
        {#each Object.entries(character.stats) as [key, val]}
          <div class="text-center">
            <div class="text-[9px] font-['Share_Tech_Mono'] tracking-widest text-slate-500 uppercase mb-2">
              {statLabels[key] || key}
            </div>
            <div class="h-1 bg-white/5 rounded-full overflow-hidden mb-2">
              <div 
                class="h-full transition-all duration-1000" 
                style="width: {val}%; background: {statColors[key] || '#4a9eff'}"
              ></div>
            </div>
            <div class="font-['Share_Tech_Mono'] text-white text-lg">{val}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  @reference "tailwindcss";
  .ability-card {
    @apply bg-gradient-to-br from-[#0d0d1a]/95 to-[#08080f]/98 rounded-[2px] p-10 relative overflow-hidden border border-blue-500/10;
  }
  .ability-card.technique { @apply border-blue-500/30; }
  .ability-card.domain { @apply border-red-900/30 bg-gradient-to-br from-[#140505]/95 to-[#08080f]/98; }
  .ability-card.extensions { @apply border-[#c9a84c]/20; }
</style>
