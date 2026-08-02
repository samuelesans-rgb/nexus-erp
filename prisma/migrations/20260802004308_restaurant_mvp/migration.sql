-- CreateEnum
CREATE TYPE "RestaurantTableStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'DIRTY', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "RestaurantReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'WAITLIST');

-- CreateEnum
CREATE TYPE "RestaurantReservationSource" AS ENUM ('PHONE', 'WALK_IN', 'WEBSITE', 'MANUAL', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "RestaurantOrderStatus" AS ENUM ('OPEN', 'SENT', 'IN_PROGRESS', 'READY', 'SERVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RestaurantServiceType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'EVENT');

-- CreateEnum
CREATE TYPE "RestaurantPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RestaurantOrderLineStatus" AS ENUM ('NEW', 'SENT', 'IN_PREPARATION', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KitchenTicketStatus" AS ENUM ('NEW', 'IN_PREPARATION', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RestaurantArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "minSeats" INTEGER,
    "maxSeats" INTEGER,
    "shape" TEXT,
    "positionX" DECIMAL(10,2),
    "positionY" DECIMAL(10,2),
    "width" DECIMAL(10,2),
    "height" DECIMAL(10,2),
    "status" "RestaurantTableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "combinable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "partnerId" TEXT,
    "guestName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "reservationDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "partySize" INTEGER NOT NULL,
    "status" "RestaurantReservationStatus" NOT NULL DEFAULT 'PENDING',
    "source" "RestaurantReservationSource" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "internalNotes" TEXT,
    "depositAmount" DECIMAL(15,2),
    "depositScheduleId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantReservationTable" (
    "companyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestaurantReservationTable_pkey" PRIMARY KEY ("companyId","reservationId","tableId")
);

-- CreateTable
CREATE TABLE "RestaurantMenu" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantMenuSection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RestaurantMenuSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantMenuItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "menuSectionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "priceOverride" DECIMAL(15,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reservationId" TEXT,
    "tableId" TEXT,
    "partnerId" TEXT,
    "status" "RestaurantOrderStatus" NOT NULL DEFAULT 'OPEN',
    "serviceType" "RestaurantServiceType" NOT NULL DEFAULT 'DINE_IN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "documentId" TEXT,
    "paymentStatus" "RestaurantPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrderLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "unitPrice" DECIMAL(15,4) NOT NULL,
    "vatRateId" TEXT NOT NULL,
    "status" "RestaurantOrderLineStatus" NOT NULL DEFAULT 'NEW',
    "courseNumber" INTEGER,
    "seatNumber" INTEGER,
    "notes" TEXT,
    "kitchenNotes" TEXT,
    "sentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantOrderLineModifier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "RestaurantOrderLineModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenStationAssignment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kitchenStationId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemCategoryId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KitchenStationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "kitchenStationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "KitchenTicketStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenTicketLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "status" "KitchenTicketStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KitchenTicketLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeConsumption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "recipeItemId" TEXT NOT NULL,
    "inventoryMovementId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantArea_companyId_locationId_active_deletedAt_idx" ON "RestaurantArea"("companyId", "locationId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantArea_companyId_locationId_code_key" ON "RestaurantArea"("companyId", "locationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantArea_companyId_id_key" ON "RestaurantArea"("companyId", "id");

-- CreateIndex
CREATE INDEX "RestaurantTable_companyId_locationId_status_deletedAt_idx" ON "RestaurantTable"("companyId", "locationId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_companyId_locationId_code_key" ON "RestaurantTable"("companyId", "locationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_companyId_id_key" ON "RestaurantTable"("companyId", "id");

-- CreateIndex
CREATE INDEX "RestaurantReservation_companyId_locationId_reservationDate__idx" ON "RestaurantReservation"("companyId", "locationId", "reservationDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantReservation_companyId_code_key" ON "RestaurantReservation"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantReservation_companyId_id_key" ON "RestaurantReservation"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantReservation_companyId_depositScheduleId_key" ON "RestaurantReservation"("companyId", "depositScheduleId");

-- CreateIndex
CREATE INDEX "RestaurantReservationTable_companyId_tableId_idx" ON "RestaurantReservationTable"("companyId", "tableId");

-- CreateIndex
CREATE INDEX "RestaurantMenu_companyId_locationId_active_deletedAt_idx" ON "RestaurantMenu"("companyId", "locationId", "active", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenu_companyId_code_key" ON "RestaurantMenu"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenu_companyId_id_key" ON "RestaurantMenu"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenuSection_companyId_menuId_name_key" ON "RestaurantMenuSection"("companyId", "menuId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenuSection_companyId_id_key" ON "RestaurantMenuSection"("companyId", "id");

-- CreateIndex
CREATE INDEX "RestaurantMenuItem_companyId_itemId_idx" ON "RestaurantMenuItem"("companyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantMenuItem_companyId_menuSectionId_itemId_key" ON "RestaurantMenuItem"("companyId", "menuSectionId", "itemId");

-- CreateIndex
CREATE INDEX "RestaurantOrder_companyId_locationId_status_idx" ON "RestaurantOrder"("companyId", "locationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_companyId_locationId_code_key" ON "RestaurantOrder"("companyId", "locationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_companyId_id_key" ON "RestaurantOrder"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrder_companyId_documentId_key" ON "RestaurantOrder"("companyId", "documentId");

-- CreateIndex
CREATE INDEX "RestaurantOrderLine_companyId_orderId_status_idx" ON "RestaurantOrderLine"("companyId", "orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantOrderLine_companyId_id_key" ON "RestaurantOrderLine"("companyId", "id");

-- CreateIndex
CREATE INDEX "RestaurantOrderLineModifier_companyId_orderLineId_idx" ON "RestaurantOrderLineModifier"("companyId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_companyId_locationId_code_key" ON "KitchenStation"("companyId", "locationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_companyId_id_key" ON "KitchenStation"("companyId", "id");

-- CreateIndex
CREATE INDEX "KitchenStationAssignment_companyId_kitchenStationId_active_idx" ON "KitchenStationAssignment"("companyId", "kitchenStationId", "active");

-- CreateIndex
CREATE INDEX "KitchenTicket_companyId_kitchenStationId_status_createdAt_idx" ON "KitchenTicket"("companyId", "kitchenStationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicket_companyId_id_key" ON "KitchenTicket"("companyId", "id");

-- CreateIndex
CREATE INDEX "KitchenTicketLine_companyId_orderLineId_idx" ON "KitchenTicketLine"("companyId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicketLine_companyId_ticketId_orderLineId_key" ON "KitchenTicketLine"("companyId", "ticketId", "orderLineId");

-- CreateIndex
CREATE INDEX "RecipeConsumption_companyId_orderId_idx" ON "RecipeConsumption"("companyId", "orderId");

-- CreateIndex
CREATE INDEX "RecipeConsumption_companyId_inventoryMovementId_idx" ON "RecipeConsumption"("companyId", "inventoryMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeConsumption_companyId_orderLineId_componentItemId_key" ON "RecipeConsumption"("companyId", "orderLineId", "componentItemId");

-- AddForeignKey
ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_companyId_areaId_fkey" FOREIGN KEY ("companyId", "areaId") REFERENCES "RestaurantArea"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "RestaurantReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "RestaurantReservation_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "RestaurantReservation_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservation" ADD CONSTRAINT "RestaurantReservation_companyId_depositScheduleId_fkey" FOREIGN KEY ("companyId", "depositScheduleId") REFERENCES "PaymentSchedule"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservationTable" ADD CONSTRAINT "RestaurantReservationTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservationTable" ADD CONSTRAINT "RestaurantReservationTable_companyId_reservationId_fkey" FOREIGN KEY ("companyId", "reservationId") REFERENCES "RestaurantReservation"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantReservationTable" ADD CONSTRAINT "RestaurantReservationTable_companyId_tableId_fkey" FOREIGN KEY ("companyId", "tableId") REFERENCES "RestaurantTable"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenu" ADD CONSTRAINT "RestaurantMenu_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenu" ADD CONSTRAINT "RestaurantMenu_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuSection" ADD CONSTRAINT "RestaurantMenuSection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuSection" ADD CONSTRAINT "RestaurantMenuSection_companyId_menuId_fkey" FOREIGN KEY ("companyId", "menuId") REFERENCES "RestaurantMenu"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuItem" ADD CONSTRAINT "RestaurantMenuItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuItem" ADD CONSTRAINT "RestaurantMenuItem_companyId_menuSectionId_fkey" FOREIGN KEY ("companyId", "menuSectionId") REFERENCES "RestaurantMenuSection"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantMenuItem" ADD CONSTRAINT "RestaurantMenuItem_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_reservationId_fkey" FOREIGN KEY ("companyId", "reservationId") REFERENCES "RestaurantReservation"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_tableId_fkey" FOREIGN KEY ("companyId", "tableId") REFERENCES "RestaurantTable"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_partnerId_fkey" FOREIGN KEY ("companyId", "partnerId") REFERENCES "Partner"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_companyId_documentId_fkey" FOREIGN KEY ("companyId", "documentId") REFERENCES "BusinessDocument"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "RestaurantOrder"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_vatRateId_fkey" FOREIGN KEY ("companyId", "vatRateId") REFERENCES "VatRate"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLineModifier" ADD CONSTRAINT "RestaurantOrderLineModifier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLineModifier" ADD CONSTRAINT "RestaurantOrderLineModifier_companyId_orderLineId_fkey" FOREIGN KEY ("companyId", "orderLineId") REFERENCES "RestaurantOrderLine"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantOrderLineModifier" ADD CONSTRAINT "RestaurantOrderLineModifier_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStationAssignment" ADD CONSTRAINT "KitchenStationAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStationAssignment" ADD CONSTRAINT "KitchenStationAssignment_companyId_kitchenStationId_fkey" FOREIGN KEY ("companyId", "kitchenStationId") REFERENCES "KitchenStation"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStationAssignment" ADD CONSTRAINT "KitchenStationAssignment_companyId_itemId_fkey" FOREIGN KEY ("companyId", "itemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStationAssignment" ADD CONSTRAINT "KitchenStationAssignment_companyId_itemCategoryId_fkey" FOREIGN KEY ("companyId", "itemCategoryId") REFERENCES "ItemCategory"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_companyId_kitchenStationId_fkey" FOREIGN KEY ("companyId", "kitchenStationId") REFERENCES "KitchenStation"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "RestaurantOrder"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_companyId_ticketId_fkey" FOREIGN KEY ("companyId", "ticketId") REFERENCES "KitchenTicket"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_companyId_orderLineId_fkey" FOREIGN KEY ("companyId", "orderLineId") REFERENCES "RestaurantOrderLine"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "RestaurantOrder"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_orderLineId_fkey" FOREIGN KEY ("companyId", "orderLineId") REFERENCES "RestaurantOrderLine"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_recipeItemId_fkey" FOREIGN KEY ("companyId", "recipeItemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_componentItemId_fkey" FOREIGN KEY ("companyId", "componentItemId") REFERENCES "Item"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeConsumption" ADD CONSTRAINT "RecipeConsumption_companyId_inventoryMovementId_fkey" FOREIGN KEY ("companyId", "inventoryMovementId") REFERENCES "InventoryMovement"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
