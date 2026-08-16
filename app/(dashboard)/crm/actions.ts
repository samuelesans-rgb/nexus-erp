"use server";

import { CRM_CAPABILITIES, requireCrmContext } from "@/lib/crm-access";
import { archiveCrmOpportunity, createCrmActivity, createCrmOpportunity, createCrmPipeline, moveCrmOpportunityStage, setCrmActivityStatus, updateCrmOpportunity } from "@/lib/crm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || undefined;
const date = (data: FormData, key: string) => optional(data, key) ? new Date(text(data, key)) : null;

export async function createPipelineAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.PIPELINE_ADMIN);
  await createCrmPipeline(actor, { name: text(data, "name"), code: optional(data, "code"), isDefault: data.get("isDefault") === "on" });
  revalidatePath("/crm"); revalidatePath("/crm/pipelines");
}

export async function createOpportunityAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  const result = await createCrmOpportunity(actor, { partnerId: text(data, "partnerId"), pipelineId: text(data, "pipelineId"), stageId: text(data, "stageId"), ownerMembershipId: optional(data, "ownerMembershipId"), locationId: optional(data, "locationId"), title: text(data, "title"), description: optional(data, "description"), source: optional(data, "source"), estimatedValue: text(data, "estimatedValue"), currency: text(data, "currency") || "EUR", probability: Number(text(data, "probability")), expectedCloseDate: date(data, "expectedCloseDate") });
  revalidatePath("/crm"); redirect(`/crm/opportunities/${result.id}`);
}

export async function updateOpportunityAction(id: string, data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  await updateCrmOpportunity(actor, id, { partnerId: text(data, "partnerId"), pipelineId: text(data, "pipelineId"), stageId: text(data, "stageId"), title: text(data, "title"), description: optional(data, "description"), source: optional(data, "source"), estimatedValue: text(data, "estimatedValue"), currency: text(data, "currency") || "EUR", probability: Number(text(data, "probability")), expectedCloseDate: date(data, "expectedCloseDate"), ownerMembershipId: optional(data, "ownerMembershipId"), locationId: optional(data, "locationId"), lostReason: optional(data, "lostReason") });
  revalidatePath("/crm"); redirect(`/crm/opportunities/${id}`);
}

export async function moveOpportunityAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  const id = text(data, "opportunityId");
  await moveCrmOpportunityStage(actor, id, text(data, "stageId"), optional(data, "lostReason"));
  revalidatePath("/crm"); revalidatePath(`/crm/opportunities/${id}`);
}

export async function archiveOpportunityAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  await archiveCrmOpportunity(actor, text(data, "opportunityId"), data.get("restore") === "true");
  revalidatePath("/crm"); redirect("/crm/opportunities");
}

export async function createActivityAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  await createCrmActivity(actor, { partnerId: optional(data, "partnerId"), opportunityId: optional(data, "opportunityId"), assignedMembershipId: optional(data, "assignedMembershipId"), locationId: optional(data, "locationId"), type: text(data, "type") as "CALL" | "EMAIL" | "MEETING" | "FOLLOW_UP" | "TASK" | "NOTE", subject: text(data, "subject"), description: optional(data, "description"), dueAt: date(data, "dueAt"), priority: (text(data, "priority") || "NORMAL") as "LOW" | "NORMAL" | "HIGH" });
  revalidatePath("/crm");
}

export async function activityStatusAction(data: FormData) {
  const actor = await requireCrmContext(CRM_CAPABILITIES.WRITE);
  await setCrmActivityStatus(actor, text(data, "activityId"), text(data, "status") as "OPEN" | "COMPLETED" | "CANCELLED");
  revalidatePath("/crm");
}
