import type { CommitmentPreference, PurchaseOption, RateCard, Warning } from './types.js';

/**
 * Copilot Credits pool: cost of covering `unitsByMonth` under each purchase vehicle.
 *
 * Rules (Learn, usage-based-billing-compare-dashboard-views FAQ + capacity-packs page):
 *  - capacity packs: 25,000 credits per pack per month, consumed first, unused credits expire monthly
 *  - PAYG: per-credit rate on everything not covered by packs / P3
 *  - P3: 1-year commit units drawn down first, at a discounted rate (tiers must be sourced; empty = skipped)
 *
 * Returns every option it could price, plus `recommended` = cheapest priced option that
 * satisfies the customer's commitment preference. Any null price makes that option unpriced.
 */
export function solvePurchaseMix(
  unitsByMonth: number[],
  rateCard: RateCard,
  preference: CommitmentPreference,
): { options: PurchaseOption[]; recommended: PurchaseOption | null; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const m = rateCard.meters.copilotCredits;
  const payg = m.paygPricePerCredit.USD;
  const packPrice = m.capacityPack.priceUSD;
  const packSize = m.capacityPack.creditsPerMonth;
  const months = unitsByMonth.length;
  const sum = (xs: (number | null)[]): number | null =>
    xs.every((x): x is number => x !== null) ? xs.reduce((a, b) => a + b, 0) : null;

  if (payg === null) {
    warnings.push({
      scope: 'pool',
      ref: 'copilotCredits',
      code: 'PRICE_MISSING',
      message: `Copilot Credits PAYG price is not in rate card ${rateCard.version}; pool cost cannot be priced. Source: ${m.paygPricePerCredit.source}`,
    });
  }
  if (packPrice === null) {
    warnings.push({
      scope: 'pool',
      ref: 'copilotCredits',
      code: 'PRICE_MISSING',
      message: `Capacity-pack price is not in rate card ${rateCard.version}; pack options cannot be priced. Source: ${m.capacityPack.source}`,
    });
  }

  // --- pure PAYG ---------------------------------------------------------
  const paygByMonth = unitsByMonth.map((u) => (payg === null ? null : u * payg));
  const paygOption: PurchaseOption = {
    strategy: 'payg',
    costByMonthUSD: paygByMonth,
    totalUSD: sum(paygByMonth),
    savingVsPaygUSD: 0,
  };
  const options: PurchaseOption[] = [paygOption];

  // --- packs + PAYG overage: try every pack count up to peak demand ------
  const peak = Math.max(0, ...unitsByMonth);
  const maxPacks = Math.ceil(peak / packSize);
  let bestPacks: PurchaseOption | null = null;
  for (let packs = 1; packs <= maxPacks; packs++) {
    const covered = packs * packSize;
    const byMonth = unitsByMonth.map((u) => {
      if (packPrice === null) return null;
      const overage = Math.max(0, u - covered);
      const overageCost = overage === 0 ? 0 : payg === null ? null : overage * payg;
      return overageCost === null ? null : packs * packPrice + overageCost;
    });
    const total = sum(byMonth);
    const allCovered = unitsByMonth.every((u) => u <= covered);
    const opt: PurchaseOption = {
      strategy: allCovered ? 'packs' : 'packs+payg',
      packs,
      costByMonthUSD: byMonth,
      totalUSD: total,
      savingVsPaygUSD: total === null || paygOption.totalUSD === null ? null : paygOption.totalUSD - total,
    };
    if (total !== null && (bestPacks === null || bestPacks.totalUSD === null || total < bestPacks.totalUSD)) {
      bestPacks = opt;
    }
  }
  if (bestPacks) options.push(bestPacks);

  // --- P3 pre-purchase ---------------------------------------------------
  if (m.prePurchaseP3.tiers.length === 0) {
    warnings.push({
      scope: 'pool',
      ref: 'copilotCredits',
      code: 'P3_TIERS_MISSING',
      message: `P3 pre-purchase tiers are not in rate card ${rateCard.version}; P3 option skipped. Source: ${m.prePurchaseP3.source}`,
    });
  } else if (payg !== null) {
    // Commit enough to cover the horizon's usage at the discounted rate; cap at the term.
    const termMonths = Math.min(months, m.prePurchaseP3.termMonths);
    const unitsInTerm = unitsByMonth.slice(0, termMonths).reduce((a, b) => a + b, 0);
    const listUSD = unitsInTerm * payg;
    const tier = [...m.prePurchaseP3.tiers].sort((a, b) => b.minCommitUSD - a.minCommitUSD).find((t) => listUSD >= t.minCommitUSD);
    if (tier) {
      const commit = listUSD * (1 - tier.discountPercent / 100);
      const byMonth = unitsByMonth.map((u, i) => (i === 0 ? commit : 0) + (i >= termMonths ? u * payg : 0));
      const total = sum(byMonth);
      options.push({
        strategy: months > termMonths ? 'p3+payg' : 'p3',
        p3CommitUSD: commit,
        costByMonthUSD: byMonth,
        totalUSD: total,
        savingVsPaygUSD: total === null || paygOption.totalUSD === null ? null : paygOption.totalUSD - total,
      });
    }
  }

  // --- recommendation ----------------------------------------------------
  const allowed = (o: PurchaseOption) =>
    preference === 'auto' ||
    (preference === 'none' && o.strategy === 'payg') ||
    (preference === 'packs' && o.strategy.startsWith('packs')) ||
    (preference === 'p3' && o.strategy.startsWith('p3'));
  const priced = options.filter((o) => o.totalUSD !== null && allowed(o));
  const recommended =
    priced.length === 0 ? null : priced.reduce((best, o) => ((o.totalUSD as number) < (best.totalUSD as number) ? o : best));

  return { options, recommended, warnings };
}
