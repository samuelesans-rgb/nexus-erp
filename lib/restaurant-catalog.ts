import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { RestaurantDomainError } from "@/lib/restaurant";

export const EU_ALLERGENS = [
  ["GLUTEN", "Cereali contenenti glutine"],
  ["CRUSTACEANS", "Crostacei"],
  ["EGGS", "Uova"],
  ["FISH", "Pesce"],
  ["PEANUTS", "Arachidi"],
  ["SOY", "Soia"],
  ["MILK", "Latte"],
  ["NUTS", "Frutta a guscio"],
  ["CELERY", "Sedano"],
  ["MUSTARD", "Senape"],
  ["SESAME", "Sesamo"],
  ["SULPHITES", "Anidride solforosa e solfiti"],
  ["LUPIN", "Lupini"],
  ["MOLLUSCS", "Molluschi"],
] as const;

type Tx = Prisma.TransactionClient;
const clean = (value: string, label: string) => {
  const result = value.trim();
  if (!result) throw new RestaurantDomainError(label + " obbligatorio.");
  return result;
};

export async function saveItemCategory(
  companyId: string,
  userId: string,
  input: {
    id?: string;
    code: string;
    name: string;
    description?: string | null;
    purpose: "SELLABLE" | "INVENTORY" | "BOTH";
    active: boolean;
  },
) {
  const data = {
    code: clean(input.code, "Codice").toUpperCase(),
    name: clean(input.name, "Nome"),
    description: input.description?.trim() || null,
    purpose: input.purpose,
    active: input.active,
    updatedById: userId,
  };
  if (input.id) {
    const result = await prisma.itemCategory.updateMany({
      where: { id: input.id, companyId, deletedAt: null },
      data,
    });
    if (!result.count)
      throw new RestaurantDomainError("Categoria non trovata.");
    return { id: input.id };
  }
  return prisma.itemCategory.create({
    data: { companyId, ...data, createdById: userId },
    select: { id: true },
  });
}

export async function archiveItemCategory(companyId: string, id: string) {
  const category = await prisma.itemCategory.findFirst({
    where: { id, companyId, deletedAt: null },
    select: {
      id: true,
      _count: {
        select: { items: true, children: true, businessDocumentLines: true },
      },
    },
  });
  if (!category) throw new RestaurantDomainError("Categoria non trovata.");
  if (
    category._count.items ||
    category._count.children ||
    category._count.businessDocumentLines
  )
    throw new RestaurantDomainError(
      "Categoria referenziata: disattivarla invece di eliminarla.",
    );
  await prisma.itemCategory.update({
    where: { id },
    data: { active: false, deletedAt: new Date() },
  });
  return { id };
}

export async function saveAllergen(
  companyId: string,
  input: {
    id?: string;
    code: string;
    name: string;
    description?: string | null;
    active: boolean;
  },
) {
  const data = {
    code: clean(input.code, "Codice").toUpperCase(),
    name: clean(input.name, "Nome"),
    description: input.description?.trim() || null,
    active: input.active,
  };
  if (input.id) {
    const result = await prisma.allergen.updateMany({
      where: { id: input.id, companyId, deletedAt: null },
      data,
    });
    if (!result.count)
      throw new RestaurantDomainError("Allergene non trovato.");
    return { id: input.id };
  }
  return prisma.allergen.create({
    data: { companyId, ...data },
    select: { id: true },
  });
}

export async function ensureEuAllergens(companyId: string) {
  await prisma.$transaction(
    EU_ALLERGENS.map(([code, name]) =>
      prisma.allergen.upsert({
        where: { companyId_code: { companyId, code } },
        create: { companyId, code, name },
        update: { name, active: true, deletedAt: null },
      }),
    ),
  );
  return { count: EU_ALLERGENS.length };
}

export async function setItemAllergens(
  companyId: string,
  itemId: string,
  allergenIds: string[],
) {
  const unique = [...new Set(allergenIds.filter(Boolean))];
  const [item, count] = await Promise.all([
    prisma.item.findFirst({
      where: { id: itemId, companyId, deletedAt: null },
      select: { id: true },
    }),
    prisma.allergen.count({
      where: { companyId, id: { in: unique }, active: true, deletedAt: null },
    }),
  ]);
  if (!item || count !== unique.length)
    throw new RestaurantDomainError(
      "Item o allergene non valido per questa azienda.",
    );
  await prisma.$transaction(async (tx) => {
    await tx.itemAllergen.deleteMany({ where: { companyId, itemId } });
    if (unique.length)
      await tx.itemAllergen.createMany({
        data: unique.map((allergenId) => ({ companyId, itemId, allergenId })),
      });
  });
  return { itemId };
}

export async function getItemAllergens(companyId: string, itemId: string) {
  const item = await prisma.item.findFirst({
    where: { id: itemId, companyId, deletedAt: null },
    select: {
      allergens: {
        where: { allergen: { active: true, deletedAt: null } },
        select: { allergen: true },
      },
      recipeComponents: {
        where: { deletedAt: null },
        select: {
          componentItem: {
            select: {
              allergens: {
                where: { allergen: { active: true, deletedAt: null } },
                select: { allergen: true },
              },
            },
          },
        },
      },
    },
  });
  if (!item) throw new RestaurantDomainError("Item non trovato.");
  const explicit = item.allergens.map((row) => row.allergen);
  const explicitIds = new Set(explicit.map((row) => row.id));
  const derived = [
    ...new Map(
      item.recipeComponents
        .flatMap((row) =>
          row.componentItem.allergens.map((link) => link.allergen),
        )
        .filter((row) => !explicitIds.has(row.id))
        .map((row) => [row.id, row]),
    ).values(),
  ];
  return { explicit, derived, all: [...explicit, ...derived] };
}

async function requireSellableItem(tx: Tx, companyId: string, itemId: string) {
  const item = await tx.item.findFirst({
    where: {
      id: itemId,
      companyId,
      sellable: true,
      active: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!item) throw new RestaurantDomainError("Prodotto vendibile non valido.");
  return item;
}
export async function saveVariant(
  companyId: string,
  input: {
    id?: string;
    itemId: string;
    name: string;
    sku?: string | null;
    priceOverride?: number | null;
    priceDelta: number;
    available: boolean;
    active: boolean;
    sortOrder: number;
  },
) {
  if (input.priceOverride != null && input.priceOverride < 0)
    throw new RestaurantDomainError("Prezzo variante non valido.");
  return prisma.$transaction(async (tx) => {
    await requireSellableItem(tx, companyId, input.itemId);
    const data = {
      itemId: input.itemId,
      name: clean(input.name, "Nome"),
      sku: input.sku?.trim() || null,
      priceOverride: input.priceOverride,
      priceDelta: input.priceDelta,
      available: input.available,
      active: input.active,
      sortOrder: input.sortOrder,
    };
    if (input.id) {
      const result = await tx.restaurantProductVariant.updateMany({
        where: {
          id: input.id,
          companyId,
          itemId: input.itemId,
          deletedAt: null,
        },
        data,
      });
      if (!result.count)
        throw new RestaurantDomainError("Variante non trovata.");
      return { id: input.id };
    }
    return tx.restaurantProductVariant.create({
      data: { companyId, ...data },
      select: { id: true },
    });
  });
}

export async function saveModifierGroup(
  companyId: string,
  input: {
    id?: string;
    itemId: string;
    name: string;
    required: boolean;
    minSelections: number;
    maxSelections: number;
    active: boolean;
    sortOrder: number;
  },
) {
  if (
    !Number.isInteger(input.minSelections) ||
    !Number.isInteger(input.maxSelections) ||
    input.minSelections < 0 ||
    input.maxSelections < input.minSelections ||
    (input.required && input.minSelections < 1)
  )
    throw new RestaurantDomainError("Limiti selezione non validi.");
  return prisma.$transaction(async (tx) => {
    await requireSellableItem(tx, companyId, input.itemId);
    const data = {
      itemId: input.itemId,
      name: clean(input.name, "Nome gruppo"),
      required: input.required,
      minSelections: input.minSelections,
      maxSelections: input.maxSelections,
      active: input.active,
      sortOrder: input.sortOrder,
    };
    if (input.id) {
      const result = await tx.restaurantModifierGroup.updateMany({
        where: {
          id: input.id,
          companyId,
          itemId: input.itemId,
          deletedAt: null,
        },
        data,
      });
      if (!result.count) throw new RestaurantDomainError("Gruppo non trovato.");
      return { id: input.id };
    }
    return tx.restaurantModifierGroup.create({
      data: { companyId, ...data },
      select: { id: true },
    });
  });
}

export async function saveModifier(
  companyId: string,
  input: {
    id?: string;
    locationId?: string;
    groupId: string;
    name: string;
    kitchenLabel?: string;
    priceDelta: number;
    fusionPluId?: number | null;
    fusionPlateVariation?: boolean;
    itemId?: string | null;
    active: boolean;
    sortOrder: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.restaurantModifierGroup.findFirst({
      where: { id: input.groupId, companyId, deletedAt: null },
      select: { id: true, itemId: true },
    });
    if (!group)
      throw new RestaurantDomainError("Gruppo modificatori non valido.");
    if (input.itemId) {
      const impactItem = await tx.item.findFirst({
        where: { id: input.itemId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!impactItem)
        throw new RestaurantDomainError("Item collegato non valido.");
    }
    const locationId =
      input.locationId ??
      (
        await tx.restaurantMenu.findFirst({
          where: {
            companyId,
            deletedAt: null,
            sections: { some: { items: { some: { itemId: group.itemId } } } },
          },
          orderBy: [{ active: "desc" }, { createdAt: "asc" }],
          select: { locationId: true },
        })
      )?.locationId ??
      (
        await tx.location.findFirst({
          where: { companyId, active: true, deletedAt: null },
          orderBy: [{ isHeadquarters: "desc" }, { createdAt: "asc" }],
          select: { id: true },
        })
      )?.id;
    if (!locationId)
      throw new RestaurantDomainError("Sede modifier non valida.");
    const location = await tx.location.findFirst({
      where: { id: locationId, companyId, active: true, deletedAt: null },
      select: { id: true },
    });
    if (!location) throw new RestaurantDomainError("Sede modifier non valida.");
    const name = clean(input.name, "Nome modifier"),
      fusionPluId = input.fusionPluId ?? null;
    if (
      fusionPluId !== null &&
      (!Number.isInteger(fusionPluId) || fusionPluId < 1)
    )
      throw new RestaurantDomainError("PLU FUSION modifier non valido.");
    const data = {
      locationId,
      groupId: input.groupId,
      name,
      kitchenLabel: clean(input.kitchenLabel || name, "Etichetta cucina"),
      priceDelta: input.priceDelta,
      fusionPluId,
      fusionPlateVariation: Boolean(input.fusionPlateVariation && fusionPluId),
      itemId: input.itemId || null,
      active: input.active,
      sortOrder: input.sortOrder,
    };
    if (input.id) {
      const result = await tx.restaurantModifier.updateMany({
        where: {
          id: input.id,
          companyId,
          locationId,
          groupId: input.groupId,
          deletedAt: null,
        },
        data,
      });
      if (!result.count)
        throw new RestaurantDomainError("Modifier non trovato.");
      return { id: input.id };
    }
    return tx.restaurantModifier.create({
      data: { companyId, ...data },
      select: { id: true },
    });
  });
}

export async function saveRecipeImpact(
  companyId: string,
  input: {
    variantId?: string | null;
    modifierId?: string | null;
    componentItemId: string;
    unitOfMeasureId: string;
    quantityDelta: number;
  },
) {
  if (
    Boolean(input.variantId) === Boolean(input.modifierId) ||
    !Number.isFinite(input.quantityDelta) ||
    input.quantityDelta === 0
  )
    throw new RestaurantDomainError("Impatto ricetta non valido.");
  return prisma.$transaction(async (tx) => {
    const [variant, modifier, component, unit] = await Promise.all([
      input.variantId
        ? tx.restaurantProductVariant.findFirst({
            where: { id: input.variantId, companyId, deletedAt: null },
            select: { id: true },
          })
        : null,
      input.modifierId
        ? tx.restaurantModifier.findFirst({
            where: { id: input.modifierId, companyId, deletedAt: null },
            select: { id: true },
          })
        : null,
      tx.item.findFirst({
        where: {
          id: input.componentItemId,
          companyId,
          stockManaged: true,
          deletedAt: null,
        },
        select: { id: true },
      }),
      tx.unitOfMeasure.findFirst({
        where: {
          id: input.unitOfMeasureId,
          companyId,
          active: true,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    if (
      (input.variantId && !variant) ||
      (input.modifierId && !modifier) ||
      !component ||
      !unit
    )
      throw new RestaurantDomainError(
        "Riferimenti impatto ricetta non validi.",
      );
    const where = input.variantId
      ? {
          companyId_variantId_componentItemId: {
            companyId,
            variantId: input.variantId,
            componentItemId: input.componentItemId,
          },
        }
      : {
          companyId_modifierId_componentItemId: {
            companyId,
            modifierId: input.modifierId!,
            componentItemId: input.componentItemId,
          },
        };
    return tx.restaurantRecipeImpact.upsert({
      where,
      create: {
        companyId,
        variantId: input.variantId || null,
        modifierId: input.modifierId || null,
        componentItemId: input.componentItemId,
        unitOfMeasureId: input.unitOfMeasureId,
        quantityDelta: input.quantityDelta,
      },
      update: {
        unitOfMeasureId: input.unitOfMeasureId,
        quantityDelta: input.quantityDelta,
      },
      select: { id: true },
    });
  });
}

export async function getRestaurantCatalog(companyId: string) {
  return prisma.item.findMany({
    where: { companyId, sellable: true, deletedAt: null },
    include: {
      category: true,
      vatRate: true,
      allergens: { include: { allergen: true } },
      restaurantVariants: {
        where: { deletedAt: null },
        include: {
          recipeImpacts: {
            include: { componentItem: true, unitOfMeasure: true },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      restaurantModifierGroups: {
        where: { deletedAt: null },
        include: {
          modifiers: {
            where: { deletedAt: null },
            include: {
              recipeImpacts: {
                include: { componentItem: true, unitOfMeasure: true },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
}
