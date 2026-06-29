import { FormEvent, useEffect, useState } from 'react';
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
