import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { writeAuditLogTx } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export class FloorConfigError extends Error {}

type Actor = {
  companyId: string;
  locationId: string;
  userId: string;
  membershipId?: string;
};

const shapes = new Set(["RECTANGLE", "SQUARE", "ROUND"]);
const rotations = new Set([0, 90, 180, 270]);

const number = (value: number, min: number, max: number, name: string) => {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new FloorConfigError(`${name} non valido.`);
  return value;
};

export async function getFloorConfiguration(
  actor: Pick<Actor, "companyId" | "locationId">,
) {
  return prisma.restaurantArea.findMany({
    where: {
      companyId: actor.companyId,
      locationId: actor.locationId,
      deletedAt: null,
    },
    include: {
      tables: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getAreaCombinations(
  actor: Pick<Actor, "companyId" | "locationId">,
  areaId: string,
) {
  return prisma.restaurantTableCombination.findMany({
    where: {
      companyId: actor.companyId,
      locationId: actor.locationId,
      areaId,
      active: true,
    },
    include: {
      tables: {
        include: {
          table: { select: { id: true, code: true, name: true, seats: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function saveFloorArea(
  actor: Actor,
  input: {
    id?: string;
    code: string;
    name: string;
    active: boolean;
    sortOrder: number;
    layoutWidth: number;
    layoutHeight: number;
    backgroundImage?: string | null;
    backgroundOpacity: number;
  },
) {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name)
    throw new FloorConfigError("Codice e nome sala sono obbligatori.");
  const layoutWidth = number(input.layoutWidth, 320, 5000, "Larghezza pianta");
  const layoutHeight = number(input.layoutHeight, 240, 5000, "Altezza pianta");
  const backgroundOpacity = number(
    input.backgroundOpacity,
    0,
    1,
    "Opacità sfondo",
  );
  return prisma.$transaction(async (tx) => {
    const scope = { companyId: actor.companyId, locationId: actor.locationId };
    if (input.id) {
      const current = await tx.restaurantArea.findFirst({
        where: { id: input.id, ...scope, deletedAt: null },
        select: {
          id: true,
          active: true,
          layoutWidth: true,
          layoutHeight: true,
        },
      });
      if (!current) throw new FloorConfigError("Sala non trovata.");
      if (
        await tx.restaurantArea.count({
          where: { ...scope, code, id: { not: current.id }, deletedAt: null },
        })
      )
        throw new FloorConfigError(
          "Il codice sala è già utilizzato in questa sede.",
        );
      // Shrinking without this check strands tables outside the canvas, and a
      // single stranded row then rejects every later layout save.
      if (
        layoutWidth < current.layoutWidth ||
        layoutHeight < current.layoutHeight
      ) {
        const stranded = (
          await tx.restaurantTable.findMany({
            where: { ...scope, areaId: current.id, deletedAt: null },
            select: {
              code: true,
              positionX: true,
              positionY: true,
              width: true,
              height: true,
            },
          })
        ).filter(
          (table) =>
            Number(table.positionX) + Number(table.width) > layoutWidth ||
            Number(table.positionY) + Number(table.height) > layoutHeight,
        );
        if (stranded.length)
          throw new FloorConfigError(
            `Riduzione non possibile: ${stranded.length} tavoli resterebbero fuori dalla pianta (${stranded
              .slice(0, 5)
              .map((table) => table.code)
              .join(", ")}). Riposizionali prima di ridurre la sala.`,
          );
      }
      if (current.active && !input.active) {
        const occupied = await tx.restaurantOrder.count({
          where: {
            companyId: actor.companyId,
            locationId: actor.locationId,
            status: { notIn: ["CLOSED", "CANCELLED"] },
            tables: { some: { table: { areaId: current.id } } },
          },
        });
        if (occupied)
          throw new FloorConfigError(
            "Una sala con ordini attivi non può essere disattivata.",
          );
      }
      await tx.restaurantArea.update({
        where: { id: current.id },
        data: {
          code,
          name,
          active: input.active,
          sortOrder: input.sortOrder,
          layoutWidth,
          layoutHeight,
          backgroundImage: input.backgroundImage?.trim() || null,
          backgroundOpacity,
          updatedById: actor.userId,
        },
      });
      await writeAuditLogTx(tx, {
        ...actor,
        action:
          current.active && !input.active ? "AREA_DISABLED" : "AREA_UPDATED",
        entityType: "RestaurantArea",
        entityId: current.id,
      });
      return { id: current.id };
    }
    const area = await tx.restaurantArea.create({
      data: {
        companyId: actor.companyId,
        locationId: actor.locationId,
        code,
        name,
        active: input.active,
        sortOrder: input.sortOrder,
        layoutWidth,
        layoutHeight,
        backgroundImage: input.backgroundImage?.trim() || null,
        backgroundOpacity,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      select: { id: true },
    });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "AREA_CREATED",
      entityType: "RestaurantArea",
      entityId: area.id,
    });
    return area;
  });
}

type TableInput = {
  id?: string;
  areaId: string;
  code: string;
  name: string;
  seats: number;
  shape: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  rotation: number;
  sortOrder: number;
  active: boolean;
  visibleInFloor: boolean;
  fusionTableNumber?: number | null;
};

function validGeometry(
  input: TableInput,
  area: { layoutWidth: number; layoutHeight: number },
) {
  if (!input.code.trim() || input.seats < 1 || !Number.isInteger(input.seats))
    throw new FloorConfigError("Codice e capacità tavolo non validi.");
  // Batch saves report which table is wrong: one stale row would otherwise
  // reject the whole layout with no way to tell which.
  const at = ` (tavolo ${input.code.trim().toUpperCase()})`;
  if (!shapes.has(input.shape) || !rotations.has(input.rotation))
    throw new FloorConfigError(`Forma o rotazione non valida${at}.`);
  if (
    !Number.isInteger(input.sortOrder) ||
    input.sortOrder < 0 ||
    input.sortOrder > 9999
  )
    throw new FloorConfigError(`Ordine non valido${at}.`);
  number(input.width, 60, area.layoutWidth, `Larghezza tavolo${at}`);
  number(input.height, 60, area.layoutHeight, `Altezza tavolo${at}`);
  number(input.positionX, 0, area.layoutWidth - input.width, `Posizione X${at}`);
  number(
    input.positionY,
    0,
    area.layoutHeight - input.height,
    `Posizione Y${at}`,
  );
  if (
    (input.shape === "ROUND" || input.shape === "SQUARE") &&
    input.width !== input.height
  )
    throw new FloorConfigError(
      `Tavoli quadrati e rotondi devono avere lati uguali${at}.`,
    );
  if (
    input.fusionTableNumber != null &&
    (!Number.isInteger(input.fusionTableNumber) ||
      input.fusionTableNumber < 1 ||
      input.fusionTableNumber > 199)
  )
    throw new FloorConfigError("Tavolo FUSION non valido.");
}

export async function saveFloorTable(actor: Actor, input: TableInput) {
  return prisma.$transaction(async (tx) => {
    const scope = { companyId: actor.companyId, locationId: actor.locationId };
    const area = await tx.restaurantArea.findFirst({
      where: { id: input.areaId, ...scope, deletedAt: null },
      select: { id: true, layoutWidth: true, layoutHeight: true },
    });
    if (!area) throw new FloorConfigError("Sala non valida.");
    validGeometry(input, area);
    // Pre-checked so a duplicate surfaces as a domain error instead of a raw
    // Prisma P2002 rendered verbatim in the properties panel.
    const code = input.code.trim().toUpperCase();
    const clash = { ...scope, deletedAt: null, id: { not: input.id ?? "" } };
    if (await tx.restaurantTable.count({ where: { ...clash, code } }))
      throw new FloorConfigError(
        "Il codice tavolo è già utilizzato in questa sede.",
      );
    if (
      input.fusionTableNumber != null &&
      (await tx.restaurantTable.count({
        where: { ...clash, fusionTableNumber: input.fusionTableNumber },
      }))
    )
      throw new FloorConfigError(
        "Il numero tavolo FUSION è già assegnato in questa sede.",
      );
    const data = {
      areaId: area.id,
      locationId: actor.locationId,
      code,
      name: input.name.trim(),
      seats: input.seats,
      shape: input.shape,
      positionX: input.positionX,
      positionY: input.positionY,
      width: input.width,
      height: input.height,
      rotation: input.rotation,
      sortOrder: input.sortOrder,
      active: input.active,
      visibleInFloor: input.visibleInFloor,
      fusionTableNumber: input.fusionTableNumber ?? null,
    };
    if (input.id) {
      const current = await tx.restaurantTable.findFirst({
        where: { id: input.id, ...scope, deletedAt: null },
        select: { id: true, active: true },
      });
      if (!current) throw new FloorConfigError("Tavolo non trovato.");
      if (current.active && !input.active) {
        const activeOrder = await tx.restaurantOrder.count({
          where: {
            companyId: actor.companyId,
            locationId: actor.locationId,
            status: { notIn: ["CLOSED", "CANCELLED"] },
            tables: { some: { tableId: current.id } },
          },
        });
        if (activeOrder)
          throw new FloorConfigError(
            "Un tavolo con ordine attivo non può essere disattivato.",
          );
      }
      await tx.restaurantTable.update({ where: { id: current.id }, data });
      await tx.restaurantArea.update({
        where: { id: area.id },
        data: { updatedById: actor.userId },
      });
      await writeAuditLogTx(tx, {
        ...actor,
        action:
          current.active && !input.active ? "TABLE_DISABLED" : "TABLE_UPDATED",
        entityType: "RestaurantTable",
        entityId: current.id,
        metadata: {
          areaId: area.id,
          fusionTableNumber: data.fusionTableNumber,
        },
      });
      return { id: current.id };
    }
    const table = await tx.restaurantTable.create({
      data: { companyId: actor.companyId, ...data },
      select: { id: true },
    });
    await tx.restaurantArea.update({
      where: { id: area.id },
      data: { updatedById: actor.userId },
    });
    await writeAuditLogTx(tx, {
      ...actor,
      action: "TABLE_CREATED",
      entityType: "RestaurantTable",
      entityId: table.id,
      metadata: { areaId: area.id, fusionTableNumber: data.fusionTableNumber },
    });
    return table;
  });
}

export async function saveFloorLayout(
  actor: Actor,
  areaId: string,
  expectedUpdatedAt: Date,
  tables: Array<
    Pick<
      TableInput,
      "id" | "positionX" | "positionY" | "width" | "height" | "rotation"
    >
  >,
) {
  if (tables.length > 100)
    throw new FloorConfigError("Troppi tavoli nella pianta.");
  return prisma.$transaction(
    async (tx) => {
      const area = await tx.restaurantArea.findFirst({
        where: {
          id: areaId,
          companyId: actor.companyId,
          locationId: actor.locationId,
          deletedAt: null,
        },
        select: { id: true, layoutWidth: true, layoutHeight: true },
      });
      if (!area) throw new FloorConfigError("Sala non trovata.");
      const ids = tables
        .map(({ id }) => id)
        .filter((id): id is string => Boolean(id));
      if (new Set(ids).size !== ids.length)
        throw new FloorConfigError("Tavoli duplicati nel salvataggio.");
      if (ids.length !== tables.length)
        throw new FloorConfigError("Tavolo senza identificativo.");
      // The real shape must come from the database: forcing RECTANGLE here used
      // to let a ROUND table be saved with width !== height.
      const owned = await tx.restaurantTable.findMany({
        where: {
          id: { in: ids },
          companyId: actor.companyId,
          locationId: actor.locationId,
          areaId,
          deletedAt: null,
        },
        select: { id: true, code: true, shape: true },
      });
      if (owned.length !== ids.length)
        throw new FloorConfigError("Tavolo non appartenente alla sala.");
      const ownedById = new Map(owned.map((row) => [row.id, row]));
      for (const table of tables) {
        const current = ownedById.get(table.id!);
        if (!current)
          throw new FloorConfigError("Tavolo non appartenente alla sala.");
        validGeometry(
          {
            ...table,
            areaId,
            code: current.code,
            name: "",
            seats: 1,
            shape: current.shape,
            sortOrder: 0,
            active: true,
            visibleInFloor: true,
          },
          area,
        );
      }
      const claimed = await tx.restaurantArea.updateMany({
        where: {
          id: areaId,
          companyId: actor.companyId,
          locationId: actor.locationId,
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedById: actor.userId },
      });
      if (!claimed.count)
        throw new FloorConfigError(
          "La pianta è stata modificata da un altro utente. Ricarica.",
        );
      for (const table of tables)
        await tx.restaurantTable.update({
          where: { id: table.id! },
          data: {
            positionX: table.positionX,
            positionY: table.positionY,
            width: table.width,
            height: table.height,
            rotation: table.rotation,
          },
        });
      await writeAuditLogTx(tx, {
        ...actor,
        action: "FLOOR_LAYOUT_UPDATED",
        entityType: "RestaurantArea",
        entityId: areaId,
        metadata: { tableCount: tables.length },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
