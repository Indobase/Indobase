const nav = ['Overview', 'Customers', 'Billing', 'Settings'];

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
