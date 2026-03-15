<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getCharacter } from '$lib/storage';

  onMount(() => {
    const character = getCharacter();
    if (character) {
      goto('/home');
    } else {
      goto('/create');
    }
  });
</script>

<div class="h-screen flex items-center justify-center bg-black">
  <div class="text-center animate-pulse">
    <div class="cursed-orb w-20 h-20 mx-auto mb-8 bg-blue-500/30 rounded-full blur-xl"></div>
    <p class="font-['Share_Tech_Mono'] text-blue-400 tracking-[0.5em] text-sm">INITIALIZING PROTOCOL</p>
  </div>
</div>
