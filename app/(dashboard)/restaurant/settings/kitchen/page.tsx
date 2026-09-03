import { getConnectorDashboard } from "@/lib/kitchen-connector";
import { getFusionCatalogDashboard } from "@/lib/fusion-catalog-sync";
import { MODULE_CODES } from "@/lib/module-catalog";
import { prisma } from "@/lib/prisma";
import { requireRestaurantContext } from "@/lib/restaurant-access";
import { kitchenSettingsAction } from "../../actions";
import { ConnectorPanel } from "./connector-panel";

export default async function Page() {
  const c = await requireRestaurantContext(
    MODULE_CODES.RESTAURANT_KITCHEN,
    "manage",
  );
  const [stations, printers, items, dashboard, catalog] = await Promise.all([
    prisma.kitchenStation.findMany({
      where: { companyId: c.companyId, locationId: c.locationId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.restaurantPrinter.findMany({
      where: { companyId: c.companyId, locationId: c.locationId },
      include: { station: true },
    }),
    prisma.item.findMany({
      where: {
        companyId: c.companyId,
        sellable: true,
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        kitchenAssignments: {
          where: { active: true },
          include: { station: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    getConnectorDashboard(c.companyId, c.locationId),
    getFusionCatalogDashboard(c.companyId, c.locationId),
  ]);
  const field = "border p-2";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cucina · impostazioni</h1>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Postazioni</h2>
        {stations.map((s) => (
          <p key={s.id}>
            {s.sortOrder} · {s.code} · {s.name} ·{" "}
            {s.active ? "Attiva" : "Disattiva"}
          </p>
        ))}
        <form
          action={kitchenSettingsAction}
          className="grid gap-2 border p-3 md:grid-cols-5"
        >
          <input type="hidden" name="operation" value="station" />
          <input required name="code" placeholder="Codice" className={field} />
          <input required name="name" placeholder="Nome" className={field} />
          <input
            name="sortOrder"
            type="number"
            defaultValue="0"
            className={field}
          />
          <label>
            <input name="active" type="checkbox" defaultChecked /> Attiva
          </label>
          <button className={field}>Salva postazione</button>
        </form>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Stampanti</h2>
        {printers.map((p) => (
          <p key={p.id}>
            {p.code} · {p.name} → {p.station.name} · {p.mode} · {p.deviceType} ·{" "}
            {p.type} · {p.paperWidth}mm · {p.enabled ? "Attiva" : "Disattiva"}
          </p>
        ))}
        <form
          action={kitchenSettingsAction}
          className="grid gap-2 border p-3 md:grid-cols-4"
        >
          <input type="hidden" name="operation" value="printer" />
          <select required name="stationId" className={field}>
            <option value="">Postazione</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input required name="code" placeholder="Codice" className={field} />
          <input required name="name" placeholder="Nome" className={field} />
          <select name="mode" className={field}>
            <option>NEXUS_DIRECT</option>
            <option>LEGACY_FUSION</option>
          </select>
          <select name="deviceType" className={field}>
            <option>NON_FISCAL</option>
            <option>FISCAL</option>
          </select>
          <select name="type" className={field}>
            <option>MOCK</option>
            <option>ESC_POS</option>
            <option>CUSTOM_KUBE</option>
            <option>FUSION_XML_1745</option>
          </select>
          <select name="connectionType" className={field}>
            <option>MOCK</option>
            <option>NETWORK</option>
            <option>USB</option>
            <option>RS232</option>
            <option>TCP</option>
          </select>
          <input
            name="address"
            placeholder="Indirizzo/config non sensibile"
            className={field}
          />
          <input
            name="copies"
            type="number"
            min="1"
            defaultValue="1"
            className={field}
          />
          <select name="paperWidth" className={field}>
            <option value="80">80 mm</option>
            <option value="58">58 mm</option>
          </select>
          <label>
            <input name="enabled" type="checkbox" defaultChecked /> Attiva
          </label>
          <button className={field}>Salva stampante</button>
        </form>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Routing prodotti</h2>
        <form
          action={kitchenSettingsAction}
          className="grid gap-2 border p-3 md:grid-cols-3"
        >
          <input type="hidden" name="operation" value="routing" />
          <select name="itemId" className={field}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}{" "}
                {i.kitchenAssignments[0]
                  ? `→ ${i.kitchenAssignments[0].station.name}`
                  : "· senza routing"}
              </option>
            ))}
          </select>
          <select name="stationId" className={field}>
            {stations
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button className={field}>Salva routing</button>
        </form>
      </section>
      <ConnectorPanel
        catalog={catalog.map((s) => ({
          status: s.status,
          lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
          totalCount: s.totalCount,
          createdCount: s.createdCount,
          updatedCount: s.updatedCount,
          unchangedCount: s.unchangedCount,
          missingCount: s.missingCount,
          emptySlotsSkipped: s.emptySlotsSkipped,
          errorCount: s.errorCount,
          lastError: s.lastError,
        }))}
        printers={printers.map(({ id, name }) => ({ id, name }))}
        devices={dashboard.devices.map((d) => ({
          id: d.id,
          name: d.name,
          status: d.status,
          online: d.online,
          printerOnline: d.printerOnline,
          credentialPrefix: d.credentialPrefix,
          lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
          lastError: d.lastError,
          diagnostics: d.diagnostics,
          printer: {
            name: d.printer.name,
            station: { name: d.printer.station.name },
          },
        }))}
      />
    </div>
  );
}
