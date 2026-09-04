import { requireRestaurantContext } from "@/lib/restaurant-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { getOperationalRestaurantFloor } from "@/lib/restaurant-floor-operations";
import { OperationalFloor } from "./operational-floor";

export default async function Page() {
  const context = await requireRestaurantContext(
    MODULE_CODES.RESTAURANT_FLOOR,
    "floor",
  );
  const data = await getOperationalRestaurantFloor(
    context.companyId,
    context.locationId,
  );
  return (
    <OperationalFloor
      data={data}
      canConfigure={context.roles.some((role) =>
        ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role),
      )}
    />
  );
}
