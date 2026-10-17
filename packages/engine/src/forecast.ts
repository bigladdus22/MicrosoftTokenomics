import { EstimateSchema, RateCardSchema } from './schemas.js';
import { coworkBaseUnits } from './products/cowork.js';
import { copilotStudioBaseUnits } from './products/copilotStudio.js';
import { powerPlatformAiBaseUnits } from './products/powerPlatformAi.js';
import { githubCopilotBase } from './products/githubCopilot.js';
import { solvePurchaseMix } from './purchaseMix.js';
import {
  PRODUCT_METER,
  type Estimate,
  type EstimateForecast,
  type LineItem,
  type LineItemForecast,
  type MeterId,
  type RateCard,
  type Warning,
} from './types.js';

/** units_m = base × (1 + g)^(m-1), m = 1..horizon. Credits never carry over, so each month stands alone. */
export function applyGrowth(baseUnits: number, growth: number, horizonMonths: number): number[] {
  return Array.from({ length: horizonMonths }, (_, i) => baseUnits * Math.pow(1 + growth, i));
}

function forecastLineItem(item: LineItem, estimate: Estimate, rateCard: RateCard): LineItemForecast {
  const { horizonMonths, growthPercentPerMonth, m365CopilotLicensedShare } = estimate.assumptions;
  const common = { lineItemId: item.id, product: item.product, meter: PRODUCT_METER[item.product] } as const;

  switch (item.product) {
    case 'cowork': {
      const r = coworkBaseUnits(item.inputs, rateCard, item.id);
      return { ...common, baseUnits: r.units, unitsByMonth: applyGrowth(r.units, growthPercentPerMonth, horizonMonths), warnings: r.warnings };
    }
    case 'copilotStudio': {
      const r = copilotStudioBaseUnits(item.inputs, rateCard, m365CopilotLicensedShare);
      return { ...common, baseUnits: r.units, unitsByMonth: applyGrowth(r.units, growthPercentPerMonth, horizonMonths), warnings: r.warnings };
    }
    case 'powerPlatformAi': {
      const r = powerPlatformAiBaseUnits(item.inputs, rateCard, item.id);
      return { ...common, baseUnits: r.units, unitsByMonth: applyGrowth(r.units, growthPercentPerMonth, horizonMonths), warnings: r.warnings };
    }
    case 'githubCopilot': {
      const r = githubCopilotBase(item.inputs, rateCard, item.id);
      return {
        ...common,
        baseUnits: r.units,
        unitsByMonth: applyGrowth(r.units, growthPercentPerMonth, horizonMonths),
        includedUnitsPerMonth: r.includedUnitsPerMonth,
        fixedCostPerMonthUSD: r.fixedCostPerMonthUSD,
        warnings: r.warnings,
      };
    }
  }
}

/**
 * The engine entry point. Validates both inputs, runs every line item, pools by meter,
 * prices what the rate card can price, and converts to the estimate's currency.
 * Throws a ZodError on invalid input; never throws on missing prices (those become warnings).
 */
export function forecast(estimateIn: Estimate, rateCardIn: RateCard): EstimateForecast {
  const estimate = EstimateSchema.parse(estimateIn);
  const rateCard = RateCardSchema.parse(rateCardIn);
  const H = estimate.assumptions.horizonMonths;
  const warnings: Warning[] = [];

  if (estimate.rateCardVersion !== rateCard.version) {
    warnings.push({
      scope: 'estimate',
      code: 'INVALID_INPUT',
      message: `Estimate is pinned to rate card ${estimate.rateCardVersion} but was priced with ${rateCard.version}; re-pin or re-price.`,
    });
  }

  const lineItems = estimate.lineItems
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((li) => forecastLineItem(li, estimate, rateCard));

  // A line item that could not be fully costed (missing rate, unknown model) makes its meter's
  // units a lower bound. Report that and withhold cost, rather than price a partial number.
  const incomplete = (meter: MeterId) =>
    lineItems.some((l) => l.meter === meter && l.warnings.some((w) => w.code === 'RATE_MISSING' || w.code === 'MODEL_UNKNOWN'));
  const incompleteWarning = (meter: MeterId, label: string): Warning => ({
    scope: 'pool',
    ref: meter,
    code: 'RATE_MISSING',
    message: `${label} usage is incomplete (see the line-item warnings), so its cost and purchase recommendation are withheld rather than shown for a partial total.`,
  });

  const zeros = () => Array.from({ length: H }, () => 0);
  const addInto = (acc: number[], xs: number[]) => xs.forEach((x, i) => (acc[i] = (acc[i] ?? 0) + x));

  // --- Copilot Credits pool (Microsoft) ------------------------------------
  const ccLines = lineItems.filter((l) => l.meter === 'copilotCredits');
  const ccUnits = zeros();
  ccLines.forEach((l) => addInto(ccUnits, l.unitsByMonth));
  const ccComplete = !incomplete('copilotCredits');
  const mix = solvePurchaseMix(ccUnits, rateCard, estimate.assumptions.commitmentPreference);
  const copilotCredits = {
    meter: 'copilotCredits' as const,
    unitsByMonth: ccUnits,
    unitsComplete: ccComplete,
    peakMonthUnits: Math.max(0, ...ccUnits),
    options: mix.options,
    recommended: ccComplete ? mix.recommended : null,
    warnings: ccComplete ? mix.warnings : [incompleteWarning('copilotCredits', 'Copilot Credits'), ...mix.warnings],
  };

  // --- GitHub AI Credits pool --------------------------------------------
  const gh = rateCard.meters.githubAiCredits;
  const ghLines = lineItems.filter((l) => l.meter === 'githubAiCredits');
  const ghUnits = zeros();
  ghLines.forEach((l) => addInto(ghUnits, l.unitsByMonth));
  const includedPerMonth = ghLines.reduce((a, l) => a + (l.includedUnitsPerMonth ?? 0), 0);
  const anyBlocked = estimate.lineItems.some((li) => li.product === 'githubCopilot' && !li.inputs.additionalUsageAllowed);
  const ghComplete = !incomplete('githubAiCredits');
  const ghWarnings: Warning[] = ghComplete ? [] : [incompleteWarning('githubAiCredits', 'GitHub AI Credits')];
  const overageUnitsByMonth = ghUnits.map((u) => Math.max(0, u - includedPerMonth));
  if (anyBlocked && overageUnitsByMonth.some((o) => o > 0)) {
    ghWarnings.push({
      scope: 'pool',
      ref: 'githubAiCredits',
      code: 'USAGE_BLOCKED',
      message:
        'Forecast demand exceeds the pooled included AI credits and additional usage is disabled: Copilot will stop for users until the monthly reset. Overage is shown but would not be billed.',
    });
  }
  const overageCostByMonthUSD = overageUnitsByMonth.map((o) => (anyBlocked ? 0 : o * gh.usdPerCredit));
  const seatCostByMonthUSD: (number | null)[] = Array.from({ length: H }, () =>
    ghLines.reduce<number | null>((a, l) => (a === null || l.fixedCostPerMonthUSD == null ? null : a + l.fixedCostPerMonthUSD), ghLines.length ? 0 : 0),
  );
  const ghTotalByMonth = seatCostByMonthUSD.map((s, i) => (s === null || !ghComplete ? null : s + (overageCostByMonthUSD[i] ?? 0)));
  const githubAiCredits = {
    meter: 'githubAiCredits' as const,
    unitsByMonth: ghUnits,
    unitsComplete: ghComplete,
    includedPerMonth,
    overageUnitsByMonth,
    overageCostByMonthUSD,
    seatCostByMonthUSD,
    totalByMonthUSD: ghTotalByMonth,
    warnings: ghWarnings,
  };

  // --- totals + currency ---------------------------------------------------
  const ccByMonth = copilotCredits.recommended?.costByMonthUSD ?? Array.from({ length: H }, () => null);
  const hasCc = ccLines.length > 0;
  const hasGh = ghUnits.some((u) => u > 0) || ghLines.length > 0;
  const currency = estimate.assumptions.currency;
  const fxRate = currency === 'USD' ? 1 : (rateCard.currencies.GBP?.rate ?? null);
  if (currency === 'GBP' && fxRate === null) {
    warnings.push({ scope: 'estimate', code: 'PRICE_MISSING', message: 'No GBP rate in the rate card; totals are shown in USD.' });
  }
  const fx = fxRate ?? 1;
  const byMonth = Array.from({ length: H }, (_, i) => {
    const cc = hasCc ? (ccByMonth[i] ?? null) : 0;
    const g = hasGh ? (ghTotalByMonth[i] ?? null) : 0;
    return cc === null || g === null ? null : (cc + g) * fx;
  });
  const horizon = byMonth.every((x): x is number => x !== null) ? byMonth.reduce((a, b) => a + b, 0) : null;

  return {
    estimateId: estimate.id,
    rateCardVersion: rateCard.version,
    horizonMonths: H,
    lineItems,
    pools: { copilotCredits, githubAiCredits },
    totals: { currency: fxRate === null ? 'USD' : currency, fxRate, byMonth, horizon },
    warnings: [...warnings, ...lineItems.flatMap((l) => l.warnings), ...copilotCredits.warnings, ...ghWarnings],
  };
}
