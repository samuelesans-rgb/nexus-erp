"use server";

import { InventoryDomainError, completeTransfer, createInventoryCount, createTransfer, postInventoryCount, postInventoryMovement, reverseInventoryMovement } from "@/lib/inventory";
import { requireInventoryContext } from "@/lib/inventory-access";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function value(data: FormData, key: string) { const result = String(data.get(key) ?? "").trim(); return result || null; }
function number(data: FormData, key: string) { return Number(String(data.get(key) ?? "").replace(",", ".")); }
function inventoryError(error: unknown) { return error instanceof InventoryDomainError || error instanceof Error ? error.message : "Operazione Inventory non riuscita."; }

export async function saveWarehouse(formData: FormData) {
  const { companyId, userId } = await requireInventoryContext();
  const id = value(formData, "id"); const code = value(formData, "code")?.toUpperCase(); const name = value(formData, "name");
  if (!code || !name) redirect("/inventory/warehouses?error=Codice e nome sono obbligatori");
  const locationId = value(formData, "locationId");
  const validLocation = locationId && await prisma.location.findFirst({ where: { id: locationId, companyId, active: true, deletedAt: null }, select: { id: true } });
  if (!validLocation) redirect("/inventory/warehouses?error=Sede non valida");
  if (id) await prisma.warehouse.updateMany({ where: { id, companyId }, data: { code, name, locationId, description: value(formData, "description"), allowNegativeStock: formData.get("allowNegativeStock") === "on", active: formData.get("active") === "on", updatedById: userId } });
  else await prisma.warehouse.create({ data: { companyId, code, name, locationId, description: value(formData, "description"), allowNegativeStock: formData.get("allowNegativeStock") === "on", createdById: userId, updatedById: userId } });
  revalidatePath("/inventory"); redirect("/inventory/warehouses?success=Magazzino salvato");
}

export async function setWarehouseLifecycle(formData: FormData) {
  const { companyId, userId } = await requireInventoryContext(); const id = value(formData, "id"); const restore = formData.get("restore") === "true";
  if (id) await prisma.warehouse.updateMany({ where: { id, companyId }, data: { active: restore, deletedAt: restore ? null : new Date(), updatedById: userId } });
  revalidatePath("/inventory"); redirect("/inventory/warehouses");
}

export async function saveBin(formData: FormData) {
  const { companyId } = await requireInventoryContext(); const warehouseId = value(formData, "warehouseId"); const code = value(formData, "code")?.toUpperCase(); const name = value(formData, "name");
  if (!warehouseId || !code || !name || !(await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId, deletedAt: null }, select: { id: true } }))) redirect("/inventory/warehouses?error=Dati ubicazione non validi");
  await prisma.warehouseBin.create({ data: { companyId, warehouseId, code, name } }); revalidatePath("/inventory/warehouses"); redirect("/inventory/warehouses?success=Ubicazione creata");
}

export async function createMovementAction(formData: FormData) {
  const { companyId, userId } = await requireInventoryContext();
  let movementId: string;
  try { const movement = await postInventoryMovement(companyId, userId, { warehouseId: value(formData, "warehouseId")!, binId: value(formData, "binId"), itemId: value(formData, "itemId")!, movementType: value(formData, "movementType") as never, quantity: number(formData, "quantity"), unitOfMeasureId: value(formData, "unitOfMeasureId")!, lotId: value(formData, "lotId"), serialId: value(formData, "serialId"), unitCost: value(formData, "unitCost"), referenceType: value(formData, "referenceType"), referenceId: value(formData, "referenceId"), reason: value(formData, "reason"), note: value(formData, "note") }); movementId = movement.id; }
  catch (error) { redirect(`/inventory/movements/new?error=${encodeURIComponent(inventoryError(error))}`); }
  revalidatePath("/inventory"); redirect(`/inventory/movements/${movementId}`);
}

export async function reverseMovementAction(formData: FormData) { const { companyId, userId } = await requireInventoryContext(); const id = value(formData, "id"); if (!id) redirect("/inventory/movements"); try { await reverseInventoryMovement(companyId, userId, id, value(formData, "reason") ?? undefined); revalidatePath("/inventory"); redirect(`/inventory/movements/${id}?success=Movimento stornato`); } catch (error) { redirect(`/inventory/movements/${id}?error=${encodeURIComponent(inventoryError(error))}`); } }

export async function createTransferAction(formData: FormData) { const { companyId, userId } = await requireInventoryContext(); let id: string; try { const transfer = await createTransfer(companyId, userId, { code: value(formData, "code")!, sourceWarehouseId: value(formData, "sourceWarehouseId")!, destinationWarehouseId: value(formData, "destinationWarehouseId")!, sourceBinId: value(formData, "sourceBinId"), destinationBinId: value(formData, "destinationBinId"), lines: [{ itemId: value(formData, "itemId")!, quantity: number(formData, "quantity"), unitOfMeasureId: value(formData, "unitOfMeasureId")!, lotId: value(formData, "lotId"), serialId: value(formData, "serialId") }] }); id = transfer.id; } catch (error) { redirect(`/inventory/transfers/new?error=${encodeURIComponent(inventoryError(error))}`); } redirect(`/inventory/transfers/${id}`); }
export async function completeTransferAction(formData: FormData) { const { companyId, userId } = await requireInventoryContext(); const id = value(formData, "id")!; try { await completeTransfer(companyId, userId, id); revalidatePath("/inventory"); redirect(`/inventory/transfers/${id}?success=Trasferimento completato`); } catch (error) { redirect(`/inventory/transfers/${id}?error=${encodeURIComponent(inventoryError(error))}`); } }

export async function createCountAction(formData: FormData) { const { companyId, userId } = await requireInventoryContext(); let id: string; try { const count = await createInventoryCount(companyId, userId, { code: value(formData, "code")!, warehouseId: value(formData, "warehouseId")!, binId: value(formData, "binId"), lines: [{ itemId: value(formData, "itemId")!, countedQuantity: number(formData, "countedQuantity"), unitOfMeasureId: value(formData, "unitOfMeasureId")!, lotId: value(formData, "lotId"), serialId: value(formData, "serialId") }] }); id = count.id; } catch (error) { redirect(`/inventory/counts/new?error=${encodeURIComponent(inventoryError(error))}`); } redirect(`/inventory/counts/${id}`); }
export async function postCountAction(formData: FormData) { const { companyId, userId } = await requireInventoryContext(); const id = value(formData, "id")!; try { await postInventoryCount(companyId, userId, id); revalidatePath("/inventory"); redirect(`/inventory/counts/${id}?success=Inventario contabilizzato`); } catch (error) { redirect(`/inventory/counts/${id}?error=${encodeURIComponent(inventoryError(error))}`); } }
