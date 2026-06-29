import { TodoApp } from './components/TodoApp';

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
