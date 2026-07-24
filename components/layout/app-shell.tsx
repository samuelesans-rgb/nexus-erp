export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-slate-900 text-white">
        <div className="border-b border-slate-800 p-6">
          <h1 className="text-xl font-bold">Nexus ERP</h1>
          <p className="mt-1 text-sm text-slate-400">Business Platform</p>
        </div>

        <nav className="space-y-1 p-4">
          <div className="rounded-lg bg-slate-800 px-3 py-2">Dashboard</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">CRM</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Magazzino</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Vendite</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Acquisti</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Contabilità</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Tesoreria</div>
          <div className="rounded-lg px-3 py-2 hover:bg-slate-800">Report</div>
        </nav>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <h2 className="text-lg font-semibold">Dashboard</h2>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-slate-200" />
            <span className="font-medium">Admin</span>
          </div>
        </header>

        <section className="flex-1 p-6">{children}</section>
      </main>
    </div>
  );
}