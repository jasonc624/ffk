export const INTERACTION_HANDLERS: Record<string, Function> = {
  mahoragaClashDisruption: (interaction: any, scene: any) => {
    // Logic to push clash bar
    if (scene.clashBar) {
      scene.clashBar.value += interaction.passivePushPerSecond || 0;
    }
  },
  divineContemptProceedings: (interaction: any, scene: any) => {
    // Logic for Mahoraga attacking Judgeman
  },
  nullifiedAccumulator: (interaction: any, scene: any) => {
    // Logic to cap damage
  }
}
