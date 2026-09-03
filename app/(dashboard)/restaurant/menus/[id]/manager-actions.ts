"use server";

import { revalidatePath } from "next/cache";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { moveRestaurantMenuItem, reorderRestaurantMenuItem, reorderRestaurantMenuSection, updateRestaurantMenuItemState, type MenuMoveDirection } from "@/lib/restaurant-menu-manager";

export type MenuManagerActionResult = { ok: boolean; message: string };
const response = async (operation: (actor: { companyId: string; locationId: string; userId: string }) => Promise<unknown>): Promise<MenuManagerActionResult> => {
  try {
    const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_MENU, "manage");
    await operation(context);
    revalidatePath("/restaurant/menus");
    return { ok: true, message: "Salvato" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Operazione non riuscita" };
  }
};

export async function setMenuItemStateAction(menuItemId: string, field: "visible" | "available", value: boolean) {
  if ((field !== "visible" && field !== "available") || typeof value !== "boolean") return { ok: false, message: "Modifica non valida" };
  return response((actor) => updateRestaurantMenuItemState(actor, menuItemId, { [field]: value }));
}
export async function moveMenuItemAction(menuItemId: string, sectionId: string) {
  return response((actor) => moveRestaurantMenuItem(actor, menuItemId, sectionId));
}
export async function reorderMenuSectionAction(sectionId: string, direction: MenuMoveDirection) {
  if (direction !== "up" && direction !== "down") return { ok: false, message: "Direzione non valida" };
  return response((actor) => reorderRestaurantMenuSection(actor, sectionId, direction));
}
export async function reorderMenuItemAction(menuItemId: string, direction: MenuMoveDirection) {
  if (direction !== "up" && direction !== "down") return { ok: false, message: "Direzione non valida" };
  return response((actor) => reorderRestaurantMenuItem(actor, menuItemId, direction));
}
