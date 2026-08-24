import Link from "next/link";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { MODULE_CODES } from "@/lib/module-catalog";
import { getOperationalFloor } from "@/lib/restaurant-floor";
import { FloorEditor } from "./floor-editor";
import { saveCombinationAction, dissolveCombinationAction } from "./actions";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [c, m] = await Promise.all([
      requireRestaurantContext(MODULE_CODES.RESTAURANT_FLOOR, "manage"),
      searchParams,
    ]),
    floor = await getOperationalFloor(c.companyId, c.locationId);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Sala operativa</h1>
        <p className="text-slate-500">
          Trascina un tavolo e premi il tavolo per salvare la posizione.
        </p>
      </header>
      {m.error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-800">
          {m.error}
        </p>
      )}
      {m.success && (
        <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-800">
          {m.success}
        </p>
      )}
      {floor.areas.map((area) => (
        <section className="space-y-3" key={area.id}>
          <h2 className="text-xl font-semibold">{area.name}</h2>
          <FloorEditor
            areaId={area.id}
            tables={area.tables.map((table) => ({
              ...table,
              positionX: Number(table.positionX),
              positionY: Number(table.positionY),
              width: Number(table.width),
              height: Number(table.height),
              rotation: Number(table.rotation),
            }))}
          />
        </section>
      ))}
      <section className="rounded-xl border p-5">
        <h2 className="text-xl font-semibold">Combinazioni consentite</h2>
        <form
          action={saveCombinationAction}
          className="mt-3 grid gap-3 md:grid-cols-3"
        >
          <input
            className="rounded border p-2"
            name="name"
            placeholder="Nome combinazione"
            required
          />
          <select
            className="rounded border p-2"
            name="tableIds"
            multiple
            required
          >
            {floor.areas.flatMap((a) =>
              a.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {a.name} · {t.name} ({t.seats})
                </option>
              )),
            )}
          </select>
          <label>
            <input type="checkbox" name="active" defaultChecked /> Attiva
          </label>
          <button className="rounded bg-slate-900 p-2 text-white">
            Salva combinazione
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {floor.combinations.map((combo) => (
            <div
              className="flex items-center justify-between rounded border p-3"
              key={combo.id}
            >
              <span>
                <b>{combo.name}</b> · {combo.tables.length} tavoli
              </span>
              <form action={dissolveCombinationAction}>
                <input type="hidden" name="id" value={combo.id} />
                <button className="rounded border px-3 py-1">Sciogli</button>
              </form>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="text-xl font-semibold">Prenotazioni imminenti</h2>
        {floor.reservations.map((r) => (
          <p key={r.id} className="border-b py-2">
            {r.startTime.toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {r.guestName} · {r.partySize} coperti · {r.status} ·{" "}
            {r.tables.length} tavoli ·{" "}
            <Link
              className="underline"
              href={"/restaurant/orders/new?reservationId=" + r.id}
            >
              Apri comanda
            </Link>
          </p>
        ))}
      </section>
    </div>
  );
}
