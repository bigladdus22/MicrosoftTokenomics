import type { CoworkInputs, RateCard, Warning } from '../types.js';

/** Month-1 Copilot Credits for a Cowork line item (before growth). */
export function coworkBaseUnits(
  inputs: CoworkInputs,
  rateCard: RateCard,
  lineItemId: string,
): { units: number; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const tasks = inputs.users * inputs.tasksPerUserPerMonth;

  if (inputs.creditsPerTaskOverride !== undefined) {
    return { units: tasks * inputs.creditsPerTaskOverride, warnings };
  }

  const profiles = rateCard.meters.copilotCredits.consumptionRates.cowork.taskProfiles;
  let creditsPerTask = 0;
  for (const p of profiles) {
    const shareOfMix = inputs.taskProfileMix[p.id];
    if (shareOfMix === 0) continue;
    if (p.avgCredits === null) {
      warnings.push({
        scope: 'lineItem',
        ref: lineItemId,
        code: 'RATE_MISSING',
        message: `Cowork task profile "${p.id}" has no sourced avgCredits in rate card ${rateCard.version}; enter creditsPerTaskOverride from the customer's /cost or usage report.`,
      });
      continue;
    }
    creditsPerTask += shareOfMix * p.avgCredits;
  }
  return { units: tasks * creditsPerTask, warnings };
}
