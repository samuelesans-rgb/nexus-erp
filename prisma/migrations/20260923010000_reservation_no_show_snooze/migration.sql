-- Rinvio dell'avviso di mancata presentazione.
--
-- Il cliente telefona dicendo che arriva tardi: il cameriere non vuole
-- marcarlo né arrivato né assente, ma nemmeno tenersi l'avviso davanti per
-- un'ora. Additiva e nullable: le prenotazioni esistenti non ne risentono.
ALTER TABLE "RestaurantReservation" ADD COLUMN "noShowSnoozedUntil" TIMESTAMP(3);
