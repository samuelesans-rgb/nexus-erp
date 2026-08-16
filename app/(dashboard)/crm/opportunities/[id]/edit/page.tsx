import { notFound } from "next/navigation";
import { CRM_CAPABILITIES, requireCrmContext } from "@/lib/crm-access";
import { getCrmOpportunity, getCrmOptions } from "@/lib/crm";
import { updateOpportunityAction } from "../../../actions";
import { OpportunityForm } from "../../new/page";

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  const { id } = await params;
  const [opportunity, options] = await Promise.all([getCrmOpportunity(actor, id), getCrmOptions(actor)]);
  if (!opportunity) notFound();
  return <div className="max-w-3xl space-y-5"><h1 className="text-3xl font-bold">Modifica opportunità</h1><OpportunityForm options={options} action={updateOpportunityAction.bind(null, id)} defaults={{
    partnerId: opportunity.partnerId,
    pipelineId: opportunity.pipelineId,
    stageId: opportunity.stageId,
    ownerMembershipId: opportunity.ownerMembershipId,
    locationId: opportunity.locationId ?? "",
    expectedCloseDate: opportunity.expectedCloseDate?.toISOString().slice(0, 10) ?? "",
    title: opportunity.title,
    description: opportunity.description ?? "",
    source: opportunity.source ?? "",
    estimatedValue: opportunity.estimatedValue,
    probability: String(opportunity.probability),
    currency: opportunity.currency,
    lostReason: opportunity.lostReason ?? "",
  }}/></div>;
}
