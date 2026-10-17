import type { PowerPlatformAiInputs, RateCard, Warning } from '../types.js';

/** Month-1 Copilot Credits for Power Platform AI (AI Builder prompt tools + document processing). */
export function powerPlatformAiBaseUnits(
  inputs: PowerPlatformAiInputs,
  rateCard: RateCard,
  lineItemId: string,
): { units: number; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const r = rateCard.meters.copilotCredits.consumptionRates.powerPlatformAi;
  let units = 0;

  for (const tier of ['basic', 'standard', 'premium'] as const) {
    const tokensK = inputs.promptTokensKPerMonth[tier];
    if (tokensK === 0) continue;
    const rate = r.promptToolsPer1kTokens[tier];
    if (rate === undefined) {
      warnings.push({
        scope: 'lineItem',
        ref: lineItemId,
        code: 'RATE_MISSING',
        message: `Power Platform prompt-tool rate for tier "${tier}" is not in rate card ${rateCard.version}; source it from ${r.source}.`,
      });
      continue;
    }
    units += tokensK * rate;
  }

  if (inputs.documentPagesPerMonth > 0) {
    if (r.documentProcessingPerPage === null) {
      warnings.push({
        scope: 'lineItem',
        ref: lineItemId,
        code: 'RATE_MISSING',
        message: `Power Platform document-processing rate is not in rate card ${rateCard.version}; source it from ${r.source}.`,
      });
    } else {
      units += inputs.documentPagesPerMonth * r.documentProcessingPerPage;
    }
  }

  return { units, warnings };
}
