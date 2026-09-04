"use server";

import { revalidatePath } from "next/cache";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import {
  addFloorOrderItem,
  deleteUnsentFloorLine,
  dispatchFloorOrder,
  openFloorTable,
  retrySafeFloorJob,
  updateFloorGuestCount,
  updateUnsentFloorLine,
} from "@/lib/restaurant-floor-operations";

export type FloorActionResult = {
  ok: boolean;
  message: string;
  orderId?: string;
};
const run = async (
  operation: (actor: {
    companyId: string;
    locationId: string;
    userId: string;
  }) => Promise<{ id?: string } | unknown>,
  success = "Salvato",
): Promise<FloorActionResult> => {
  try {
    const actor = await requireRestaurantContext(
      MODULE_CODES.RESTAURANT_FLOOR,
      "floor",
    );
    const result = (await operation(actor)) as { id?: string } | undefined;
    revalidatePath("/restaurant/floor");
    return { ok: true, message: success, orderId: result?.id };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Operazione non riuscita",
    };
  }
};

export async function openFloorTableAction(
  tableId: string,
  guestCount: number,
) {
  return run(
    (actor) => openFloorTable(actor, tableId, guestCount),
    "Tavolo aperto",
  );
}
export async function addFloorItemAction(
  orderId: string,
  itemId: string,
  modifierIds: string[] = [],
) {
  return run(
    (actor) => addFloorOrderItem(actor, orderId, itemId, modifierIds),
    "Prodotto aggiunto",
  );
}
export async function changeFloorLineQuantityAction(
  orderId: string,
  lineId: string,
  quantity: number,
) {
  return run((actor) =>
    updateUnsentFloorLine(actor, orderId, lineId, { quantity }),
  );
}
export async function saveFloorLineNoteAction(
  orderId: string,
  lineId: string,
  kitchenNotes: string,
) {
  return run(
    (actor) => updateUnsentFloorLine(actor, orderId, lineId, { kitchenNotes }),
    "Nota salvata",
  );
}
export async function deleteFloorLineAction(orderId: string, lineId: string) {
  return run(
    (actor) => deleteUnsentFloorLine(actor, orderId, lineId),
    "Riga eliminata",
  );
}
export async function changeFloorGuestCountAction(
  orderId: string,
  guestCount: number,
) {
  return run(
    (actor) => updateFloorGuestCount(actor, orderId, guestCount),
    "Coperti aggiornati",
  );
}
export async function dispatchFloorOrderAction(
  orderId: string,
  idempotencyKey: string,
) {
  return run(
    (actor) => dispatchFloorOrder(actor, orderId, idempotencyKey),
    "Comanda inviata",
  );
}
export async function retryFloorJobAction(jobId: string) {
  return run(
    (actor) => retrySafeFloorJob(actor, jobId),
    "Invio rimesso in coda",
  );
}
