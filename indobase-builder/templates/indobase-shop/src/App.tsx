import { useEffect, useState } from 'react';
import type { Session } from '@indobaseinc/indobase-js';
import { hasIndobaseEnv, requireIndobase } from './lib/indobase';
import { AuthForm } from './components/AuthForm';
import { ShopHome } from './components/ShopHome';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasIndobaseEnv) {
      setLoading(false);
      return;
    }

    const client = requireIndobase();
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-300">Loading session…</div>;
  }

  if (!hasIndobaseEnv) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold">Indobase Shop</h1>
        <p className="text-slate-400">Add VITE_INDOBASE_URL and VITE_INDOBASE_ANON_KEY to .env (Builder seeds this when linked from Studio).</p>
      </div>
    );
  }

  return session ? <ShopHome session={session} /> : <AuthForm onSignedIn={() => undefined} />;
}
