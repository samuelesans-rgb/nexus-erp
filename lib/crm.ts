import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client";
import {
  CRM_CAPABILITIES,
  assertCrmCapability,
  canReadAllCrmOpportunities,
  resolveCrmOwner,
  type CrmActor,
} from "@/lib/crm-access";
import { prisma } from "@/lib/prisma";

export type CrmStageType = "OPEN" | "WON" | "LOST";
export type CrmActivityType = "CALL" | "EMAIL" | "MEETING" | "FOLLOW_UP" | "TASK" | "NOTE";
export type CrmActivityStatus = "OPEN" | "COMPLETED" | "CANCELLED";
export type CrmActivityPriority = "LOW" | "NORMAL" | "HIGH";

export class CrmDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmDomainError";
  }
}

export function crmOpportunityHref(id: string) {
  if (!id) throw new CrmDomainError("ID opportunità obbligatorio.");
  return `/crm/opportunities/${encodeURIComponent(id)}`;
}

export function crmNewOpportunityHref(partnerId: string) {
  if (!partnerId) throw new CrmDomainError("ID partner obbligatorio.");
  return `/crm/opportunities/new?partnerId=${encodeURIComponent(partnerId)}`;
}

type IdRow = { id: string };
type StageRow = { id: string; pipelineId: string; probability: number; type: CrmStageType; name: string };

const now = () => new Date();
const clean = (value?: string | null) => value?.trim() || null;
const probability = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new CrmDomainError("La probabilità deve essere compresa tra 0 e 100.");
  return value;
};
const money = (value: string | number | undefined) => {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new CrmDomainError("Valore opportunità non valido.");
  return normalized;
};
const code = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

function visible(actor: CrmActor, alias = "o") {
  return canReadAllCrmOpportunities(actor.roles)
    ? Prisma.empty
    : Prisma.sql`AND ${Prisma.raw(alias)}."ownerMembershipId" = ${actor.membershipId}`;
}

async function event(
  tx: typeof prisma,
  actor: CrmActor,
  input: { opportunityId?: string; activityId?: string; eventType: string; payload?: Prisma.InputJsonValue },
) {
  await tx.$executeRaw`INSERT INTO "CrmEvent" ("id", "companyId", "opportunityId", "activityId", "actorMembershipId", "eventType", "payload", "occurredAt")
    VALUES (${randomUUID()}, ${actor.companyId}, ${input.opportunityId ?? null}, ${input.activityId ?? null}, ${actor.membershipId}, ${input.eventType}, ${input.payload ? JSON.stringify(input.payload) : null}::jsonb, ${now()})`;
}

export async function createCrmPipeline(actor: CrmActor, input: { name: string; code?: string; isDefault?: boolean }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.PIPELINE_ADMIN);
  const name = clean(input.name);
  const pipelineCode = code(input.code || input.name);
  if (!name || !pipelineCode) throw new CrmDomainError("Nome pipeline obbligatorio.");
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.$executeRaw`UPDATE "CrmPipeline" SET "isDefault" = false, "updatedAt" = ${now()} WHERE "companyId" = ${actor.companyId}`;
    const id = randomUUID();
    await tx.$executeRaw`INSERT INTO "CrmPipeline" ("id", "companyId", "code", "name", "active", "isDefault", "createdAt", "updatedAt") VALUES (${id}, ${actor.companyId}, ${pipelineCode}, ${name}, true, ${Boolean(input.isDefault)}, ${now()}, ${now()})`;
    const defaults: Array<[string, string, number, number, CrmStageType]> = [
      ["QUALIFICATION", "Qualificazione", 10, 10, "OPEN"],
      ["PROPOSAL", "Proposta", 20, 50, "OPEN"],
      ["WON", "Vinta", 90, 100, "WON"],
      ["LOST", "Persa", 100, 0, "LOST"],
    ];
    for (const [stageCode, stageName, sortOrder, stageProbability, type] of defaults) {
      await tx.$executeRaw`INSERT INTO "CrmStage" ("id", "companyId", "pipelineId", "code", "name", "sortOrder", "probability", "type", "active", "createdAt", "updatedAt") VALUES (${randomUUID()}, ${actor.companyId}, ${id}, ${stageCode}, ${stageName}, ${sortOrder}, ${stageProbability}, ${type}::"CrmStageType", true, ${now()}, ${now()})`;
    }
    return { id };
  });
}

export async function createCrmStage(actor: CrmActor, input: { pipelineId: string; name: string; code?: string; sortOrder: number; probability: number; type?: CrmStageType; color?: string }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.PIPELINE_ADMIN);
  const pipelines = await prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "CrmPipeline" WHERE "companyId" = ${actor.companyId} AND "id" = ${input.pipelineId}`;
  if (!pipelines[0]) throw new CrmDomainError("Pipeline non valida.");
  const id = randomUUID();
  await prisma.$executeRaw`INSERT INTO "CrmStage" ("id", "companyId", "pipelineId", "code", "name", "sortOrder", "probability", "color", "type", "active", "createdAt", "updatedAt") VALUES (${id}, ${actor.companyId}, ${input.pipelineId}, ${code(input.code || input.name)}, ${input.name.trim()}, ${input.sortOrder}, ${probability(input.probability)}, ${clean(input.color)}, ${input.type ?? "OPEN"}::"CrmStageType", true, ${now()}, ${now()})`;
  return { id };
}

export async function getCrmPipelines(actor: CrmActor) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  return prisma.$queryRaw<Array<{ id: string; code: string; name: string; active: boolean; isDefault: boolean; stages: unknown }>>`
    SELECT p."id", p."code", p."name", p."active", p."isDefault",
      COALESCE(json_agg(json_build_object('id', s."id", 'name', s."name", 'code', s."code", 'sortOrder', s."sortOrder", 'probability', s."probability", 'type', s."type", 'color', s."color") ORDER BY s."sortOrder") FILTER (WHERE s."id" IS NOT NULL), '[]') AS stages
    FROM "CrmPipeline" p LEFT JOIN "CrmStage" s ON s."companyId" = p."companyId" AND s."pipelineId" = p."id" AND s."active" = true
    WHERE p."companyId" = ${actor.companyId} GROUP BY p."id" ORDER BY p."isDefault" DESC, p."name"`;
}

export async function getCrmOptions(actor: CrmActor) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  const [partners, memberships, locations, pipelines] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT "id", "name" FROM "Partner" WHERE "companyId" = ${actor.companyId} AND "active" = true ORDER BY "name"`,
    prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT m."id", concat_ws(' ', u."firstName", u."lastName") AS "name" FROM "Membership" m JOIN "User" u ON u."id" = m."userId" WHERE m."companyId" = ${actor.companyId} AND m."active" = true ORDER BY concat_ws(' ', u."firstName", u."lastName")`,
    prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT "id", "name" FROM "Location" WHERE "companyId" = ${actor.companyId} AND "active" = true ORDER BY "name"`,
    getCrmPipelines(actor),
  ]);
  return { partners, memberships, locations, pipelines };
}

async function refs(actor: CrmActor, input: { partnerId: string; pipelineId: string; stageId: string; ownerMembershipId: string; locationId?: string | null }) {
  const [partner, stage, owner, location] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Partner" WHERE "companyId" = ${actor.companyId} AND "id" = ${input.partnerId} AND "active" = true`,
    prisma.$queryRaw<StageRow[]>`SELECT "id", "pipelineId", "probability", "type", "name" FROM "CrmStage" WHERE "companyId" = ${actor.companyId} AND "pipelineId" = ${input.pipelineId} AND "id" = ${input.stageId} AND "active" = true`,
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Membership" WHERE "companyId" = ${actor.companyId} AND "id" = ${input.ownerMembershipId} AND "active" = true`,
    input.locationId ? prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Location" WHERE "companyId" = ${actor.companyId} AND "id" = ${input.locationId} AND "active" = true` : Promise.resolve([{ id: "none" }]),
  ]);
  if (!partner[0] || !stage[0] || !owner[0] || !location[0]) throw new CrmDomainError("Riferimento CRM non valido per questa azienda.");
  return stage[0];
}

export async function createCrmOpportunity(actor: CrmActor, input: { partnerId: string; pipelineId: string; stageId: string; ownerMembershipId?: string | null; locationId?: string | null; title: string; description?: string; source?: string; estimatedValue?: string | number; currency?: string; probability?: number; expectedCloseDate?: Date | null }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  const ownerId = resolveCrmOwner(actor.roles, actor.membershipId, input.ownerMembershipId);
  const stage = await refs(actor, { ...input, ownerMembershipId: ownerId });
  if (stage.type !== "OPEN") throw new CrmDomainError("Una nuova opportunità deve iniziare in uno stage aperto.");
  const title = clean(input.title);
  if (!title) throw new CrmDomainError("Titolo opportunità obbligatorio.");
  const id = randomUUID();
  const at = now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "CrmOpportunity" ("id", "companyId", "partnerId", "pipelineId", "stageId", "ownerMembershipId", "locationId", "title", "description", "source", "estimatedValue", "currency", "probability", "expectedCloseDate", "createdAt", "updatedAt") VALUES (${id}, ${actor.companyId}, ${input.partnerId}, ${input.pipelineId}, ${input.stageId}, ${ownerId}, ${input.locationId ?? null}, ${title}, ${clean(input.description)}, ${clean(input.source)}, ${money(input.estimatedValue)}::decimal, ${(input.currency || "EUR").trim().toUpperCase()}, ${probability(input.probability ?? stage.probability)}, ${input.expectedCloseDate ?? null}, ${at}, ${at})`;
    await event(tx as typeof prisma, actor, { opportunityId: id, eventType: "OPPORTUNITY_CREATED", payload: { stageId: input.stageId } });
  });
  return { id };
}

type OpportunityRow = { id: string; companyId: string; partnerId: string; pipelineId: string; stageId: string; ownerMembershipId: string; locationId: string | null; title: string; description: string | null; source: string | null; estimatedValue: string; currency: string; probability: number; expectedCloseDate: Date | null; wonAt: Date | null; lostAt: Date | null; lostReason: string | null; archivedAt: Date | null; stageType: CrmStageType; partnerName: string; pipelineName: string; stageName: string; ownerName: string; locationName: string | null; nextActivity: unknown };

const opportunitySelect = Prisma.sql`SELECT o.*, o."estimatedValue"::text AS "estimatedValue", s."type" AS "stageType", p."name" AS "partnerName", pl."name" AS "pipelineName", s."name" AS "stageName", concat_ws(' ', u."firstName", u."lastName") AS "ownerName", l."name" AS "locationName",
  (SELECT json_build_object('id', a."id", 'subject', a."subject", 'dueAt', a."dueAt", 'type', a."type") FROM "CrmActivity" a WHERE a."companyId" = o."companyId" AND a."opportunityId" = o."id" AND a."status" = 'OPEN' ORDER BY a."dueAt" NULLS LAST, a."createdAt" LIMIT 1) AS "nextActivity"
  FROM "CrmOpportunity" o JOIN "Partner" p ON p."companyId" = o."companyId" AND p."id" = o."partnerId" JOIN "CrmPipeline" pl ON pl."companyId" = o."companyId" AND pl."id" = o."pipelineId" JOIN "CrmStage" s ON s."companyId" = o."companyId" AND s."id" = o."stageId" JOIN "Membership" m ON m."companyId" = o."companyId" AND m."id" = o."ownerMembershipId" JOIN "User" u ON u."id" = m."userId" LEFT JOIN "Location" l ON l."companyId" = o."companyId" AND l."id" = o."locationId"`;

export async function getCrmOpportunities(actor: CrmActor, filters: { pipelineId?: string; ownerMembershipId?: string; locationId?: string; includeArchived?: boolean; partnerId?: string } = {}) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  return prisma.$queryRaw<OpportunityRow[]>(Prisma.sql`${opportunitySelect} WHERE o."companyId" = ${actor.companyId} ${visible(actor)} ${filters.pipelineId ? Prisma.sql`AND o."pipelineId" = ${filters.pipelineId}` : Prisma.empty} ${filters.ownerMembershipId ? Prisma.sql`AND o."ownerMembershipId" = ${filters.ownerMembershipId}` : Prisma.empty} ${filters.locationId ? Prisma.sql`AND o."locationId" = ${filters.locationId}` : Prisma.empty} ${filters.partnerId ? Prisma.sql`AND o."partnerId" = ${filters.partnerId}` : Prisma.empty} ${filters.includeArchived ? Prisma.empty : Prisma.sql`AND o."archivedAt" IS NULL`} ORDER BY s."sortOrder", o."updatedAt" DESC`);
}

export async function getCrmOpportunity(actor: CrmActor, id: string) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  const rows = await prisma.$queryRaw<OpportunityRow[]>(Prisma.sql`${opportunitySelect} WHERE o."companyId" = ${actor.companyId} AND o."id" = ${id} ${visible(actor)} LIMIT 1`);
  return rows[0] ?? null;
}

async function mutable(actor: CrmActor, id: string) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  const opportunity = await getCrmOpportunity(actor, id);
  if (!opportunity) throw new CrmDomainError("Opportunità non trovata o non accessibile.");
  return opportunity;
}

export async function updateCrmOpportunity(actor: CrmActor, id: string, input: { partnerId?: string; pipelineId?: string; stageId?: string; title: string; description?: string; source?: string; estimatedValue?: string | number; currency?: string; probability: number; expectedCloseDate?: Date | null; ownerMembershipId?: string; locationId?: string | null; lostReason?: string | null }) {
  const current = await mutable(actor, id);
  const ownerId = resolveCrmOwner(actor.roles, actor.membershipId, input.ownerMembershipId || current.ownerMembershipId);
  const partnerId = input.partnerId || current.partnerId;
  const pipelineId = input.pipelineId || current.pipelineId;
  const stageId = input.stageId || current.stageId;
  const stage = await refs(actor, { partnerId, pipelineId, stageId, ownerMembershipId: ownerId, locationId: input.locationId });
  const lostReason = stage.type === "LOST" ? clean(input.lostReason) || current.lostReason : null;
  if (stage.type === "LOST" && !lostReason) throw new CrmDomainError("Motivo perdita obbligatorio.");
  const stageChanged = stageId !== current.stageId;
  const at = now();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "CrmOpportunity" SET "partnerId" = ${partnerId}, "pipelineId" = ${pipelineId}, "stageId" = ${stageId}, "title" = ${input.title.trim()}, "description" = ${clean(input.description)}, "source" = ${clean(input.source)}, "estimatedValue" = ${money(input.estimatedValue)}::decimal, "currency" = ${(input.currency || "EUR").trim().toUpperCase()}, "probability" = ${probability(input.probability)}, "expectedCloseDate" = ${input.expectedCloseDate ?? null}, "ownerMembershipId" = ${ownerId}, "locationId" = ${input.locationId ?? null}, "wonAt" = ${stageChanged ? (stage.type === "WON" ? at : null) : current.wonAt}, "lostAt" = ${stageChanged ? (stage.type === "LOST" ? at : null) : current.lostAt}, "lostReason" = ${lostReason}, "updatedAt" = ${at} WHERE "companyId" = ${actor.companyId} AND "id" = ${id}`;
    await event(tx as typeof prisma, actor, { opportunityId: id, eventType: "OPPORTUNITY_UPDATED" });
  });
}
export async function moveCrmOpportunityStage(actor: CrmActor, id: string, stageId: string, lostReason?: string) {
  const current = await mutable(actor, id);
  const stages = await prisma.$queryRaw<StageRow[]>`SELECT "id", "pipelineId", "probability", "type", "name" FROM "CrmStage" WHERE "companyId" = ${actor.companyId} AND "pipelineId" = ${current.pipelineId} AND "id" = ${stageId} AND "active" = true`;
  const stage = stages[0];
  if (!stage) throw new CrmDomainError("Stage non valido per la pipeline.");
  if (stage.type === "LOST" && !clean(lostReason)) throw new CrmDomainError("Motivo perdita obbligatorio.");
  const at = now();
  const eventType = current.stageType !== "OPEN" && stage.type === "OPEN" ? "OPPORTUNITY_REOPENED" : stage.type === "WON" ? "OPPORTUNITY_WON" : stage.type === "LOST" ? "OPPORTUNITY_LOST" : "OPPORTUNITY_STAGE_CHANGED";
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "CrmOpportunity" SET "stageId" = ${stage.id}, "probability" = ${stage.probability}, "wonAt" = ${stage.type === "WON" ? at : null}, "lostAt" = ${stage.type === "LOST" ? at : null}, "lostReason" = ${stage.type === "LOST" ? clean(lostReason) : null}, "updatedAt" = ${at} WHERE "companyId" = ${actor.companyId} AND "id" = ${id}`;
    await event(tx as typeof prisma, actor, { opportunityId: id, eventType, payload: { fromStageId: current.stageId, toStageId: stage.id } });
  });
}

export const markCrmOpportunity = moveCrmOpportunityStage;
export const reopenCrmOpportunity = moveCrmOpportunityStage;

export async function archiveCrmOpportunity(actor: CrmActor, id: string, restore = false) {
  await mutable(actor, id);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "CrmOpportunity" SET "archivedAt" = ${restore ? null : now()}, "updatedAt" = ${now()} WHERE "companyId" = ${actor.companyId} AND "id" = ${id}`;
    await event(tx as typeof prisma, actor, { opportunityId: id, eventType: restore ? "OPPORTUNITY_RESTORED" : "OPPORTUNITY_ARCHIVED" });
  });
}

type ActivityRow = { id: string; companyId: string; partnerId: string | null; opportunityId: string | null; assignedMembershipId: string; createdByMembershipId: string; locationId: string | null; type: CrmActivityType; subject: string; description: string | null; dueAt: Date | null; priority: CrmActivityPriority; status: CrmActivityStatus; completedAt: Date | null; createdAt: Date; assignedName: string; partnerName: string | null; opportunityTitle: string | null };

export async function createCrmActivity(actor: CrmActor, input: { partnerId?: string | null; opportunityId?: string | null; assignedMembershipId?: string | null; locationId?: string | null; type: CrmActivityType; subject: string; description?: string; dueAt?: Date | null; priority?: CrmActivityPriority }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  let partnerId = input.partnerId || null;
  if (input.opportunityId) {
    const opportunity = await mutable(actor, input.opportunityId);
    if (partnerId && partnerId !== opportunity.partnerId) throw new CrmDomainError("Il Partner dell'attività non coincide con quello dell'opportunità.");
    partnerId = opportunity.partnerId;
  }
  if (!partnerId) throw new CrmDomainError("Partner o opportunità obbligatori.");
  const ownerId = resolveCrmOwner(actor.roles, actor.membershipId, input.assignedMembershipId);
  const [partner, owner, location] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Partner" WHERE "companyId" = ${actor.companyId} AND "id" = ${partnerId}`,
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Membership" WHERE "companyId" = ${actor.companyId} AND "id" = ${ownerId} AND "active" = true`,
    input.locationId ? prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Location" WHERE "companyId" = ${actor.companyId} AND "id" = ${input.locationId}` : Promise.resolve([{ id: "none" }]),
  ]);
  if (!partner[0] || !owner[0] || !location[0]) throw new CrmDomainError("Riferimento attività non valido per questa azienda.");
  const id = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "CrmActivity" ("id", "companyId", "partnerId", "opportunityId", "assignedMembershipId", "createdByMembershipId", "locationId", "type", "subject", "description", "dueAt", "priority", "status", "createdAt", "updatedAt") VALUES (${id}, ${actor.companyId}, ${partnerId}, ${input.opportunityId ?? null}, ${ownerId}, ${actor.membershipId}, ${input.locationId ?? null}, ${input.type}::"CrmActivityType", ${input.subject.trim()}, ${clean(input.description)}, ${input.dueAt ?? null}, ${input.priority ?? "NORMAL"}::"CrmActivityPriority", 'OPEN', ${now()}, ${now()})`;
    await event(tx as typeof prisma, actor, { opportunityId: input.opportunityId || undefined, activityId: id, eventType: "ACTIVITY_CREATED" });
  });
  return { id };
}

export async function updateCrmActivity(actor: CrmActor, id: string, input: { partnerId?: string | null; opportunityId?: string | null; assignedMembershipId?: string | null; locationId?: string | null }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  const rows = await prisma.$queryRaw<Array<{ partnerId: string | null; opportunityId: string | null; assignedMembershipId: string; locationId: string | null }>>`SELECT "partnerId", "opportunityId", "assignedMembershipId", "locationId" FROM "CrmActivity" WHERE "companyId" = ${actor.companyId} AND "id" = ${id} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND "assignedMembershipId" = ${actor.membershipId}`}`;
  const current = rows[0];
  if (!current) throw new CrmDomainError("Attività non trovata o non accessibile.");
  const opportunityId = Object.hasOwn(input, "opportunityId") ? input.opportunityId || null : current.opportunityId;
  let partnerId = Object.hasOwn(input, "partnerId") ? input.partnerId || null : current.partnerId;
  if (opportunityId) {
    const opportunity = await mutable(actor, opportunityId);
    if (partnerId && partnerId !== opportunity.partnerId) throw new CrmDomainError("Il Partner dell'attività non coincide con quello dell'opportunità.");
    partnerId = opportunity.partnerId;
  }
  if (!partnerId) throw new CrmDomainError("Partner o opportunità obbligatori.");
  const assignedMembershipId = resolveCrmOwner(actor.roles, actor.membershipId, input.assignedMembershipId || current.assignedMembershipId);
  const locationId = Object.hasOwn(input, "locationId") ? input.locationId || null : current.locationId;
  const [partner, owner, location] = await Promise.all([
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Partner" WHERE "companyId" = ${actor.companyId} AND "id" = ${partnerId}`,
    prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Membership" WHERE "companyId" = ${actor.companyId} AND "id" = ${assignedMembershipId} AND "active" = true`,
    locationId ? prisma.$queryRaw<IdRow[]>`SELECT "id" FROM "Location" WHERE "companyId" = ${actor.companyId} AND "id" = ${locationId}` : Promise.resolve([{ id: "none" }]),
  ]);
  if (!partner[0] || !owner[0] || !location[0]) throw new CrmDomainError("Riferimento attività non valido per questa azienda.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "CrmActivity" SET "partnerId" = ${partnerId}, "opportunityId" = ${opportunityId}, "assignedMembershipId" = ${assignedMembershipId}, "locationId" = ${locationId}, "updatedAt" = ${now()} WHERE "companyId" = ${actor.companyId} AND "id" = ${id}`;
    await event(tx as typeof prisma, actor, { opportunityId: opportunityId || undefined, activityId: id, eventType: "ACTIVITY_UPDATED" });
  });
}

export async function setCrmActivityStatus(actor: CrmActor, id: string, status: CrmActivityStatus) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.WRITE);
  const rows = await prisma.$queryRaw<Array<{ id: string; opportunityId: string | null; assignedMembershipId: string }>>`SELECT a."id", a."opportunityId", a."assignedMembershipId" FROM "CrmActivity" a WHERE a."companyId" = ${actor.companyId} AND a."id" = ${id} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND a."assignedMembershipId" = ${actor.membershipId}`}`;
  if (!rows[0]) throw new CrmDomainError("Attività non trovata o non accessibile.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "CrmActivity" SET "status" = ${status}::"CrmActivityStatus", "completedAt" = ${status === "COMPLETED" ? now() : null}, "updatedAt" = ${now()} WHERE "companyId" = ${actor.companyId} AND "id" = ${id}`;
    await event(tx as typeof prisma, actor, { opportunityId: rows[0].opportunityId || undefined, activityId: id, eventType: `ACTIVITY_${status}` });
  });
}

export async function getCrmActivities(actor: CrmActor, filters: { opportunityId?: string; partnerId?: string; status?: CrmActivityStatus } = {}) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  return prisma.$queryRaw<ActivityRow[]>(Prisma.sql`SELECT a.*, concat_ws(' ', u."firstName", u."lastName") AS "assignedName", p."name" AS "partnerName", o."title" AS "opportunityTitle" FROM "CrmActivity" a JOIN "Membership" m ON m."companyId" = a."companyId" AND m."id" = a."assignedMembershipId" JOIN "User" u ON u."id" = m."userId" LEFT JOIN "Partner" p ON p."companyId" = a."companyId" AND p."id" = a."partnerId" LEFT JOIN "CrmOpportunity" o ON o."companyId" = a."companyId" AND o."id" = a."opportunityId" WHERE a."companyId" = ${actor.companyId} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND a."assignedMembershipId" = ${actor.membershipId}`} ${filters.opportunityId ? Prisma.sql`AND a."opportunityId" = ${filters.opportunityId}` : Prisma.empty} ${filters.partnerId ? Prisma.sql`AND a."partnerId" = ${filters.partnerId}` : Prisma.empty} ${filters.status ? Prisma.sql`AND a."status" = ${filters.status}::"CrmActivityStatus"` : Prisma.empty} ORDER BY a."dueAt" NULLS LAST, a."createdAt" DESC`);
}

export async function getCrmTimeline(actor: CrmActor, input: { opportunityId?: string; partnerId?: string }) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  if (input.opportunityId && !(await getCrmOpportunity(actor, input.opportunityId))) return [];
  return prisma.$queryRaw<Array<{ id: string; eventType: string; payload: unknown; occurredAt: Date; actorName: string; opportunityId: string | null; activityId: string | null }>>(Prisma.sql`SELECT e."id", e."eventType", e."payload", e."occurredAt", concat_ws(' ', u."firstName", u."lastName") AS "actorName", e."opportunityId", e."activityId" FROM "CrmEvent" e JOIN "Membership" m ON m."companyId" = e."companyId" AND m."id" = e."actorMembershipId" JOIN "User" u ON u."id" = m."userId" LEFT JOIN "CrmOpportunity" o ON o."companyId" = e."companyId" AND o."id" = e."opportunityId" LEFT JOIN "CrmActivity" a ON a."companyId" = e."companyId" AND a."id" = e."activityId" WHERE e."companyId" = ${actor.companyId} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND COALESCE(o."ownerMembershipId", a."assignedMembershipId") = ${actor.membershipId}`} ${input.opportunityId ? Prisma.sql`AND e."opportunityId" = ${input.opportunityId}` : Prisma.empty} ${input.partnerId ? Prisma.sql`AND COALESCE(o."partnerId", a."partnerId") = ${input.partnerId}` : Prisma.empty} ORDER BY e."occurredAt" DESC`);
}

export async function getCrmDashboard(actor: CrmActor) {
  assertCrmCapability(actor.roles, CRM_CAPABILITIES.READ);
  const scope = visible(actor);
  const [summary, stages, owners, activities] = await Promise.all([
    prisma.$queryRaw<Array<{ openCount: number; wonCount: number; lostCount: number; pipelineValue: string; weightedValue: string; conversionRate: string }>>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE s."type" = 'OPEN')::int AS "openCount", COUNT(*) FILTER (WHERE s."type" = 'WON')::int AS "wonCount", COUNT(*) FILTER (WHERE s."type" = 'LOST')::int AS "lostCount", COALESCE(SUM(o."estimatedValue") FILTER (WHERE s."type" = 'OPEN'), 0)::text AS "pipelineValue", COALESCE(SUM(o."estimatedValue" * o."probability" / 100) FILTER (WHERE s."type" = 'OPEN'), 0)::text AS "weightedValue", CASE WHEN COUNT(*) FILTER (WHERE s."type" IN ('WON','LOST')) = 0 THEN '0' ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE s."type" = 'WON') / COUNT(*) FILTER (WHERE s."type" IN ('WON','LOST')), 2)::text END AS "conversionRate" FROM "CrmOpportunity" o JOIN "CrmStage" s ON s."companyId" = o."companyId" AND s."id" = o."stageId" WHERE o."companyId" = ${actor.companyId} AND o."archivedAt" IS NULL ${scope}`),
    prisma.$queryRaw<Array<{ id: string; name: string; count: number; value: string }>>(Prisma.sql`SELECT s."id", s."name", COUNT(o."id")::int AS count, COALESCE(SUM(o."estimatedValue"), 0)::text AS value FROM "CrmStage" s LEFT JOIN "CrmOpportunity" o ON o."companyId" = s."companyId" AND o."stageId" = s."id" AND o."archivedAt" IS NULL ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND o."ownerMembershipId" = ${actor.membershipId}`} WHERE s."companyId" = ${actor.companyId} AND s."active" = true GROUP BY s."id" ORDER BY s."sortOrder"`),
    prisma.$queryRaw<Array<{ id: string; name: string; count: number; value: string }>>(Prisma.sql`SELECT m."id", concat_ws(' ', u."firstName", u."lastName") AS "name", COUNT(o."id")::int AS count, COALESCE(SUM(o."estimatedValue"), 0)::text AS value FROM "Membership" m JOIN "User" u ON u."id" = m."userId" LEFT JOIN "CrmOpportunity" o ON o."companyId" = m."companyId" AND o."ownerMembershipId" = m."id" AND o."archivedAt" IS NULL WHERE m."companyId" = ${actor.companyId} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND m."id" = ${actor.membershipId}`} GROUP BY m."id", concat_ws(' ', u."firstName", u."lastName") ORDER BY concat_ws(' ', u."firstName", u."lastName")`),
    prisma.$queryRaw<Array<{ overdue: number; today: number; upcoming: number }>>(Prisma.sql`SELECT COUNT(*) FILTER (WHERE "status" = 'OPEN' AND "dueAt" < CURRENT_DATE)::int AS overdue, COUNT(*) FILTER (WHERE "status" = 'OPEN' AND "dueAt" >= CURRENT_DATE AND "dueAt" < CURRENT_DATE + INTERVAL '1 day')::int AS today, COUNT(*) FILTER (WHERE "status" = 'OPEN' AND "dueAt" >= CURRENT_DATE + INTERVAL '1 day')::int AS upcoming FROM "CrmActivity" WHERE "companyId" = ${actor.companyId} ${canReadAllCrmOpportunities(actor.roles) ? Prisma.empty : Prisma.sql`AND "assignedMembershipId" = ${actor.membershipId}`}`),
  ]);
  return { summary: summary[0], stages, owners, activities: activities[0] };
}

export async function getPartnerCrmSummary(actor: CrmActor, partnerId: string) {
  const [opportunities, activities, timeline, totals] = await Promise.all([
    getCrmOpportunities(actor, { partnerId }),
    getCrmActivities(actor, { partnerId }),
    getCrmTimeline(actor, { partnerId }),
    prisma.$queryRaw<Array<{ openCount: number; openValue: string }>>(Prisma.sql`SELECT COUNT(*)::int AS "openCount", COALESCE(SUM(o."estimatedValue"), 0)::text AS "openValue" FROM "CrmOpportunity" o JOIN "CrmStage" s ON s."companyId" = o."companyId" AND s."id" = o."stageId" WHERE o."companyId" = ${actor.companyId} AND o."partnerId" = ${partnerId} AND o."archivedAt" IS NULL AND s."type" = 'OPEN' ${visible(actor)}`),
  ]);
  return {
    opportunities,
    activities,
    timeline,
    openCount: totals[0].openCount,
    openValue: totals[0].openValue,
  };
}
