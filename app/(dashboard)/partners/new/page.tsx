import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { getCompanyAgents } from "@/lib/partners";
import { getPartnerConfigurationOptions } from "@/lib/configurations";
import { redirect } from "next/navigation";
import { createPartner } from "../actions";
import PartnerForm from "../partner-form";

export default async function NewPartnerPage() {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_PARTNERS);
  const [agents, configurationOptions] = await Promise.all([getCompanyAgents(session.user.companyId), getPartnerConfigurationOptions(session.user.companyId)]);

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
