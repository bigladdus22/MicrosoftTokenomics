export * from './types.js';
export * from './schemas.js';
export { forecast, applyGrowth } from './forecast.js';
export { solvePurchaseMix } from './purchaseMix.js';
export { coworkBaseUnits } from './products/cowork.js';
export { copilotStudioBaseUnits, creditsPerSession } from './products/copilotStudio.js';
export { powerPlatformAiBaseUnits } from './products/powerPlatformAi.js';
export { githubCopilotBase, sessionCostUSD } from './products/githubCopilot.js';

import rateCard202610 from './rate-card/rate-card.2026.10.json' with { type: 'json' };
import rateCard2026101 from './rate-card/rate-card.2026.10.1.json' with { type: 'json' };
import type { RateCard } from './types.js';

/** All published rate cards, newest first. The UI pins new estimates to RATE_CARDS[0]. */
export const RATE_CARDS: RateCard[] = [rateCard2026101 as RateCard, rateCard202610 as RateCard];

export function getRateCard(version: string): RateCard | undefined {
  return RATE_CARDS.find((r) => r.version === version);
}
