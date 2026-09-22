-- Lista d'attesa: fascia accettata dal cliente, offerta in corso, richiesta di
-- chiamata allo staff quando manca troppo poco per un'offerta via email.
--
-- Tutto additivo e nullable: le prenotazioni esistenti restano valide e non in
-- lista, perché i campi restano vuoti.

ALTER TABLE "RestaurantReservation"
  ADD COLUMN "waitlistFromTime"     TIMESTAMP(3),
  ADD COLUMN "waitlistToTime"       TIMESTAMP(3),
  ADD COLUMN "offerTokenHash"       TEXT,
  ADD COLUMN "offerExpiresAt"       TIMESTAMP(3),
  ADD COLUMN "staffCallRequestedAt" TIMESTAMP(3),
  ADD COLUMN "staffCallResolvedAt"  TIMESTAMP(3);

CREATE UNIQUE INDEX "RestaurantReservation_offerTokenHash_key"
  ON "RestaurantReservation" ("offerTokenHash");

-- Le due interrogazioni calde: chi è in lista per una fascia, e quali chiamate
-- restano da gestire.
CREATE INDEX "RestaurantReservation_waitlist_idx"
  ON "RestaurantReservation" ("companyId", "locationId", "status", "waitlistFromTime");
CREATE INDEX "RestaurantReservation_staffCall_idx"
  ON "RestaurantReservation" ("companyId", "locationId", "staffCallResolvedAt", "staffCallRequestedAt");
