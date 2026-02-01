export default function HomePage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Cashflow Planner</h1>
      <p className="mt-2 text-slate-400">
        <a className="underline" href="/login">Login</a> ·{' '}
        <a className="underline" href="/register">Register</a> ·{' '}
        <a className="underline" href="/dashboard">Dashboard</a>
      </p>
    </main>
  );
}
