import { requireUserAdminContext } from "@/lib/user-access";
import { getUserManagementOptions } from "@/lib/user-management";
import { createUserAction } from "../actions";
import { UserForm } from "../user-form";

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireUserAdminContext(),
    searchParams,
  ]);
  const options = await getUserManagementOptions(
    context.companyId,
    context.roles,
  );
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Nuovo utente</h1>
        <p className="text-slate-500">
          Crea l’accesso e assegna ruoli e sedi autorizzate.
        </p>
      </header>
      {query.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {query.error}
        </p>
      )}
      <UserForm action={createUserAction} {...options} />
    </div>
  );
}
