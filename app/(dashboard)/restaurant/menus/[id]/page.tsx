import { notFound } from "next/navigation";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getRestaurantMenuManager, RestaurantMenuManagerError } from "@/lib/restaurant-menu-manager";
import { MenuManager } from "./menu-manager";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_MENU);
  const canManage = context.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role));
  const data = await getRestaurantMenuManager(context.companyId, context.locationId, (await params).id).catch((error: unknown) => {
    if (error instanceof RestaurantMenuManagerError) notFound();
    throw error;
  });
  return <MenuManager data={data} canManage={canManage}/>;
}
