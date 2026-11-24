<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  interface AdminSquare {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    badge: string;
    href?: string;
    accent: string;
    available: boolean;
    icon: 'cube' | 'folder' | 'sliders' | 'map' | 'sparkles' | 'audio';
  }

  let savedGlbCount = $state<number | null>(null);

  const squares: AdminSquare[] = [
    {
      id: 'image-to-3d',
      title: 'Image to 3D GLB',
      subtitle: 'TRELLIS Neural GLB + Three.js',
      description:
        'Drop or paste any reference image to generate a textured neural 3D .glb via TRELLIS (no API key required), orbit-inspect it, and save to static/models/.',
      badge: 'ACTIVE',
      href: '/admin/image-to-3d',
      accent: '#38bdf8',
      available: true,
      icon: 'cube'
    },
    {
      id: 'model-vault',
      title: 'GLB Model Vault',
      subtitle: 'static/models/',
      description: 'Browse, inspect, scale-normalize, and verify rigged or static .glb assets used in the arena.',
      badge: 'PLANNED',
      accent: '#a855f7',
      available: false,
      icon: 'folder'
    },
    {
      id: 'hero-tuner',
      title: 'Hero Kit Balancer',
      subtitle: 'Stats & Cooldowns',
      description: 'Tune damage, Cursed Energy costs, cooldowns, and hitboxes across the FPS-MOBA hero roster.',
      badge: 'PLANNED',
      accent: '#f59e0b',
      available: false,
      icon: 'sliders'
    },
    {
      id: 'map-props',
      title: 'Map Prop Placer',
      subtitle: 'Arena & Orlando',
      description: 'Position destructible pillars, crates, and custom GLB landmarks with Rapier3D physics colliders.',
      badge: 'PLANNED',
      accent: '#22c55e',
      available: false,
      icon: 'map'
    },
    {
      id: 'vfx-lab',
      title: 'Shader & VFX Lab',
      subtitle: 'GLSL Sandbox',
      description: 'Preview Domain Expansion domes, cursed orbs, and fracture shaders in an isolated studio viewport.',
      badge: 'PLANNED',
      accent: '#f43f5e',
      available: false,
      icon: 'sparkles'
    },
    {
      id: 'audio-bank',
      title: 'Audio & SFX Bank',
      subtitle: 'Spatial Web Audio',
      description: 'Audition voice lines, domain themes, and spatial rolloff curves for every character.',
      badge: 'PLANNED',
      accent: '#6366f1',
      available: false,
      icon: 'audio'
    }
  ];

  onMount(async () => {
    try {
      const res = await fetch('/api/admin/save-glb');
      if (res.ok) {
        const data = (await res.json()) as { models?: unknown[] };
        savedGlbCount = data.models?.length ?? 0;
      }
    } catch {
      savedGlbCount = null;
    }
  });
</script>

<svelte:head>
  <title>Admin Workbench — Fufutsu Kaisen</title>
</svelte:head>

<div class="min-h-screen bg-[#070b14] text-white flex flex-col relative overflow-x-hidden">
  <!-- Subtle tactical grid backdrop -->
  <div class="pointer-events-none fixed inset-0">
    <div
      class="absolute inset-0 opacity-60"
      style="background: radial-gradient(circle at 18% 20%, rgba(56, 189, 248, 0.14), transparent 42%), radial-gradient(circle at 82% 80%, rgba(168, 85, 247, 0.12), transparent 45%), linear-gradient(180deg, #0b1222 0%, #050811 100%);"
    ></div>
    <div
      class="absolute inset-0 opacity-[0.06]"
      style="background-image: linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px); background-size: 48px 48px;"
    ></div>
  </div>

  <!-- Top Header -->
  <header class="relative z-20 h-16 bg-[#0a101d]/90 backdrop-blur-md border-b border-white/10 px-6 md:px-10 flex items-center justify-between">
    <div class="flex items-center gap-4">
      <button
        onclick={() => goto('/')}
        class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-sky-400/40 font-['Share_Tech_Mono'] text-xs text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-2"
      >
        <span>←</span>
        <span>MAIN MENU</span>
      </button>
      <div class="h-5 w-px bg-white/10"></div>
      <div>
        <div class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.3em] text-sky-400 uppercase">
          DEVELOPER CONSOLE
        </div>
        <h1 class="font-['Share_Tech_Mono'] text-sm md:text-base font-bold tracking-[0.12em] uppercase text-white">
          ADMIN WORKBENCH
        </h1>
      </div>
    </div>

    <div class="flex items-center gap-3 font-['Share_Tech_Mono'] text-xs">
      {#if savedGlbCount !== null}
        <span class="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">
          {savedGlbCount} GLB{savedGlbCount === 1 ? '' : 'S'} IN STATIC/MODELS
        </span>
      {/if}
      <span class="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/35 text-emerald-300">
        LOCAL ADMIN
      </span>
    </div>
  </header>

  <!-- Main Grid of Functionality Squares -->
  <main class="relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 md:px-10 py-10">
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <p class="font-['Share_Tech_Mono'] text-xs tracking-[0.3em] text-sky-400 uppercase mb-2">
          TOOLKIT MODULES
        </p>
        <h2 class="text-3xl md:text-4xl font-bold tracking-tight text-white">
          Select an Admin Utility
        </h2>
        <p class="text-slate-400 text-base mt-1.5 max-w-2xl">
          Launch production tools for 3D asset generation, model inspection, and game configuration.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each squares as sq, i}
        {#if sq.available && sq.href}
          <a
            href={sq.href}
            class="group relative aspect-square rounded-2xl bg-[#0c1424]/90 border border-sky-400/35 hover:border-sky-300 p-6 flex flex-col justify-between overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(56,189,248,0.18)]"
          >
            <!-- Ambient corner glow -->
            <div
              class="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20 group-hover:opacity-35 blur-3xl transition-opacity"
              style="background: {sq.accent};"
            ></div>

            <!-- Top Row: Index + Badge -->
            <div class="relative flex items-center justify-between">
              <span class="font-['Share_Tech_Mono'] text-xs tracking-[0.25em] text-slate-400">
                0{i + 1}
              </span>
              <span
                class="font-['Share_Tech_Mono'] text-[10px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border"
                style="background: {sq.accent}20; border-color: {sq.accent}66; color: {sq.accent};"
              >
                {sq.badge}
              </span>
            </div>

            <!-- Center Icon -->
            <div class="relative my-auto flex flex-col items-start gap-4">
              <div
                class="w-16 h-16 rounded-2xl flex items-center justify-center border transition-transform duration-200 group-hover:scale-105"
                style="background: {sq.accent}18; border-color: {sq.accent}55; color: {sq.accent}; box-shadow: 0 0 30px {sq.accent}22;"
              >
                {#if sq.icon === 'cube'}
                  <svg class="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                {/if}
              </div>

              <div>
                <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.2em] uppercase text-sky-300 mb-1">
                  {sq.subtitle}
                </div>
                <h3 class="text-2xl font-bold text-white group-hover:text-sky-100 transition-colors">
                  {sq.title}
                </h3>
                <p class="text-sm text-slate-300/90 mt-2 leading-relaxed">
                  {sq.description}
                </p>
              </div>
            </div>

            <!-- Footer CTA -->
            <div class="relative pt-4 border-t border-white/10 flex items-center justify-between font-['Share_Tech_Mono'] text-xs text-sky-300 group-hover:text-white transition-colors">
              <span>LAUNCH STUDIO</span>
              <span class="transform group-hover:translate-x-1 transition-transform">→</span>
            </div>
          </a>
        {:else}
          <div
            class="relative aspect-square rounded-2xl bg-[#0a101d]/60 border border-white/10 p-6 flex flex-col justify-between overflow-hidden opacity-65 select-none"
          >
            <div class="flex items-center justify-between">
              <span class="font-['Share_Tech_Mono'] text-xs tracking-[0.25em] text-slate-500">
                0{i + 1}
              </span>
              <span class="font-['Share_Tech_Mono'] text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400">
                {sq.badge}
              </span>
            </div>

            <div class="my-auto flex flex-col items-start gap-4">
              <div
                class="w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 bg-white/[0.03]"
                style="color: {sq.accent};"
              >
                {#if sq.icon === 'folder'}
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                {:else if sq.icon === 'sliders'}
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                {:else if sq.icon === 'map'}
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                    <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                  </svg>
                {:else if sq.icon === 'sparkles'}
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
                  </svg>
                {:else}
                  <svg class="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                {/if}
              </div>

              <div>
                <div class="font-['Share_Tech_Mono'] text-[11px] tracking-[0.2em] uppercase text-slate-500 mb-1">
                  {sq.subtitle}
                </div>
                <h3 class="text-xl font-bold text-slate-200">{sq.title}</h3>
                <p class="text-sm text-slate-400 mt-2 leading-relaxed">{sq.description}</p>
              </div>
            </div>

            <div class="pt-4 border-t border-white/5 flex items-center justify-between font-['Share_Tech_Mono'] text-[11px] text-slate-500">
              <span>RESERVED MODULE SLOT</span>
              <span>—</span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  </main>
</div>
