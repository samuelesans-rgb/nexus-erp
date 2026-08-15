-- Expand: line-level operational aggregates inherit Location only from authoritative parents.
ALTER TABLE "RestaurantOrderLine" ADD COLUMN "locationId" TEXT;
ALTER TABLE "KitchenTicketLine" ADD COLUMN "locationId" TEXT;

UPDATE "RestaurantOrderLine" line
SET "locationId" = orders."locationId"
FROM "RestaurantOrder" orders
WHERE orders."companyId" = line."companyId" AND orders."id" = line."orderId";

UPDATE "KitchenTicketLine" line
SET "locationId" = ticket."locationId"
FROM "KitchenTicket" ticket
WHERE ticket."companyId" = line."companyId" AND ticket."id" = line."ticketId";

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "RestaurantOrderLine" WHERE "locationId" IS NULL)
     OR EXISTS (SELECT 1 FROM "KitchenTicketLine" WHERE "locationId" IS NULL) THEN
    RAISE EXCEPTION 'Restaurant Location backfill incomplete: operational child without authoritative parent';
  END IF;
END $$;

ALTER TABLE "RestaurantOrderLine" ALTER COLUMN "locationId" SET NOT NULL;
ALTER TABLE "KitchenTicketLine" ALTER COLUMN "locationId" SET NOT NULL;

CREATE UNIQUE INDEX "RestaurantArea_companyId_locationId_id_key" ON "RestaurantArea"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "RestaurantTable_companyId_locationId_id_key" ON "RestaurantTable"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "RestaurantReservation_companyId_locationId_id_key" ON "RestaurantReservation"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "RestaurantOrder_companyId_locationId_id_key" ON "RestaurantOrder"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "RestaurantOrderLine_companyId_locationId_id_key" ON "RestaurantOrderLine"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "KitchenStation_companyId_locationId_id_key" ON "KitchenStation"("companyId", "locationId", "id");
CREATE UNIQUE INDEX "KitchenTicket_companyId_locationId_id_key" ON "KitchenTicket"("companyId", "locationId", "id");
CREATE INDEX "RestaurantOrderLine_companyId_locationId_orderId_status_idx" ON "RestaurantOrderLine"("companyId", "locationId", "orderId", "status");
CREATE INDEX "KitchenTicketLine_companyId_locationId_orderLineId_idx" ON "KitchenTicketLine"("companyId", "locationId", "orderLineId");

ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOT VALID preserves auditable legacy inconsistencies while enforcing all new writes.
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_location_area_fkey" FOREIGN KEY ("companyId", "locationId", "areaId") REFERENCES "RestaurantArea"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_location_table_fkey" FOREIGN KEY ("companyId", "locationId", "tableId") REFERENCES "RestaurantTable"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_location_reservation_fkey" FOREIGN KEY ("companyId", "locationId", "reservationId") REFERENCES "RestaurantReservation"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "RestaurantOrderLine" ADD CONSTRAINT "RestaurantOrderLine_location_order_fkey" FOREIGN KEY ("companyId", "locationId", "orderId") REFERENCES "RestaurantOrder"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_location_station_fkey" FOREIGN KEY ("companyId", "locationId", "kitchenStationId") REFERENCES "KitchenStation"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_location_order_fkey" FOREIGN KEY ("companyId", "locationId", "orderId") REFERENCES "RestaurantOrder"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_location_ticket_fkey" FOREIGN KEY ("companyId", "locationId", "ticketId") REFERENCES "KitchenTicket"("companyId", "locationId", "id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KitchenTicketLine" ADD CONSTRAINT "KitchenTicketLine_location_orderLine_fkey" FOREIGN KEY ("companyId", "locationId", "orderLineId") REFERENCES "RestaurantOrderLine"("companyId", "locationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
