-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('QUOTE', 'SALES_ORDER', 'PURCHASE_ORDER', 'DELIVERY_NOTE', 'SALES_INVOICE', 'PURCHASE_INVOICE', 'INVENTORY_DOCUMENT', 'RETURN', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'POSTED', 'CANCELLED', 'CLOSED');

-- CreateTable
CREATE TABLE "DocumentSeries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "partnerId" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "postingDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "paymentMethodId" TEXT,
    "paymentTermId" TEXT,
    "priceListId" TEXT,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "internalNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDocumentLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "unitPrice" DECIMAL(15,4) NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vatRateId" TEXT NOT NULL,
    "lineTotal" DECIMAL(15,2) NOT NULL,
    "warehouseId" TEXT,
    "lotId" TEXT,
    "serialId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemCategoryId" TEXT,

    CONSTRAINT "BusinessDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "storageKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromStatus" "DocumentStatus",
    "toStatus" "DocumentStatus",
    "payload" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSeries_companyId_documentType_active_idx" ON "DocumentSeries"("companyId", "documentType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSeries_companyId_code_key" ON "DocumentSeries"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSeries_companyId_id_key" ON "DocumentSeries"("companyId", "id");

-- CreateIndex
CREATE INDEX "BusinessDocument_companyId_status_documentDate_idx" ON "BusinessDocument"("companyId", "status", "documentDate");

-- CreateIndex
CREATE INDEX "BusinessDocument_companyId_documentType_documentDate_idx" ON "BusinessDocument"("companyId", "documentType", "documentDate");

-- CreateIndex
CREATE INDEX "BusinessDocument_companyId_partnerId_documentDate_idx" ON "BusinessDocument"("companyId", "partnerId", "documentDate");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_companyId_seriesId_documentNumber_key" ON "BusinessDocument"("companyId", "seriesId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_companyId_id_key" ON "BusinessDocument"("companyId", "id");

-- CreateIndex
CREATE INDEX "BusinessDocumentLine_companyId_itemId_idx" ON "BusinessDocumentLine"("companyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocumentLine_companyId_documentId_lineNumber_key" ON "BusinessDocumentLine"("companyId", "documentId", "lineNumber");

-- CreateIndex
CREATE INDEX "DocumentAttachment_companyId_documentId_idx" ON "DocumentAttachment"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentEvent_companyId_documentId_createdAt_idx" ON "DocumentEvent"("companyId", "documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_companyId_id_key" ON "Partner"("companyId", "id");

-- AddForeignKey
ALTER TABLE "DocumentSeries" ADD CONSTRAINT "DocumentSeries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_seriesId_fkey" FOREIGN KEY ("companyId", "seriesId") REFERENCES "DocumentSeries"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_paymentMethodId_fkey" FOREIGN KEY ("companyId", "paymentMethodId") REFERENCES "PaymentMethod"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_paymentTermId_fkey" FOREIGN KEY ("companyId", "paymentTermId") REFERENCES "PaymentTerm"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_companyId_priceListId_fkey" FOREIGN KEY ("companyId", "priceListId") REFERENCES "PriceList"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocument" ADD CONSTRAINT "BusinessDocument_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_vatRateId_fkey" FOREIGN KEY ("companyId", "vatRateId") REFERENCES "VatRate"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_lotId_fkey" FOREIGN KEY ("companyId", "lotId") REFERENCES "InventoryLot"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_companyId_serialId_fkey" FOREIGN KEY ("companyId", "serialId") REFERENCES "InventorySerial"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDocumentLine" ADD CONSTRAINT "BusinessDocumentLine_itemCategoryId_fkey" FOREIGN KEY ("itemCategoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
