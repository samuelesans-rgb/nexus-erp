# Restaurant Booking & Floor V2

## Availability precedence

For a company and location, availability is evaluated in this order:

1. an active date exception overrides the weekly calendar (CLOSED always denies; SPECIAL_OPENING and OVERRIDE_HOURS replace time intervals);
2. an active service window selects slot interval, duration, optional cover limit and optional buffers;
3. weekly openingHours is the legacy fallback when no service window exists;
4. capacity is the most specific of active CAPACITY_OVERRIDE, service maximum, then location maxCoversPerSlot;
5. bufferBeforeMinutes and bufferAfterMinutes expand both the candidate and existing reservation occupancy;
6. PENDING, CONFIRMED and SEATED reservations consume covers and assigned tables;
7. OUT_OF_SERVICE and OCCUPIED tables are unavailable;
8. a single table is preferred, followed by an explicitly configured same-area table combination.

All reads and mutations require companyId and locationId. A combination never creates table copies: reservations continue to use RestaurantReservationTable.

## Policies

Public reservations are PENDING under MANUAL and CONFIRMED under AUTO_CONFIRM only after availability succeeds. Public cancellation requires the existing hashed token, enabled cancellation, an eligible state and a deadline that has not expired. Staff cancellation is the authenticated override. No-show remains a manual transition; the configured threshold is informational until a reliable scheduler exists.
