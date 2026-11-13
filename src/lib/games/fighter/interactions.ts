export const SPECIAL_INTERACTIONS: Record<string, any> = {
  'domain_deadly_sentencing+entity_mahoraga_active': {
    handler: 'mahoragaClashDisruption',
    description: 'Mahoraga disrupts trial domain clash — passive bar push regardless of inputs',
    passivePushPerSecond: 0.02
  },
  'domain_deadly_sentencing+entity_mahoraga_on_trial': {
    handler: 'divineContemptProceedings',
    description: 'Mahoraga destroys Judgeman during deliberation phase',
    judgemanAttackDelay: 1200,
    judgemanAttackDamage: 80,
    wheelAdaptsTo: 'BINDING'
  },
  'status_ce_nullified+technique_ACCUMULATION': {
    handler: 'nullifiedAccumulator',
    description: 'Accumulation technique user with CE nullified cannot stack — all hits deal flat 5 damage only'
  }
}

export function checkInteraction(keyA: string, keyB: string, scene: any) {
  const key = `${keyA}+${keyB}`
  const interaction = SPECIAL_INTERACTIONS[key]
  if (!interaction) return null
  return interaction
}
