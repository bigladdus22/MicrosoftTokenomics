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
  const organisation = session.user.user_metadata?.organisation as string | undefined;

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
        <strong>AI Credits Forecast Calculator</strong>
        <span className="muted">{session.user.email}</span>
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        {error && <p className="error card">{error}</p>}
        {view.kind === 'list' ? (
          <EstimateList onOpen={open} onNew={() => setView({ kind: 'edit', estimate: newEstimate(organisation), isNew: true })} />
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
