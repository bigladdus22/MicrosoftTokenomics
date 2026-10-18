import { useEffect, useState } from 'react';
import { deleteEstimate, listEstimates, type EstimateSummary } from '../lib/persistence';

const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function EstimateList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [rows, setRows] = useState<EstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = () =>
    listEstimates()
      .then(setRows)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void refresh();
  }, []);

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteEstimate(id).catch((e: Error) => setError(e.message));
    void refresh();
  }

  const q = query.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || (r.customerName ?? '').toLowerCase().includes(q));

  return (
    <>
      <div className="list-head">
        <div className="grow">
          <h1>Estimates</h1>
          <p className="muted">Copilot Credits and GitHub AI Credits forecasts for your customers.</p>
        </div>
        {rows && rows.length > 0 && (
          <input className="search" type="search" placeholder="Search customer or estimate" value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        <button type="button" className="primary" onClick={onNew}>
          + New estimate
        </button>
      </div>

      {error && (
        <p className="card error" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="card empty">
          <h2>No estimates yet</h2>
          <p className="muted">Start one for a customer: add their products and the forecast builds as you type.</p>
          <button type="button" className="primary" onClick={onNew}>
            + New estimate
          </button>
        </section>
      ) : (
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="estimates">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Estimate</th>
                <th>Last saved</th>
                <th>Rate card</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r.id)}>
                  <td className="name">{r.customerName ?? <span className="muted">No customer</span>}</td>
                  <td>
                    <button type="button" className="link" onClick={(e) => (e.stopPropagation(), onOpen(r.id))}>
                      {r.name}
                    </button>
                  </td>
                  <td className="secondary">{when.format(new Date(r.updatedAt))}</td>
                  <td>
                    <span className="pill">{r.rateCardVersion}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="subtle danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(r.id, r.name);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No estimates match "{query}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
