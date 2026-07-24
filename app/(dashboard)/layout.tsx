export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r bg-zinc-900 text-white p-6">
        <h1 className="text-2xl font-bold">Nexus ERP</h1>

        <nav className="mt-8 space-y-3">
          <a href="/dashboard" className="block hover:text-blue-400">
            Dashboard
          </a>

          <a href="/companies" className="block hover:text-blue-400">
            Aziende
          </a>

          <a href="/users" className="block hover:text-blue-400">
            Utenti
          </a>

          <a href="/contacts" className="block hover:text-blue-400">
            Contatti
          </a>
        </nav>
      </aside>

      <main className="flex-1 p-8 bg-zinc-100">
        {children}
      </main>
    </div>
  );
}