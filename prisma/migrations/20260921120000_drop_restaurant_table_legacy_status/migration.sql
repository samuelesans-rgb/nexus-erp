-- Rimuove RestaurantTable.status, lo stato legacy ormai derivato.
--
-- Lo stato di un tavolo si calcola da RestaurantOrderTable e
-- RestaurantReservationTable; nella colonna restava solo ciò che è davvero
-- fisico, ed è già in "physicalStatus". La colonna era scritta da sei punti
-- diversi senza che nulla li tenesse d'accordo, ed è la causa dei difetti per
-- cui un tavolo poteva risultare OCCUPIED senza comande.
--
-- Il tipo "RestaurantTableStatus" NON viene rimosso: resta il vocabolario
-- dello stato derivato, ed è ciò che permette al rollback di ricreare la
-- colonna senza ricostruire anche l'enum.

DROP INDEX IF EXISTS "RestaurantTable_companyId_locationId_status_deletedAt_idx";

ALTER TABLE "RestaurantTable" DROP COLUMN "status";
