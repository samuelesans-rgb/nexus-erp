"use server";
import { revalidatePath } from "next/cache";
import { createConnectorTestPrint, createPairingToken, revokeConnector, rotateConnectorCredential } from "@/lib/kitchen-connector";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
export type ConnectorActionState = { secret?: string; expiresAt?: string; message?: string; error?: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export async function connectorAdminAction(_state: ConnectorActionState, form: FormData): Promise<ConnectorActionState> {
  const context = await requireRestaurantContext(MODULE_CODES.RESTAURANT_KITCHEN, "manage");
  try {
    const operation = value(form, "operation");
    if (operation === "pair") { const result = await createPairingToken(context.companyId, context.locationId, value(form, "printerId"), context.userId); return { secret: result.pairingToken, expiresAt: result.expiresAt.toISOString(), message: "Token creato. Viene mostrato una sola volta." }; }
    if (operation === "rotate") { const result = await rotateConnectorCredential(context.companyId, context.locationId, value(form, "deviceId"), context.userId); revalidatePath("/restaurant/settings/kitchen"); return { secret: result.credential, message: "Credenziale ruotata. Viene mostrata una sola volta." }; }
    if (operation === "revoke") await revokeConnector(context.companyId, context.locationId, value(form, "deviceId"), context.userId);
    else if (operation === "test") await createConnectorTestPrint(context.companyId, context.locationId, value(form, "printerId"), context.userId);
    else throw new Error("Operazione non valida.");
    revalidatePath("/restaurant/settings/kitchen"); revalidatePath("/restaurant/kitchen/print-queue");
    return { message: operation === "test" ? "Stampa di test accodata." : "Operazione completata." };
  } catch (error) { return { error: error instanceof Error ? error.message : "Operazione non riuscita." }; }
}
