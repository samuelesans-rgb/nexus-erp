"use server";

import { getAuthorizationContext } from "@/lib/authorization";
import { Prisma } from "@/generated/prisma/client";
import {
  isCatalogItemType,
  itemTypeSupportsStock,
  type CatalogItemType,
} from "@/lib/item-types";
import { isItemTypeEnabled } from "@/lib/items";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ItemFormState = {
  status: "idle" | "error";
  message?: string;
  errors?: Record<string, string>;
};

type TransactionClient = Prisma.TransactionClient;

const allowedStatuses = new Set(["ACTIVE", "SUSPENDED"]);

function optionalText(formData: FormData, field: string, max = 255) {
  const value = String(formData.get(field) ?? "").trim();
  return value ? value.slice(0, max) : null;
}

function optionalNumber(
  formData: FormData,
  field: string,
  options: { integer?: boolean; min?: number; max?: number } = {}
) {
  const value = String(formData.get(field) ?? "").trim().replace(",", ".");
  if (!value) return null;
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    (options.integer && !Number.isInteger(parsed)) ||
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    return undefined;
  }
  return value;
}

function parseComponents(formData: FormData, includeWaste: boolean) {
  const itemIds = formData.getAll("componentItemId").map(String);
  const quantities = formData.getAll("componentQuantity").map(String);
  const unitIds = formData.getAll("componentUnitId").map(String);
  const wasteValues = formData.getAll("componentWaste").map(String);
  const components: Array<{
    componentItemId: string;
    unitOfMeasureId: string;
    quantity: string;
    wastePercentage: string | null;
    sortOrder: number;
  }> = [];
  const errors: Record<string, string> = {};

  for (let index = 0; index < itemIds.length; index += 1) {
    const componentItemId = itemIds[index]?.trim();
    if (!componentItemId) continue;
    const unitOfMeasureId = unitIds[index]?.trim();
    const quantity = Number(quantities[index]?.replace(",", "."));
    const waste = includeWaste
      ? Number(wasteValues[index]?.replace(",", ".") || "0")
      : 0;
    if (!unitOfMeasureId || !Number.isFinite(quantity) || quantity <= 0) {
      errors.components = "Ogni componente richiede Item, unità e quantità positiva.";
      continue;
    }
    if (!Number.isFinite(waste) || waste < 0 || waste > 100) {
      errors.components = "Lo scarto deve essere compreso tra 0 e 100.";
      continue;
    }
    components.push({
      componentItemId,
      unitOfMeasureId,
      quantity: String(quantity),
      wastePercentage: includeWaste ? String(waste) : null,
      sortOrder: index,
    });
  }

  if (new Set(components.map(({ componentItemId }) => componentItemId)).size !== components.length) {
    errors.components = "Lo stesso Item può comparire una sola volta.";
  }

  return { components, errors };
}

async function requireItemSession() {
  let context;
  try { context = await getAuthorizationContext(); }
  catch { return { error: "Sessione scaduta. Accedi nuovamente per continuare." } as const; }
  try {
    await requireModule(context.companyId, MODULE_CODES.CORE_PRODUCTS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) {
      return {
        error: "Il modulo Prodotti e servizi non è attivo per questa azienda.",
      } as const;
    }
    throw error;
  }
  return { session: { user: { id: context.userId, membershipId: context.membershipId, companyId: context.companyId, companyName: context.companyName, roles: context.roles } } } as const;
}

function parseItemForm(formData: FormData) {
  const typeValue = String(formData.get("type") ?? "");
  const status = String(formData.get("status") ?? "");
  const name = optionalText(formData, "name", 200);
  const code = optionalText(formData, "code", 80)?.toUpperCase();
  const salePrice = optionalNumber(formData, "salePrice", { min: 0 });
  const purchasePrice = optionalNumber(formData, "purchasePrice", { min: 0 });
  const standardCost = optionalNumber(formData, "standardCost", { min: 0 });
  const errors: Record<string, string> = {};

  if (!isCatalogItemType(typeValue)) errors.type = "Seleziona un tipo valido.";
  if (!allowedStatuses.has(status)) errors.status = "Seleziona uno stato valido.";
  if (!name) errors.name = "Il nome è obbligatorio.";
  if (salePrice === undefined) errors.salePrice = "Il prezzo non può essere negativo.";
  if (purchasePrice === undefined) {
    errors.purchasePrice = "Il prezzo non può essere negativo.";
  }
  if (standardCost === undefined) {
    errors.standardCost = "Il costo non può essere negativo.";
  }

  const type: CatalogItemType = isCatalogItemType(typeValue)
    ? typeValue
    : "PRODUCT";
  const stockManaged = formData.get("stockManaged") === "on";
  if (stockManaged && !itemTypeSupportsStock(type)) {
    errors.stockManaged =
      "La gestione stock è ammessa solo per prodotti e ingredienti.";
  }

  const recipeComponents = parseComponents(formData, true);
  const packageComponents = parseComponents(formData, false);
  const components =
    type === "RECIPE"
      ? recipeComponents.components
      : type === "PACKAGE"
        ? packageComponents.components
        : [];
  if (type === "RECIPE") Object.assign(errors, recipeComponents.errors);
  if (type === "PACKAGE") Object.assign(errors, packageComponents.errors);

  const positiveIntFields = [
    "durationMinutes",
    "defaultCapacity",
    "perishabilityDays",
    "preparationMinutes",
    "beautyDurationMinutes",
    "cleanupMinutes",
    "recommendedRepeatDays",
    "capacityAdults",
    "validityDays",
    "usageLimit",
    "defaultValidityDays",
  ] as const;
  const positiveValues = Object.fromEntries(
    positiveIntFields.map((field) => [
      field,
      optionalNumber(formData, field, { integer: true, min: 1 }),
    ])
  ) as Record<(typeof positiveIntFields)[number], string | null | undefined>;
  for (const field of positiveIntFields) {
    if (positiveValues[field] === undefined) {
      errors[field] = "Inserisci un numero intero positivo.";
    }
  }

  const capacityChildren = optionalNumber(formData, "capacityChildren", {
    integer: true,
    min: 0,
  });
  if (capacityChildren === undefined) {
    errors.capacityChildren = "Inserisci un numero intero non negativo.";
  }

  const percentageFields = [
    "yieldPercentage",
    "foodCostTarget",
  ] as const;
  const percentages = Object.fromEntries(
    percentageFields.map((field) => [
      field,
      optionalNumber(formData, field, { min: 0, max: 100 }),
    ])
  ) as Record<(typeof percentageFields)[number], string | null | undefined>;
  for (const field of percentageFields) {
    if (percentages[field] === undefined) {
      errors[field] = "Inserisci una percentuale tra 0 e 100.";
    }
  }

  const positiveDecimals = ["weight", "reorderPoint", "minimumStock", "portions", "yieldQuantity"] as const;
  const decimalValues = Object.fromEntries(
    positiveDecimals.map((field) => [
      field,
      optionalNumber(formData, field, { min: 0 }),
    ])
  ) as Record<(typeof positiveDecimals)[number], string | null | undefined>;
  for (const field of positiveDecimals) {
    if (decimalValues[field] === undefined) {
      errors[field] = "Inserisci un valore non negativo.";
    }
  }

  const fixedValue = optionalNumber(formData, "fixedValue", { min: 0 });
  if (fixedValue === undefined) errors.fixedValue = "Il valore non può essere negativo.";
  if (type === "BEAUTY_SERVICE" && !positiveValues.beautyDurationMinutes) {
    errors.beautyDurationMinutes = "La durata è obbligatoria.";
  }
  if (type === "GIFT_CARD" && !positiveValues.defaultValidityDays) {
    errors.defaultValidityDays = "La validità è obbligatoria.";
  }

  return {
    errors,
    components,
    data: {
      type,
      status: status === "SUSPENDED" ? "SUSPENDED" as const : "ACTIVE" as const,
      code,
      name: name ?? "",
      shortName: optionalText(formData, "shortName", 100),
      description: optionalText(formData, "description", 5000),
      internalNotes: optionalText(formData, "internalNotes", 5000),
      barcode: optionalText(formData, "barcode", 100),
      sku: optionalText(formData, "sku", 100),
      imageUrl: optionalText(formData, "imageUrl", 1000),
      categoryId: optionalText(formData, "categoryId"),
      unitOfMeasureId: optionalText(formData, "unitOfMeasureId"),
      vatRateId: optionalText(formData, "vatRateId"),
      salePrice,
      purchasePrice,
      standardCost,
      currency: (optionalText(formData, "currency", 3) ?? "EUR").toUpperCase(),
      sellable: formData.get("sellable") === "on",
      purchasable: formData.get("purchasable") === "on",
      stockManaged,
      trackLots: stockManaged && formData.get("trackLots") === "on",
      trackSerials: stockManaged && formData.get("trackSerials") === "on",
      trackExpiration:
        stockManaged && formData.get("trackExpiration") === "on",
      active: formData.get("active") === "on",
      profile: {
        weight: decimalValues.weight,
        dimensions: optionalText(formData, "dimensions", 2000),
        manufacturer: optionalText(formData, "manufacturer"),
        brand: optionalText(formData, "brand"),
        reorderPoint: decimalValues.reorderPoint,
        minimumStock: decimalValues.minimumStock,
        durationMinutes: positiveValues.durationMinutes,
        requiresAppointment: formData.get("requiresAppointment") === "on",
        defaultCapacity: positiveValues.defaultCapacity,
        yieldPercentage: percentages.yieldPercentage,
        storageInstructions: optionalText(formData, "storageInstructions", 3000),
        allergenNotes: optionalText(formData, "allergenNotes", 3000),
        perishabilityDays: positiveValues.perishabilityDays,
        preparationMinutes: positiveValues.preparationMinutes,
        portions: decimalValues.portions,
        yieldQuantity: decimalValues.yieldQuantity,
        instructions: optionalText(formData, "instructions", 10000),
        foodCostTarget: percentages.foodCostTarget,
        beautyDurationMinutes: positiveValues.beautyDurationMinutes,
        cleanupMinutes: positiveValues.cleanupMinutes,
        requiresCabin: formData.get("requiresCabin") === "on",
        requiresOperator: formData.get("requiresOperator") === "on",
        recommendedRepeatDays: positiveValues.recommendedRepeatDays,
        consentRequired: formData.get("consentRequired") === "on",
        capacityAdults: positiveValues.capacityAdults,
        capacityChildren,
        roomTypeCode: optionalText(formData, "roomTypeCode", 80),
        physicalRoomCode: optionalText(formData, "physicalRoomCode", 80),
        floor: optionalText(formData, "floor", 80),
        sellableUnit: formData.get("sellableUnit") === "on",
        housekeepingRequired: formData.get("housekeepingRequired") === "on",
        validityDays: positiveValues.validityDays,
        usageLimit: positiveValues.usageLimit,
        defaultValidityDays: positiveValues.defaultValidityDays,
        fixedValue,
        reusable: formData.get("reusable") === "on",
        transferable: formData.get("transferable") === "on",
      },
    },
  };
}

async function validateRelations(
  companyId: string,
  itemId: string | null,
  parsed: ReturnType<typeof parseItemForm>
) {
  if (!(await isItemTypeEnabled(companyId, parsed.data.type))) {
    return "Il modulo richiesto per questo tipo Item non è attivo.";
  }
  if (
    itemId &&
    parsed.components.some(({ componentItemId }) => componentItemId === itemId)
  ) {
    return "Un Item non può includere sé stesso come componente.";
  }

  const componentItemIds = parsed.components.map(
    ({ componentItemId }) => componentItemId
  );
  const componentUnitIds = parsed.components.map(
    ({ unitOfMeasureId }) => unitOfMeasureId
  );

  const [categoryCount, unitCount, vatCount, componentItemCount, componentUnitCount] =
    await Promise.all([
      parsed.data.categoryId
        ? prisma.itemCategory.count({
            where: {
              id: parsed.data.categoryId,
              companyId,
              active: true,
              deletedAt: null,
            },
          })
        : 0,
      parsed.data.unitOfMeasureId
        ? prisma.unitOfMeasure.count({
            where: { id: parsed.data.unitOfMeasureId, companyId, active: true, deletedAt: null },
          })
        : 0,
      parsed.data.vatRateId
        ? prisma.vatRate.count({
            where: { id: parsed.data.vatRateId, companyId, active: true, deletedAt: null },
          })
        : 0,
      componentItemIds.length
        ? prisma.item.count({
            where: {
              id: { in: componentItemIds },
              companyId,
              active: true,
              deletedAt: null,
            },
          })
        : 0,
      componentUnitIds.length
        ? prisma.unitOfMeasure.count({
            where: {
              id: { in: componentUnitIds },
              companyId,
              active: true,
              deletedAt: null,
            },
          })
        : 0,
    ]);
  if (parsed.data.categoryId && categoryCount !== 1) return "Categoria non valida.";
  if (parsed.data.unitOfMeasureId && unitCount !== 1) return "Unità di misura non valida.";
  if (parsed.data.vatRateId && vatCount !== 1) return "Aliquota IVA non valida.";
  if (componentItemCount !== new Set(componentItemIds).size) {
    return "Uno o più componenti non appartengono alla Company attiva.";
  }
  if (componentUnitCount !== new Set(componentUnitIds).size) {
    return "Una o più unità dei componenti non sono valide.";
  }
  return null;
}

function itemData(
  companyId: string,
  userId: string,
  parsed: ReturnType<typeof parseItemForm>
) {
  const { profile, code, ...data } = parsed.data;
  void profile;
  return {
    ...data,
    ...(code ? { code } : {}),
    companyId,
    updatedById: userId,
  };
}

async function saveProfile(
  tx: TransactionClient,
  companyId: string,
  itemId: string,
  parsed: ReturnType<typeof parseItemForm>
) {
  const profile = parsed.data.profile;
  switch (parsed.data.type) {
    case "PRODUCT":
      await tx.productProfile.upsert({
        where: { itemId },
        update: {
          weight: profile.weight,
          dimensions: profile.dimensions ?? Prisma.JsonNull,
          manufacturer: profile.manufacturer,
          brand: profile.brand,
          reorderPoint: profile.reorderPoint,
          minimumStock: profile.minimumStock,
        },
        create: {
          itemId,
          companyId,
          weight: profile.weight,
          dimensions: profile.dimensions ?? Prisma.JsonNull,
          manufacturer: profile.manufacturer,
          brand: profile.brand,
          reorderPoint: profile.reorderPoint,
          minimumStock: profile.minimumStock,
        },
      });
      break;
    case "SERVICE":
      await tx.serviceProfile.upsert({
        where: { itemId },
        update: {
          durationMinutes: profile.durationMinutes
            ? Number(profile.durationMinutes)
            : null,
          requiresAppointment: profile.requiresAppointment,
          defaultCapacity: profile.defaultCapacity
            ? Number(profile.defaultCapacity)
            : null,
        },
        create: {
          itemId,
          companyId,
          durationMinutes: profile.durationMinutes
            ? Number(profile.durationMinutes)
            : null,
          requiresAppointment: profile.requiresAppointment,
          defaultCapacity: profile.defaultCapacity
            ? Number(profile.defaultCapacity)
            : null,
        },
      });
      break;
    case "INGREDIENT":
      await tx.ingredientProfile.upsert({
        where: { itemId },
        update: {
          yieldPercentage: profile.yieldPercentage,
          storageInstructions: profile.storageInstructions,
          allergenNotes: profile.allergenNotes,
          perishabilityDays: profile.perishabilityDays
            ? Number(profile.perishabilityDays)
            : null,
        },
        create: {
          itemId,
          companyId,
          yieldPercentage: profile.yieldPercentage,
          storageInstructions: profile.storageInstructions,
          allergenNotes: profile.allergenNotes,
          perishabilityDays: profile.perishabilityDays
            ? Number(profile.perishabilityDays)
            : null,
        },
      });
      break;
    case "RECIPE":
      await tx.recipeProfile.upsert({
        where: { itemId },
        update: {
          preparationMinutes: profile.preparationMinutes
            ? Number(profile.preparationMinutes)
            : null,
          portions: profile.portions,
          yieldQuantity: profile.yieldQuantity,
          instructions: profile.instructions,
          foodCostTarget: profile.foodCostTarget,
        },
        create: {
          itemId,
          companyId,
          preparationMinutes: profile.preparationMinutes
            ? Number(profile.preparationMinutes)
            : null,
          portions: profile.portions,
          yieldQuantity: profile.yieldQuantity,
          instructions: profile.instructions,
          foodCostTarget: profile.foodCostTarget,
        },
      });
      await syncRecipeComponents(tx, companyId, itemId, parsed.components);
      break;
    case "BEAUTY_SERVICE":
      await tx.beautyServiceProfile.upsert({
        where: { itemId },
        update: {
          durationMinutes: Number(profile.beautyDurationMinutes),
          cleanupMinutes: profile.cleanupMinutes
            ? Number(profile.cleanupMinutes)
            : null,
          requiresCabin: profile.requiresCabin,
          requiresOperator: profile.requiresOperator,
          recommendedRepeatDays: profile.recommendedRepeatDays
            ? Number(profile.recommendedRepeatDays)
            : null,
          consentRequired: profile.consentRequired,
        },
        create: {
          itemId,
          companyId,
          durationMinutes: Number(profile.beautyDurationMinutes),
          cleanupMinutes: profile.cleanupMinutes
            ? Number(profile.cleanupMinutes)
            : null,
          requiresCabin: profile.requiresCabin,
          requiresOperator: profile.requiresOperator,
          recommendedRepeatDays: profile.recommendedRepeatDays
            ? Number(profile.recommendedRepeatDays)
            : null,
          consentRequired: profile.consentRequired,
        },
      });
      break;
    case "HOTEL_ROOM":
      await tx.hotelRoomProfile.upsert({
        where: { itemId },
        update: {
          capacityAdults: Number(profile.capacityAdults ?? 1),
          capacityChildren: Number(profile.capacityChildren ?? 0),
          roomTypeCode: profile.roomTypeCode,
          physicalRoomCode: profile.physicalRoomCode,
          floor: profile.floor,
          sellableUnit: profile.sellableUnit,
          housekeepingRequired: profile.housekeepingRequired,
        },
        create: {
          itemId,
          companyId,
          capacityAdults: Number(profile.capacityAdults ?? 1),
          capacityChildren: Number(profile.capacityChildren ?? 0),
          roomTypeCode: profile.roomTypeCode,
          physicalRoomCode: profile.physicalRoomCode,
          floor: profile.floor,
          sellableUnit: profile.sellableUnit,
          housekeepingRequired: profile.housekeepingRequired,
        },
      });
      break;
    case "PACKAGE":
      await tx.packageProfile.upsert({
        where: { itemId },
        update: {
          validityDays: profile.validityDays ? Number(profile.validityDays) : null,
          usageLimit: profile.usageLimit ? Number(profile.usageLimit) : null,
        },
        create: {
          itemId,
          companyId,
          validityDays: profile.validityDays ? Number(profile.validityDays) : null,
          usageLimit: profile.usageLimit ? Number(profile.usageLimit) : null,
        },
      });
      await syncPackageComponents(tx, companyId, itemId, parsed.components);
      break;
    case "GIFT_CARD":
      await tx.giftCardProfile.upsert({
        where: { itemId },
        update: {
          defaultValidityDays: Number(profile.defaultValidityDays),
          fixedValue: profile.fixedValue,
          reusable: profile.reusable,
          transferable: profile.transferable,
        },
        create: {
          itemId,
          companyId,
          defaultValidityDays: Number(profile.defaultValidityDays),
          fixedValue: profile.fixedValue,
          reusable: profile.reusable,
          transferable: profile.transferable,
        },
      });
  }
}

async function syncRecipeComponents(
  tx: TransactionClient,
  companyId: string,
  recipeItemId: string,
  components: ReturnType<typeof parseComponents>["components"]
) {
  await tx.recipeComponent.updateMany({
    where: { companyId, recipeItemId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  for (const component of components) {
    await tx.recipeComponent.upsert({
      where: {
        companyId_recipeItemId_componentItemId: {
          companyId,
          recipeItemId,
          componentItemId: component.componentItemId,
        },
      },
      update: {
        unitOfMeasureId: component.unitOfMeasureId,
        quantity: component.quantity,
        wastePercentage: component.wastePercentage,
        sortOrder: component.sortOrder,
        deletedAt: null,
      },
      create: {
        ...component,
        companyId,
        recipeItemId,
      },
    });
  }
}

async function syncPackageComponents(
  tx: TransactionClient,
  companyId: string,
  packageItemId: string,
  components: ReturnType<typeof parseComponents>["components"]
) {
  await tx.packageComponent.updateMany({
    where: { companyId, packageItemId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  for (const componentWithWaste of components) {
    const { wastePercentage, ...component } = componentWithWaste;
    void wastePercentage;
    await tx.packageComponent.upsert({
      where: {
        companyId_packageItemId_componentItemId: {
          companyId,
          packageItemId,
          componentItemId: component.componentItemId,
        },
      },
      update: {
        unitOfMeasureId: component.unitOfMeasureId,
        quantity: component.quantity,
        sortOrder: component.sortOrder,
        deletedAt: null,
      },
      create: {
        ...component,
        companyId,
        packageItemId,
      },
    });
  }
}

function knownDatabaseMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return "Il codice Item è già utilizzato in questa Company.";
  }
  return null;
}

export async function createItem(
  _previousState: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const context = await requireItemSession();
  if ("error" in context) return { status: "error", message: context.error };
  const parsed = parseItemForm(formData);
  if (Object.keys(parsed.errors).length) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }
  const companyId = context.session.user.companyId;
  const relationError = await validateRelations(companyId, null, parsed);
  if (relationError) return { status: "error", message: relationError };

  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          ...itemData(companyId, context.session.user.id, parsed),
          createdById: context.session.user.id,
        },
        select: { id: true },
      });
      if (
        parsed.components.some(
          ({ componentItemId }) => componentItemId === created.id
        )
      ) {
        throw new Error("ITEM_SELF_REFERENCE");
      }
      await saveProfile(tx, companyId, created.id, parsed);
      return created;
    });
    revalidatePath("/items");
    redirect(`/items/${item.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === "ITEM_SELF_REFERENCE") {
      return { status: "error", message: "Un Item non può includere sé stesso." };
    }
    const message = knownDatabaseMessage(error);
    if (message) return { status: "error", message };
    throw error;
  }
}

export async function updateItem(
  itemId: string,
  _previousState: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const context = await requireItemSession();
  if ("error" in context) return { status: "error", message: context.error };
  const parsed = parseItemForm(formData);
  if (Object.keys(parsed.errors).length) {
    return {
      status: "error",
      message: "Controlla i campi evidenziati.",
      errors: parsed.errors,
    };
  }
  const companyId = context.session.user.companyId;
  const existing = await prisma.item.findFirst({
    where: { id: itemId, companyId },
    select: { id: true, type: true },
  });
  if (!existing) return { status: "error", message: "Item non trovato." };
  if (existing.type !== parsed.data.type) {
    return {
      status: "error",
      message: "Il tipo Item non può essere cambiato dopo la creazione.",
    };
  }
  const relationError = await validateRelations(companyId, itemId, parsed);
  if (relationError) return { status: "error", message: relationError };

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.item.updateMany({
        where: { id: itemId, companyId },
        data: itemData(companyId, context.session.user.id, parsed),
      });
      if (result.count !== 1) throw new Error("ITEM_NOT_FOUND");
      await saveProfile(tx, companyId, itemId, parsed);
    });
    revalidatePath("/items");
    revalidatePath(`/items/${itemId}`);
    redirect(`/items/${itemId}`);
  } catch (error) {
    const message = knownDatabaseMessage(error);
    if (message) return { status: "error", message };
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") {
      return { status: "error", message: "Item non trovato." };
    }
    throw error;
  }
}

export async function archiveItem(formData: FormData) {
  const context = await requireItemSession();
  if ("error" in context) redirect("/items");
  const itemId = String(formData.get("itemId") ?? "");
  await prisma.item.updateMany({
    where: {
      id: itemId,
      companyId: context.session.user.companyId,
      deletedAt: null,
    },
    data: {
      active: false,
      deletedAt: new Date(),
      updatedById: context.session.user.id,
    },
  });
  revalidatePath("/items");
  redirect("/items");
}

export async function restoreItem(formData: FormData) {
  const context = await requireItemSession();
  if ("error" in context) redirect("/items");
  const itemId = String(formData.get("itemId") ?? "");
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      companyId: context.session.user.companyId,
      deletedAt: { not: null },
    },
    select: { type: true },
  });
  if (!item || !(await isItemTypeEnabled(context.session.user.companyId, item.type))) {
    redirect("/items");
  }
  await prisma.item.updateMany({
    where: {
      id: itemId,
      companyId: context.session.user.companyId,
      deletedAt: { not: null },
    },
    data: {
      active: true,
      deletedAt: null,
      updatedById: context.session.user.id,
    },
  });
  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  redirect(`/items/${itemId}`);
}
