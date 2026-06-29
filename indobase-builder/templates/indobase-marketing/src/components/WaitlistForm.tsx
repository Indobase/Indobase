import { FormEvent, useState } from 'react';
import { hasIndobaseEnv, requireIndobase } from '../lib/indobase';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!hasIndobaseEnv) {
      setMessage('Connect Builder to Indobase and apply supabase/migrations/001_waitlist.sql first.');
      return;
    }

    const client = requireIndobase();
    const { error } = await client.from('waitlist').insert({ email });
    setMessage(error ? error.message : 'You are on the waitlist!');
    if (!error) setEmail('');
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
      <h2 className="text-2xl font-semibold">Join the waitlist</h2>
      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={onSubmit}>
        <input className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-4 py-3" placeholder="you@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="rounded-lg bg-brand-500 px-5 py-3 font-medium" type="submit">Notify me</button>
      </form>
      {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
    </div>
  );
}
