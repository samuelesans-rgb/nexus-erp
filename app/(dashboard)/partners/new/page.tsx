import { PARTNER_CAPABILITIES, requirePartnerContext } from "@/lib/partner-access";
import { getCompanyAgents } from "@/lib/partners";
import { getPartnerConfigurationOptions } from "@/lib/configurations";
import { createPartner } from "../actions";
import PartnerForm from "../partner-form";

export default async function NewPartnerPage() {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.WRITE);
  const [agents, configurationOptions] = await Promise.all([getCompanyAgents(context.companyId), getPartnerConfigurationOptions(context.companyId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nuovo Partner</h1>
        <p className="text-slate-500">
          Crea un&apos;anagrafica condivisa per tutti i moduli Nexus ERP.
        </p>
      </div>
      <PartnerForm
        action={createPartner}
        agents={agents}
        configurationOptions={configurationOptions}
        submitLabel="Crea Partner"
      />
    </div>
  );
}
