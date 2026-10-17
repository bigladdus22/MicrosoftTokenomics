/**
 * Engine contracts.
 *
 * Two meters, four products:
 *   copilotCredits   <- cowork, copilotStudio, powerPlatformAi   (Microsoft, one pooled tenant meter)
 *   githubAiCredits  <- githubCopilot                            (GitHub, pooled at the billing entity)
 *
 * Every price that can be unknown is `number | null`. The engine ALWAYS computes units
 * (credits) and computes currency only where the rate card carries a price; a null price
 * produces `cost: null` plus a warning, never a silent zero.
 */

export type ProductId = 'cowork' | 'copilotStudio' | 'powerPlatformAi' | 'githubCopilot';
export type MeterId = 'copilotCredits' | 'githubAiCredits';

export const PRODUCT_METER: Record<ProductId, MeterId> = {
  cowork: 'copilotCredits',
  copilotStudio: 'copilotCredits',
  powerPlatformAi: 'copilotCredits',
  githubCopilot: 'githubAiCredits',
};

// ---------------------------------------------------------------------------
// Rate card (versioned, immutable once published; see src/rate-card/*.json)
// ---------------------------------------------------------------------------

export interface Sourced {
  /** Microsoft Learn or docs.github.com URL the figures were read from. */
  source: string;
  /** ISO date the source was opened. */
  verified: string;
}

export interface CopilotStudioRates extends Sourced {
  classicAnswer: number;
  generativeAnswer: number;
  agentAction: number;
  tenantGraphGrounding: number;
  flowActionsPer100: number;
  genAiToolsPer1kTokens: { basic: number; standard: number; premium: number };
  contentProcessingPerPage: number;
  voicePerMinute: { classic: number; genAi: number; premium: number };
}

export interface CoworkTaskProfile {
  id: 'light' | 'standard' | 'heavy';
  /** Average Copilot Credits per task. null = not yet sourced. */
  avgCredits: number | null;
}

export interface CoworkRates extends Sourced {
  taskProfiles: CoworkTaskProfile[];
}

export interface PowerPlatformAiRates extends Sourced {
  /** Credits per 1K tokens by AI Builder prompt-tool tier. Empty = not yet sourced. */
  promptToolsPer1kTokens: Partial<Record<'basic' | 'standard' | 'premium', number>>;
  documentProcessingPerPage: number | null;
}

export interface P3Tier {
  /** Minimum commitment in USD for this tier. */
  minCommitUSD: number;
  /** Discount applied to the PAYG per-credit rate for usage covered by the commitment. */
  discountPercent: number;
}

export interface CopilotCreditsMeter {
  paygPricePerCredit: { USD: number | null } & Sourced;
  capacityPack: { creditsPerMonth: number; priceUSD: number | null } & Sourced;
  prePurchaseP3: { termMonths: number; tiers: P3Tier[] } & Sourced;
  consumptionRates: {
    copilotStudio: CopilotStudioRates;
    cowork: CoworkRates;
    powerPlatformAi: PowerPlatformAiRates;
  };
}

export type GitHubPlan = 'business' | 'enterprise';

export interface GitHubModelPrice {
  id: string;
  category: 'lightweight' | 'versatile' | 'powerful';
  tier: 'default' | 'longContext';
  /** USD per 1,000,000 tokens. cacheWrite is null for models without a cache-write charge. */
  perMillionTokensUSD: { input: number; cachedInput: number; cacheWrite: number | null; output: number };
}

export interface GitHubAiCreditsMeter extends Sourced {
  usdPerCredit: number;
  plans: Record<GitHubPlan, { seatUSD: number | null; includedCreditsPerUser: number }>;
  pooledAtBillingEntity: boolean;
  additionalUsageDefault: 'enabled' | 'disabled';
  models: GitHubModelPrice[];
}

export interface RateCard {
  version: string;
  effectiveFrom: string;
  currencies: { base: 'USD'; GBP?: { rate: number | null; source: string } };
  meters: {
    copilotCredits: CopilotCreditsMeter;
    githubAiCredits: GitHubAiCreditsMeter;
  };
}

// ---------------------------------------------------------------------------
// Estimate inputs (what the customer enters; what is persisted)
// ---------------------------------------------------------------------------

export type CommitmentPreference = 'none' | 'packs' | 'p3' | 'auto';

export interface Assumptions {
  /** 1–36 */
  horizonMonths: number;
  /** Month-on-month growth applied to every line item's units, e.g. 0.05 = 5 %. */
  growthPercentPerMonth: number;
  /** 0–1. Copilot Studio usage from M365 Copilot-licensed users bills zero credits. */
  m365CopilotLicensedShare: number;
  commitmentPreference: CommitmentPreference;
  currency: 'USD' | 'GBP';
}

export interface CoworkInputs {
  users: number;
  tasksPerUserPerMonth: number;
  /** Shares must sum to 1. */
  taskProfileMix: { light: number; standard: number; heavy: number };
  /** Override when the customer has measured their own average (from /cost or the usage report). */
  creditsPerTaskOverride?: number;
}

export interface CopilotStudioAgentInputs {
  name: string;
  sessionsPerMonth: number;
  /** Per-session feature counts. */
  perSession: {
    classicAnswers: number;
    generativeAnswers: number;
    agentActions: number;
    tenantGraphGroundings: number;
    flowActions: number;
    genAiTokensK: { basic: number; standard: number; premium: number };
    contentPages: number;
    voiceMinutes: { classic: number; genAi: number; premium: number };
  };
  /** Overrides assumptions.m365CopilotLicensedShare for this agent. */
  m365CopilotLicensedShare?: number;
}

export interface CopilotStudioInputs {
  agents: CopilotStudioAgentInputs[];
}

export interface PowerPlatformAiInputs {
  promptTokensKPerMonth: { basic: number; standard: number; premium: number };
  documentPagesPerMonth: number;
}

export interface GitHubCopilotInputs {
  seats: Record<GitHubPlan, number>;
  /** 0–1 share of seats active in a month. */
  activeShare: number;
  sessionsPerUserPerMonth: number;
  /** Tokens per session, in thousands. */
  tokensKPerSession: { input: number; cachedInput: number; cacheWrite: number; output: number };
  /** model id -> share of sessions; shares must sum to 1 and ids must exist in the rate card. */
  modelMix: Record<string, number>;
  additionalUsageAllowed: boolean;
}

export type LineItemInputs =
  | { product: 'cowork'; inputs: CoworkInputs }
  | { product: 'copilotStudio'; inputs: CopilotStudioInputs }
  | { product: 'powerPlatformAi'; inputs: PowerPlatformAiInputs }
  | { product: 'githubCopilot'; inputs: GitHubCopilotInputs };

export type LineItem = LineItemInputs & {
  id: string;
  label: string;
  sortOrder: number;
};

export interface Estimate {
  id: string;
  name: string;
  customerName?: string;
  rateCardVersion: string;
  assumptions: Assumptions;
  lineItems: LineItem[];
  parentEstimateId?: string;
}

// ---------------------------------------------------------------------------
// Engine outputs (computed, never persisted)
// ---------------------------------------------------------------------------

export interface Warning {
  scope: 'estimate' | 'lineItem' | 'pool';
  ref?: string;
  code:
    | 'PRICE_MISSING'
    | 'RATE_MISSING'
    | 'USAGE_BLOCKED'
    | 'MODEL_UNKNOWN'
    | 'P3_TIERS_MISSING'
    | 'MIX_NOT_NORMALISED'
    | 'INVALID_INPUT';
  message: string;
}

export interface LineItemForecast {
  lineItemId: string;
  product: ProductId;
  meter: MeterId;
  /** Units (credits) per month, index 0 = month 1. */
  unitsByMonth: number[];
  /** Month-1 units before growth, useful for the UI's "per month at current usage". */
  baseUnits: number;
  /** For GitHub: the included allowance contributed by this line item's seats. */
  includedUnitsPerMonth?: number;
  /** For GitHub: fixed seat cost per month (null when seat price unknown). */
  fixedCostPerMonthUSD?: number | null;
  warnings: Warning[];
}

export interface PurchaseOption {
  strategy: 'payg' | 'packs' | 'p3' | 'p3+payg' | 'packs+payg';
  packs?: number;
  p3CommitUSD?: number;
  costByMonthUSD: (number | null)[];
  totalUSD: number | null;
  /** Saving versus pure PAYG over the horizon; null when either side is unpriced. */
  savingVsPaygUSD: number | null;
}

export interface CopilotCreditsPoolForecast {
  meter: 'copilotCredits';
  unitsByMonth: number[];
  peakMonthUnits: number;
  options: PurchaseOption[];
  recommended: PurchaseOption | null;
  warnings: Warning[];
}

export interface GitHubAiCreditsPoolForecast {
  meter: 'githubAiCredits';
  unitsByMonth: number[];
  includedPerMonth: number;
  overageUnitsByMonth: number[];
  overageCostByMonthUSD: number[];
  seatCostByMonthUSD: (number | null)[];
  totalByMonthUSD: (number | null)[];
  warnings: Warning[];
}

export interface EstimateForecast {
  estimateId: string;
  rateCardVersion: string;
  horizonMonths: number;
  lineItems: LineItemForecast[];
  pools: {
    copilotCredits: CopilotCreditsPoolForecast;
    githubAiCredits: GitHubAiCreditsPoolForecast;
  };
  totals: {
    currency: 'USD' | 'GBP';
    fxRate: number | null;
    byMonth: (number | null)[];
    horizon: number | null;
  };
  warnings: Warning[];
}
