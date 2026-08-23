import { getAuthorizationSessionUser } from "@/lib/authorization";
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import {
  getEnabledItemTypes,
  getItemList,
  type ItemListParams,
} from "@/lib/items";
import { MODULE_CODES } from "@/lib/module-catalog";
import { ModuleNotEnabledError, requireModule } from "@/lib/modules";
import Link from "next/link";
import { redirect } from "next/navigation";
import ItemSearchInput from "./search-input";

function queryString(
  params: Record<string, string | number | undefined>,
  changes: Record<string, string | number | undefined>
) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value !== undefined && value !== "") result.set(key, String(value));
  }
  return result.toString();
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<ItemListParams>;
}) {
  const session = { user: await getAuthorizationSessionUser() };
  if (!session?.user?.companyId) redirect("/login");
  try {
    await requireModule(session.user.companyId, MODULE_CODES.CORE_PRODUCTS);
  } catch (error) {
    if (error instanceof ModuleNotEnabledError) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-bold">Modulo non disponibile</h1>
          <p className="mt-2 text-amber-900">
            Il modulo Prodotti e servizi non è attivo per questa azienda.
          </p>
        </div>
      );
    }
    throw error;
  }

  const rawParams = await searchParams;
  const enabledTypes = await getEnabledItemTypes(session.user.companyId);
  const result = await getItemList(
    session.user.companyId,
    rawParams,
    enabledTypes
  );
  const currentParams = {
    ...rawParams,
    page: result.page,
    sort: result.params.sort,
    direction: result.params.direction,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Catalogo Item</h1>
          <p className="text-slate-500">
            Catalogo commerciale condiviso di {session.user.companyName}.
          </p>
        </div>
        <Link
          href="/items/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Nuovo Item
        </Link>
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ItemSearchInput initialValue={result.params.q} />
          <span className="text-sm text-slate-500">
            {result.total} risultat{result.total === 1 ? "o" : "i"}
          </span>
        </div>
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {result.params.q && <input type="hidden" name="q" value={result.params.q} />}
          <FilterSelect
            name="type"
            label="Tipo"
            value={rawParams.type}
            options={[
              ["", "Tutti"],
              ...enabledTypes.map(
                (type) => [type, ITEM_TYPE_LABELS[type]] as [string, string]
              ),
            ]}
          />
          <label className="text-xs font-medium text-slate-600">
            Categoria
            <select
              name="category"
              defaultValue={rawParams.category ?? ""}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="">Tutte</option>
              {result.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <FilterSelect name="active" label="Operativo" value={rawParams.active} />
          <FilterSelect name="sellable" label="Vendibile" value={rawParams.sellable} />
          <FilterSelect name="purchasable" label="Acquistabile" value={rawParams.purchasable} />
          <FilterSelect name="stockManaged" label="Stock" value={rawParams.stockManaged} />
          <FilterSelect
            name="lifecycle"
            label="Archivio"
            value={rawParams.lifecycle}
            options={[
              ["", "Correnti"],
              ["deleted", "Eliminati"],
              ["all", "Tutti"],
            ]}
          />
          <FilterSelect
            name="sort"
            label="Ordina per"
            value={result.params.sort}
            options={[
              ["name", "Nome"],
              ["code", "Codice"],
              ["createdAt", "Creazione"],
              ["salePrice", "Prezzo vendita"],
            ]}
          />
          <FilterSelect
            name="direction"
            label="Direzione"
            value={result.params.direction}
            options={[
              ["asc", "Crescente"],
              ["desc", "Decrescente"],
            ]}
          />
          <div className="flex items-end gap-2">
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
              Applica
            </button>
            <Link href="/items" className="rounded-lg border px-4 py-2 text-sm">
              Azzera
            </Link>
          </div>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-5xl text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left">
              <th className="p-4">Codice</th>
              <th className="p-4">Item</th>
              <th className="p-4">Tipo</th>
              <th className="p-4">Categoria</th>
              <th className="p-4">Prezzo</th>
              <th className="p-4">Impiego</th>
              <th className="p-4">Stato</th>
              <th className="p-4 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="p-4 font-mono text-xs">{item.code}</td>
                <td className="p-4">
                  <Link href={`/items/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {item.sku ?? item.barcode ?? item.shortName ?? "—"}
                  </div>
                </td>
                <td className="p-4">
                  <Badge>{ITEM_TYPE_LABELS[item.type]}</Badge>
                </td>
                <td className="p-4">{item.category?.name ?? "—"}</td>
                <td className="p-4">
                  {item.salePrice === null
                    ? "—"
                    : new Intl.NumberFormat("it-IT", {
                        style: "currency",
                        currency: item.currency,
                      }).format(Number(item.salePrice))}
                </td>
                <td className="p-4 text-xs">
                  {[item.sellable && "Vendita", item.purchasable && "Acquisto", item.stockManaged && "Stock"]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="p-4">
                  {item.deletedAt
                    ? "Eliminato"
                    : item.active && item.status === "ACTIVE"
                      ? "Attivo"
                      : "Sospeso"}
                </td>
                <td className="p-4 text-right">
                  <Link href={`/items/${item.id}`} className="rounded-lg border px-3 py-2 hover:bg-slate-50">
                    Dettaglio
                  </Link>
                </td>
              </tr>
            ))}
            {result.items.length === 0 && (
              <tr>
                <td colSpan={8} className="p-12 text-center text-slate-500">
                  Nessun Item corrisponde ai criteri selezionati.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>
          Pagina {Math.min(result.page, result.pageCount)} di {result.pageCount}
        </span>
        <div className="flex gap-2">
          <PaginationLink
            disabled={result.page <= 1}
            href={`/items?${queryString(currentParams, { page: Math.max(1, result.page - 1) })}`}
          >
            Precedente
          </PaginationLink>
          <PaginationLink
            disabled={result.page >= result.pageCount}
            href={`/items?${queryString(currentParams, { page: Math.min(result.pageCount, result.page + 1) })}`}
          >
            Successiva
          </PaginationLink>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options = [
    ["", "Tutti"],
    ["true", "Sì"],
    ["false", "No"],
  ],
}: {
  name: string;
  label: string;
  value?: string;
  options?: Array<[string, string]>;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select name={name} defaultValue={value ?? ""} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
        {options.map(([optionValue, text]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{children}</span>;
}

function PaginationLink({
  disabled,
  href,
  children,
}: {
  disabled: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return disabled ? (
    <span className="rounded-lg border px-3 py-2 text-slate-300">{children}</span>
  ) : (
    <Link href={href} className="rounded-lg border px-3 py-2 hover:bg-white">
      {children}
    </Link>
  );
}
