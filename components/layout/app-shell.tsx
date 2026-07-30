import AppHeader from "./app-header";
import AppSidebar from "./app-sidebar";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar />

      <main className="flex flex-1 flex-col">
        <AppHeader />

        <section className="flex-1 p-6">
          {children}
        </section>
      </main>
    </div>
  );
}