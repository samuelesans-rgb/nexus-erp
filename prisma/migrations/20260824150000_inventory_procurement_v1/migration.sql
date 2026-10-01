CREATE TABLE "ItemSupplier" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "supplierPartnerId" TEXT NOT NULL,
  "supplierItemCode" TEXT,
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  "purchaseUomId" TEXT NOT NULL,
  "packSize" DECIMAL(15,6) NOT NULL DEFAULT 1,
  "minimumOrderQuantity" DECIMAL(15,3) NOT NULL DEFAULT 1,
  "leadTimeDays" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "unitCost" DECIMAL(15,4) NOT NULL,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemSupplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ItemSupplier_pack_check" CHECK ("packSize" > 0 AND "minimumOrderQuantity" > 0),
  CONSTRAINT "ItemSupplier_lead_check" CHECK ("leadTimeDays" >= 0),
  CONSTRAINT "ItemSupplier_cost_check" CHECK ("unitCost" >= 0),
  CONSTRAINT "ItemSupplier_validity_check" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom"),
  CONSTRAINT "ItemSupplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemSupplier_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemSupplier_companyId_itemId_fkey" FOREIGN KEY ("companyId","itemId") REFERENCES "Item"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemSupplier_companyId_supplierPartnerId_fkey" FOREIGN KEY ("companyId","supplierPartnerId") REFERENCES "Partner"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ItemSupplier_companyId_purchaseUomId_fkey" FOREIGN KEY ("companyId","purchaseUomId") REFERENCES "UnitOfMeasure"("companyId","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ItemSupplier_companyId_id_key" ON "ItemSupplier"("companyId","id");
CREATE UNIQUE INDEX "ItemSupplier_companyId_locationId_itemId_supplierPartnerId_key" ON "ItemSupplier"("companyId","locationId","itemId","supplierPartnerId");
CREATE UNIQUE INDEX "ItemSupplier_one_preferred_active_key" ON "ItemSupplier"("companyId","locationId","itemId") WHERE "preferred" AND "active";
CREATE INDEX "ItemSupplier_companyId_locationId_itemId_active_preferred_idx" ON "ItemSupplier"("companyId","locationId","itemId","active","preferred");
CREATE INDEX "ItemSupplier_companyId_supplierPartnerId_active_idx" ON "ItemSupplier"("companyId","supplierPartnerId","active");

CREATE UNIQUE INDEX "Warehouse_companyId_locationId_id_key" ON "Warehouse"("companyId","locationId","id");

CREATE TABLE "WarehouseItemPolicy" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "minimumStock" DECIMAL(15,3),
  "reorderPoint" DECIMAL(15,3) NOT NULL,
  "targetStock" DECIMAL(15,3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseItemPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarehouseItemPolicy_values_check" CHECK (("minimumStock" IS NULL OR "minimumStock" >= 0) AND "reorderPoint" >= 0 AND ("targetStock" IS NULL OR "targetStock" >= "reorderPoint")),
  CONSTRAINT "WarehouseItemPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WarehouseItemPolicy_companyId_locationId_fkey" FOREIGN KEY ("companyId","locationId") REFERENCES "Location"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WarehouseItemPolicy_companyId_locationId_warehouseId_fkey" FOREIGN KEY ("companyId","locationId","warehouseId") REFERENCES "Warehouse"("companyId","locationId","id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WarehouseItemPolicy_companyId_itemId_fkey" FOREIGN KEY ("companyId","itemId") REFERENCES "Item"("companyId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WarehouseItemPolicy_companyId_id_key" ON "WarehouseItemPolicy"("companyId","id");
CREATE UNIQUE INDEX "WarehouseItemPolicy_companyId_warehouseId_itemId_key" ON "WarehouseItemPolicy"("companyId","warehouseId","itemId");
CREATE INDEX "WarehouseItemPolicy_companyId_locationId_active_idx" ON "WarehouseItemPolicy"("companyId","locationId","active");
