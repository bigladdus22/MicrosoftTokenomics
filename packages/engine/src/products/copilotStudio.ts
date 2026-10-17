import type { CopilotStudioAgentInputs, CopilotStudioInputs, RateCard, Warning } from '../types.js';

/** Copilot Credits consumed by ONE session of an agent, before the M365-Copilot-licensed discount. */
export function creditsPerSession(agent: CopilotStudioAgentInputs, rateCard: RateCard): number {
  const r = rateCard.meters.copilotCredits.consumptionRates.copilotStudio;
  const s = agent.perSession;
  return (
    s.classicAnswers * r.classicAnswer +
    s.generativeAnswers * r.generativeAnswer +
    s.agentActions * r.agentAction +
    s.tenantGraphGroundings * r.tenantGraphGrounding +
    (s.flowActions / 100) * r.flowActionsPer100 +
    s.genAiTokensK.basic * r.genAiToolsPer1kTokens.basic +
    s.genAiTokensK.standard * r.genAiToolsPer1kTokens.standard +
    s.genAiTokensK.premium * r.genAiToolsPer1kTokens.premium +
    s.contentPages * r.contentProcessingPerPage +
    s.voiceMinutes.classic * r.voicePerMinute.classic +
    s.voiceMinutes.genAi * r.voicePerMinute.genAi +
    s.voiceMinutes.premium * r.voicePerMinute.premium
  );
}

/**
 * Month-1 BILLED Copilot Credits for a Copilot Studio line item.
 * Sessions from Microsoft 365 Copilot-licensed users bill zero
 * (source: Learn "Copilot Credits billing rates" table, column "Used by Microsoft 365 Copilot licensed user").
 */
export function copilotStudioBaseUnits(
  inputs: CopilotStudioInputs,
  rateCard: RateCard,
  defaultLicensedShare: number,
): { units: number; warnings: Warning[] } {
  let units = 0;
  for (const agent of inputs.agents) {
    const licensedShare = agent.m365CopilotLicensedShare ?? defaultLicensedShare;
    units += agent.sessionsPerMonth * creditsPerSession(agent, rateCard) * (1 - licensedShare);
  }
  return { units, warnings: [] };
}
