import {
  hasPartnerCapability,
  PARTNER_CAPABILITIES,
  requirePartnerContext,
} from "@/lib/partner-access";
import {
  getPartnerOverview,
  validatePartnerOverviewScope,
} from "@/lib/partner-overview";
import { getLocations } from "@/lib/locations";
import { getCompanyModules } from "@/lib/modules";
import { MODULE_CODES } from "@/lib/module-catalog";
import { getPartnerDetail } from "@/lib/partners";
import { CRM_CAPABILITIES, hasCrmCapability } from "@/lib/crm-access";
import { crmNewOpportunityHref, crmOpportunityHref, getPartnerCrmSummary } from "@/lib/crm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archivePartner, restorePartner } from "../actions";

export default async function PartnerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const context = await requirePartnerContext(PARTNER_CAPABILITIES.READ);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const scope = await validatePartnerOverviewScope(
    context.companyId,
    query.location,
    context.location.id,
    context.canReadCompanyWide,
  );
  const [partner, overview, locations, modules] = await Promise.all([
    getPartnerDetail(context.companyId, id),
    getPartnerOverview({
      companyId: context.companyId,
      partnerId: id,
      locationId: scope.locationId,
      financialScope: context.financialScope,
    }),
    getLocations(context.companyId),
    getCompanyModules(context.companyId),
  ]);
  if (!partner || !overview) notFound();

  const canWrite = hasPartnerCapability(context.roles, PARTNER_CAPABILITIES.WRITE);
  const canArchive = hasPartnerCapability(context.roles, PARTNER_CAPABILITIES.ARCHIVE);
  const moduleCodes = new Set(modules.map((row) => row.moduleDefinition.code));
  const crmSummary = moduleCodes.has(MODULE_CODES.CORE_CRM) && hasCrmCapability(context.roles, CRM_CAPABILITIES.READ)
    ? await getPartnerCrmSummary({ companyId: context.companyId, membershipId: context.membershipId, userId: context.userId, roles: context.roles }, partner.id)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">{partner.code}</p>
          <h1 className="text-3xl font-bold">{partner.name}</h1>
          <p className="text-slate-500">
            {partner.type === "COMPANY" ? "Azienda" : "Persona fisica"} · {partnerState(partner)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && !partner.deletedAt && <Link href={`/partners/${partner.id}/edit`} className="rounded-lg border px-4 py-2 text-sm">Modifica</Link>}
          {canArchive && (
            <form action={partner.deletedAt ? restorePartner : archivePartner}>
              <input type="hidden" name="partnerId" value={partner.id} />
              <button type="submit" className={`rounded-lg px-4 py-2 text-sm ${partner.deletedAt ? "bg-emerald-700 text-white" : "bg-red-50 text-red-700"}`}>
                {partner.deletedAt ? "Ripristina" : "Elimina logicamente"}
              </button>
            </form>
          )}
        </div>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">Ambito dati ERP
            <select name="location" defaultValue={scope.locationId ?? "company"} className="mt-1 block rounded-lg border px-3 py-2">
              {context.canReadCompanyWide && <option value="company">Intera Company</option>}
              {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
            </select>
          </label>
          <button className="rounded-lg border px-4 py-2 text-sm">Applica</button>
          <span className="pb-2 text-xs text-slate-500">Il Partner resta condiviso fra tutte le sedi.</span>
        </form>
      </section>

      <QuickActions partner={partner} moduleCodes={moduleCodes} roles={context.roles} />

      {crmSummary && <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">CRM</h2><Link href={crmNewOpportunityHref(partner.id)} className="text-sm underline">Nuova opportunità</Link></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Detail label="Opportunità aperte" value={String(crmSummary.openCount)} /><Detail label="Valore aperto" value={money(Number(crmSummary.openValue))} /></div><div className="mt-4 space-y-2">{crmSummary.opportunities.slice(0, 5).map((row) => <Link key={row.id} href={crmOpportunityHref(row.id)} className="block border-t pt-2 text-sm">{row.title} · {row.stageName} · {money(Number(row.estimatedValue), row.currency)}</Link>)}</div><div className="mt-4 space-y-2">{crmSummary.activities.filter((row) => row.status === "OPEN").slice(0, 5).map((row) => <p key={row.id} className="border-t pt-2 text-sm">{row.type} · {row.subject} · {row.dueAt ? dateTime(row.dueAt) : "Senza scadenza"}</p>)}</div></section>}

      {overview.customer && <KpiSection title="Customer KPI" rows={[
        ["Fatturato", money(overview.customer.revenue)],
        ["Documenti vendita", String(overview.customer.documentCount)],
        ["Valore ordini", money(overview.customer.orderValue)],
        ["Incassato", overview.customer.financial ? money(overview.customer.financial.paid) : "Riservato"],
        ["Residuo", overview.customer.financial ? money(overview.customer.financial.residual) : "Riservato"],
        ["Scaduto", overview.customer.financial ? money(overview.customer.financial.overdue) : "Riservato"],
        ["Prossima scadenza", date(overview.customer.financial?.nextDueDate)],
        ["Ultima vendita", date(overview.customer.lastSale)],
        ["Prenotazioni", String(overview.customer.reservationCount)],
        ["Comande", String(overview.customer.restaurantOrderCount)],
        ["Valore Restaurant", money(overview.customer.restaurantValue)],
      ]} />}

      {overview.supplier && <KpiSection title="Supplier KPI" rows={[
        ["Acquisti", money(overview.supplier.purchases)],
        ["Documenti acquisto", String(overview.supplier.documentCount)],
        ["Valore ordini acquisto", money(overview.supplier.orderValue)],
        ["Pagato", overview.supplier.financial ? money(overview.supplier.financial.paid) : "Riservato"],
        ["Residuo", overview.supplier.financial ? money(overview.supplier.financial.residual) : "Riservato"],
        ["Scaduto", overview.supplier.financial ? money(overview.supplier.financial.overdue) : "Riservato"],
        ["Prossima scadenza", date(overview.supplier.financial?.nextDueDate)],
        ["Ultimo acquisto", date(overview.supplier.lastPurchase)],
      ]} />}

      <DetailSection title="Overview">
        <Detail label="Ragione sociale" value={partner.legalName} />
        <Detail label="Nome" value={partner.firstName} />
        <Detail label="Cognome" value={partner.lastName} />
        <Detail label="Partita IVA" value={partner.vatNumber} />
        <Detail label="Codice fiscale" value={partner.taxCode} />
        <Detail label="Categoria" value={partner.category} />
        <Detail label="Qualifiche" value={partnerRoles(partner)} />
        <Detail label="Email" value={partner.email} />
        <Detail label="PEC" value={partner.pec} />
        <Detail label="Telefono" value={partner.phone} />
        <Detail label="Cellulare" value={partner.mobile} />
        <Detail label="Sito web" value={partner.website} />
        <Detail label="Indirizzo" value={[partner.address, partner.zipCode, partner.city, partner.province, partner.country].filter(Boolean).join(", ")} />
        <Detail label="Listino" value={partner.priceList ? `${partner.priceList.code} · ${partner.priceList.name}` : null} />
        <Detail label="Agente" value={partner.agent?.name} />
        <Detail label="Metodo pagamento" value={partner.paymentMethod ? `${partner.paymentMethod.code} · ${partner.paymentMethod.name}` : null} />
        <Detail label="Condizioni pagamento" value={partner.paymentTerm ? `${partner.paymentTerm.code} · ${partner.paymentTerm.name}` : null} />
        <Detail label="Fido" value={partner.creditLimit ? money(Number(partner.creditLimit)) : null} />
        <Detail label="Sconto" value={partner.discountPercent ? `${partner.discountPercent}%` : null} />
      </DetailSection>

      <DetailSection title="Fiscale">
        <Detail label="Codice destinatario" value={partner.recipientCode} />
        <Detail label="Split payment" value={partner.splitPayment ? "Sì" : "No"} />
        <Detail label="Reverse charge" value={partner.reverseCharge ? "Sì" : "No"} />
      </DetailSection>

      <DocumentSection title="Sales Documents" rows={overview.documents.filter((row) => row.section === "SALES")} />
      <DocumentSection title="Purchasing Documents" rows={overview.documents.filter((row) => row.section === "PURCHASING")} />
      <DocumentSection title="Resi e note di credito" rows={overview.documents.filter((row) => row.section === "OTHER")} />

      {overview.treasury && <TreasurySection overview={overview} />}
      {(overview.restaurant.reservations.length > 0 || overview.restaurant.orders.length > 0) && <RestaurantSection overview={overview} />}

      <DetailSection title="Note e audit">
        <Detail label="Note interne" value={partner.internalNotes} />
        <Detail label="Creato da" value={partner.createdBy ? `${partner.createdBy.firstName} ${partner.createdBy.lastName}` : null} />
        <Detail label="Aggiornato da" value={partner.updatedBy ? `${partner.updatedBy.firstName} ${partner.updatedBy.lastName}` : null} />
      </DetailSection>
    </div>
  );
}

function QuickActions({ partner, moduleCodes, roles }: { partner: { isCustomer: boolean; isSupplier: boolean }; moduleCodes: Set<string>; roles: readonly string[] }) {
  const links: Array<[string, string]> = [];
  if (partner.isCustomer && moduleCodes.has(MODULE_CODES.CORE_SALES) && roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"].includes(role))) links.push(["Nuovo preventivo", "/sales/quotes/new"]);
  if (partner.isSupplier && moduleCodes.has(MODULE_CODES.CORE_PURCHASES) && roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(role))) links.push(["Nuovo ordine acquisto", "/purchases/orders/new"]);
  if (partner.isCustomer && moduleCodes.has(MODULE_CODES.RESTAURANT_RESERVATIONS) && roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "SALES"].includes(role))) links.push(["Nuova prenotazione", "/restaurant/reservations/new"]);
  if (!links.length) return null;
  return <section className="flex flex-wrap gap-2">{links.map(([label, href]) => <Link key={href} href={href} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">{label}</Link>)}</section>;
}

function DocumentSection({ title, rows }: { title: string; rows: Array<{ id: string; documentNumber: string; documentType: string; status: string; documentDate: Date; total: unknown; currency: string; location: { code: string; name: string } | null }> }) {
  return <section className="overflow-hidden rounded-xl border bg-white"><h2 className="border-b p-5 text-lg font-semibold">{title}</h2>{rows.length ? rows.map((row) => <Link key={row.id} href={`/documents/${row.id}`} className="grid gap-2 border-b p-3 text-sm hover:bg-slate-50 md:grid-cols-6"><span>{row.documentNumber}</span><span>{row.documentType}</span><span>{date(row.documentDate)}</span><span>{row.status}</span><span>{money(Number(row.total), row.currency)}</span><span>{row.location ? `${row.location.code} · ${row.location.name}` : "Company"}</span></Link>) : <p className="p-5 text-sm text-slate-500">Nessun documento.</p>}</section>;
}

function TreasurySection({ overview }: { overview: NonNullable<Awaited<ReturnType<typeof getPartnerOverview>>> }) {
  const treasury = overview.treasury!;
  return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Treasury</h2><h3 className="font-medium">Scadenze aperte</h3>{treasury.schedules.length ? treasury.schedules.map((row) => <div key={row.id} className="grid gap-2 border-b py-2 text-sm md:grid-cols-6"><span>{row.direction}</span><span>{date(row.dueDate)}</span><span>{row.status}</span><span>{money(Number(row.residualAmount), row.currency)}</span><span>{row.document?.documentNumber ?? "Manuale"}</span><span>{row.location?.name ?? "Company"}</span></div>) : <p className="text-sm text-slate-500">Nessuna scadenza aperta.</p>}<h3 className="font-medium">Incassi e pagamenti</h3>{treasury.movements.length ? treasury.movements.map((row) => <div key={row.id} className="grid gap-2 border-b py-2 text-sm md:grid-cols-5"><span>{row.movementType}</span><span>{date(row.occurredAt)}</span><span>{money(Number(row.amount), row.currency)}</span><span>{row.reference ?? "—"}</span><span>{row.location?.name ?? "Company"}</span></div>) : <p className="text-sm text-slate-500">Nessun movimento.</p>}</section>;
}

function RestaurantSection({ overview }: { overview: NonNullable<Awaited<ReturnType<typeof getPartnerOverview>>> }) {
  return <section className="space-y-4 rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold">Restaurant & Booking</h2>{overview.restaurant.reservations.map((row) => <Link key={row.id} href={`/restaurant/reservations/${row.id}`} className="grid gap-2 border-b py-2 text-sm md:grid-cols-5"><span>{row.code}</span><span>{dateTime(row.startTime)}</span><span>{row.partySize} coperti</span><span>{row.status}</span><span>{row.location.name}</span></Link>)}{overview.restaurant.orders.map((row) => <Link key={row.id} href={`/restaurant/orders/${row.id}`} className="grid gap-2 border-b py-2 text-sm md:grid-cols-5"><span>{row.code}</span><span>{dateTime(row.openedAt)}</span><span>{row.status}</span><span>{row.document ? money(Number(row.document.total), row.document.currency) : "—"}</span><span>{row.location.name}</span></Link>)}</section>;
}

function KpiSection({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section className="rounded-xl border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{rows.map(([label, value]) => <Detail key={label} label={label} value={value} />)}</dl></section>; }
function partnerState(partner: { deletedAt: Date | null; active: boolean; status: string }) { return partner.deletedAt ? "Eliminato" : partner.active ? partner.status === "ACTIVE" ? "Attivo" : "Sospeso" : "Non operativo"; }
function money(value: number, currency = "EUR") { return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value); }
function date(value?: Date | null) { return value ? value.toLocaleDateString("it-IT") : "—"; }
function dateTime(value: Date) { return value.toLocaleString("it-IT"); }

function partnerRoles(partner: { isCustomer: boolean; isSupplier: boolean; isLead: boolean; isProspect: boolean; isCollaborator: boolean; isAgent: boolean; isCarrier: boolean; isProfessional: boolean }) {
  return [partner.isCustomer && "Cliente", partner.isSupplier && "Fornitore", partner.isLead && "Lead", partner.isProspect && "Prospect", partner.isCollaborator && "Collaboratore", partner.isAgent && "Agente", partner.isCarrier && "Trasportatore", partner.isProfessional && "Professionista"].filter(Boolean).join(", ");
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">{title}</h2><dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</dl></section>; }
function Detail({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-xs font-medium uppercase text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</dd></div>; }
