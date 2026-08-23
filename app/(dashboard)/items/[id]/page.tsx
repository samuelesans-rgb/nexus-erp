import { getAuthorizationSessionUser } from "@/lib/authorization";
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import { getItemDetail, isItemTypeEnabled } from "@/lib/items";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { archiveItem, restoreItem } from "../actions";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = { user: await getAuthorizationSessionUser() };
  if (!session?.user?.companyId) redirect("/login");
  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PRODUCTS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) redirect("/items");
    throw error;
  }
  const { id } = await params;
  const item = await getItemDetail(session.user.companyId, id);
  if (
    !item ||
    !(await isItemTypeEnabled(session.user.companyId, item.type))
  ) {
    notFound();
  }

  const profileRows = getProfileRows(item);
  const components =
    item.type === "RECIPE" ? item.recipeComponents : item.packageComponents;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/items" className="text-sm text-slate-500 hover:underline">
            ← Catalogo Item
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{item.name}</h1>
          <p className="text-slate-500">
            {item.code} · {ITEM_TYPE_LABELS[item.type]}
          </p>
        </div>
        <div className="flex gap-2">
          {!item.deletedAt && (
            <Link
              href={`/items/${item.id}/edit`}
              className="rounded-lg border bg-white px-4 py-2 text-sm"
            >
              Modifica
            </Link>
          )}
          <form action={item.deletedAt ? restoreItem : archiveItem}>
            <input type="hidden" name="itemId" value={item.id} />
            <button
              className={`rounded-lg px-4 py-2 text-sm ${
                item.deletedAt
                  ? "bg-emerald-700 text-white"
                  : "bg-red-700 text-white"
              }`}
            >
              {item.deletedAt ? "Ripristina" : "Elimina logicamente"}
            </button>
          </form>
        </div>
      </div>

      <DetailSection title="Generale">
        <Detail label="Tipo" value={ITEM_TYPE_LABELS[item.type]} />
        <Detail label="Stato" value={item.status} />
        <Detail label="Operativo" value={item.active ? "Sì" : "No"} />
        <Detail label="Nome breve" value={item.shortName} />
        <Detail label="Categoria" value={item.category?.name} />
        <Detail label="Unità" value={item.unitOfMeasure ? `${item.unitOfMeasure.code} · ${item.unitOfMeasure.symbol}` : null} />
        <Detail label="SKU" value={item.sku} />
        <Detail label="Barcode" value={item.barcode} />
        <Detail label="Descrizione" value={item.description} wide />
      </DetailSection>

      <DetailSection title="Commerciale">
        <Detail label="Prezzo vendita" value={money(item.salePrice, item.currency)} />
        <Detail label="Prezzo acquisto" value={money(item.purchasePrice, item.currency)} />
        <Detail label="Listini" value={item.priceLists.map(({ price, priceList }) => `${priceList.code} · ${priceList.name}: ${money(price, priceList.currency)}`).join("\n")} />
        <Detail label="Costo standard" value={money(item.standardCost, item.currency)} />
        <Detail label="IVA" value={item.vatRate ? `${item.vatRate.name} (${item.vatRate.percentage}%)` : null} />
        <Detail label="Vendibile" value={item.sellable ? "Sì" : "No"} />
        <Detail label="Acquistabile" value={item.purchasable ? "Sì" : "No"} />
      </DetailSection>

      <DetailSection title="Magazzino">
        <Detail label="Gestione stock" value={item.stockManaged ? "Sì" : "No"} />
        <Detail label="Lotti" value={item.trackLots ? "Sì" : "No"} />
        <Detail label="Seriali" value={item.trackSerials ? "Sì" : "No"} />
        <Detail label="Scadenze" value={item.trackExpiration ? "Sì" : "No"} />
      </DetailSection>

      <DetailSection title={`Profilo ${ITEM_TYPE_LABELS[item.type]}`}>
        {profileRows.map(([label, value]) => (
          <Detail key={label} label={label} value={value} />
        ))}
        {profileRows.length === 0 && (
          <p className="text-sm text-slate-500">Nessun dato specifico.</p>
        )}
      </DetailSection>

      {(item.type === "RECIPE" || item.type === "PACKAGE") && (
        <section className="rounded-xl border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Componenti</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Item</th>
                  <th className="py-2">Quantità</th>
                  {item.type === "RECIPE" && <th className="py-2">Scarto</th>}
                </tr>
              </thead>
              <tbody>
                {components.map((component) => (
                  <tr key={component.id} className="border-b last:border-0">
                    <td className="py-3">
                      {component.componentItem.code} · {component.componentItem.name}
                    </td>
                    <td className="py-3">
                      {component.quantity.toString()} {component.unitOfMeasure.symbol}
                    </td>
                    {item.type === "RECIPE" && "wastePercentage" in component && (
                      <td className="py-3">
                        {component.wastePercentage?.toString() ?? "0"}%
                      </td>
                    )}
                  </tr>
                ))}
                {components.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">
                      Nessun componente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DetailSection title="Documenti">
        <p className="text-sm text-slate-500">
          Placeholder: allegati e documenti saranno integrati con CORE_DOCUMENTS.
        </p>
      </DetailSection>

      <DetailSection title="Storico e audit">
        <Detail
          label="Creato"
          value={`${item.createdAt.toLocaleString("it-IT")} · ${person(item.createdBy)}`}
        />
        <Detail
          label="Aggiornato"
          value={`${item.updatedAt.toLocaleString("it-IT")} · ${person(item.updatedBy)}`}
        />
        <Detail label="Note interne" value={item.internalNotes} wide />
        <p className="text-sm text-slate-500">
          Il motore audit completo sarà fornito da CORE_AUDIT.
        </p>
      </DetailSection>
    </div>
  );
}

function getProfileRows(
  item: NonNullable<Awaited<ReturnType<typeof getItemDetail>>>
): Array<[string, string | null]> {
  const value = (input: unknown) =>
    input === null || input === undefined ? null : String(input);
  switch (item.type) {
    case "PRODUCT":
      return item.productProfile
        ? [
            ["Peso", value(item.productProfile.weight)],
            ["Dimensioni", value(item.productProfile.dimensions)],
            ["Produttore", item.productProfile.manufacturer],
            ["Marca", item.productProfile.brand],
            ["Punto riordino", value(item.productProfile.reorderPoint)],
            ["Scorta minima", value(item.productProfile.minimumStock)],
          ]
        : [];
    case "SERVICE":
      return item.serviceProfile
        ? [
            ["Durata minuti", value(item.serviceProfile.durationMinutes)],
            ["Richiede appuntamento", item.serviceProfile.requiresAppointment ? "Sì" : "No"],
            ["Capacità", value(item.serviceProfile.defaultCapacity)],
          ]
        : [];
    case "INGREDIENT":
      return item.ingredientProfile
        ? [
            ["Resa %", value(item.ingredientProfile.yieldPercentage)],
            ["Conservazione", item.ingredientProfile.storageInstructions],
            ["Allergeni", item.ingredientProfile.allergenNotes],
            ["Deperibilità giorni", value(item.ingredientProfile.perishabilityDays)],
          ]
        : [];
    case "RECIPE":
      return item.recipeProfile
        ? [
            ["Preparazione minuti", value(item.recipeProfile.preparationMinutes)],
            ["Porzioni", value(item.recipeProfile.portions)],
            ["Quantità resa", value(item.recipeProfile.yieldQuantity)],
            ["Food cost target %", value(item.recipeProfile.foodCostTarget)],
            ["Istruzioni", item.recipeProfile.instructions],
          ]
        : [];
    case "BEAUTY_SERVICE":
      return item.beautyServiceProfile
        ? [
            ["Durata minuti", value(item.beautyServiceProfile.durationMinutes)],
            ["Riassetto minuti", value(item.beautyServiceProfile.cleanupMinutes)],
            ["Richiede cabina", item.beautyServiceProfile.requiresCabin ? "Sì" : "No"],
            ["Richiede operatore", item.beautyServiceProfile.requiresOperator ? "Sì" : "No"],
            ["Ripetizione giorni", value(item.beautyServiceProfile.recommendedRepeatDays)],
            ["Consenso richiesto", item.beautyServiceProfile.consentRequired ? "Sì" : "No"],
          ]
        : [];
    case "HOTEL_ROOM":
      return item.hotelRoomProfile
        ? [
            ["Adulti", value(item.hotelRoomProfile.capacityAdults)],
            ["Bambini", value(item.hotelRoomProfile.capacityChildren)],
            ["Tipologia", item.hotelRoomProfile.roomTypeCode],
            ["Camera fisica", item.hotelRoomProfile.physicalRoomCode],
            ["Piano", item.hotelRoomProfile.floor],
            ["Unità vendibile", item.hotelRoomProfile.sellableUnit ? "Sì" : "No"],
            ["Housekeeping", item.hotelRoomProfile.housekeepingRequired ? "Sì" : "No"],
          ]
        : [];
    case "PACKAGE":
      return item.packageProfile
        ? [
            ["Validità giorni", value(item.packageProfile.validityDays)],
            ["Limite utilizzi", value(item.packageProfile.usageLimit)],
          ]
        : [];
    case "GIFT_CARD":
      return item.giftCardProfile
        ? [
            ["Validità giorni", value(item.giftCardProfile.defaultValidityDays)],
            ["Valore fisso", value(item.giftCardProfile.fixedValue)],
            ["Riutilizzabile", item.giftCardProfile.reusable ? "Sì" : "No"],
            ["Trasferibile", item.giftCardProfile.transferable ? "Sì" : "No"],
          ]
        : [];
  }
}

function money(value: { toString(): string } | null, currency: string) {
  return value === null
    ? null
    : new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency,
      }).format(Number(value));
}

function person(personValue: { firstName: string; lastName: string } | null) {
  return personValue
    ? `${personValue.firstName} ${personValue.lastName}`
    : "Sistema";
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2 lg:col-span-3" : ""}>
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</div>
    </div>
  );
}
