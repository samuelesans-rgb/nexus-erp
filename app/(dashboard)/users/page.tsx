import Link from "next/link";
import { requireUserAdminContext } from "@/lib/user-access";
import { getCompanyUsers } from "@/lib/user-management";
import { toggleUserActiveAction } from "./actions";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireUserAdminContext(),
    searchParams,
  ]);
  const users = await getCompanyUsers(context.companyId);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Utenti</h1>
          <p className="text-slate-500">
            Accessi, ruoli e sedi della tua azienda.
          </p>
        </div>
        <Link
          href="/users/new"
          className="min-h-11 rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white"
        >
          Nuovo utente
        </Link>
      </header>
      {query.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {query.error}
        </p>
      )}
      {query.success && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-emerald-700"
        >
          {query.success}
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-3">Utente</th>
              <th className="p-3">Ruoli</th>
              <th className="p-3">Azienda</th>
              <th className="p-3">Sedi</th>
              <th className="p-3">Ultimo accesso</th>
              <th className="p-3">Stato</th>
              <th className="p-3">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map((membership) => (
              <tr key={membership.id} className="border-t align-top">
                <td className="p-3">
                  <b>
                    {membership.user.firstName} {membership.user.lastName}
                  </b>
                  <span className="block text-slate-500">
                    {membership.user.email}
                  </span>
                </td>
                <td className="p-3">
                  {membership.roles.map(({ role }) => role.code).join(", ") ||
                    "—"}
                </td>
                <td className="p-3">{membership.company.name}</td>
                <td className="p-3">
                  {membership.authorizedLocations
                    .map(({ location }) => location.name)
                    .join(", ") || "—"}
                  <span className="block text-xs text-slate-500">
                    Predefinita: {membership.defaultLocation?.name ?? "—"}
                  </span>
                </td>
                <td className="p-3">
                  {membership.user.lastLogin?.toLocaleString("it-IT") ?? "Mai"}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${membership.active && membership.user.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
                  >
                    {membership.active && membership.user.active
                      ? "ATTIVO"
                      : "DISATTIVO"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/users/${membership.id}/edit`}
                      className="rounded border px-3 py-2"
                    >
                      Modifica · Gestisci ruoli
                    </Link>
                    <form action={toggleUserActiveAction}>
                      <input
                        type="hidden"
                        name="membershipId"
                        value={membership.id}
                      />
                      <input
                        type="hidden"
                        name="active"
                        value={membership.active ? "false" : "true"}
                      />
                      <button className="rounded border px-3 py-2">
                        {membership.active ? "Disattiva" : "Attiva"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
