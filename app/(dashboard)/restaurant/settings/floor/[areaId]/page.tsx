import { notFound } from "next/navigation";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getFloorConfiguration } from "@/lib/restaurant-floor-config";
import { FloorEditor } from "./floor-editor";

export default async function FloorEditorPage({
  params,
}: {
  params: Promise<{ areaId: string }>;
}) {
  const [context, { areaId }] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, "manage"),
    params,
  ]);
  const area = (await getFloorConfiguration(context)).find(
    ({ id }) => id === areaId,
  );
  if (!area) notFound();
  return (
    <FloorEditor
      area={{
        ...area,
        backgroundOpacity: Number(area.backgroundOpacity),
        updatedAt: area.updatedAt.toISOString(),
        tables: area.tables.map((table) => ({
          ...table,
          positionX: Number(table.positionX),
          positionY: Number(table.positionY),
          width: Number(table.width),
          height: Number(table.height),
          rotation: Number(table.rotation),
        })),
      }}
    />
  );
}
