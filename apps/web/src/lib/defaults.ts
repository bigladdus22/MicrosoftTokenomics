/**
 * Starting inputs for a new estimate and each product line. These are placeholders
 * the customer edits, not benchmarks.
 */
import { RATE_CARDS, type Estimate, type LineItem, type ProductId } from '@ai-credits/engine';

export const CURRENT_RATE_CARD = RATE_CARDS[0]!;

export const PRODUCT_LABELS: Record<ProductId, string> = {
  cowork: 'Copilot Cowork',
  copilotStudio: 'Copilot Studio',
  powerPlatformAi: 'Power Platform AI',
  githubCopilot: 'GitHub Copilot',
};

const newId = () => crypto.randomUUID();

export function newEstimate(customerName?: string): Estimate {
  return {
    id: newId(),
    name: 'New estimate',
    customerName,
    rateCardVersion: CURRENT_RATE_CARD.version,
    assumptions: {
      horizonMonths: 12,
      growthPercentPerMonth: 0.02,
      m365CopilotLicensedShare: 0,
      commitmentPreference: 'auto',
      currency: 'USD',
    },
    lineItems: [],
  };
}

export function newLineItem(product: ProductId, sortOrder: number): LineItem {
  const base = { id: newId(), label: PRODUCT_LABELS[product], sortOrder };
  switch (product) {
    case 'cowork':
      return {
        ...base,
        product,
        inputs: { users: 100, tasksPerUserPerMonth: 20, taskProfileMix: { light: 0.5, standard: 0.4, heavy: 0.1 } },
      };
    case 'copilotStudio':
      return {
        ...base,
        product,
        inputs: {
          agents: [
            {
              name: 'Agent 1',
              sessionsPerMonth: 1000,
              perSession: {
                classicAnswers: 0,
                generativeAnswers: 2,
                agentActions: 1,
                tenantGraphGroundings: 0,
                flowActions: 0,
                genAiTokensK: { basic: 0, standard: 0, premium: 0 },
                contentPages: 0,
                voiceMinutes: { classic: 0, genAi: 0, premium: 0 },
              },
            },
          ],
        },
      };
    case 'powerPlatformAi':
      return { ...base, product, inputs: { promptTokensKPerMonth: { basic: 0, standard: 1000, premium: 0 }, documentPagesPerMonth: 0 } };
    case 'githubCopilot': {
      const firstModel = CURRENT_RATE_CARD.meters.githubAiCredits.models[0]!.id;
      return {
        ...base,
        product,
        inputs: {
          seats: { business: 50, enterprise: 0 },
          activeShare: 0.8,
          sessionsPerUserPerMonth: 60,
          tokensKPerSession: { input: 20, cachedInput: 40, cacheWrite: 0, output: 4 },
          modelMix: { [firstModel]: 1 },
          additionalUsageAllowed: true,
        },
      };
    }
  }
}
