import { PARTNER_CAPABILITIES, requirePartnerContext } from "@/lib/partner-access";
import {
  getPartnerList,
  type PartnerListParams,
} from "@/lib/partners";
import Link from "next/link";
import PartnerSearchInput from "./search-input";

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

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<PartnerListParams>;
}) {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.READ);

  const rawParams = await searchParams;
  const result = await getPartnerList(context.companyId, rawParams);
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
          <h1 className="text-3xl font-bold">Partner</h1>
          <p className="text-slate-500">
            Anagrafica centrale di {context.companyName}.
          </p>
        </div>
        {context.roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"].includes(role)) && (
          <Link href="/partners/new" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Nuovo Partner</Link>
        )}
      </div>

      <div className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PartnerSearchInput initialValue={result.params.q} />
          <span className="text-sm text-slate-500">
            {result.total} risultat{result.total === 1 ? "o" : "i"}
          </span>
        </div>

        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {result.params.q && <input type="hidden" name="q" value={result.params.q} />}
          <FilterSelect
            name="type"
            label="Tipo"
            value={rawParams.type}
            options={[
              ["", "Tutti"],
              ["COMPANY", "Azienda"],
              ["PERSON", "Persona"],
            ]}
          />
          <FilterSelect
            name="active"
            label="Operativo"
            value={rawParams.active}
            options={[
              ["", "Tutti"],
              ["true", "Sì"],
              ["false", "No"],
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
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <FilterSelect name="customer" label="Cliente" value={rawParams.customer} />
          <FilterSelect name="supplier" label="Fornitore" value={rawParams.supplier} />
          <FilterSelect name="lead" label="Lead" value={rawParams.lead} />
          <FilterSelect name="prospect" label="Prospect" value={rawParams.prospect} />
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
          <label className="text-xs font-medium text-slate-600">
            Ordina per
            <select
              name="sort"
              defaultValue={result.params.sort}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="name">Nome</option>
              <option value="code">Codice</option>
              <option value="createdAt">Creazione</option>
              <option value="city">Città</option>
            </select>
          </label>
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
            <Link href="/partners" className="rounded-lg border px-4 py-2 text-sm">
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
              <th className="p-4">Partner</th>
              <th className="p-4">Qualifiche</th>
              <th className="p-4">Categoria</th>
              <th className="p-4">Contatti</th>
              <th className="p-4">Stato</th>
              <th className="p-4 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {result.partners.map((partner) => (
              <tr key={partner.id} className="border-b last:border-0">
                <td className="p-4 font-mono text-xs">{partner.code}</td>
                <td className="p-4">
                  <Link
                    href={`/partners/${partner.id}`}
                    className="font-medium hover:underline"
                  >
                    {partner.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {partner.type === "COMPANY" ? "Azienda" : "Persona"}
                    {partner.city ? ` · ${partner.city}` : ""}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {partner.isCustomer && <Badge>Cliente</Badge>}
                    {partner.isSupplier && <Badge>Fornitore</Badge>}
                    {partner.isLead && <Badge>Lead</Badge>}
                    {partner.isProspect && <Badge>Prospect</Badge>}
                  </div>
                </td>
                <td className="p-4">{partner.category ?? "—"}</td>
                <td className="p-4">
                  <div>{partner.email ?? "—"}</div>
                  <div className="text-xs text-slate-500">
                    {partner.phone ?? partner.mobile ?? "—"}
                  </div>
                </td>
                <td className="p-4">
                  {partner.deletedAt
                    ? "Eliminato"
                    : partner.active
                      ? partner.status === "ACTIVE"
                        ? "Attivo"
                        : "Sospeso"
                      : "Non operativo"}
                </td>
                <td className="p-4 text-right">
                  <Link
                    href={`/partners/${partner.id}`}
                    className="rounded-lg border px-3 py-2 hover:bg-slate-50"
                  >
                    Dettaglio
                  </Link>
                </td>
              </tr>
            ))}
            {result.partners.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-slate-500">
                  Nessun Partner corrisponde ai criteri selezionati.
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
            href={`/partners?${queryString(currentParams, {
              page: Math.max(1, result.page - 1),
            })}`}
          >
            Precedente
          </PaginationLink>
          <PaginationLink
            disabled={result.page >= result.pageCount}
            href={`/partners?${queryString(currentParams, {
              page: Math.min(result.pageCount, result.page + 1),
            })}`}
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
      <select
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
      >
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
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
      {children}
    </span>
  );
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
