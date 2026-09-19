"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildSettleConfirmation } from "@/lib/restaurant-floor-settle-copy";
import { buildConnectorAlert } from "@/lib/restaurant-floor-connector-copy";
import {
  addFloorItemAction,
  assignFloorPartnerAction,
  changeFloorGuestCountAction,
  changeFloorLineQuantityAction,
  deleteFloorLineAction,
  dispatchFloorOrderAction,
  type FloorActionResult,
  type FloorPartnerOption,
  openFloorTableAction,
  releaseFloorTableAction,
  searchFloorPartnersAction,
  settleFloorOrderAction,
  retryFloorJobAction,
  saveFloorLineNoteAction,
} from "./operational-actions";

type LineState = "PENDING" | "SENDING" | "SENT" | "ERROR" | "UNCERTAIN";
type Modifier = {
  id: string;
  name: string;
  kitchenLabel: string;
  priceDelta: number;
};
type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
};
type OrderLine = {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  sentQuantity: number;
  unitPrice: number;
  lineTotal: number;
  kitchenNotes: string | null;
  modifiers: Modifier[];
  state: LineState;
  retryJobId: string | null;
};
type Order = {
  id: string;
  code: string;
  guestCount: number;
  partnerId: string | null;
  partnerName: string | null;
  billed: boolean;
  tableIds: string[];
  total: number;
  unsentCount: number;
  lines: OrderLine[];
};
type Product = {
  id: string;
  name: string;
  plu: number;
  price: number | null;
  modifierGroups: ModifierGroup[];
};
type Props = {
  data: {
    areas: Array<{
      id: string;
      name: string;
      layoutWidth: number;
      layoutHeight: number;
      backgroundImage: string | null;
      backgroundOpacity: number;
      tables: Array<{
        id: string;
        code: string;
        name: string;
        seats: number;
        status: string;
        shape: string;
        positionX: number;
        positionY: number;
        width: number;
        height: number;
        rotation: number;
      }>;
    }>;
    orders: Order[];
    connector: {
      stale: boolean;
      staleForMinutes: number | null;
      maxAgeMinutes: number;
    };
    menu: {
      id: string | null;
      sections: Array<{ id: string; name: string; products: Product[] }>;
    };
  };
};
const money = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});
const labels: Record<LineState, string> = {
  PENDING: "DA INVIARE",
  SENDING: "IN INVIO",
  SENT: "INVIATO",
  ERROR: "ERRORE",
  UNCERTAIN: "INVIO INCERTO",
};

export function OperationalFloor({
  data,
  canConfigure = false,
}: Props & { canConfigure?: boolean }) {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  const [partnerPickerOpen, setPartnerPickerOpen] = useState(false),
    [partnerQuery, setPartnerQuery] = useState(""),
    [partnerResults, setPartnerResults] = useState<FloorPartnerOption[]>([]);
  const [settleConfirmId, setSettleConfirmId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null),
    [openingTableId, setOpeningTableId] = useState<string | null>(null),
    [guestCount, setGuestCount] = useState(2),
    [selectedSectionId, setSelectedSectionId] = useState(
      data.menu.sections[0]?.id ?? "",
    ),
    [query, setQuery] = useState(""),
    [feedback, setFeedback] = useState<FloorActionResult | null>(null),
    [selectedProduct, setSelectedProduct] = useState<Product | null>(null),
    [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState(data.areas[0]?.id ?? "");
  const dispatchKeys = useRef(new Map<string, string>());
  const order = data.orders.find((row) => row.id === selectedOrderId) ?? null;
  const settleConfirming = order !== null && settleConfirmId === order.id;
  const settleCopy = order
    ? buildSettleConfirmation({
        tableNames: data.areas
          .flatMap((area) => area.tables)
          .filter((table) => order.tableIds.includes(table.id))
          .map((table) => table.code),
        lineCount: order.lines.length,
        unsentCount: order.unsentCount,
      })
    : null;
  const selectedArea =
    data.areas.find(({ id }) => id === selectedAreaId) ?? data.areas[0];
  const hasVisibleTables = data.areas.some((area) => area.tables.length > 0);
  useEffect(() => {
    const remembered = sessionStorage.getItem("nexus-sala-area");
    const frame =
      remembered && data.areas.some(({ id }) => id === remembered)
        ? window.requestAnimationFrame(() => setSelectedAreaId(remembered))
        : null;
    const timer = window.setInterval(() => {
      if (!openingTableId && !selectedProduct) router.refresh();
    }, 15000);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [data.areas, openingTableId, router, selectedProduct]);
  const selectedSection = data.menu.sections.find(
    (row) => row.id === selectedSectionId,
  );
  const normalized = query.trim().toLocaleLowerCase("it-IT");
  const products = useMemo(() => {
    const sections = normalized
      ? data.menu.sections
      : selectedSection
        ? [selectedSection]
        : [];
    return sections.flatMap((section) =>
      section.products
        .filter(
          (product) =>
            !normalized ||
            product.name.toLocaleLowerCase("it-IT").includes(normalized) ||
            String(product.plu).includes(normalized),
        )
        .map((product) => ({ ...product, sectionName: section.name })),
    );
  }, [data.menu.sections, normalized, selectedSection]);
  const execute = (
    action: () => Promise<FloorActionResult>,
    onSuccess?: (result: FloorActionResult) => void,
  ) =>
    startTransition(async () => {
      setFeedback(null);
      const result = await action();
      setFeedback(result);
      if (result.ok) {
        onSuccess?.(result);
        router.refresh();
      }
    });
  const open = (tableId: string) =>
    execute(
      () => openFloorTableAction(tableId, guestCount),
      (result) => {
        setOpeningTableId(null);
        if (result.orderId) setSelectedOrderId(result.orderId);
      },
    );
  const release = (tableId: string) =>
    execute(() => releaseFloorTableAction(tableId));
  const settle = (orderId: string) =>
    execute(() => settleFloorOrderAction(orderId), () => {
      setSettleConfirmId(null);
      setSelectedOrderId(null);
    });
  const searchPartners = (value: string) => {
    setPartnerQuery(value);
    startTransition(async () =>
      setPartnerResults(
        value.trim().length < 2 ? [] : await searchFloorPartnersAction(value),
      ),
    );
  };
  const assignPartner = (orderId: string, partnerId: string) =>
    execute(() => assignFloorPartnerAction(orderId, partnerId), () => {
      setPartnerPickerOpen(false);
      setPartnerQuery("");
      setPartnerResults([]);
    });
  const chooseProduct = (product: Product) => {
    if (!order) return;
    if (!product.modifierGroups.length)
      execute(() => addFloorItemAction(order.id, product.id));
    else {
      setSelectedModifiers([]);
      setSelectedProduct(product);
    }
  };
  const modifierSelectionValid =
    selectedProduct?.modifierGroups.every((group) => {
      const count = group.modifiers.filter((modifier) =>
        selectedModifiers.includes(modifier.id),
      ).length;
      return (
        count >= group.minSelections &&
        count <= group.maxSelections &&
        (!group.required || count > 0)
      );
    }) ?? false;
  const addConfiguredProduct = () => {
    if (!order || !selectedProduct || !modifierSelectionValid) return;
    execute(
      () => addFloorItemAction(order.id, selectedProduct.id, selectedModifiers),
      () => {
        setSelectedProduct(null);
        setSelectedModifiers([]);
      },
    );
  };
  const connectorAlert = buildConnectorAlert({
    staleForMinutes: data.connector.staleForMinutes,
    maxAgeMinutes: data.connector.maxAgeMinutes,
  });
  const dispatch = () => {
    if (!order) return;
    const key = dispatchKeys.current.get(order.id) ?? crypto.randomUUID();
    dispatchKeys.current.set(order.id, key);
    execute(
      () => dispatchFloorOrderAction(order.id, key),
      (result) => {
        if (result.ok) dispatchKeys.current.delete(order.id);
      },
    );
  };
  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Ristorante
        </p>
        <h1 className="text-3xl font-bold text-slate-950">Sala</h1>
        <p className="text-sm text-slate-600">
          Tavoli e comande operative · nessuna funzione di pagamento
        </p>
      </header>
      {data.connector.stale && (
        // Sempre visibile e non chiudibile: un avviso che il cameriere zittisce
        // alle 20:00 non lo protegge alle 21:00.
        <section
          role="alert"
          className="rounded-2xl border-4 border-red-600 bg-red-50 p-4"
        >
          <h2 className="text-xl font-black text-red-800">
            ⚠ {connectorAlert.title}
          </h2>
          {connectorAlert.lines.map((line, index) => (
            <p
              className={
                index === 0
                  ? "mt-1 text-base font-black text-red-900"
                  : "mt-1 text-sm font-semibold text-red-900"
              }
              key={line}
            >
              {line}
            </p>
          ))}
        </section>
      )}
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-xl p-3 text-sm ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}
        >
          {feedback.message}
        </p>
      )}
      {!order && (
        <div className="space-y-6">
          {!hasVisibleTables && (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <h2 className="text-xl font-bold">Nessun tavolo configurato</h2>
              <p className="mt-2 text-slate-500">
                Contatta un amministratore per configurare la sala.
              </p>
              {canConfigure && (
                <Link
                  href="/restaurant/settings/floor"
                  className="mt-4 inline-block rounded-lg bg-slate-950 px-4 py-3 font-bold text-white"
                >
                  Configura la sala
                </Link>
              )}
            </div>
          )}
          {hasVisibleTables && (
            <>
              <nav
                aria-label="Sale"
                className="flex gap-2 overflow-x-auto pb-1"
              >
                {data.areas.map((area) => (
                  <button
                    key={area.id}
                    onClick={() => {
                      setSelectedAreaId(area.id);
                      sessionStorage.setItem("nexus-sala-area", area.id);
                    }}
                    className={`min-h-11 shrink-0 rounded-full border px-5 font-bold ${selectedArea?.id === area.id ? "border-slate-950 bg-slate-950 text-white" : "bg-white"}`}
                  >
                    {area.name}
                  </button>
                ))}
              </nav>
              {selectedArea && (
                <section>
                  <h2 className="sr-only">{selectedArea.name}</h2>
                  <div
                    className="relative w-full overflow-hidden rounded-2xl border bg-slate-100"
                    style={{
                      aspectRatio: `${selectedArea.layoutWidth} / ${selectedArea.layoutHeight}`,
                      backgroundImage: selectedArea.backgroundImage
                        ? `linear-gradient(rgb(255 255 255 / ${1 - selectedArea.backgroundOpacity}), rgb(255 255 255 / ${1 - selectedArea.backgroundOpacity})), url(${selectedArea.backgroundImage})`
                        : undefined,
                      backgroundSize: "cover",
                    }}
                  >
                    {selectedArea.tables.map((table) => {
                      const active = data.orders.find((candidate) =>
                        candidate.tableIds.includes(table.id),
                      );
                      const available = !active && table.status === "AVAILABLE";
                      const dirty = !active && table.status === "DIRTY";
                      const uncertain = active?.lines.some(
                          (line) => line.state === "UNCERTAIN",
                        ),
                        failed = active?.lines.some(
                          (line) => line.state === "ERROR",
                        ),
                        sending = active?.lines.some(
                          (line) => line.state === "SENDING",
                        );
                      const state = available
                        ? "LIBERO"
                        : dirty
                          ? "DA RIASSETTARE"
                          : !active
                          ? table.status.replaceAll("_", " ")
                          : uncertain || failed
                            ? "ERRORE CUCINA"
                            : active.unsentCount
                              ? "DA INVIARE"
                              : sending
                                ? "IN INVIO"
                                : active.lines.length
                                  ? "INVIATO"
                                  : "APERTO";
                      return (
                        <article
                          key={table.id}
                          className={`absolute min-h-11 min-w-11 rounded-xl border-2 p-1 shadow-sm ${available ? "border-emerald-500 bg-emerald-50" : dirty ? "border-sky-500 bg-sky-50" : !active ? "border-slate-500 bg-slate-200" : uncertain || failed ? "border-red-500 bg-red-50" : active.unsentCount ? "border-amber-500 bg-amber-50" : "border-blue-500 bg-blue-50"}`}
                          style={{
                            left: `${(table.positionX / selectedArea.layoutWidth) * 100}%`,
                            top: `${(table.positionY / selectedArea.layoutHeight) * 100}%`,
                            width: `${(table.width / selectedArea.layoutWidth) * 100}%`,
                            height: `${(table.height / selectedArea.layoutHeight) * 100}%`,
                            transform: `rotate(${table.rotation}deg)`,
                            borderRadius:
                              table.shape === "ROUND" ? "9999px" : undefined,
                          }}
                        >
                          <button
                            disabled={
                              (!active && !available && !dirty) ||
                              (dirty && pending)
                            }
                            aria-label={`${table.name || table.code}: ${state}${dirty ? ", tocca per liberare" : ""}`}
                            className="flex h-full w-full flex-col items-center justify-center text-center disabled:cursor-not-allowed"
                            onClick={() =>
                              active
                                ? setSelectedOrderId(active.id)
                                : dirty
                                  ? release(table.id)
                                  : setOpeningTableId(table.id)
                            }
                          >
                            <span className="font-black leading-tight">
                              {table.name || table.code}
                            </span>
                            <span className="mt-0.5 text-[10px] font-bold tracking-wide">
                              {state}
                            </span>
                            {active && (
                              <span className="hidden text-xs sm:block">
                                <span className="block">
                                  {active.guestCount} coperti
                                </span>
                                <span className="block font-bold">
                                  {money.format(active.total)}
                                </span>
                                <span className="block">
                                  {active.unsentCount} righe da inviare
                                </span>
                              </span>
                            )}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                  {openingTableId && (
                    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-2 rounded-2xl border bg-white p-4 shadow-xl sm:left-auto sm:right-6 sm:w-72">
                      <label className="text-sm font-semibold">
                        Coperti{" "}
                        <input
                          aria-label="Numero coperti"
                          className="ml-1 w-16 rounded border p-2"
                          type="number"
                          min="1"
                          value={guestCount}
                          onChange={(event) =>
                            setGuestCount(Number(event.target.value))
                          }
                        />
                      </label>
                      <button
                        disabled={pending || guestCount < 1}
                        onClick={() => open(openingTableId)}
                        className="min-h-11 flex-1 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white disabled:opacity-50"
                      >
                        Apri tavolo
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}
      {order && (
        <>
          <button
            onClick={() => setSelectedOrderId(null)}
            className="min-h-11 rounded-lg border px-4 text-sm font-semibold"
          >
            ← Tutti i tavoli
          </button>
          <div className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_24rem]">
            <aside className="rounded-2xl border bg-white p-3">
              <p className="px-2 pb-2 text-xs font-bold uppercase text-slate-500">
                Categorie
              </p>
              <div className="flex gap-2 overflow-x-auto xl:block xl:space-y-1">
                {data.menu.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setSelectedSectionId(section.id);
                      setQuery("");
                    }}
                    className={`min-h-12 min-w-48 rounded-xl px-3 text-left text-sm font-semibold xl:w-full ${selectedSectionId === section.id && !query ? "bg-slate-950 text-white" : "bg-slate-100"}`}
                  >
                    {section.name}
                    <span className="block text-xs opacity-70">
                      {section.products.length} prodotti
                    </span>
                  </button>
                ))}
              </div>
            </aside>
            <main className="min-w-0 rounded-2xl border bg-white p-4">
              <label className="sr-only" htmlFor="floor-product-search">
                Cerca prodotto per nome o PLU
              </label>
              <input
                id="floor-product-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca nome o PLU…"
                className="mb-4 min-h-12 w-full rounded-xl border px-4"
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => (
                  <button
                    key={`${product.sectionName}:${product.id}`}
                    disabled={pending}
                    onClick={() => chooseProduct(product)}
                    className="min-h-28 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.98] disabled:opacity-50"
                  >
                    <span className="block font-bold text-slate-950">
                      {product.name}
                    </span>
                    <span className="mt-2 block text-lg font-black">
                      {product.price === null
                        ? "—"
                        : money.format(product.price)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      PLU {product.plu} · {product.sectionName}
                    </span>
                    {product.modifierGroups.length > 0 && (
                      <span className="mt-2 block text-xs font-bold text-amber-700">
                        Personalizzabile
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {!products.length && (
                <p className="py-12 text-center text-sm text-slate-500">
                  Nessun prodotto disponibile.
                </p>
              )}
            </main>
            <aside className="self-start rounded-2xl border bg-white p-4 xl:sticky xl:top-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Comanda corrente
                  </p>
                  <h2 className="text-xl font-black">{order.code}</h2>
                  <p className="mt-1 text-sm">
                    <span className="text-slate-500">Cliente: </span>
                    <span className="font-semibold">
                      {order.partnerName ?? "non assegnato"}
                    </span>
                  </p>
                  {order.billed ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Conto emesso: cliente non più modificabile.
                    </p>
                  ) : (
                    <button
                      onClick={() => setPartnerPickerOpen((value) => !value)}
                      aria-expanded={partnerPickerOpen}
                      className="mt-1 min-h-11 rounded-lg border px-3 text-sm font-semibold"
                    >
                      {order.partnerId
                        ? "Cambia cliente"
                        : "Assegna cliente"}
                    </button>
                  )}
                </div>
                <label className="text-xs font-semibold">
                  Coperti
                  <input
                    aria-label="Coperti comanda"
                    className="mt-1 block w-16 rounded border p-2"
                    type="number"
                    min="1"
                    defaultValue={order.guestCount}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== order.guestCount)
                        execute(() =>
                          changeFloorGuestCountAction(order.id, value),
                        );
                    }}
                  />
                </label>
              </div>
              {partnerPickerOpen && !order.billed && (
                <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                  <label
                    className="block text-xs font-bold uppercase text-slate-500"
                    htmlFor="floor-partner-search"
                  >
                    Cerca cliente per nome, P. IVA o codice fiscale
                  </label>
                  <input
                    id="floor-partner-search"
                    className="mt-1 min-h-11 w-full rounded border px-3"
                    value={partnerQuery}
                    onChange={(event) => searchPartners(event.target.value)}
                    placeholder="Almeno 2 caratteri"
                  />
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {partnerResults.map((partner) => (
                      <li key={partner.id}>
                        <button
                          disabled={pending}
                          onClick={() => assignPartner(order.id, partner.id)}
                          className="min-h-11 w-full rounded-lg border bg-white px-3 text-left text-sm disabled:opacity-50"
                        >
                          <span className="font-semibold">
                            {partner.displayName ?? partner.name}
                          </span>
                          {partner.vatNumber && (
                            <span className="block text-xs text-slate-500">
                              P. IVA {partner.vatNumber}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {partnerQuery.trim().length >= 2 &&
                    !partnerResults.length &&
                    !pending && (
                      <p className="mt-2 text-sm text-slate-500">
                        Nessun cliente trovato.
                      </p>
                    )}
                </div>
              )}
              <div className="mt-4 space-y-3">
                {order.lines.map((line) => {
                  const editable =
                    line.state === "PENDING" && line.sentQuantity === 0;
                  return (
                    <article key={line.id} className="rounded-xl border p-3">
                      <div className="flex justify-between gap-2">
                        <div>
                          <span
                            className={`text-xs font-black ${line.state === "UNCERTAIN" || line.state === "ERROR" ? "text-red-700" : line.state === "PENDING" ? "text-amber-700" : "text-blue-700"}`}
                          >
                            {labels[line.state]}
                          </span>
                          <p className="font-semibold">
                            {line.quantity} × {line.name}
                          </p>
                          {line.modifiers.map((modifier) => (
                            <p
                              className="pl-3 text-sm font-medium text-amber-800"
                              key={modifier.id}
                            >
                              → {modifier.kitchenLabel}
                              {modifier.priceDelta
                                ? ` · ${money.format(modifier.priceDelta)}`
                                : ""}
                            </p>
                          ))}
                        </div>
                        <b>{money.format(line.lineTotal)}</b>
                      </div>
                      {line.kitchenNotes && (
                        <p className="mt-2 text-sm text-slate-600">
                          Nota: {line.kitchenNotes}
                        </p>
                      )}
                      {editable && (
                        <div className="mt-3 space-y-2">
                          <div className="flex gap-2">
                            <button
                              aria-label={`Riduci ${line.name}`}
                              disabled={pending || line.quantity <= 1}
                              onClick={() =>
                                execute(() =>
                                  changeFloorLineQuantityAction(
                                    order.id,
                                    line.id,
                                    line.quantity - 1,
                                  ),
                                )
                              }
                              className="min-h-11 min-w-11 rounded border text-lg"
                            >
                              −
                            </button>
                            <button
                              aria-label={`Aumenta ${line.name}`}
                              disabled={pending}
                              onClick={() =>
                                execute(() =>
                                  changeFloorLineQuantityAction(
                                    order.id,
                                    line.id,
                                    line.quantity + 1,
                                  ),
                                )
                              }
                              className="min-h-11 min-w-11 rounded border text-lg"
                            >
                              +
                            </button>
                            <button
                              disabled={pending}
                              onClick={() =>
                                execute(() =>
                                  deleteFloorLineAction(order.id, line.id),
                                )
                              }
                              className="min-h-11 rounded border border-red-200 px-3 text-sm text-red-700"
                            >
                              Elimina
                            </button>
                          </div>
                          <input
                            aria-label={`Nota cucina ${line.name}`}
                            defaultValue={line.kitchenNotes ?? ""}
                            onBlur={(event) =>
                              execute(() =>
                                saveFloorLineNoteAction(
                                  order.id,
                                  line.id,
                                  event.target.value,
                                ),
                              )
                            }
                            placeholder="Nota cucina"
                            className="min-h-11 w-full rounded border px-3 text-sm"
                          />
                        </div>
                      )}
                      {line.state === "ERROR" && line.retryJobId && (
                        <button
                          disabled={pending}
                          onClick={() =>
                            execute(() => retryFloorJobAction(line.retryJobId!))
                          }
                          className="mt-3 min-h-11 rounded border px-3 text-sm font-semibold"
                        >
                          Riprova invio sicuro
                        </button>
                      )}
                      {line.state === "UNCERTAIN" && (
                        <p
                          role="alert"
                          className="mt-3 rounded-lg bg-red-100 p-2 text-sm font-semibold text-red-900"
                        >
                          Invio incerto — verificare la comanda in cucina. Non
                          reinviare automaticamente.
                        </p>
                      )}
                    </article>
                  );
                })}
                {!order.lines.length && (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Comanda vuota
                  </p>
                )}
              </div>
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-between text-lg font-black">
                  <span>Totale</span>
                  <span>{money.format(order.total)}</span>
                </div>
                <button
                  disabled={pending || order.unsentCount === 0}
                  onClick={dispatch}
                  className="mt-4 min-h-14 w-full rounded-xl bg-amber-600 px-4 font-black text-white disabled:bg-slate-300"
                >
                  {pending ? "INVIO…" : "INVIA IN CUCINA"}
                </button>
                {settleConfirming && settleCopy ? (
                  <section
                    aria-label="Conferma chiusura comanda"
                    className="mt-2 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-4"
                  >
                    <h3 className="text-lg font-black text-emerald-900">
                      {settleCopy.title}
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm font-semibold text-emerald-900">
                      {settleCopy.points.map((point) => (
                        <li key={point}>• {point}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex justify-between border-t border-emerald-200 pt-2 text-sm font-black text-emerald-900">
                      <span>Totale comanda</span>
                      <span>{money.format(order.total)}</span>
                    </div>
                    {settleCopy.warning && (
                      <p className="mt-3 rounded-lg bg-amber-100 p-2 text-sm font-bold text-amber-900">
                        ⚠ {settleCopy.warning}
                      </p>
                    )}
                    {/* Annulla a sinistra e conferma a destra: il bersaglio non
                        ricade dove stava "INCASSATO IN CASSA", così un doppio
                        tocco non chiude il tavolo per inerzia. */}
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        disabled={pending}
                        onClick={() => setSettleConfirmId(null)}
                        className="min-h-14 rounded-xl border-2 border-slate-400 px-4 font-black text-slate-700 disabled:opacity-50"
                      >
                        ANNULLA
                      </button>
                      <button
                        disabled={pending}
                        onClick={() => settle(order.id)}
                        className="min-h-14 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:bg-slate-300"
                      >
                        {pending ? "CHIUSURA…" : "SÌ, INCASSATO"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                    <button
                      disabled={pending}
                      onClick={() => setSettleConfirmId(order.id)}
                      className="mt-2 min-h-14 w-full rounded-xl bg-emerald-700 px-4 font-black text-white disabled:bg-slate-300"
                    >
                      INCASSATO IN CASSA
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      Il conto si emette in cassa. “Incassato in cassa” chiude la
                      comanda in Nexus e libera subito il tavolo, senza emettere
                      alcun documento.
                    </p>
                  </>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Invia esclusivamente le righe contrassegnate “DA INVIARE”. Le
                  note e i modificatori locali restano nel ticket Nexus; i
                  modificatori FUSION configurati vengono inviati subito dopo il
                  relativo piatto.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
      {selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Modificatori ${selectedProduct.name}`}
          className="fixed inset-0 z-50 flex items-end bg-slate-950/50 sm:items-center sm:justify-center"
        >
          <section className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">
                  Personalizza
                </p>
                <h2 className="text-2xl font-black">{selectedProduct.name}</h2>
              </div>
              <button
                className="min-h-11 min-w-11 rounded-full border text-xl"
                onClick={() => setSelectedProduct(null)}
                aria-label="Chiudi"
              >
                ×
              </button>
            </div>
            <div className="mt-5 space-y-5">
              {selectedProduct.modifierGroups.map((group) => (
                <fieldset key={group.id}>
                  <legend className="font-bold">
                    {group.name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {group.minSelections}–{group.maxSelections}
                    </span>
                  </legend>
                  <div className="mt-2 grid gap-2">
                    {group.modifiers.map((modifier) => {
                      const checked = selectedModifiers.includes(modifier.id);
                      return (
                        <label
                          key={modifier.id}
                          className={`flex min-h-12 items-center justify-between rounded-xl border-2 px-4 ${checked ? "border-amber-500 bg-amber-50" : "border-slate-200"}`}
                        >
                          <span>
                            <input
                              className="mr-3 size-5"
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedModifiers((current) =>
                                  checked
                                    ? current.filter((id) => id !== modifier.id)
                                    : group.modifiers.filter((item) =>
                                          current.includes(item.id),
                                        ).length >= group.maxSelections
                                      ? current
                                      : [...current, modifier.id],
                                )
                              }
                            />
                            {modifier.name}
                          </span>
                          {modifier.priceDelta !== 0 && (
                            <b>+ {money.format(modifier.priceDelta)}</b>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <button
              disabled={pending || !modifierSelectionValid}
              onClick={addConfiguredProduct}
              className="mt-6 min-h-14 w-full rounded-xl bg-slate-950 px-4 font-black text-white disabled:bg-slate-300"
            >
              AGGIUNGI ALLA COMANDA
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
