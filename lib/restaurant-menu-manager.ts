import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { FRISA_LEGACY_HIDDEN_PLUS, isFrisaTechnicalItem } from "@/lib/restaurant-fusion-menu";
import { prisma } from "@/lib/prisma";

export type MenuExclusionReason = "PLACEHOLDER_PLU" | "TECHNICAL" | "ZERO_PRICE" | "LEGACY";
export type MenuMoveDirection = "up" | "down";

export class RestaurantMenuManagerError extends Error {}

export function menuExclusionReason(input: { plu: number; name: string; price: number | null }): MenuExclusionReason | null {
  if (/PLU/i.test(input.name)) return "PLACEHOLDER_PLU";
  if (isFrisaTechnicalItem(input.name)) return "TECHNICAL";
  if (Number(input.price ?? 0) === 0) return "ZERO_PRICE";
  if (FRISA_LEGACY_HIDDEN_PLUS.has(input.plu)) return "LEGACY";
  return null;
}

export async function getRestaurantMenuManager(companyId: string, locationId: string, menuId: string) {
  const [menu, mappings, fusionItems, syncState] = await Promise.all([
    prisma.restaurantMenu.findFirst({
      where: { id: menuId, companyId, locationId, deletedAt: null },
      include: {
        sections: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            items: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: { item: { select: { id: true, name: true, salePrice: true } } },
            },
          },
        },
      },
    }),
    prisma.fusionCatalogMapping.findMany({
      where: { companyId, locationId, missingFromFusion: false },
      orderBy: { plu: "asc" },
    }),
    prisma.item.findMany({ where: { companyId, deletedAt: null }, select: { id: true, name: true, salePrice: true } }),
    prisma.fusionCatalogSyncState.findFirst({ where: { companyId, locationId }, orderBy: { updatedAt: "desc" } }),
  ]);
  if (!menu) throw new RestaurantMenuManagerError("Menu non trovato.");

  const mappingByItem = new Map(mappings.map((mapping) => [mapping.itemId, mapping]));
  const fusionItemById = new Map(fusionItems.map((item) => [item.id, item]));
  const sections = menu.sections.map((section) => ({
    id: section.id,
    name: section.name,
    active: section.active,
    sortOrder: section.sortOrder,
    items: section.items.flatMap((row) => {
      const mapping = mappingByItem.get(row.itemId);
      if (!mapping) return [];
      if (menuExclusionReason({ plu: mapping.plu, name: row.item.name, price: row.item.salePrice?.toNumber() ?? null })) return [];
      return [{
        id: row.id,
        itemId: row.itemId,
        name: row.item.name,
        plu: mapping.plu,
        price: row.item.salePrice?.toNumber() ?? null,
        visible: row.visible,
        available: row.available,
        sortOrder: row.sortOrder,
        source: "FUSION" as const,
      }];
    }),
  }));
  const excluded = mappings.flatMap((mapping) => {
    const item = fusionItemById.get(mapping.itemId);
    if (!item) return [];
    const reason = menuExclusionReason({ plu: mapping.plu, name: item.name, price: item.salePrice?.toNumber() ?? null });
    return reason ? [{ itemId: mapping.itemId, name: item.name, plu: mapping.plu, price: item.salePrice?.toNumber() ?? null, reason }] : [];
  });
  return {
    menu: { id: menu.id, name: menu.name, code: menu.code, active: menu.active },
    sections,
    configuredCount: sections.reduce((total, section) => total + section.items.length, 0),
    excluded,
    sync: {
      status: syncState?.status ?? "STALE",
      lastSyncAt: syncState?.lastSyncAt?.toISOString() ?? null,
      lastError: syncState?.lastError ?? null,
      productCount: mappings.length,
    },
  };
}

type Actor = { companyId: string; locationId: string; userId: string };

async function managedItem(tx: Prisma.TransactionClient, actor: Actor, menuItemId: string) {
  const row = await tx.restaurantMenuItem.findFirst({
    where: { id: menuItemId, companyId: actor.companyId, section: { menu: { locationId: actor.locationId, deletedAt: null } } },
    include: { section: { select: { id: true, menuId: true } }, item: { select: { name: true, salePrice: true } } },
  });
  if (!row) throw new RestaurantMenuManagerError("Prodotto menu non trovato.");
  const mapping = await tx.fusionCatalogMapping.findFirst({ where: { companyId: actor.companyId, locationId: actor.locationId, itemId: row.itemId, missingFromFusion: false } });
  if (!mapping) throw new RestaurantMenuManagerError("Il prodotto non è sincronizzato da FUSION.");
  if (menuExclusionReason({ plu: mapping.plu, name: row.item.name, price: row.item.salePrice?.toNumber() ?? null })) throw new RestaurantMenuManagerError("Un prodotto escluso non può essere pubblicato.");
  return { row, mapping };
}

export async function updateRestaurantMenuItemState(actor: Actor, menuItemId: string, change: { visible?: boolean; available?: boolean }) {
  if (change.visible === undefined && change.available === undefined) throw new RestaurantMenuManagerError("Nessuna modifica richiesta.");
  return prisma.$transaction(async (tx) => {
    const { row } = await managedItem(tx, actor, menuItemId);
    const previous = { visible: row.visible, available: row.available };
    const next = { visible: change.visible ?? row.visible, available: change.available ?? row.available };
    await tx.restaurantMenuItem.updateMany({ where: { id: row.id, companyId: actor.companyId }, data: next });
    await writeAuditLogTx(tx, { companyId: actor.companyId, userId: actor.userId, locationId: actor.locationId, action: "RESTAURANT_MENU_ITEM_STATE_CHANGED", entityType: "RestaurantMenuItem", entityId: row.id, metadata: { previous, next } });
    return next;
  });
}

export async function moveRestaurantMenuItem(actor: Actor, menuItemId: string, targetSectionId: string) {
  return prisma.$transaction(async (tx) => {
    const { row } = await managedItem(tx, actor, menuItemId);
    const target = await tx.restaurantMenuSection.findFirst({ where: { id: targetSectionId, companyId: actor.companyId, menuId: row.section.menuId } });
    if (!target) throw new RestaurantMenuManagerError("Categoria di destinazione non valida.");
    if (target.id === row.menuSectionId) return row;
    const duplicate = await tx.restaurantMenuItem.findFirst({ where: { companyId: actor.companyId, menuSectionId: target.id, itemId: row.itemId } });
    if (duplicate) throw new RestaurantMenuManagerError("Prodotto già presente nella categoria di destinazione.");
    const last = await tx.restaurantMenuItem.findFirst({ where: { companyId: actor.companyId, menuSectionId: target.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const sortOrder = (last?.sortOrder ?? -1) + 1;
    const updated = await tx.restaurantMenuItem.update({ where: { id: row.id }, data: { menuSectionId: target.id, sortOrder } });
    await writeAuditLogTx(tx, { companyId: actor.companyId, userId: actor.userId, locationId: actor.locationId, action: "RESTAURANT_MENU_ITEM_CATEGORY_CHANGED", entityType: "RestaurantMenuItem", entityId: row.id, metadata: { previous: { sectionId: row.menuSectionId }, next: { sectionId: target.id } } });
    return updated;
  }, { isolationLevel: "Serializable" });
}

export async function reorderRestaurantMenuSection(actor: Actor, sectionId: string, direction: MenuMoveDirection) {
  if (direction !== "up" && direction !== "down") throw new RestaurantMenuManagerError("Direzione di ordinamento non valida.");
  return prisma.$transaction(async (tx) => {
    const section = await tx.restaurantMenuSection.findFirst({ where: { id: sectionId, companyId: actor.companyId, menu: { locationId: actor.locationId, deletedAt: null } } });
    if (!section) throw new RestaurantMenuManagerError("Categoria non trovata.");
    const rows = await tx.restaurantMenuSection.findMany({ where: { companyId: actor.companyId, menuId: section.menuId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const index = rows.findIndex((row) => row.id === section.id), targetIndex = index + (direction === "up" ? -1 : 1), target = rows[targetIndex];
    if (!target) return section;
    [rows[index], rows[targetIndex]] = [rows[targetIndex], rows[index]];
    for (const [sortOrder, current] of rows.entries()) await tx.restaurantMenuSection.update({ where: { id: current.id }, data: { sortOrder } });
    await writeAuditLogTx(tx, { companyId: actor.companyId, userId: actor.userId, locationId: actor.locationId, action: "RESTAURANT_MENU_SECTION_REORDERED", entityType: "RestaurantMenuSection", entityId: section.id, metadata: { previous: { sortOrder: index }, next: { sortOrder: targetIndex } } });
    return section;
  }, { isolationLevel: "Serializable" });
}

export async function reorderRestaurantMenuItem(actor: Actor, menuItemId: string, direction: MenuMoveDirection) {
  if (direction !== "up" && direction !== "down") throw new RestaurantMenuManagerError("Direzione di ordinamento non valida.");
  return prisma.$transaction(async (tx) => {
    const { row } = await managedItem(tx, actor, menuItemId);
    const rows = await tx.restaurantMenuItem.findMany({ where: { companyId: actor.companyId, menuSectionId: row.menuSectionId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const index = rows.findIndex((item) => item.id === row.id), targetIndex = index + (direction === "up" ? -1 : 1), target = rows[targetIndex];
    if (!target) return row;
    [rows[index], rows[targetIndex]] = [rows[targetIndex], rows[index]];
    for (const [sortOrder, current] of rows.entries()) await tx.restaurantMenuItem.update({ where: { id: current.id }, data: { sortOrder } });
    await writeAuditLogTx(tx, { companyId: actor.companyId, userId: actor.userId, locationId: actor.locationId, action: "RESTAURANT_MENU_ITEM_REORDERED", entityType: "RestaurantMenuItem", entityId: row.id, metadata: { previous: { sortOrder: index }, next: { sortOrder: targetIndex } } });
    return row;
  }, { isolationLevel: "Serializable" });
}
