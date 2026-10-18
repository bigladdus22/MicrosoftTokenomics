/**
 * Customer-facing form fields for each product's line-item inputs. Each form edits the
 * same inputs object the engine validates; the raw JSON stays available under "Advanced".
 * Shares are entered as percentages (0–100) and stored as fractions (0–1).
 */
import { creditsPerSession, type LineItem, type RateCard } from '@ai-credits/engine';

type Item<P extends LineItem['product']> = Extract<LineItem, { product: P }>;
type Change = (n: LineItem) => void;

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Number input that maps an empty box to `undefined` rather than 0. */
function parseNum(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function NumberField({
  label,
  value,
  onChange,
  integer,
  hint,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  integer?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label title={hint}>
      {label}
      <input
        type="number"
        min={0}
        step={integer ? 1 : 'any'}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const v = parseNum(e.target.value);
          onChange(v === undefined ? undefined : Math.max(0, integer ? Math.round(v) : v));
        }}
      />
    </label>
  );
}

/** Percentage field over a 0–1 share. */
function PercentField({ label, value, onChange, hint }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; hint?: string }) {
  return (
    <NumberField
      label={`${label} (%)`}
      hint={hint}
      value={value === undefined ? undefined : +(value * 100).toFixed(4)}
      onChange={(v) => onChange(v === undefined ? undefined : Math.min(100, v) / 100)}
    />
  );
}

// ---------------------------------------------------------------------------
// Copilot Cowork
// ---------------------------------------------------------------------------

export function CoworkFields({ item, onChange }: { item: Item<'cowork'>; onChange: Change }) {
  const i = item.inputs;
  const set = (patch: Partial<Item<'cowork'>['inputs']>) => {
    const inputs = { ...i, ...patch };
    if (inputs.creditsPerTaskOverride === undefined) delete inputs.creditsPerTaskOverride;
    onChange({ ...item, inputs });
  };
  const credits = i.creditsPerTaskOverride;
  return (
    <>
      <div className="grid">
        <NumberField label="Users" integer value={i.users} onChange={(v) => set({ users: v ?? 0 })} />
        <NumberField label="Tasks per user / month" value={i.tasksPerUserPerMonth} onChange={(v) => set({ tasksPerUserPerMonth: v ?? 0 })} />
        <NumberField
          label="Credits per task"
          placeholder="from /cost"
          value={credits}
          onChange={(v) => set({ creditsPerTaskOverride: v })}
          hint="Average Copilot Credits per Cowork task, from the customer's /cost readings or the Cowork estimator."
        />
      </div>
      {credits === undefined ? (
        <p className="hint warn">
          Cowork has no published per-task credit average. Enter the customer's average from <code>/cost</code> or the Cowork
          estimator (aka.ms/CustomerCoworkEstimator). Until then this product is left out of the totals.
        </p>
      ) : (
        <p className="hint">
          {fmt(i.users)} users × {fmt(i.tasksPerUserPerMonth)} tasks × {credits.toLocaleString()} credits ={' '}
          <strong>{fmt(i.users * i.tasksPerUserPerMonth * credits)} Copilot Credits / month</strong>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Copilot Studio
// ---------------------------------------------------------------------------

type Agent = Item<'copilotStudio'>['inputs']['agents'][number];

const blankAgent = (n: number): Agent => ({
  name: `Agent ${n}`,
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
});

export function CopilotStudioFields({ item, onChange, rateCard }: { item: Item<'copilotStudio'>; onChange: Change; rateCard: RateCard }) {
  const agents = item.inputs.agents;
  const setAgents = (next: Agent[]) => onChange({ ...item, inputs: { ...item.inputs, agents: next } });
  const setAgent = (idx: number, a: Agent) => setAgents(agents.map((x, i) => (i === idx ? a : x)));

  return (
    <>
      {agents.map((a, idx) => {
        const ps = a.perSession;
        const setPs = (patch: Partial<Agent['perSession']>) => setAgent(idx, { ...a, perSession: { ...ps, ...patch } });
        const perSession = creditsPerSession(a, rateCard);
        return (
          <fieldset key={idx} className="subcard">
            <div className="row" style={{ alignItems: 'end' }}>
              <label className="grow">
                Agent name
                <input value={a.name} onChange={(e) => setAgent(idx, { ...a, name: e.target.value })} />
              </label>
              {agents.length > 1 && (
                <button type="button" className="link danger" onClick={() => setAgents(agents.filter((_, i) => i !== idx))}>
                  Remove agent
                </button>
              )}
            </div>
            <div className="grid">
              <NumberField label="Conversations / month" integer value={a.sessionsPerMonth} onChange={(v) => setAgent(idx, { ...a, sessionsPerMonth: v ?? 0 })} />
              <PercentField
                label="M365 Copilot-licensed users"
                hint="Conversations from Microsoft 365 Copilot-licensed users bill zero credits. Leave empty to use the estimate-wide value."
                value={a.m365CopilotLicensedShare}
                onChange={(v) => {
                  const next = { ...a, m365CopilotLicensedShare: v };
                  if (v === undefined) delete next.m365CopilotLicensedShare;
                  setAgent(idx, next);
                }}
              />
            </div>
            <div className="subhead">Per conversation, on average</div>
            <div className="grid">
              <NumberField label="Classic answers" value={ps.classicAnswers} onChange={(v) => setPs({ classicAnswers: v ?? 0 })} />
              <NumberField label="Generative answers" value={ps.generativeAnswers} onChange={(v) => setPs({ generativeAnswers: v ?? 0 })} />
              <NumberField label="Agent actions" value={ps.agentActions} onChange={(v) => setPs({ agentActions: v ?? 0 })} />
              <NumberField label="Tenant Graph groundings" value={ps.tenantGraphGroundings} onChange={(v) => setPs({ tenantGraphGroundings: v ?? 0 })} />
              <NumberField label="Agent flow actions" value={ps.flowActions} onChange={(v) => setPs({ flowActions: v ?? 0 })} />
            </div>
            <details>
              <summary>AI tools, documents and voice</summary>
              <div className="grid">
                <NumberField label="AI tool tokens, basic (thousands)" value={ps.genAiTokensK.basic} onChange={(v) => setPs({ genAiTokensK: { ...ps.genAiTokensK, basic: v ?? 0 } })} />
                <NumberField label="AI tool tokens, standard (thousands)" value={ps.genAiTokensK.standard} onChange={(v) => setPs({ genAiTokensK: { ...ps.genAiTokensK, standard: v ?? 0 } })} />
                <NumberField label="AI tool tokens, premium (thousands)" value={ps.genAiTokensK.premium} onChange={(v) => setPs({ genAiTokensK: { ...ps.genAiTokensK, premium: v ?? 0 } })} />
                <NumberField label="Document pages processed" value={ps.contentPages} onChange={(v) => setPs({ contentPages: v ?? 0 })} />
                <NumberField label="Voice minutes, classic" value={ps.voiceMinutes.classic} onChange={(v) => setPs({ voiceMinutes: { ...ps.voiceMinutes, classic: v ?? 0 } })} />
                <NumberField label="Voice minutes, generative AI" value={ps.voiceMinutes.genAi} onChange={(v) => setPs({ voiceMinutes: { ...ps.voiceMinutes, genAi: v ?? 0 } })} />
                <NumberField label="Voice minutes, premium" value={ps.voiceMinutes.premium} onChange={(v) => setPs({ voiceMinutes: { ...ps.voiceMinutes, premium: v ?? 0 } })} />
              </div>
            </details>
            <p className="hint">
              ≈ {perSession.toLocaleString(undefined, { maximumFractionDigits: 2 })} credits per conversation ×{' '}
              {fmt(a.sessionsPerMonth)} = <strong>{fmt(perSession * a.sessionsPerMonth)} credits / month</strong>, before the
              M365 Copilot-licensed discount
            </p>
          </fieldset>
        );
      })}
      <div>
        <button type="button" onClick={() => setAgents([...agents, blankAgent(agents.length + 1)])}>
          + Add agent
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Power Platform AI
// ---------------------------------------------------------------------------

export function PowerPlatformAiFields({ item, onChange }: { item: Item<'powerPlatformAi'>; onChange: Change }) {
  const i = item.inputs;
  const set = (patch: Partial<Item<'powerPlatformAi'>['inputs']>) => onChange({ ...item, inputs: { ...i, ...patch } });
  const tok = i.promptTokensKPerMonth;
  return (
    <div className="grid">
      <NumberField label="Prompt tokens / month, basic (thousands)" value={tok.basic} onChange={(v) => set({ promptTokensKPerMonth: { ...tok, basic: v ?? 0 } })} />
      <NumberField label="Prompt tokens / month, standard (thousands)" value={tok.standard} onChange={(v) => set({ promptTokensKPerMonth: { ...tok, standard: v ?? 0 } })} />
      <NumberField label="Prompt tokens / month, premium (thousands)" value={tok.premium} onChange={(v) => set({ promptTokensKPerMonth: { ...tok, premium: v ?? 0 } })} />
      <NumberField label="Document pages / month" value={i.documentPagesPerMonth} onChange={(v) => set({ documentPagesPerMonth: v ?? 0 })} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub Copilot
// ---------------------------------------------------------------------------

export function GitHubCopilotFields({ item, onChange, rateCard }: { item: Item<'githubCopilot'>; onChange: Change; rateCard: RateCard }) {
  const i = item.inputs;
  const set = (patch: Partial<Item<'githubCopilot'>['inputs']>) => onChange({ ...item, inputs: { ...i, ...patch } });
  const tk = i.tokensKPerSession;
  const models = rateCard.meters.githubAiCredits.models;
  const mix = Object.entries(i.modelMix);
  const mixTotal = mix.reduce((a, [, s]) => a + s, 0);
  const unused = models.filter((m) => !(m.id in i.modelMix));
  const setMix = (entries: [string, number][]) => set({ modelMix: Object.fromEntries(entries) });

  return (
    <>
      <div className="grid">
        <NumberField label="Business seats" integer value={i.seats.business} onChange={(v) => set({ seats: { ...i.seats, business: v ?? 0 } })} />
        <NumberField label="Enterprise seats" integer value={i.seats.enterprise} onChange={(v) => set({ seats: { ...i.seats, enterprise: v ?? 0 } })} />
        <PercentField label="Seats active each month" value={i.activeShare} onChange={(v) => set({ activeShare: v ?? 0 })} />
        <NumberField label="Sessions per active user / month" value={i.sessionsPerUserPerMonth} onChange={(v) => set({ sessionsPerUserPerMonth: v ?? 0 })} />
      </div>
      <label className="inline">
        <input type="checkbox" checked={i.additionalUsageAllowed} onChange={(e) => set({ additionalUsageAllowed: e.target.checked })} />
        Allow paid usage beyond the included AI credits
      </label>

      <div className="subhead">Model mix · share of sessions</div>
      {mix.map(([id, share], idx) => (
        <div className="mix-row" key={id}>
          <select
            value={id}
            onChange={(e) => setMix(mix.map(([k, s], j) => (j === idx ? [e.target.value, s] : [k, s])))}
          >
            <option value={id}>{id}</option>
            {unused.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <input
            className="pct"
            type="number"
            min={0}
            max={100}
            value={+(share * 100).toFixed(4)}
            onChange={(e) => setMix(mix.map(([k, s], j) => (j === idx ? [k, Math.min(100, Math.max(0, parseNum(e.target.value) ?? 0)) / 100] : [k, s])))}
            aria-label={`${id} share (%)`}
          />
          <span className="muted">%</span>
          {mix.length > 1 && (
            <button type="button" className="link danger" onClick={() => setMix(mix.filter((_, j) => j !== idx))}>
              Remove
            </button>
          )}
        </div>
      ))}
      <div className="row">
        {unused.length > 0 && (
          <button type="button" onClick={() => setMix([...mix, [unused[0]!.id, 0]])}>
            + Add model
          </button>
        )}
        <span className={Math.abs(mixTotal - 1) < 1e-6 ? 'muted' : 'error'}>Total: {+(mixTotal * 100).toFixed(2)}%</span>
      </div>

      <details>
        <summary>Tokens per session</summary>
        <div className="grid">
          <NumberField label="Input tokens (thousands)" value={tk.input} onChange={(v) => set({ tokensKPerSession: { ...tk, input: v ?? 0 } })} />
          <NumberField label="Cached input tokens (thousands)" value={tk.cachedInput} onChange={(v) => set({ tokensKPerSession: { ...tk, cachedInput: v ?? 0 } })} />
          <NumberField label="Cache-write tokens (thousands)" value={tk.cacheWrite} onChange={(v) => set({ tokensKPerSession: { ...tk, cacheWrite: v ?? 0 } })} />
          <NumberField label="Output tokens (thousands)" value={tk.output} onChange={(v) => set({ tokensKPerSession: { ...tk, output: v ?? 0 } })} />
        </div>
      </details>
    </>
  );
}
