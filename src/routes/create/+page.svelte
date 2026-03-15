<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { saveCharacter, type CharacterData } from '$lib/storage';

  let currentStep = $state(0);
  let sorcererName = $state('');
  let answers = $state<Record<string, string>>({});
  let loading = $state(false);
  let loadingPhase = $state('Scanning cursed energy signature...');
  
  const TOTAL_STEPS = 8;
  const loadingPhases = [
    "Scanning cursed Highland energy signature...",
    "Mapping personality to technique archetype...",
    "Deriving innate ability from soul composition...",
    "Constructing domain boundaries...",
    "Awakening secret technique extensions...",
    "Finalizing combat profile..."
  ];

  const steps = [
    { title: "What is your name, sorcerer?", hint: "This is how you'll be known in the jujutsu world.", type: 'input' },
    { 
      title: "When a conflict arises, what is your instinct?", 
      id: 'q1',
      choices: [
        "Overwhelm it — hit first, hit hardest, leave nothing standing.",
        "Analyze it — study the opponent until their weakness reveals itself.",
        "Outlast it — patience is a weapon most never master.",
        "Redirect it — turn their strength into your advantage."
      ]
    },
    {
      title: "What drives you more deeply than anything else?",
      id: 'q2',
      choices: [
        "Protecting someone — there is a person I would destroy the world for.",
        "Mastery — I want to reach a level no one else has ever touched.",
        "Justice — I cannot stand watching the wrong things go unanswered.",
        "Freedom — no cage, no system, no one's rules but my own."
      ]
    },
    {
      title: "What are your main hobbies or interests?",
      id: 'q3',
      hint: "Be specific — your technique will literally be shaped from this.",
      type: 'textarea'
    },
    {
      title: "How do people who know you well describe your mind?",
      id: 'q4',
      choices: [
        "Calculated and precise — they say I think ten steps ahead.",
        "Intuitive and fast — I process things before I can explain how.",
        "Creative and unconventional — I see connections others miss entirely.",
        "Stubborn and relentless — once I lock in, nothing can stop me."
      ]
    },
    {
      title: "What is a fear or weakness you carry?",
      id: 'q5',
      hint: "In JJK, the greatest techniques often emerge from what haunts us.",
      type: 'textarea'
    },
    {
      title: "In your world, what does \"winning\" truly look like?",
      id: 'q6',
      choices: [
        "Standing alone at the top — undeniable, unreachable.",
        "Everyone I care about is safe and thriving.",
        "Having built something that outlasts me.",
        "Never having to compromise who I am."
      ]
    },
    {
      title: "Your cursed energy has a color and a feel to it. What resonates?",
      id: 'q7',
      choices: [
        "Cold blue-white — crisp, electric, blinding precision.",
        "Deep crimson — heavy, volcanic, barely contained fury.",
        "Void black — consuming, gravitational, erasing.",
        "Shifting gold — radiant, adaptive, deceptively warm."
      ]
    }
  ];

  function nextStep() {
    if (currentStep === 0 && !sorcererName.trim()) return;
    const step = steps[currentStep];
    if (!step) return;
    if (step.id && !answers[step.id] && step.type !== 'textarea') return;
    if (step.id && step.type === 'textarea' && !answers[step.id]?.trim()) return;
    
    if (currentStep < TOTAL_STEPS - 1) {
      currentStep++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      summonTechnique();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function selectChoice(id: string, value: string) {
    answers[id] = value;
  }

  async function summonTechnique() {
    loading = true;
    let phaseIdx = 0;
    const interval = setInterval(() => {
      loadingPhase = loadingPhases[phaseIdx % loadingPhases.length];
      phaseIdx++;
    }, 2000);

    try {
      const response = await fetch("/api/awaken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, sorcererName: sorcererName })
      });

      if (!response.ok) throw new Error('Awakening failed');
      
      const result = await response.json();
      clearInterval(interval);

      const character: CharacterData = { ...result, name: sorcererName };
      saveCharacter(character);
      goto('/home');
    } catch (err) {
      console.error(err);
      clearInterval(interval);
      loadingPhase = 'Cursed energy destabilized. Redirecting to manual setup...';
      
      setTimeout(() => {
        const fallback: CharacterData = {
          name: sorcererName,
          perceived_grade: 'Grade 1 (Estimated)',
          grade: 0,
          maxGrade: 0,
          epithet: 'The Awakened One',
          archetype: 'PROJECTILE',
          technique: { 
            name: 'Cursed Resonance', 
            description: 'Manipulates vibration.', 
            mechanic: 'Stacks resonance on hit.',
            visualProfile: {
              casterColor: '#4a9eff',
              accentColor: '#ffffff',
              onActivation: { caster: [], screen: [] },
              onHit: { 
                target: [{ emitter: 'BURST_RADIAL', particle: 'SHARD', color: '#4a9eff', count: 12, lifespan: 600 }], 
                screen: [{ fx: 'SCREENSHAKE', duration: 100, intensity: 5 }], 
                hud: [{ fx: 'TEXT_POP', text: 'RESONANCE', color: '#4a9eff' }] 
              },
              onMaxStacks: { 
                target: [{ fx: 'INVERT', duration: 200 }], 
                screen: [{ fx: 'SHOCKWAVE', duration: 500 }], 
                hud: [] 
              },
              onDomainExpansion: {
                background: { base: '#05051a', layers: [{ type: 'VOID_GRID', color: '#4a9eff', speed: 1, opacity: 0.5 }] },
                ambient: [],
                caster: []
              }
            }
          },
          domain: { name: 'Void of Silence', description: 'A silent realm.', mechanic: 'Guaranteed hit.' },
          extensions: [],
          stats: { cursedEnergy: 80, technicalSkill: 75, speed: 70, strength: 65, adaptability: 85, domainRefinement: 60 },
          color: '#4a9eff'
        } as any;
        saveCharacter(fallback);
        goto('/home');
      }, 2000);
    }
  }
</script>

<div class="container min-h-screen flex flex-col items-center justify-center py-20">
  {#if !loading}
    <div class="header mb-16 text-center">
      <div class="header-eyebrow mb-4">Jujutsu Kaisen — Cursed Awakening Protocol</div>
      <h1 class="text-4xl md:text-6xl mb-4 font-black">Awaken Your<br>Cursed Technique</h1>
      <div class="divider flex items-center gap-4 my-8">
        <span class="divider-symbol text-2xl opacity-60">⬡</span>
      </div>
      <p class="header-sub italic text-slate-400">Answer truthfully. Your cursed energy reflects who you truly are.</p>
    </div>

    <!-- Progress Dots -->
    <div class="flex gap-2 mb-12">
      {#each Array(TOTAL_STEPS) as _, i}
        <div class="w-2 h-2 rounded-full border border-blue-500/20 transition-all duration-300 
          {i < currentStep ? 'bg-[#c9a84c] border-[#c9a84c]' : i === currentStep ? 'bg-[#4a9eff] shadow-[0_0_10px_#4a9eff] border-[#4a9eff]' : 'bg-[#1a1a3e]'}"
        ></div>
      {/each}
    </div>

    <!-- Question Card -->
    <div class="question-card w-full max-w-2xl relative">
      <div class="absolute -top-5 right-8 text-[120px] font-black opacity-[0.015] pointer-events-none font-['Cinzel_Decorative']">
        {currentStep === 0 ? '—' : (currentStep).toString().padStart(2, '0')}
      </div>
      
      <div class="question-label mb-4 opacity-70">
        {currentStep === 0 ? 'Designation' : `Question ${currentStep} / 7`}
      </div>
      
      <div class="question-text text-2xl font-light leading-relaxed mb-8">
        {steps[currentStep]?.title}
      </div>
      
      {#if steps[currentStep]?.hint}
        <div class="question-hint italic text-sm text-slate-500 mb-6 -mt-6">
          {steps[currentStep]?.hint}
        </div>
      {/if}

      {#if steps[currentStep]?.type === 'input'}
        <input 
          type="text" 
          bind:value={sorcererName} 
          placeholder="Enter your name..." 
          class="w-full bg-white/5 border border-blue-500/15 rounded-[2px] p-4 text-white focus:border-blue-500/50 outline-none"
        />
      {:else if steps[currentStep]?.type === 'textarea'}
        <textarea 
          bind:value={answers[steps[currentStep]?.id || '']} 
          rows="4" 
          placeholder="e.g. building apps, trading stocks, collecting fragrances..."
          class="w-full bg-white/5 border border-blue-500/15 rounded-[2px] p-4 text-white focus:border-blue-500/50 outline-none"
        ></textarea>
      {:else if steps[currentStep]?.choices}
        <div class="grid gap-3">
          {#each steps[currentStep]?.choices || [] as choice}
            <button 
              class="choice-btn {answers[steps[currentStep]?.id || ''] === choice ? 'selected' : ''}"
              onclick={() => selectChoice(steps[currentStep]?.id || '', choice)}
            >
              {choice}
            </button>
          {/each}
        </div>
      {/if}

      <div class="flex justify-between items-center mt-10">
        <button class="btn btn-ghost" class:invisible={currentStep === 0} onclick={prevStep}>← Back</button>
        <button class="btn {currentStep === TOTAL_STEPS - 1 ? 'btn-summon' : 'btn-primary'}" onclick={nextStep}>
          {currentStep === TOTAL_STEPS - 1 ? '⬡ Awaken Cursed Technique ⬡' : 'Continue →'}
        </button>
      </div>
    </div>
  {:else}
    <div class="text-center">
      <div class="cursed-orb w-24 h-24 mx-auto mb-10 bg-blue-500/30 rounded-full relative">
        <div class="absolute inset-0 border border-blue-500/20 rounded-full animate-ping"></div>
      </div>
      <div class="text-blue-400 italic mb-4 h-6 transition-opacity duration-500">{loadingPhase}</div>
      <div class="font-['Share_Tech_Mono'] text-sm tracking-[0.3em] opacity-50">AWAKENING IN PROGRESS</div>
    </div>
  {/if}
</div>

<style>
  @reference "tailwindcss";
  :global(.container) {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 24px;
  }
  
  .header h1 {
    font-family: 'Cinzel Decorative', serif;
    background: linear-gradient(135deg, #ffffff 0%, var(--gold-bright) 40%, var(--ce-bright) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
</style>
