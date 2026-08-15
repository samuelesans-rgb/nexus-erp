import { ManagementView } from "@/components/management/management-view";
import { requireManagementContext } from "@/lib/management-access";
import { getManagementDashboard, parseManagementPeriod } from "@/lib/management-dashboard";

export default async function ControllingPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const [context, query] = await Promise.all([requireManagementContext(), searchParams]);
  const data = await getManagementDashboard(context.companyId, context.location.id, parseManagementPeriod(query));
  return <ManagementView data={data} locationName={context.location.name} controlling />;
}
