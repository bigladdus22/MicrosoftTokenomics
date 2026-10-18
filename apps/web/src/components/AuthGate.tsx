import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Internal tool: email + password sign-in only. Accounts are created in the Supabase
 * dashboard (Authentication → Users); public sign-up is off.
 */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (session) return <>{children(session)}</>;
  return <SignIn />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  return (
    <main className="signin">
      <div className="card">
        <span className="brand">
          <i className="brand-mark" aria-hidden="true" />
          AI Credits Forecast
        </span>
        <p className="muted small" style={{ marginTop: 6 }}>
          Copilot Credits and GitHub AI Credits forecasts
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {message && (
            <p className="error small" role="alert">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
