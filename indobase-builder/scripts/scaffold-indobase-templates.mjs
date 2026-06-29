import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..', 'templates');

const shared = {
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
`,
  'tsconfig.node.json': `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
`,
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
});
`,
  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4ed',
          500: '#e84718',
          600: '#c93a12',
          950: '#3a1207',
        },
      },
    },
  },
  plugins: [],
};
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Indobase App</title>
  </head>
  <body class="bg-slate-950 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  min-height: 100vh;
  font-family: Inter, system-ui, sans-serif;
}
`,
  'src/lib/indobase.ts': `import { createClient } from '@indobaseinc/indobase-js';

const url = import.meta.env.VITE_INDOBASE_URL;
const anonKey = import.meta.env.VITE_INDOBASE_ANON_KEY;

export const hasIndobaseEnv = Boolean(url && anonKey);

export const indobase = hasIndobaseEnv ? createClient(url!, anonKey!) : null;

export function requireIndobase() {
  if (!indobase) {
    throw new Error('Missing VITE_INDOBASE_URL or VITE_INDOBASE_ANON_KEY. Link Builder from Studio or add a .env file.');
  }

  return indobase;
}
`,
  '.env.example': `VITE_INDOBASE_URL=https://your-project.indobase.in
VITE_INDOBASE_ANON_KEY=your-anon-key
`,
};

const pkg = (name) =>
  JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
      dependencies: { '@indobaseinc/indobase-js': '^1.0.8', react: '^19.0.0', 'react-dom': '^19.0.0' },
      devDependencies: {
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        '@vitejs/plugin-react': '^4.3.4',
        autoprefixer: '^10.4.20',
        postcss: '^8.4.49',
        tailwindcss: '^3.4.17',
        typescript: '^5.7.2',
        vite: '^6.0.3',
      },
    },
    null,
    2,
  ) + '\n';

const templates = {
  'indobase-auth-app': {
    'package.json': pkg('indobase-auth-app'),
    'src/App.tsx': `import { useEffect, useState } from 'react';
import type { Session } from '@indobaseinc/indobase-js';
import { hasIndobaseEnv, requireIndobase } from './lib/indobase';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';

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
        <h1 className="text-3xl font-semibold">Indobase Auth App</h1>
        <p className="text-slate-400">Add VITE_INDOBASE_URL and VITE_INDOBASE_ANON_KEY to .env (Builder seeds this when linked from Studio).</p>
      </div>
    );
  }

  return session ? <Dashboard session={session} /> : <AuthForm onSignedIn={setSession} />;
}
`,
    'src/components/AuthForm.tsx': `import { FormEvent, useState } from 'react';
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
`,
    'src/components/Dashboard.tsx': `import type { Session } from '@indobaseinc/indobase-js';
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
`,
    '.bolt/prompt': `This is an Indobase Auth App template using @indobaseinc/indobase-js.
- Keep src/lib/indobase.ts as the single client entry point.
- Auth uses email/password via GoTrue on the linked Indobase project.
- Customize branding and dashboard cards; do not replace the Indobase client with @supabase/supabase-js.
- Run npm install && npm run dev after import. Vite is already configured for WebContainer preview on port 5173.
`,
    '.bolt/ignore': 'src/lib/indobase.ts\n',
  },
  'indobase-todo-app': {
    'package.json': pkg('indobase-todo-app'),
    'supabase/migrations/001_todos.sql': `create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;

create policy "Users read own todos" on public.todos for select using (auth.uid() = user_id);
create policy "Users insert own todos" on public.todos for insert with check (auth.uid() = user_id);
create policy "Users update own todos" on public.todos for update using (auth.uid() = user_id);
create policy "Users delete own todos" on public.todos for delete using (auth.uid() = user_id);
`,
    'src/App.tsx': `import { TodoApp } from './components/TodoApp';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-500">Indobase</p>
        <h1 className="mt-2 text-4xl font-semibold">Todo list</h1>
        <p className="mt-2 text-slate-400">Persists to your Indobase Postgres todos table when signed in.</p>
        <TodoApp />
      </div>
    </div>
  );
}
`,
    'src/components/TodoApp.tsx': `import { FormEvent, useEffect, useState } from 'react';
import type { Session } from '@indobaseinc/indobase-js';
import { hasIndobaseEnv, requireIndobase } from '../lib/indobase';

type Todo = { id: string; title: string; completed: boolean };

export function TodoApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!hasIndobaseEnv) return;
    const client = requireIndobase();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !hasIndobaseEnv) return;
    void loadTodos();
  }, [session]);

  async function loadTodos() {
    const client = requireIndobase();
    const { data, error } = await client.from('todos').select('id,title,completed').order('created_at', { ascending: false });
    if (error) {
      setStatus(error.message);
      return;
    }
    setTodos(data ?? []);
  }

  async function addTodo(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !session) return;
    const client = requireIndobase();
    const { error } = await client.from('todos').insert({ title: title.trim(), user_id: session.user.id });
    if (error) {
      setStatus(error.message);
      return;
    }
    setTitle('');
    await loadTodos();
  }

  async function toggleTodo(todo: Todo) {
    const client = requireIndobase();
    await client.from('todos').update({ completed: !todo.completed }).eq('id', todo.id);
    await loadTodos();
  }

  if (!hasIndobaseEnv) {
    return <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">Link Builder from Studio to seed .env, then run the SQL migration in supabase/migrations/001_todos.sql.</p>;
  }

  if (!session) {
    return <p className="mt-8 text-slate-400">Sign in via the Auth template or add a quick email auth flow before using todos.</p>;
  }

  return (
    <div className="mt-8 space-y-4">
      <form className="flex gap-2" onSubmit={addTodo}>
        <input className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-4 py-3" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" />
        <button className="rounded-lg bg-brand-500 px-4 py-3 font-medium" type="submit">Add</button>
      </form>
      {status ? <p className="text-sm text-red-300">{status}</p> : null}
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <input checked={todo.completed} onChange={() => toggleTodo(todo)} type="checkbox" />
            <span className={todo.completed ? 'line-through text-slate-500' : ''}>{todo.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
`,
    '.bolt/prompt': `Indobase Todo template. Apply supabase/migrations/001_todos.sql in Studio SQL editor before testing inserts.
Use @indobaseinc/indobase-js via src/lib/indobase.ts. Add sign-in if the user is not authenticated yet.
`,
    '.bolt/ignore': 'src/lib/indobase.ts\nsupabase/migrations/001_todos.sql\n',
  },
  'indobase-dashboard': {
    'package.json': pkg('indobase-dashboard'),
    'src/App.tsx': `import { DashboardShell } from './components/DashboardShell';

export default function App() {
  return <DashboardShell />;
}
`,
    'src/components/DashboardShell.tsx': `const nav = ['Overview', 'Customers', 'Billing', 'Settings'];

const stats = [
  { label: 'Active users', value: '1,248' },
  { label: 'MRR', value: '₹4.2L' },
  { label: 'Churn', value: '2.1%' },
];

export function DashboardShell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-r border-white/10 p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-500">Indobase</p>
        <h1 className="mt-2 text-xl font-semibold">Ops Console</h1>
        <nav className="mt-8 space-y-2">
          {nav.map((item) => (
            <button key={item} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white" type="button">{item}</button>
          ))}
        </nav>
      </aside>
      <main className="p-8">
        <h2 className="text-3xl font-semibold">Dashboard</h2>
        <p className="mt-2 text-slate-400">Wire these cards to your Indobase tables with src/lib/indobase.ts.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-sm text-slate-400">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
`,
    '.bolt/prompt': `Indobase Dashboard shell. Replace placeholder stats with real queries. Keep Vite on port 5173 and use @indobaseinc/indobase-js only.
`,
    '.bolt/ignore': 'src/lib/indobase.ts\n',
  },
  'indobase-marketing': {
    'package.json': pkg('indobase-marketing'),
    'supabase/migrations/001_waitlist.sql': `create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
create policy "Anyone can join waitlist" on public.waitlist for insert with check (true);
`,
    'src/App.tsx': `import { WaitlistForm } from './components/WaitlistForm';

const features = ['Auth & database on Indobase', 'Publish from Builder', 'India-ready billing hooks'];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-semibold">Your Product</span>
        <a className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white" href="#waitlist">Join waitlist</a>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-sm uppercase tracking-[0.2em] text-brand-500">Launch faster</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight">Ship on Indobase without rebuilding auth every time</h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-400">This marketing template includes a waitlist form backed by your Indobase Postgres table.</p>
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <li key={feature} className="rounded-2xl border border-white/10 bg-white/5 p-6">{feature}</li>
          ))}
        </ul>
        <section className="mt-16" id="waitlist">
          <WaitlistForm />
        </section>
      </main>
    </div>
  );
}
`,
    'src/components/WaitlistForm.tsx': `import { FormEvent, useState } from 'react';
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
`,
    '.bolt/prompt': `Indobase marketing site. Run supabase/migrations/001_waitlist.sql in Studio before testing the waitlist form.
`,
    '.bolt/ignore': 'src/lib/indobase.ts\nsupabase/migrations/001_waitlist.sql\n',
  },
};

for (const [bundle, files] of Object.entries(templates)) {
  const bundleRoot = path.join(root, bundle);
  for (const [rel, content] of Object.entries({ ...shared, ...files })) {
    const filePath = path.join(bundleRoot, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

console.log('Created templates:', Object.keys(templates).join(', '));
