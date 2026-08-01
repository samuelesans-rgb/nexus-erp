-- CreateEnum
CREATE TYPE "DocumentLinkType" AS ENUM ('QUOTE_TO_ORDER', 'ORDER_TO_DDT', 'DDT_TO_INVOICE', 'ORDER_TO_INVOICE', 'RETURN_TO_CREDIT_NOTE');

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "linkType" "DocumentLinkType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentLink_companyId_sourceDocumentId_createdAt_idx" ON "DocumentLink"("companyId", "sourceDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentLink_companyId_targetDocumentId_createdAt_idx" ON "DocumentLink"("companyId", "targetDocumentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_companyId_sourceDocumentId_targetDocumentId_li_key" ON "DocumentLink"("companyId", "sourceDocumentId", "targetDocumentId", "linkType");

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_companyId_sourceDocumentId_fkey" FOREIGN KEY ("companyId", "sourceDocumentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_companyId_targetDocumentId_fkey" FOREIGN KEY ("companyId", "targetDocumentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
