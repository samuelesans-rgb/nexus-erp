-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'RECEIPT', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'INVENTORY_GAIN', 'INVENTORY_LOSS', 'CONSUMPTION', 'PRODUCTION', 'RETURN_IN', 'RETURN_OUT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InventorySerialStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ISSUED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "InventoryTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseBin" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "binType" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "supplierLot" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySerial" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "status" "InventorySerialStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "binId" TEXT,
    "itemId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "direction" INTEGER NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "lotId" TEXT,
    "serialId" TEXT,
    "unitCost" DECIMAL(15,4),
    "totalCost" DECIMAL(15,2),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "postedById" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "sourceBinId" TEXT,
    "destinationBinId" TEXT,
    "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransferLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,
    "lotId" TEXT,
    "serialId" TEXT,

    CONSTRAINT "InventoryTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "binId" TEXT,
    "code" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "countedAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lotId" TEXT,
    "serialId" TEXT,
    "expectedQuantity" DECIMAL(15,3) NOT NULL,
    "countedQuantity" DECIMAL(15,3) NOT NULL,
    "difference" DECIMAL(15,3) NOT NULL,
    "unitOfMeasureId" TEXT NOT NULL,

    CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "stockValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_companyId_active_deletedAt_idx" ON "Location"("companyId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_code_key" ON "Location"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_companyId_id_key" ON "Location"("companyId", "id");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_locationId_active_deletedAt_idx" ON "Warehouse"("companyId", "locationId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_id_key" ON "Warehouse"("companyId", "id");

-- CreateIndex
CREATE INDEX "WarehouseBin_companyId_warehouseId_active_deletedAt_idx" ON "WarehouseBin"("companyId", "warehouseId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_companyId_warehouseId_code_key" ON "WarehouseBin"("companyId", "warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseBin_companyId_id_key" ON "WarehouseBin"("companyId", "id");

-- CreateIndex
CREATE INDEX "InventoryLot_companyId_expirationDate_active_idx" ON "InventoryLot"("companyId", "expirationDate", "active");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_companyId_itemId_lotNumber_key" ON "InventoryLot"("companyId", "itemId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_companyId_id_key" ON "InventoryLot"("companyId", "id");

-- CreateIndex
CREATE INDEX "InventorySerial_companyId_itemId_status_idx" ON "InventorySerial"("companyId", "itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerial_companyId_serialNumber_key" ON "InventorySerial"("companyId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerial_companyId_id_key" ON "InventorySerial"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_reversalOfId_key" ON "InventoryMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_warehouseId_itemId_postedAt_idx" ON "InventoryMovement"("companyId", "warehouseId", "itemId", "postedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_lotId_postedAt_idx" ON "InventoryMovement"("companyId", "lotId", "postedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_serialId_postedAt_idx" ON "InventoryMovement"("companyId", "serialId", "postedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_referenceType_referenceId_idx" ON "InventoryMovement"("companyId", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_companyId_id_key" ON "InventoryMovement"("companyId", "id");

-- CreateIndex
CREATE INDEX "InventoryTransfer_companyId_status_requestedAt_idx" ON "InventoryTransfer"("companyId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_companyId_code_key" ON "InventoryTransfer"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransfer_companyId_id_key" ON "InventoryTransfer"("companyId", "id");

-- CreateIndex
CREATE INDEX "InventoryTransferLine_companyId_transferId_idx" ON "InventoryTransferLine"("companyId", "transferId");

-- CreateIndex
CREATE INDEX "InventoryCount_companyId_status_createdAt_idx" ON "InventoryCount"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_companyId_code_key" ON "InventoryCount"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_companyId_id_key" ON "InventoryCount"("companyId", "id");

-- CreateIndex
CREATE INDEX "InventoryCountLine_companyId_inventoryCountId_idx" ON "InventoryCountLine"("companyId", "inventoryCountId");

-- CreateIndex
CREATE INDEX "StockBalance_companyId_itemId_idx" ON "StockBalance"("companyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_companyId_warehouseId_itemId_key" ON "StockBalance"("companyId", "warehouseId", "itemId");

-- CreateIndex
CREATE INDEX "DomainEvent_companyId_eventType_processedAt_occurredAt_idx" ON "DomainEvent"("companyId", "eventType", "processedAt", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_aggregateType_aggregateId_idx" ON "DomainEvent"("aggregateType", "aggregateId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_binId_fkey" FOREIGN KEY ("companyId", "binId") REFERENCES "WarehouseBin"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_lotId_fkey" FOREIGN KEY ("companyId", "lotId") REFERENCES "InventoryLot"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_serialId_fkey" FOREIGN KEY ("companyId", "serialId") REFERENCES "InventorySerial"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_sourceWarehouseId_fkey" FOREIGN KEY ("companyId", "sourceWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_destinationWarehouseId_fkey" FOREIGN KEY ("companyId", "destinationWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_sourceBinId_fkey" FOREIGN KEY ("companyId", "sourceBinId") REFERENCES "WarehouseBin"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_companyId_destinationBinId_fkey" FOREIGN KEY ("companyId", "destinationBinId") REFERENCES "WarehouseBin"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_transferId_fkey" FOREIGN KEY ("companyId", "transferId") REFERENCES "InventoryTransfer"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_lotId_fkey" FOREIGN KEY ("companyId", "lotId") REFERENCES "InventoryLot"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransferLine" ADD CONSTRAINT "InventoryTransferLine_companyId_serialId_fkey" FOREIGN KEY ("companyId", "serialId") REFERENCES "InventorySerial"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_companyId_binId_fkey" FOREIGN KEY ("companyId", "binId") REFERENCES "WarehouseBin"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_inventoryCountId_fkey" FOREIGN KEY ("companyId", "inventoryCountId") REFERENCES "InventoryCount"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_unitOfMeasureId_fkey" FOREIGN KEY ("companyId", "unitOfMeasureId") REFERENCES "UnitOfMeasure"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_lotId_fkey" FOREIGN KEY ("companyId", "lotId") REFERENCES "InventoryLot"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountLine" ADD CONSTRAINT "InventoryCountLine_companyId_serialId_fkey" FOREIGN KEY ("companyId", "serialId") REFERENCES "InventorySerial"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
