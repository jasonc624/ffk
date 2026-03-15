<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { getGameConfig } from '$lib/gameConfig';

  let game: Phaser.Game;
  let container: HTMLDivElement;

  onMount(() => {
    (async () => {
      // Dynamic import to avoid SSR issues
      const Phaser = (await import('phaser')).default;
      const config = getGameConfig('phaser-container');
      game = new Phaser.Game(config);
    })();
    
    return () => {
      if (game) {
        game.destroy(true);
      }
    };
  });

  onDestroy(() => {
    if (game) {
      game.destroy(true);
    }
  });

  function exit() {
    if (game) {
      game.destroy(true);
    }
    goto('/home');
  }
</script>

<svelte:head>
  <title>Fufutsu Kaisen — Battle View</title>
</svelte:head>

<div id="phaser-container" class="fixed inset-0 bg-black overflow-hidden" bind:this={container}></div>

<!-- UI Overlay -->
<div class="fixed top-6 right-6 z-50">
  <button 
    onclick={exit}
    class="bg-white/5 border border-white/10 px-6 py-2 rounded-xl text-slate-400 hover:text-white hover:border-white/30 transition-all font-['Share_Tech_Mono'] text-xs tracking-widest"
  >
    ESC — EXIT BATTLE
  </button>
</div>

<!-- Controls Hint -->
<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none opacity-40">
  <div class="flex gap-8 font-['Share_Tech_Mono'] text-[10px] tracking-widest text-blue-300">
    <div>MOVE: WASD / ARROWS</div>
    <div>J: LIGHT</div>
    <div>K: HEAVY</div>
    <div>L: SPECIAL</div>
    <div>S: BLOCK</div>
    <div>SPACE / W: JUMP</div>
  </div>
</div>

<style>
  :global(canvas) {
    display: block;
    image-rendering: pixelated;
  }
</style>
