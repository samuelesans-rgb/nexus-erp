"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import {
  saveFloorArea,
  saveFloorLayout,
  saveFloorTable,
} from "@/lib/restaurant-floor-config";
import {
  RestaurantFloorError,
  dissolveTableCombination,
  saveTableCombination,
} from "@/lib/restaurant-floor";
import { FloorConfigError } from "@/lib/restaurant-floor-config";

// Only domain errors are safe to echo back: a raw Prisma failure would leak
// constraint and table names into the UI.
function safeMessage(error: unknown, fallback = "Operazione non riuscita") {
  if (error instanceof FloorConfigError || error instanceof RestaurantFloorError)
    return error.message;
  console.error(
    JSON.stringify({
      scope: "restaurant-floor-config",
      error: error instanceof Error ? error.name : "Unknown",
    }),
  );
  return fallback;
}

const text = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();
const num = (data: FormData, key: string) =>
  Number(text(data, key).replace(",", "."));
const actor = () =>
  requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, "manage");
export type FloorConfigResult = { ok: boolean; message: string; id?: string };

export async function saveAreaConfigAction(data: FormData) {
  const context = await actor();
  try {
    await saveFloorArea(context, {
      id: text(data, "id") || undefined,
      code: text(data, "code"),
      name: text(data, "name"),
      active: data.get("active") === "on",
      sortOrder: num(data, "sortOrder"),
      layoutWidth: num(data, "layoutWidth"),
      layoutHeight: num(data, "layoutHeight"),
      backgroundImage: text(data, "backgroundImage") || null,
      backgroundOpacity: num(data, "backgroundOpacity"),
    });
  } catch (error) {
    redirect(
      `/restaurant/settings/floor?error=${encodeURIComponent(safeMessage(error))}`,
    );
  }
  revalidatePath("/restaurant/settings/floor");
  redirect("/restaurant/settings/floor?success=Sala salvata");
}

export async function saveTableConfigAction(
  areaId: string,
  input: Parameters<typeof saveFloorTable>[1],
): Promise<FloorConfigResult> {
  try {
    const result = await saveFloorTable(await actor(), { ...input, areaId });
    revalidatePath(`/restaurant/settings/floor/${areaId}`);
    revalidatePath("/restaurant/floor");
    return { ok: true, message: "Tavolo salvato", id: result.id };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function saveLayoutConfigAction(
  areaId: string,
  expectedUpdatedAt: string,
  tables: Parameters<typeof saveFloorLayout>[3],
): Promise<FloorConfigResult> {
  try {
    await saveFloorLayout(
      await actor(),
      areaId,
      new Date(expectedUpdatedAt),
      tables,
    );
    revalidatePath(`/restaurant/settings/floor/${areaId}`);
    revalidatePath("/restaurant/floor");
    return { ok: true, message: "Pianta salvata" };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function saveCombinationConfigAction(data: FormData) {
  const context = await actor();
  const areaId = text(data, "areaId");
  try {
    await saveTableCombination(context.companyId, context.locationId, {
      id: text(data, "id") || undefined,
      name: text(data, "name"),
      tableIds: data.getAll("tableIds").map(String),
      active: true,
    });
  } catch (error) {
    redirect(
      `/restaurant/settings/floor/${areaId}?error=${encodeURIComponent(safeMessage(error, "Combinazione non salvata"))}`,
    );
  }
  revalidatePath(`/restaurant/settings/floor/${areaId}`);
  revalidatePath("/restaurant/floor");
  redirect(
    `/restaurant/settings/floor/${areaId}?success=${encodeURIComponent("Combinazione salvata")}`,
  );
}

export async function dissolveCombinationConfigAction(data: FormData) {
  const context = await actor();
  const areaId = text(data, "areaId");
  try {
    await dissolveTableCombination(
      context.companyId,
      context.locationId,
      text(data, "id"),
    );
  } catch (error) {
    redirect(
      `/restaurant/settings/floor/${areaId}?error=${encodeURIComponent(safeMessage(error, "Combinazione non sciolta"))}`,
    );
  }
  revalidatePath(`/restaurant/settings/floor/${areaId}`);
  revalidatePath("/restaurant/floor");
  redirect(
    `/restaurant/settings/floor/${areaId}?success=${encodeURIComponent("Combinazione sciolta")}`,
  );
}
