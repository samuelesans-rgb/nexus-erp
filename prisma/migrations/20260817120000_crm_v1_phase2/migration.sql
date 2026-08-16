-- CRM V1 Phase 2: company-scoped pipelines, opportunities, activities and persistent timeline.
CREATE TYPE "CrmStageType" AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'FOLLOW_UP', 'TASK', 'NOTE');
CREATE TYPE "CrmActivityStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CrmActivityPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE UNIQUE INDEX "Membership_companyId_id_key" ON "Membership"("companyId", "id");

CREATE TABLE "CrmPipeline" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmPipeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "type" "CrmStageType" NOT NULL DEFAULT 'OPEN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmStage_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
    CONSTRAINT "CrmStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "ownerMembershipId" TEXT NOT NULL,
    "locationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "estimatedValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "probability" INTEGER NOT NULL,
    "expectedCloseDate" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmOpportunity_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmActivity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT,
    "opportunityId" TEXT,
    "assignedMembershipId" TEXT NOT NULL,
    "createdByMembershipId" TEXT NOT NULL,
    "locationId" TEXT,
    "type" "CrmActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "CrmActivityPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "CrmActivityStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmActivity_reference_check" CHECK ("partnerId" IS NOT NULL OR "opportunityId" IS NOT NULL),
    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "activityId" TEXT,
    "actorMembershipId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmEvent_reference_check" CHECK ("opportunityId" IS NOT NULL OR "activityId" IS NOT NULL),
    CONSTRAINT "CrmEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmPipeline_companyId_code_key" ON "CrmPipeline"("companyId", "code");
CREATE UNIQUE INDEX "CrmPipeline_companyId_id_key" ON "CrmPipeline"("companyId", "id");
CREATE UNIQUE INDEX "CrmPipeline_one_default_per_company" ON "CrmPipeline"("companyId") WHERE "isDefault" = true;
CREATE INDEX "CrmPipeline_companyId_active_isDefault_idx" ON "CrmPipeline"("companyId", "active", "isDefault");

CREATE UNIQUE INDEX "CrmStage_companyId_pipelineId_code_key" ON "CrmStage"("companyId", "pipelineId", "code");
CREATE UNIQUE INDEX "CrmStage_companyId_pipelineId_id_key" ON "CrmStage"("companyId", "pipelineId", "id");
CREATE UNIQUE INDEX "CrmStage_companyId_id_key" ON "CrmStage"("companyId", "id");
CREATE INDEX "CrmStage_companyId_pipelineId_active_sortOrder_idx" ON "CrmStage"("companyId", "pipelineId", "active", "sortOrder");

CREATE UNIQUE INDEX "CrmOpportunity_companyId_id_key" ON "CrmOpportunity"("companyId", "id");
CREATE INDEX "CrmOpportunity_companyId_ownerMembershipId_archivedAt_idx" ON "CrmOpportunity"("companyId", "ownerMembershipId", "archivedAt");
CREATE INDEX "CrmOpportunity_companyId_pipelineId_stageId_archivedAt_idx" ON "CrmOpportunity"("companyId", "pipelineId", "stageId", "archivedAt");
CREATE INDEX "CrmOpportunity_companyId_partnerId_archivedAt_idx" ON "CrmOpportunity"("companyId", "partnerId", "archivedAt");
CREATE INDEX "CrmOpportunity_companyId_locationId_archivedAt_idx" ON "CrmOpportunity"("companyId", "locationId", "archivedAt");
CREATE INDEX "CrmOpportunity_companyId_expectedCloseDate_idx" ON "CrmOpportunity"("companyId", "expectedCloseDate");

CREATE UNIQUE INDEX "CrmActivity_companyId_id_key" ON "CrmActivity"("companyId", "id");
CREATE INDEX "CrmActivity_companyId_assignedMembershipId_status_dueAt_idx" ON "CrmActivity"("companyId", "assignedMembershipId", "status", "dueAt");
CREATE INDEX "CrmActivity_companyId_opportunityId_createdAt_idx" ON "CrmActivity"("companyId", "opportunityId", "createdAt");
CREATE INDEX "CrmActivity_companyId_partnerId_createdAt_idx" ON "CrmActivity"("companyId", "partnerId", "createdAt");
CREATE INDEX "CrmActivity_companyId_locationId_status_dueAt_idx" ON "CrmActivity"("companyId", "locationId", "status", "dueAt");

CREATE UNIQUE INDEX "CrmEvent_companyId_id_key" ON "CrmEvent"("companyId", "id");
CREATE INDEX "CrmEvent_companyId_opportunityId_occurredAt_idx" ON "CrmEvent"("companyId", "opportunityId", "occurredAt");
CREATE INDEX "CrmEvent_companyId_activityId_occurredAt_idx" ON "CrmEvent"("companyId", "activityId", "occurredAt");

ALTER TABLE "CrmPipeline" ADD CONSTRAINT "CrmPipeline_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmStage" ADD CONSTRAINT "CrmStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmStage" ADD CONSTRAINT "CrmStage_companyId_pipelineId_fkey" FOREIGN KEY ("companyId", "pipelineId") REFERENCES "CrmPipeline"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_pipelineId_fkey" FOREIGN KEY ("companyId", "pipelineId") REFERENCES "CrmPipeline"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_pipelineId_stageId_fkey" FOREIGN KEY ("companyId", "pipelineId", "stageId") REFERENCES "CrmStage"("companyId", "pipelineId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_ownerMembershipId_fkey" FOREIGN KEY ("companyId", "ownerMembershipId") REFERENCES "Membership"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_opportunityId_fkey" FOREIGN KEY ("companyId", "opportunityId") REFERENCES "CrmOpportunity"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_assignedMembershipId_fkey" FOREIGN KEY ("companyId", "assignedMembershipId") REFERENCES "Membership"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_createdByMembershipId_fkey" FOREIGN KEY ("companyId", "createdByMembershipId") REFERENCES "Membership"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrmEvent" ADD CONSTRAINT "CrmEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmEvent" ADD CONSTRAINT "CrmEvent_companyId_opportunityId_fkey" FOREIGN KEY ("companyId", "opportunityId") REFERENCES "CrmOpportunity"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmEvent" ADD CONSTRAINT "CrmEvent_companyId_activityId_fkey" FOREIGN KEY ("companyId", "activityId") REFERENCES "CrmActivity"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmEvent" ADD CONSTRAINT "CrmEvent_companyId_actorMembershipId_fkey" FOREIGN KEY ("companyId", "actorMembershipId") REFERENCES "Membership"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
