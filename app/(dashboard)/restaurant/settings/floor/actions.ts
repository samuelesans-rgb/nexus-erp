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
      `/restaurant/settings/floor?error=${encodeURIComponent(error instanceof Error ? error.message : "Operazione non riuscita")}`,
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
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Operazione non riuscita",
    };
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
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Operazione non riuscita",
    };
  }
}
