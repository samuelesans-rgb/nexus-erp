import Link from "next/link";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { getFloorConfiguration } from "@/lib/restaurant-floor-config";
import { saveAreaConfigAction } from "./actions";

const field = "min-h-11 rounded-lg border px-3";
export default async function FloorSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [context, query] = await Promise.all([
    requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, "manage"),
    searchParams,
  ]);
  const areas = await getFloorConfiguration(context);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Configurazione Sala</h1>
        <p className="text-slate-500">
          Crea sale e configura graficamente i tavoli.
        </p>
      </header>
      {query.error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {query.error}
        </p>
      )}
      {query.success && (
        <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-700">
          {query.success}
        </p>
      )}
      <details className="rounded-2xl border bg-white p-5">
        <summary className="cursor-pointer text-lg font-bold">
          + Nuova sala
        </summary>
        <form
          action={saveAreaConfigAction}
          className="mt-4 grid gap-3 md:grid-cols-3"
        >
          <input name="code" required placeholder="Codice" className={field} />
          <input
            name="name"
            required
            placeholder="Nome sala"
            className={field}
          />
          <input
            name="sortOrder"
            type="number"
            defaultValue="0"
            aria-label="Ordine"
            className={field}
          />
          <input
            name="layoutWidth"
            type="number"
            min="320"
            max="5000"
            defaultValue="1200"
            aria-label="Larghezza pianta"
            className={field}
          />
          <input
            name="layoutHeight"
            type="number"
            min="240"
            max="5000"
            defaultValue="800"
            aria-label="Altezza pianta"
            className={field}
          />
          <input
            name="backgroundImage"
            type="url"
            placeholder="URL sfondo opzionale"
            className={field}
          />
          <input
            name="backgroundOpacity"
            type="number"
            min="0"
            max="1"
            step="0.05"
            defaultValue="0.15"
            aria-label="Opacità sfondo"
            className={field}
          />
          <label className="flex items-center gap-2">
            <input name="active" type="checkbox" defaultChecked /> Attiva
          </label>
          <button className="rounded-lg bg-slate-950 px-4 text-white">
            Crea sala
          </button>
        </form>
      </details>
      <div className="space-y-4">
        {areas.map((area) => (
          <section key={area.id} className="rounded-2xl border bg-white p-5">
            <form
              action={saveAreaConfigAction}
              className="grid gap-3 md:grid-cols-4"
            >
              <input type="hidden" name="id" value={area.id} />
              <input
                name="code"
                defaultValue={area.code}
                required
                aria-label={`Codice ${area.name}`}
                className={field}
              />
              <input
                name="name"
                defaultValue={area.name}
                required
                aria-label={`Nome ${area.name}`}
                className={field}
              />
              <input
                name="sortOrder"
                type="number"
                defaultValue={area.sortOrder}
                aria-label={`Ordine ${area.name}`}
                className={field}
              />
              <span className="text-sm text-slate-500">
                {area.tables.length} tavoli
              </span>
              <input
                name="layoutWidth"
                type="number"
                min="320"
                max="5000"
                defaultValue={area.layoutWidth}
                aria-label={`Larghezza ${area.name}`}
                className={field}
              />
              <input
                name="layoutHeight"
                type="number"
                min="240"
                max="5000"
                defaultValue={area.layoutHeight}
                aria-label={`Altezza ${area.name}`}
                className={field}
              />
              <input
                name="backgroundImage"
                type="url"
                defaultValue={area.backgroundImage ?? ""}
                placeholder="URL sfondo opzionale"
                className={field}
              />
              <input
                name="backgroundOpacity"
                type="number"
                min="0"
                max="1"
                step="0.05"
                defaultValue={Number(area.backgroundOpacity)}
                aria-label={`Opacità ${area.name}`}
                className={field}
              />
              <label className="flex items-center gap-2">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={area.active}
                />{" "}
                Attiva
              </label>
              <button className="min-h-11 rounded-lg border px-4">
                Salva sala
              </button>
              <Link
                href={`/restaurant/settings/floor/${area.id}`}
                className="min-h-11 rounded-lg bg-slate-950 px-4 py-2.5 text-center font-bold text-white"
              >
                Configura pianta
              </Link>
            </form>
          </section>
        ))}
        {!areas.length && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <h2 className="font-bold">Nessuna sala configurata</h2>
            <p className="text-slate-500">Usa “Nuova sala” per iniziare.</p>
          </div>
        )}
      </div>
    </div>
  );
}
