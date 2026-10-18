import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Estimate } from '@ai-credits/engine';
import { AuthGate } from './components/AuthGate';
import { EstimateBuilder } from './components/EstimateBuilder';
import { EstimateList } from './components/EstimateList';
import { newEstimate } from './lib/defaults';
import { loadEstimate } from './lib/persistence';
import { supabase } from './lib/supabase';

type View = { kind: 'list' } | { kind: 'edit'; estimate: Estimate; isNew: boolean };

function Workspace({ session }: { session: Session }) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    setError(null);
    try {
      setView({ kind: 'edit', estimate: await loadEstimate(id), isNew: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">
          <i className="brand-mark" aria-hidden="true" />
          AI Credits Forecast
        </span>
        <span className="user">{session.user.email}</span>
        <button type="button" className="subtle" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main className="page">
        {error && (
          <p className="card error" style={{ marginBottom: 16 }}>
            {error}
          </p>
        )}
        {view.kind === 'list' ? (
          <EstimateList onOpen={open} onNew={() => setView({ kind: 'edit', estimate: newEstimate(), isNew: true })} />
        ) : (
          <EstimateBuilder
            key={view.estimate.id}
            initial={view.estimate}
            isNew={view.isNew}
            onSaved={open}
            onClose={() => setView({ kind: 'list' })}
          />
        )}
      </main>
    </>
  );
}

export function App() {
  return <AuthGate>{(session) => <Workspace session={session} />}</AuthGate>;
}
