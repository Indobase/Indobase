import { WaitlistForm } from './components/WaitlistForm';

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
