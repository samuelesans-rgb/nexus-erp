import { PARTNER_CAPABILITIES, requirePartnerContext } from "@/lib/partner-access";
import { getCompanyAgents, getPartnerDetail } from "@/lib/partners";
import { getPartnerConfigurationOptions } from "@/lib/configurations";
import { notFound } from "next/navigation";
import { updatePartner } from "../../actions";
import PartnerForm from "../../partner-form";

export default async function EditPartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.WRITE);
  const { id } = await params;
  const [partner, agents, configurationOptions] = await Promise.all([
    getPartnerDetail(context.companyId, id),
    getCompanyAgents(context.companyId),
    getPartnerConfigurationOptions(context.companyId),
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
