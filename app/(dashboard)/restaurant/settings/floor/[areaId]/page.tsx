import { notFound } from "next/navigation";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import {
  getAreaCombinations,
  getFloorConfiguration,
} from "@/lib/restaurant-floor-config";
import { FloorEditor } from "./floor-editor";
import {
  dissolveCombinationConfigAction,
  saveCombinationConfigAction,
} from "../actions";

export default async function FloorEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [context, { areaId }, feedback] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, "manage"),
    params,
    searchParams,
  ]);
  const area = (await getFloorConfiguration(context)).find(
    ({ id }) => id === areaId,
  );
  if (!area) notFound();
  const combinations = await getAreaCombinations(context, area.id);
  const combinable = area.tables.filter(
    (table) => table.active && table.combinable && !table.deletedAt,
  );
  return (
    <div className="space-y-6">
      {(feedback.error || feedback.success) && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${feedback.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {feedback.error ?? feedback.success}
        </p>
      )}
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
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-bold">Combinazioni tavoli</h2>
        <p className="mt-1 text-sm text-slate-500">
          Una combinazione unisce due o più tavoli combinabili della stessa sala
          e abilita le comande multi-tavolo in Sala.
        </p>
        {combinable.length < 2 ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Servono almeno due tavoli attivi e combinabili in questa sala.
          </p>
        ) : (
          <form
            action={saveCombinationConfigAction}
            className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
          >
            <input type="hidden" name="areaId" value={area.id} />
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Nome combinazione
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Es. Tavolata 8 coperti"
                  className="mt-1 min-h-11 w-full rounded border px-3"
                />
              </label>
              <fieldset className="rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium">
                  Tavoli inclusi (minimo 2)
                </legend>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {combinable.map((table) => (
                    <label key={table.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="tableIds"
                        value={table.id}
                        className="size-4"
                      />
                      {table.code} · {table.name} ({table.seats})
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <button className="min-h-11 self-end rounded-lg bg-slate-950 px-5 font-bold text-white">
              Crea combinazione
            </button>
          </form>
        )}
        <ul className="mt-5 space-y-2">
          {combinations.map((combination) => (
            <li
              key={combination.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div>
                <p className="font-semibold">{combination.name}</p>
                <p className="text-sm text-slate-500">
                  {combination.tables
                    .map(({ table }) => `${table.code} · ${table.name}`)
                    .join(" + ")}{" "}
                  ·{" "}
                  {combination.tables.reduce(
                    (sum, { table }) => sum + table.seats,
                    0,
                  )}{" "}
                  coperti
                </p>
              </div>
              <form action={dissolveCombinationConfigAction}>
                <input type="hidden" name="areaId" value={area.id} />
                <input type="hidden" name="id" value={combination.id} />
                <button className="min-h-11 rounded-lg border px-4 text-sm font-semibold">
                  Sciogli
                </button>
              </form>
            </li>
          ))}
          {!combinations.length && (
            <li className="text-sm text-slate-500">
              Nessuna combinazione configurata.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
