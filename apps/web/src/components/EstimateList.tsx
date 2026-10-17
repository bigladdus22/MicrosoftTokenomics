import { useEffect, useState } from 'react';
import { deleteEstimate, listEstimates, type EstimateSummary } from '../lib/persistence';

export function EstimateList({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const [rows, setRows] = useState<EstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="card">
      <header className="row">
        <h2>Your estimates</h2>
        <button type="button" className="primary" onClick={onNew}>
          New estimate
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No saved estimates yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Customer</th>
              <th>Rate card</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <button type="button" className="link" onClick={() => onOpen(r.id)}>
                    {r.name}
                  </button>
                </td>
                <td>{r.customerName ?? '—'}</td>
                <td>{r.rateCardVersion}</td>
                <td>{new Date(r.updatedAt).toLocaleString()}</td>
                <td>
                  <button type="button" className="link danger" onClick={() => remove(r.id, r.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
