-- Rollback di 20260922100000_restaurant_waitlist.
-- Additiva: basta togliere le colonne, nessun dato preesistente le usava.
DROP INDEX IF EXISTS "RestaurantReservation_staffCall_idx";
DROP INDEX IF EXISTS "RestaurantReservation_waitlist_idx";
DROP INDEX IF EXISTS "RestaurantReservation_offerTokenHash_key";
ALTER TABLE "RestaurantReservation"
  DROP COLUMN IF EXISTS "waitlistFromTime",
  DROP COLUMN IF EXISTS "waitlistToTime",
  DROP COLUMN IF EXISTS "offerTokenHash",
  DROP COLUMN IF EXISTS "offerExpiresAt",
  DROP COLUMN IF EXISTS "staffCallRequestedAt",
  DROP COLUMN IF EXISTS "staffCallResolvedAt";
