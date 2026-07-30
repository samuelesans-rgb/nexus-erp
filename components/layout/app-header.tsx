import { auth, signOut } from "@/auth";

export default async function AppHeader() {
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email ?? "Utente";

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <h2 className="text-lg font-semibold">
        Dashboard
      </h2>

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200" />
          <div className="leading-tight">
            <p className="font-medium">{userName}</p>
            <p className="text-xs text-slate-500">
              {session?.user?.companyName}
            </p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="ml-3 rounded-lg border px-3 py-2 text-sm transition hover:bg-slate-100"
            >
              Esci
            </button>
          </form>
        </div>
    </header>
  );
}
