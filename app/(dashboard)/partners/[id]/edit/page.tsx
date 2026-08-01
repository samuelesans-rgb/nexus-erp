import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { getCompanyAgents, getPartnerDetail } from "@/lib/partners";
import { getPartnerConfigurationOptions } from "@/lib/configurations";
import { notFound, redirect } from "next/navigation";
import { updatePartner } from "../../actions";
import PartnerForm from "../../partner-form";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_PARTNERS);
  const { id } = await params;
  const [partner, agents, configurationOptions] = await Promise.all([
    getPartnerDetail(session.user.companyId, id),
    getCompanyAgents(session.user.companyId),
    getPartnerConfigurationOptions(session.user.companyId),
  ]);
  if (!partner || partner.deletedAt) notFound();
  const action = updatePartner.bind(null, partner.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-slate-500">{partner.code}</p>
        <h1 className="text-3xl font-bold">Modifica {partner.name}</h1>
      </div>
      <PartnerForm
        action={action}
        agents={agents.filter((agent) => agent.id !== partner.id)}
        configurationOptions={configurationOptions}
        submitLabel="Salva modifiche"
        defaults={{
          ...partner,
          creditLimit: partner.creditLimit?.toString() ?? null,
          discountPercent: partner.discountPercent?.toString() ?? null,
        }}
      />
    </div>
  );
}
