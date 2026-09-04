import { ManagementView } from "@/components/management/management-view";
import { requireManagementContext } from "@/lib/management-access";
import {
  getManagementDashboard,
  parseManagementPeriod,
} from "@/lib/management-dashboard";
import { requireAuthorizationContext } from "@/lib/authorization";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const authorization = await requireAuthorizationContext();
  if (
    authorization.roles.includes("SALA") &&
    !authorization.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role),
    )
  )
    redirect("/restaurant/floor");
  const [context, query] = await Promise.all([
    requireManagementContext(),
    searchParams,
  ]);
  const data = await getManagementDashboard(
    context.companyId,
    context.location.id,
    parseManagementPeriod(query),
  );
  return <ManagementView data={data} locationName={context.location.name} />;
}
