import { notFound } from "next/navigation";
import { requireUserAdminContext } from "@/lib/user-access";
import {
  getCompanyUser,
  getUserManagementOptions,
} from "@/lib/user-management";
import { updateUserAction } from "../../actions";
import { UserForm } from "../../user-form";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [context, { id }, query] = await Promise.all([
    requireUserAdminContext(),
    params,
    searchParams,
  ]);
  const [membership, options] = await Promise.all([
    getCompanyUser(context.companyId, id),
    getUserManagementOptions(context.companyId, context.roles),
  ]);
  if (!membership) notFound();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">Modifica utente</h1>
        <p className="text-slate-500">
          Gestisci identità, stato, ruoli e sedi.
        </p>
      </header>
      {query.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {query.error}
        </p>
      )}
      <UserForm
        action={updateUserAction}
        {...options}
        user={{
          membershipId: membership.id,
          firstName: membership.user.firstName,
          lastName: membership.user.lastName,
          email: membership.user.email,
          roleCodes: membership.roles.map(({ role }) => role.code),
          locationIds: membership.authorizedLocations.map(
            ({ locationId }) => locationId,
          ),
          defaultLocationId: membership.defaultLocationId,
          active: membership.active,
        }}
      />
    </div>
  );
}
