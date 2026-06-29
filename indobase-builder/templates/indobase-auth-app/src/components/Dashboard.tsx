import type { Session } from '@indobaseinc/indobase-js';
import { requireIndobase } from '../lib/indobase';

type Props = { session: Session };

export function Dashboard({ session }: Props) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-brand-500">Authenticated</p>
          <h1 className="text-3xl font-semibold">Your Indobase app</h1>
          <p className="mt-2 text-slate-400">{session.user.email}</p>
        </div>
        <button
          className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          onClick={() => requireIndobase().auth.signOut()}
          type="button"
        >
          Sign out
        </button>
      </header>
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {['Users', 'Database', 'Storage'].map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-medium">{item}</h2>
            <p className="mt-2 text-sm text-slate-400">Extend this card with real queries from your Indobase project.</p>
          </div>
        ))}
      </section>
    </div>
  );
}
