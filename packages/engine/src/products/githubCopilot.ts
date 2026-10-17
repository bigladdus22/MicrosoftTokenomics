import type { GitHubCopilotInputs, GitHubModelPrice, RateCard, Warning } from '../types.js';

/**
 * USD cost of one session on one model = Σ tokens × price-per-token.
 * Prices are per 1M tokens; inputs are in thousands of tokens.
 */
export function sessionCostUSD(
  tokensK: GitHubCopilotInputs['tokensKPerSession'],
  model: GitHubModelPrice,
): number {
  const p = model.perMillionTokensUSD;
  const perK = (usdPerMillion: number) => usdPerMillion / 1000;
  return (
    tokensK.input * perK(p.input) +
    tokensK.cachedInput * perK(p.cachedInput) +
    tokensK.cacheWrite * perK(p.cacheWrite ?? 0) +
    tokensK.output * perK(p.output)
  );
}

export interface GitHubBase {
  /** Month-1 AI credits consumed (before growth). */
  units: number;
  /** Included credits per month from the seats on this line item (pooled upstream). */
  includedUnitsPerMonth: number;
  /** Fixed seat cost per month, null when any seat price is unknown. */
  fixedCostPerMonthUSD: number | null;
  warnings: Warning[];
}

export function githubCopilotBase(inputs: GitHubCopilotInputs, rateCard: RateCard, lineItemId: string): GitHubBase {
  const warnings: Warning[] = [];
  const meter = rateCard.meters.githubAiCredits;
  const modelsById = new Map(meter.models.map((m) => [m.id, m]));

  const seats = inputs.seats.business + inputs.seats.enterprise;
  const sessions = seats * inputs.activeShare * inputs.sessionsPerUserPerMonth;

  let weightedSessionUSD = 0;
  for (const [modelId, mixShare] of Object.entries(inputs.modelMix)) {
    if (mixShare === 0) continue;
    const model = modelsById.get(modelId);
    if (!model) {
      warnings.push({
        scope: 'lineItem',
        ref: lineItemId,
        code: 'MODEL_UNKNOWN',
        message: `Model "${modelId}" is not in rate card ${rateCard.version}; its share of sessions is excluded from the forecast.`,
      });
      continue;
    }
    weightedSessionUSD += mixShare * sessionCostUSD(inputs.tokensKPerSession, model);
  }

  const units = (sessions * weightedSessionUSD) / meter.usdPerCredit;

  const includedUnitsPerMonth =
    inputs.seats.business * meter.plans.business.includedCreditsPerUser +
    inputs.seats.enterprise * meter.plans.enterprise.includedCreditsPerUser;

  let fixedCostPerMonthUSD: number | null = 0;
  for (const plan of ['business', 'enterprise'] as const) {
    const n = inputs.seats[plan];
    if (n === 0) continue;
    const seatUSD = meter.plans[plan].seatUSD;
    if (seatUSD === null) {
      fixedCostPerMonthUSD = null;
      warnings.push({
        scope: 'lineItem',
        ref: lineItemId,
        code: 'PRICE_MISSING',
        message: `GitHub Copilot ${plan} seat price is not in rate card ${rateCard.version}; seat cost is excluded from totals.`,
      });
      break;
    }
    fixedCostPerMonthUSD += n * seatUSD;
  }

  return { units, includedUnitsPerMonth, fixedCostPerMonthUSD, warnings };
}
