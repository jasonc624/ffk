<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter, getGradeName, saveCharacter, type CharacterData } from '$lib/storage';

  let character = $state<CharacterData | null>(null);
  let isEditing = $state(false);
  let editForm = $state<any>(null);

  onMount(() => {
    character = getCharacter();
    if (!character) goto('/create');
    else {
      // Ensure data structures exist for editing
      if (!character.abilities) character.abilities = [];
      if (character.domain && character.domain.cost === undefined) character.domain.cost = 100;
      if (character.domain && character.domain.damage === undefined) character.domain.damage = 25;
      editForm = JSON.parse(JSON.stringify(character));
    }
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

  function startEditing() {
    editForm = JSON.parse(JSON.stringify(character));
    isEditing = true;
  }

  function handleSave() {
    if (editForm) {
      character = editForm;
      saveCharacter(editForm);
      isEditing = false;
    }
  }

  function cancelEdit() {
    isEditing = false;
  }

  function addAbility() {
    if (editForm) {
      editForm.abilities = [...(editForm.abilities || []), {
        name: 'New Technique',
        description: 'Describe the effect...',
        cost: { cursedEnergy: 20 },
        damage: 15,
        cooldown: 2000,
        slot: 'SPECIAL'
      }];
    }
  }

  function removeAbility(index: number) {
    if (editForm && editForm.abilities) {
      editForm.abilities = editForm.abilities.filter((_: any, i: number) => i !== index);
    }
  }
</script>

{#if character}
<div class="max-w-[900px] mx-auto px-8 py-20">
  <div class="mb-16 text-center relative">
    <div class="flex justify-between items-center mb-10">
      <button onclick={() => goto('/home')} class="btn btn-ghost text-sm opacity-60 px-4 py-2">← Return to Menu</button>
      <div class="flex gap-6">
        {#if isEditing}
          <button onclick={cancelEdit} class="btn btn-ghost text-sm">Discard</button>
          <button onclick={handleSave} class="px-8 py-3 bg-blue-600 rounded-[4px] text-white font-bold text-sm shadow-[0_0_20px_rgba(37,99,235,0.5)] transition-all active:scale-95">MANIFEST SOUL</button>
        {:else}
          <button onclick={startEditing} class="px-8 py-3 bg-white/5 border border-white/10 rounded-[4px] text-slate-300 text-sm active:bg-white/10 transition-colors uppercase tracking-widest font-bold">REWRITE PROFILE</button>
        {/if}
      </div>
    </div>

    <div class="flex flex-col items-center gap-2 mb-8">
      <div class="sorcerer-grade text-[#c9a84c] font-['Share_Tech_Mono'] text-sm tracking-[0.6em] uppercase font-bold">
        {getGradeName(character.grade)} SORCERER
      </div>
      <div class="font-['Share_Tech_Mono'] text-slate-600 tracking-[0.3em] uppercase text-xs italic">
        SOUL EVALUATION: {character.perceived_grade}
      </div>
    </div>

    {#if isEditing}
      <div class="flex flex-col gap-6 max-w-lg mx-auto">
        <input bind:value={editForm.name} class="bg-white/5 border border-white/10 p-4 text-center text-5xl font-bold font-['Cinzel_Decorative'] outline-none focus:border-blue-500/60 rounded-sm" />
        <input bind:value={editForm.epithet} class="bg-white/5 border border-white/10 p-3 text-center italic text-slate-400 text-xl font-['Cinzel_Decorative'] outline-none focus:border-blue-500/60 rounded-sm" placeholder="Epithet" />
      </div>
    {:else}
      <h1 class="font-['Cinzel_Decorative'] text-7xl font-bold mb-4 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
        {character.name}
      </h1>
      <p class="italic text-slate-400 text-2xl font-['Cinzel_Decorative'] opacity-80 letter-spacing-[0.05em]">"{character.epithet}"</p>
    {/if}

    <div class="divider flex items-center gap-6 my-12 justify-center">
      <div class="h-[2px] w-32 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
      <span class="text-white/30 text-xl font-bold">⬡</span>
      <div class="h-[2px] w-32 bg-gradient-to-l from-transparent via-white/20 to-transparent"></div>
    </div>
  </div>

  <div class="grid gap-12">
    <!-- Technique Section -->
    <div class="ability-card technique">
      <div class="flex justify-between items-start mb-8">
        <span class="ability-tag technique text-xs tracking-[0.3em] uppercase font-bold">Innate Technique</span>
      </div>
      
      {#if isEditing}
        <div class="grid gap-6">
          <input bind:value={editForm.technique.name} class="bg-white/5 border border-white/10 p-4 text-2xl font-bold font-['Cinzel_Decorative'] text-blue-300" placeholder="Technique Name" />
          <textarea bind:value={editForm.technique.description} class="bg-white/5 border border-white/10 p-4 text-lg text-slate-300 min-h-[120px] leading-relaxed" placeholder="Technique Description"></textarea>
          <input bind:value={editForm.technique.mechanic} class="bg-white/5 border border-white/10 p-4 text-sm italic text-slate-400" placeholder="Visual/Soul Mechanic" />
        </div>
      {:else}
        <h2 class="font-['Cinzel_Decorative'] text-4xl text-blue-300 mb-6 font-bold">{character.technique.name}</h2>
        <p class="text-slate-300 leading-relaxed mb-10 text-xl">{character.technique.description}</p>
        <div class="bg-blue-500/5 border-l-4 border-blue-500/60 p-6 italic text-lg text-blue-100/70 rounded-r-md">
          <span class="text-blue-500 font-bold mr-3 text-xl">⬡</span> {character.technique.mechanic}
        </div>
      {/if}
    </div>

    <!-- Domain Section -->
    <div class="ability-card domain">
      <div class="flex justify-between items-start mb-8">
        <span class="ability-tag domain text-xs tracking-[0.3em] uppercase font-bold">Domain Expansion</span>
        {#if !isEditing}
          <div class="flex gap-4">
            <div class="text-right">
              <div class="text-[10px] text-red-500/60 uppercase font-bold mb-1">Cursed Energy</div>
              <div class="text-xl font-bold text-red-400">{character.domain.cost || 100}</div>
            </div>
            <div class="text-right">
              <div class="text-[10px] text-red-500/60 uppercase font-bold mb-1">Sure-Hit Damage</div>
              <div class="text-xl font-bold text-red-400">{character.domain.damage || 25}</div>
            </div>
          </div>
        {/if}
      </div>

      {#if isEditing}
        <div class="grid gap-6">
          <input bind:value={editForm.domain.name} class="bg-white/5 border border-white/10 p-4 text-2xl font-bold font-['Cinzel_Decorative'] text-red-400" placeholder="Domain Name" />
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <label class="text-[11px] text-slate-500 uppercase font-bold ml-1">
                Energy Cost
                <input type="number" bind:value={editForm.domain.cost} class="w-full bg-white/5 border border-white/10 p-4 text-xl font-bold text-red-400 mt-2" />
              </label>
            </div>
            <div class="grid gap-2">
              <label class="text-[11px] text-slate-500 uppercase font-bold ml-1">
                Domain Damage
                <input type="number" bind:value={editForm.domain.damage} class="w-full bg-white/5 border border-white/10 p-4 text-xl font-bold text-red-400 mt-2" />
              </label>
            </div>
          </div>
          <textarea bind:value={editForm.domain.description} class="bg-white/5 border border-white/10 p-4 text-lg text-slate-300 min-h-[120px] leading-relaxed" placeholder="Domain Description"></textarea>
          <input bind:value={editForm.domain.mechanic} class="bg-white/5 border border-white/10 p-4 text-sm italic text-slate-400" placeholder="Inherent Rule / Sure-Hit" />
        </div>
      {:else}
        <h2 class="font-['Cinzel_Decorative'] text-4xl text-red-400 mb-6 font-bold">{character.domain.name}</h2>
        <p class="text-slate-300 leading-relaxed mb-10 text-xl">{character.domain.description}</p>
        <div class="bg-red-500/5 border-l-4 border-red-500/60 p-6 italic text-lg text-red-100/70 rounded-r-md">
          <span class="text-red-500 font-bold mr-3 text-xl">⬡</span> {character.domain.mechanic}
        </div>
      {/if}
    </div>

    <!-- Active Abilities / Special Moves -->
    <div class="ability-card abilities">
      <div class="flex justify-between items-center mb-8">
        <span class="ability-tag stats text-xs tracking-[0.3em] uppercase font-bold">Cursed Techniques</span>
        {#if isEditing}
          <button onclick={addAbility} class="px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold rounded-sm active:scale-95 transition-all">+ ADD TECHNIQUE</button>
        {/if}
      </div>

      <div class="grid gap-10">
        {#each (isEditing ? editForm.abilities : (character.abilities || [])) as ability, i}
          <div class="border-b border-white/5 pb-10 last:border-0 last:pb-0 relative group">
            {#if isEditing}
              <button onclick={() => removeAbility(i)} class="absolute top-0 right-0 text-red-500/40 hover:text-red-500 px-2 py-1 text-xs font-bold transition-colors">REMOVE</button>
              <div class="grid gap-4 mt-4">
                <div class="flex gap-4">
                  <input bind:value={ability.name} class="flex-grow bg-white/5 border border-white/10 p-3 text-xl font-bold font-['Cinzel_Decorative'] text-white" />
                  <select bind:value={ability.slot} class="bg-white/5 border border-white/10 p-3 text-xs text-slate-400 uppercase font-bold">
                    <option value="SPECIAL">Special</option>
                    <option value="BURST">Burst</option>
                    <option value="ULTIMATE">Ultimate</option>
                  </select>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <div class="grid gap-1">
                    <label class="text-[10px] text-slate-600 uppercase font-bold ml-1">
                      Cost
                      <input type="number" bind:value={ability.cost.cursedEnergy} class="w-full bg-white/5 border border-white/10 p-3 text-blue-400 text-sm font-bold mt-1" />
                    </label>
                  </div>
                  <div class="grid gap-1">
                    <label class="text-[10px] text-slate-600 uppercase font-bold ml-1">
                      Damage
                      <input type="number" bind:value={ability.damage} class="w-full bg-white/5 border border-white/10 p-3 text-red-400 text-sm font-bold mt-1" />
                    </label>
                  </div>
                  <div class="grid gap-1">
                    <label class="text-[10px] text-slate-600 uppercase font-bold ml-1">
                      CD (ms)
                      <input type="number" bind:value={ability.cooldown} class="w-full bg-white/5 border border-white/10 p-3 text-amber-400 text-sm font-bold mt-1" />
                    </label>
                  </div>
                </div>
                <input bind:value={ability.description} class="bg-white/5 border border-white/10 p-3 text-sm text-slate-400" placeholder="Short description..." />
              </div>
            {:else}
              <div class="flex justify-between items-start mb-4">
                <div>
                  <h3 class="font-['Cinzel_Decorative'] text-2xl text-white font-bold mb-1">{ability.name}</h3>
                  <div class="text-[10px] font-['Share_Tech_Mono'] text-slate-500 tracking-widest uppercase">{ability.slot} TECHNIQUE</div>
                </div>
                <div class="flex gap-6">
                  <div class="text-right">
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">Energy</div>
                    <div class="text-lg font-bold text-blue-400">{ability.cost?.cursedEnergy || 0}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">Damage</div>
                    <div class="text-lg font-bold text-red-500">{ability.damage || 0}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-[9px] text-slate-500 uppercase font-bold mb-1">Cooldown</div>
                    <div class="text-lg font-bold text-slate-300">{(ability.cooldown / 1000).toFixed(1)}s</div>
                  </div>
                </div>
              </div>
              <p class="text-slate-400 text-lg leading-relaxed">{ability.description || 'No description available for this technique.'}</p>
            {/if}
          </div>
        {/each}
        {#if !isEditing && (character.abilities || []).length === 0}
          <div class="text-center py-8 opacity-40 italic text-lg">No active techniques manifested yet.</div>
        {/if}
      </div>
    </div>

    <!-- Stats Section -->
    <div class="ability-card stats-card">
      <span class="ability-tag stats text-xs tracking-[0.3em] uppercase font-bold mb-10 block">Combat Calibration</span>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-x-16 gap-y-12 mt-6">
        {#each Object.entries(isEditing ? editForm.stats : character.stats) as [key, val]}
          <div class="flex flex-col gap-4">
            <div class="flex justify-between items-end">
              <span class="text-xs font-['Share_Tech_Mono'] tracking-widest text-slate-400 uppercase font-bold">{statLabels[key] || key}</span>
              <span class="font-['Share_Tech_Mono'] text-white text-xl font-bold">{val}</span>
            </div>
            {#if isEditing}
              <input type="range" bind:value={editForm.stats[key]} min="0" max="100" class="w-full h-2 rounded-full cursor-pointer" />
            {:else}
              <div class="h-2 bg-white/10 rounded-full overflow-hidden shadow-inner">
                <div class="h-full transition-all duration-1000" style="width: {val}%; background: {statColors[key] || '#4a9eff'}"></div>
              </div>
            {/if}
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
    @apply bg-[#08080f] rounded-[4px] p-12 relative overflow-hidden border border-white/5 shadow-2xl;
    background-image: radial-gradient(circle at 0% 0%, rgba(255,255,255,0.03) 0%, transparent 60%);
  }

  .ability-card::before {
    content: '';
    @apply absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent;
  }

  .ability-card.technique { 
    @apply border-blue-500/30;
    box-shadow: 0 15px 50px -25px rgba(59, 130, 246, 0.25);
  }
  
  .ability-card.domain { 
    @apply border-red-900/30;
    box-shadow: 0 15px 50px -25px rgba(239, 68, 68, 0.2);
  }

  .ability-tag {
    @apply font-['Share_Tech_Mono'] py-2 px-5 border rounded-sm;
  }

  .ability-tag.technique { @apply bg-blue-500/10 text-blue-400 border-blue-500/20; }
  .ability-tag.domain { @apply bg-red-900/20 text-red-500 border-red-900/40; }
  .ability-tag.stats { @apply bg-white/5 text-slate-400 border-white/10; }

  input[type='range'] {
    @apply bg-white/10 rounded-full outline-none transition-all;
    -webkit-appearance: none;
  }

  input[type='range']::-webkit-slider-thumb {
    @apply appearance-none w-5 h-5 bg-white rounded-full cursor-pointer border-4 border-slate-900;
    box-shadow: 0 0 15px rgba(255,255,255,0.6);
  }

  textarea {
    @apply resize-none outline-none focus:border-blue-500/40 transition-colors;
  }

  input, select {
    @apply outline-none focus:border-blue-500/40 transition-colors;
  }
</style>
