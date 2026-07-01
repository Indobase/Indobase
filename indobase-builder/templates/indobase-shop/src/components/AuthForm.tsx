import { FormEvent, useState } from 'react';
import { requireIndobase } from '../lib/indobase';

type Props = { onSignedIn: () => void };

export function AuthForm({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const client = requireIndobase();
    const action = mode === 'signin'
      ? client.auth.signInWithPassword({ email, password })
      : client.auth.signUp({ email, password });

    const { error } = await action;
    setPending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    onSignedIn();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-500">Indobase</p>
        <h1 className="mt-2 text-3xl font-semibold">{mode === 'signin' ? 'Welcome back' : 'Create account'}</h1>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          {message ? <p className="text-sm text-red-300">{message}</p> : null}
          <button className="w-full rounded-lg bg-brand-500 px-4 py-3 font-medium text-white disabled:opacity-60" disabled={pending} type="submit">
            {pending ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <button className="mt-4 text-sm text-slate-400 hover:text-white" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} type="button">
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already registered? Sign in'}
        </button>
      </div>
    </div>
  );
}
