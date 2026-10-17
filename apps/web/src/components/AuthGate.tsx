import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Two ways in, both through Supabase Auth:
 *  - email + password self-service sign-up (organisation captured as user metadata)
 *  - "Sign in with Microsoft" via the Supabase Azure provider (Entra ID, multi-tenant)
 */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p className="muted">Loading…</p>;
  if (session) return <>{children(session)}</>;
  return <SignIn />;
}

function SignIn() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { organisation }, emailRedirectTo: window.location.origin },
          });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (mode === 'signUp') setMessage('Check your inbox to confirm your email, then sign in.');
  }

  async function microsoft() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: window.location.origin },
    });
    if (error) setMessage(error.message);
  }

  return (
    <main className="card narrow">
      <h1>AI Credits Forecast Calculator</h1>
      <button type="button" className="primary wide" onClick={microsoft}>
        Sign in with Microsoft
      </button>
      <p className="divider">or</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {mode === 'signUp' && (
          <label>
            Organisation
            <input value={organisation} onChange={(e) => setOrganisation(e.target.value)} />
          </label>
        )}
        <button type="submit" className="wide" disabled={busy}>
          {mode === 'signIn' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      {message && <p className="notice">{message}</p>}
      <button type="button" className="link" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </main>
  );
}
