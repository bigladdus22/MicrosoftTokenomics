import type { EstimateForecast } from '@ai-credits/engine';

const fmtUnits = (n: number) => Math.round(n).toLocaleString();

export function ForecastView({ result }: { result: EstimateForecast }) {
  const { pools, totals, warnings } = result;
  const money = (n: number | null) =>
    n === null ? 'unpriced' : n.toLocaleString(undefined, { style: 'currency', currency: totals.currency });
  const rec = pools.copilotCredits.recommended;

  return (
    <section className="card">
      <h2>Forecast</h2>
      <p className="muted">
        Rate card {result.rateCardVersion} · {result.horizonMonths} months · list prices only where the rate card is sourced
      </p>

      <div className="tiles">
        <div className="tile">
          <span className="label">Copilot Credits, peak month</span>
          <strong>{fmtUnits(pools.copilotCredits.peakMonthUnits)}</strong>
          <span className="muted">{rec ? `Recommended: ${rec.strategy}` : 'No priced purchase option yet'}</span>
        </div>
        <div className="tile">
          <span className="label">GitHub AI Credits included / month</span>
          <strong>{fmtUnits(pools.githubAiCredits.includedPerMonth)}</strong>
          <span className="muted">Overage month 1: {fmtUnits(pools.githubAiCredits.overageUnitsByMonth[0] ?? 0)}</span>
        </div>
        <div className="tile">
          <span className="label">Total over horizon</span>
          <strong>{money(totals.horizon)}</strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w, i) => (
            <li key={i}>
              <code>{w.code}</code> {w.message}
            </li>
          ))}
        </ul>
      )}

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Copilot Credits</th>
              <th>GitHub AI Credits</th>
              <th>GitHub overage</th>
              <th>Total ({totals.currency})</th>
            </tr>
          </thead>
          <tbody>
            {totals.byMonth.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{fmtUnits(pools.copilotCredits.unitsByMonth[i] ?? 0)}</td>
                <td>{fmtUnits(pools.githubAiCredits.unitsByMonth[i] ?? 0)}</td>
                <td>{fmtUnits(pools.githubAiCredits.overageUnitsByMonth[i] ?? 0)}</td>
                <td>{money(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
