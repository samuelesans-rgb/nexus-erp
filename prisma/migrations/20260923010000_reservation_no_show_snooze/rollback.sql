-- Rollback di 20260923010000_reservation_no_show_snooze.
ALTER TABLE "RestaurantReservation" DROP COLUMN IF EXISTS "noShowSnoozedUntil";
