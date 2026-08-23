-- Keep the default-location ACL invariant while allowing Membership and its ACL
-- row to be created atomically in either statement order.
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_defaultLocation_authorized_fkey";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_defaultLocation_authorized_fkey"
  FOREIGN KEY ("companyId", "id", "defaultLocationId")
  REFERENCES "MembershipLocation"("companyId", "membershipId", "locationId")
  ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
