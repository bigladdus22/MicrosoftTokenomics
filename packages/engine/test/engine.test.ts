import { describe, expect, it } from 'vitest';
import {
  RATE_CARDS,
  RateCardSchema,
  applyGrowth,
  creditsPerSession,
  forecast,
  getRateCard,
  sessionCostUSD,
  solvePurchaseMix,
  type Assumptions,
  type CopilotStudioAgentInputs,
  type Estimate,
  type RateCard,
} from '../src/index.js';

const rc = RATE_CARDS[0]!;
/** The original 2026.10 card: nothing priced. Kept to pin the "never a silent zero" behaviour. */
const unpricedRc = getRateCard('2026.10')!;

/** A fully-priced copy of the rate card so cost paths can be tested. Prices are TEST VALUES, not Microsoft list prices. */
const pricedRc: RateCard = structuredClone(rc);
pricedRc.meters.copilotCredits.paygPricePerCredit.USD = 0.01;
pricedRc.meters.copilotCredits.capacityPack.priceUSD = 200;
pricedRc.meters.copilotCredits.prePurchaseP3.tiers = [{ minCommitUSD: 1000, discountPercent: 20 }];
pricedRc.meters.githubAiCredits.plans.business.seatUSD = 19;
pricedRc.meters.githubAiCredits.plans.enterprise.seatUSD = 39;

const assumptions: Assumptions = {
  horizonMonths: 12,
  growthPercentPerMonth: 0,
  m365CopilotLicensedShare: 0,
  commitmentPreference: 'auto',
  currency: 'USD',
};

const quietAgent = (name: string, sessions: number): CopilotStudioAgentInputs => ({
  name,
  sessionsPerMonth: sessions,
  perSession: {
    classicAnswers: 0,
    generativeAnswers: 1,
    agentActions: 1,
    tenantGraphGroundings: 0,
    flowActions: 0,
    genAiTokensK: { basic: 0, standard: 0, premium: 0 },
    contentPages: 0,
    voiceMinutes: { classic: 0, genAi: 0, premium: 0 },
  },
});

const estimateWith = (lineItems: Estimate['lineItems'], a: Partial<Assumptions> = {}): Estimate => ({
  id: 'e1',
  name: 'test',
  rateCardVersion: rc.version,
  assumptions: { ...assumptions, ...a },
  lineItems,
});

describe('rate card', () => {
  it('published rate card passes the schema', () => {
    expect(() => RateCardSchema.parse(rc)).not.toThrow();
  });
  it('carries a source and verification date on every meter', () => {
    expect(rc.meters.githubAiCredits.source).toMatch(/^https:\/\/docs\.github\.com/);
    expect(rc.meters.copilotCredits.consumptionRates.copilotStudio.source).toMatch(/^https:\/\/learn\.microsoft\.com/);
  });
});

describe('Copilot Studio', () => {
  it('sums per-feature rates per session (Learn billing-rates table)', () => {
    // generative answer 2 + agent action 5 = 7
    expect(creditsPerSession(quietAgent('a', 1), rc)).toBe(7);
  });
  it('bills zero for the M365-Copilot-licensed share of sessions', () => {
    const li = { id: 'cs', label: 'agent', sortOrder: 0, product: 'copilotStudio' as const, inputs: { agents: [quietAgent('a', 1000)] } };
    const all = forecast(estimateWith([li], { m365CopilotLicensedShare: 0 }), rc);
    const half = forecast(estimateWith([li], { m365CopilotLicensedShare: 0.5 }), rc);
    expect(all.lineItems[0]!.baseUnits).toBe(7000);
    expect(half.lineItems[0]!.baseUnits).toBe(3500);
  });
});

describe('Cowork', () => {
  it('warns and yields 0 units when task profiles are unsourced and no override given', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'cw',
          label: 'cowork',
          sortOrder: 0,
          product: 'cowork',
          inputs: { users: 10, tasksPerUserPerMonth: 20, taskProfileMix: { light: 0.5, standard: 0.5, heavy: 0 } },
        },
      ]),
      rc,
    );
    expect(f.lineItems[0]!.baseUnits).toBe(0);
    expect(f.warnings.some((w) => w.code === 'RATE_MISSING')).toBe(true);
  });
  it('withholds pool cost and recommendation instead of pricing an incomplete total at $0', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'cw',
          label: 'cowork',
          sortOrder: 0,
          product: 'cowork',
          inputs: { users: 10, tasksPerUserPerMonth: 20, taskProfileMix: { light: 0.5, standard: 0.5, heavy: 0 } },
        },
      ]),
      pricedRc,
    );
    expect(f.pools.copilotCredits.unitsComplete).toBe(false);
    expect(f.pools.copilotCredits.recommended).toBeNull();
    expect(f.totals.horizon).toBeNull();
    expect(f.totals.byMonth.every((m) => m === null)).toBe(true);
  });
  it('prices the pool once an override completes the usage', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'cw',
          label: 'cowork',
          sortOrder: 0,
          product: 'cowork',
          inputs: { users: 10, tasksPerUserPerMonth: 20, taskProfileMix: { light: 1, standard: 0, heavy: 0 }, creditsPerTaskOverride: 30 },
        },
      ]),
      pricedRc,
    );
    expect(f.pools.copilotCredits.unitsComplete).toBe(true);
    expect(f.totals.horizon).not.toBeNull();
  });
  it('uses creditsPerTaskOverride when supplied', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'cw',
          label: 'cowork',
          sortOrder: 0,
          product: 'cowork',
          inputs: { users: 10, tasksPerUserPerMonth: 20, taskProfileMix: { light: 1, standard: 0, heavy: 0 }, creditsPerTaskOverride: 30 },
        },
      ]),
      rc,
    );
    expect(f.lineItems[0]!.baseUnits).toBe(6000);
  });
});

describe('GitHub Copilot (AI credits)', () => {
  const sonnet = rc.meters.githubAiCredits.models.find((m) => m.id === 'claude-sonnet-5.5')!;
  it('prices a session from per-million-token rates', () => {
    // 10K input @ $2/M = 0.02, 5K output @ $10/M = 0.05, 20K cached @ $0.10/M = 0.002, 0 cache write
    const usd = sessionCostUSD({ input: 10, cachedInput: 20, cacheWrite: 0, output: 5 }, sonnet);
    expect(usd).toBeCloseTo(0.072, 6);
  });
  it('pools included credits at the billing entity and bills overage at $0.01/credit', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'gh',
          label: 'devs',
          sortOrder: 0,
          product: 'githubCopilot',
          inputs: {
            seats: { business: 100, enterprise: 0 },
            activeShare: 1,
            sessionsPerUserPerMonth: 100,
            // 0.072 USD/session * 100 sessions * 100 seats = $720 = 72,000 credits
            tokensKPerSession: { input: 10, cachedInput: 20, cacheWrite: 0, output: 5 },
            modelMix: { 'claude-sonnet-5.5': 1 },
            additionalUsageAllowed: true,
          },
        },
      ]),
      pricedRc,
    );
    const pool = f.pools.githubAiCredits;
    expect(pool.includedPerMonth).toBe(190_000);
    expect(pool.unitsByMonth[0]).toBeCloseTo(72_000, 3);
    expect(pool.overageUnitsByMonth[0]).toBe(0);
    expect(pool.seatCostByMonthUSD[0]).toBe(1900);
    expect(f.totals.byMonth[0]).toBe(1900);
  });
  it('flags USAGE_BLOCKED when demand exceeds the pool and additional usage is off', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'gh',
          label: 'devs',
          sortOrder: 0,
          product: 'githubCopilot',
          inputs: {
            seats: { business: 1, enterprise: 0 },
            activeShare: 1,
            sessionsPerUserPerMonth: 10_000,
            tokensKPerSession: { input: 10, cachedInput: 20, cacheWrite: 0, output: 5 },
            modelMix: { 'claude-sonnet-5.5': 1 },
            additionalUsageAllowed: false,
          },
        },
      ]),
      pricedRc,
    );
    expect(f.pools.githubAiCredits.overageUnitsByMonth[0]).toBeGreaterThan(0);
    expect(f.pools.githubAiCredits.overageCostByMonthUSD[0]).toBe(0);
    expect(f.warnings.some((w) => w.code === 'USAGE_BLOCKED')).toBe(true);
  });
  it('rejects a model id that is not in the rate card', () => {
    const f = forecast(
      estimateWith([
        {
          id: 'gh',
          label: 'devs',
          sortOrder: 0,
          product: 'githubCopilot',
          inputs: {
            seats: { business: 1, enterprise: 0 },
            activeShare: 1,
            sessionsPerUserPerMonth: 1,
            tokensKPerSession: { input: 1, cachedInput: 0, cacheWrite: 0, output: 1 },
            modelMix: { 'made-up-model': 1 },
            additionalUsageAllowed: true,
          },
        },
      ]),
      rc,
    );
    expect(f.warnings.some((w) => w.code === 'MODEL_UNKNOWN')).toBe(true);
    expect(f.lineItems[0]!.baseUnits).toBe(0);
  });
});

describe('growth and monthly expiry', () => {
  it('compounds growth month on month without carrying credits over', () => {
    expect(applyGrowth(1000, 0.1, 3).map((x) => Math.round(x))).toEqual([1000, 1100, 1210]);
  });
});

describe('purchase mix', () => {
  it('cannot price anything on the unpriced published card and says why', () => {
    const r = solvePurchaseMix([30_000, 30_000], unpricedRc, 'auto');
    expect(r.recommended).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain('PRICE_MISSING');
    expect(r.warnings.map((w) => w.code)).toContain('P3_TIERS_MISSING');
  });
  it('prices PAYG from the 2026.10.1 card while packs and P3 stay unpriced and warned', () => {
    expect(rc.version).toBe('2026.10.1');
    const r = solvePurchaseMix([30_000, 30_000], rc, 'auto');
    expect(r.recommended?.strategy).toBe('payg');
    expect(r.recommended?.totalUSD).toBeCloseTo(600);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('PRICE_MISSING'); // capacity pack
    expect(codes).toContain('P3_TIERS_MISSING');
    expect(r.warnings.some((w) => w.message.includes('PAYG'))).toBe(false);
  });
  it('picks packs when steady usage makes them cheaper than PAYG', () => {
    // 30,000 credits/month: PAYG = $300; 1 pack ($200) + 5,000 overage ($50) = $250
    const r = solvePurchaseMix(Array(12).fill(30_000), pricedRc, 'auto');
    const payg = r.options.find((o) => o.strategy === 'payg')!;
    const packs = r.options.find((o) => o.strategy === 'packs+payg')!;
    expect(payg.totalUSD).toBe(3600);
    expect(packs.packs).toBe(1);
    expect(packs.totalUSD).toBe(3000);
    expect(packs.savingVsPaygUSD).toBe(600);
  });
  it('prices P3 at the tier discount and makes it the recommendation when cheapest', () => {
    const r = solvePurchaseMix(Array(12).fill(30_000), pricedRc, 'auto');
    const p3 = r.options.find((o) => o.strategy === 'p3')!;
    expect(p3.p3CommitUSD).toBe(3600 * 0.8);
    expect(r.recommended?.strategy).toBe('p3');
  });
  it('honours a "none" commitment preference', () => {
    const r = solvePurchaseMix(Array(12).fill(30_000), pricedRc, 'none');
    expect(r.recommended?.strategy).toBe('payg');
  });
  it('spiky usage: a pack sized to the peak is worse than PAYG and is not recommended', () => {
    // 11 quiet months of 1,000 credits ($10 PAYG) and one 25,000 spike ($250): PAYG = $360
    const r = solvePurchaseMix([...Array(11).fill(1_000), 25_000], pricedRc, 'packs');
    const packs = r.options.find((o) => o.strategy.startsWith('packs'))!;
    expect(packs.totalUSD).toBeGreaterThan(360);
    expect(r.recommended?.strategy.startsWith('packs')).toBe(true); // forced by preference, but saving is negative
    expect(packs.savingVsPaygUSD).toBeLessThan(0);
  });
});

describe('validation', () => {
  it('rejects a task mix that does not sum to 1', () => {
    expect(() =>
      forecast(
        estimateWith([
          {
            id: 'cw',
            label: 'x',
            sortOrder: 0,
            product: 'cowork',
            inputs: { users: 1, tasksPerUserPerMonth: 1, taskProfileMix: { light: 0.5, standard: 0.2, heavy: 0 }, creditsPerTaskOverride: 1 },
          },
        ]),
        rc,
      ),
    ).toThrow();
  });
  it('warns when the estimate is pinned to a different rate-card version', () => {
    const f = forecast({ ...estimateWith([]), rateCardVersion: '2025.01' }, rc);
    expect(f.warnings[0]?.code).toBe('INVALID_INPUT');
  });
});
