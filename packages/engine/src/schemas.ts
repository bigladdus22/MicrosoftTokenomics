/**
 * Zod schemas. These validate (a) every rate card in CI and (b) every estimate
 * before the engine runs it. Keep them in step with types.ts.
 */
import { z } from 'zod';

const nonNeg = z.number().finite().min(0);
const share = z.number().finite().min(0).max(1);
const nullableNonNeg = nonNeg.nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date YYYY-MM-DD');
const url = z.string().url();

const sourced = { source: z.string().min(1), verified: isoDate };

export const CopilotStudioRatesSchema = z.object({
  ...sourced,
  source: url,
  classicAnswer: nonNeg,
  generativeAnswer: nonNeg,
  agentAction: nonNeg,
  tenantGraphGrounding: nonNeg,
  flowActionsPer100: nonNeg,
  genAiToolsPer1kTokens: z.object({ basic: nonNeg, standard: nonNeg, premium: nonNeg }),
  contentProcessingPerPage: nonNeg,
  voicePerMinute: z.object({ classic: nonNeg, genAi: nonNeg, premium: nonNeg }),
});

export const CoworkRatesSchema = z.object({
  ...sourced,
  taskProfiles: z
    .array(z.object({ id: z.enum(['light', 'standard', 'heavy']), avgCredits: nullableNonNeg }))
    .length(3),
});

export const PowerPlatformAiRatesSchema = z.object({
  ...sourced,
  promptToolsPer1kTokens: z.object({ basic: nonNeg.optional(), standard: nonNeg.optional(), premium: nonNeg.optional() }),
  documentProcessingPerPage: nullableNonNeg,
});

export const CopilotCreditsMeterSchema = z.object({
  paygPricePerCredit: z.object({ USD: nullableNonNeg, ...sourced }),
  capacityPack: z.object({ creditsPerMonth: z.number().int().positive(), priceUSD: nullableNonNeg, ...sourced }),
  prePurchaseP3: z.object({
    termMonths: z.number().int().positive(),
    tiers: z.array(z.object({ minCommitUSD: nonNeg, discountPercent: z.number().min(0).max(100) })),
    ...sourced,
  }),
  consumptionRates: z.object({
    copilotStudio: CopilotStudioRatesSchema,
    cowork: CoworkRatesSchema,
    powerPlatformAi: PowerPlatformAiRatesSchema,
  }),
});

export const GitHubModelPriceSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['lightweight', 'versatile', 'powerful']),
  tier: z.enum(['default', 'longContext']),
  perMillionTokensUSD: z.object({ input: nonNeg, cachedInput: nonNeg, cacheWrite: nullableNonNeg, output: nonNeg }),
});

export const GitHubAiCreditsMeterSchema = z.object({
  ...sourced,
  source: url,
  usdPerCredit: z.number().positive(),
  plans: z.object({
    business: z.object({ seatUSD: nullableNonNeg, includedCreditsPerUser: nonNeg }),
    enterprise: z.object({ seatUSD: nullableNonNeg, includedCreditsPerUser: nonNeg }),
  }),
  pooledAtBillingEntity: z.boolean(),
  additionalUsageDefault: z.enum(['enabled', 'disabled']),
  models: z.array(GitHubModelPriceSchema).min(1),
});

export const RateCardSchema = z.object({
  version: z.string().regex(/^\d{4}\.\d{2}(\.\d+)?$/, 'YYYY.MM or YYYY.MM.n'),
  effectiveFrom: isoDate,
  currencies: z.object({
    base: z.literal('USD'),
    GBP: z.object({ rate: z.number().positive().nullable(), source: z.string() }).optional(),
  }),
  meters: z.object({
    copilotCredits: CopilotCreditsMeterSchema,
    githubAiCredits: GitHubAiCreditsMeterSchema,
  }),
});

// ---------------------------------------------------------------------------
// Estimate inputs
// ---------------------------------------------------------------------------

const mixSumsToOne = <T extends Record<string, number>>(mix: T) =>
  Math.abs(Object.values(mix).reduce((a, b) => a + b, 0) - 1) < 1e-6;

export const AssumptionsSchema = z.object({
  horizonMonths: z.number().int().min(1).max(36),
  growthPercentPerMonth: z.number().finite().min(-1).max(5),
  m365CopilotLicensedShare: share,
  commitmentPreference: z.enum(['none', 'packs', 'p3', 'auto']),
  currency: z.enum(['USD', 'GBP']),
});

export const CoworkInputsSchema = z.object({
  users: z.number().int().min(0),
  tasksPerUserPerMonth: nonNeg,
  taskProfileMix: z
    .object({ light: share, standard: share, heavy: share })
    .refine(mixSumsToOne, 'taskProfileMix shares must sum to 1'),
  creditsPerTaskOverride: nonNeg.optional(),
});

export const CopilotStudioAgentInputsSchema = z.object({
  name: z.string().min(1),
  sessionsPerMonth: nonNeg,
  perSession: z.object({
    classicAnswers: nonNeg,
    generativeAnswers: nonNeg,
    agentActions: nonNeg,
    tenantGraphGroundings: nonNeg,
    flowActions: nonNeg,
    genAiTokensK: z.object({ basic: nonNeg, standard: nonNeg, premium: nonNeg }),
    contentPages: nonNeg,
    voiceMinutes: z.object({ classic: nonNeg, genAi: nonNeg, premium: nonNeg }),
  }),
  m365CopilotLicensedShare: share.optional(),
});

export const CopilotStudioInputsSchema = z.object({ agents: z.array(CopilotStudioAgentInputsSchema).min(1) });

export const PowerPlatformAiInputsSchema = z.object({
  promptTokensKPerMonth: z.object({ basic: nonNeg, standard: nonNeg, premium: nonNeg }),
  documentPagesPerMonth: nonNeg,
});

export const GitHubCopilotInputsSchema = z.object({
  seats: z.object({ business: z.number().int().min(0), enterprise: z.number().int().min(0) }),
  activeShare: share,
  sessionsPerUserPerMonth: nonNeg,
  tokensKPerSession: z.object({ input: nonNeg, cachedInput: nonNeg, cacheWrite: nonNeg, output: nonNeg }),
  modelMix: z.record(z.string(), share).refine(mixSumsToOne, 'modelMix shares must sum to 1'),
  additionalUsageAllowed: z.boolean(),
});

const lineItemBase = { id: z.string().min(1), label: z.string().min(1), sortOrder: z.number().int() };

export const LineItemSchema = z.discriminatedUnion('product', [
  z.object({ ...lineItemBase, product: z.literal('cowork'), inputs: CoworkInputsSchema }),
  z.object({ ...lineItemBase, product: z.literal('copilotStudio'), inputs: CopilotStudioInputsSchema }),
  z.object({ ...lineItemBase, product: z.literal('powerPlatformAi'), inputs: PowerPlatformAiInputsSchema }),
  z.object({ ...lineItemBase, product: z.literal('githubCopilot'), inputs: GitHubCopilotInputsSchema }),
]);

export const EstimateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  customerName: z.string().optional(),
  rateCardVersion: z.string().min(1),
  assumptions: AssumptionsSchema,
  lineItems: z.array(LineItemSchema),
  parentEstimateId: z.string().optional(),
});

/** Export file: estimate + the rate card it was priced with. `computed` is informational; importers recompute. */
export const ExportFileSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  estimate: EstimateSchema,
  rateCardSnapshot: RateCardSchema,
  computed: z.unknown().optional(),
});

export type ExportFile = z.infer<typeof ExportFileSchema>;
