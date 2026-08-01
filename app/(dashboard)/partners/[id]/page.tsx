import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { getPartnerDetail } from "@/lib/partners";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { archivePartner, restorePartner } from "../actions";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  await requireModule(session.user.companyId, MODULE_CODES.CORE_PARTNERS);
  const { id } = await params;
  const partner = await getPartnerDetail(session.user.companyId, id);
  if (!partner) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-slate-500">{partner.code}</p>
          <h1 className="text-3xl font-bold">{partner.name}</h1>
          <p className="text-slate-500">
            {partner.type === "COMPANY" ? "Azienda" : "Persona fisica"} ·{" "}
            {partner.deletedAt
              ? "Eliminato"
              : partner.active
                ? partner.status === "ACTIVE"
                  ? "Attivo"
                  : "Sospeso"
                : "Non operativo"}
          </p>
        </div>
        <div className="flex gap-2">
          {!partner.deletedAt && (
            <Link
              href={`/partners/${partner.id}/edit`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Modifica
            </Link>
          )}
          <form action={partner.deletedAt ? restorePartner : archivePartner}>
            <input type="hidden" name="partnerId" value={partner.id} />
            <button
              type="submit"
              className={`rounded-lg px-4 py-2 text-sm ${
                partner.deletedAt
                  ? "bg-emerald-700 text-white"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {partner.deletedAt ? "Ripristina" : "Elimina logicamente"}
            </button>
          </form>
        </div>
      </div>

      <DetailSection title="Generale">
        <Detail label="Ragione sociale" value={partner.legalName} />
        <Detail label="Nome" value={partner.firstName} />
        <Detail label="Cognome" value={partner.lastName} />
        <Detail label="Partita IVA" value={partner.vatNumber} />
        <Detail label="Codice fiscale" value={partner.taxCode} />
        <Detail label="Categoria" value={partner.category} />
        <Detail label="Qualifiche" value={partnerRoles(partner)} />
      </DetailSection>

      <DetailSection title="Contatti">
        <Detail label="Email" value={partner.email} />
        <Detail label="PEC" value={partner.pec} />
        <Detail label="Telefono" value={partner.phone} />
        <Detail label="Cellulare" value={partner.mobile} />
        <Detail label="Sito web" value={partner.website} />
        <Detail
          label="Indirizzo"
          value={[
            partner.address,
            partner.zipCode,
            partner.city,
            partner.province,
            partner.country,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      </DetailSection>

      <DetailSection title="Commerciale">
        <Detail label="Listino" value={partner.priceList ? `${partner.priceList.code} · ${partner.priceList.name}` : null} />
        <Detail label="Agente" value={partner.agent?.name} />
        <Detail label="Metodo pagamento" value={partner.paymentMethod ? `${partner.paymentMethod.code} · ${partner.paymentMethod.name}` : null} />
        <Detail label="Condizioni pagamento" value={partner.paymentTerm ? `${partner.paymentTerm.code} · ${partner.paymentTerm.name}` : null} />
        <Detail
          label="Fido"
          value={partner.creditLimit ? `€ ${partner.creditLimit}` : null}
        />
        <Detail
          label="Sconto"
          value={
            partner.discountPercent ? `${partner.discountPercent}%` : null
          }
        />
      </DetailSection>

      <DetailSection title="Fiscale">
        <Detail label="Codice destinatario" value={partner.recipientCode} />
        <Detail label="Split payment" value={partner.splitPayment ? "Sì" : "No"} />
        <Detail label="Reverse charge" value={partner.reverseCharge ? "Sì" : "No"} />
      </DetailSection>

      <DetailSection title="Note e audit">
        <Detail label="Note interne" value={partner.internalNotes} />
        <Detail
          label="Creato da"
          value={
            partner.createdBy
              ? `${partner.createdBy.firstName} ${partner.createdBy.lastName}`
              : null
          }
        />
        <Detail
          label="Aggiornato da"
          value={
            partner.updatedBy
              ? `${partner.updatedBy.firstName} ${partner.updatedBy.lastName}`
              : null
          }
        />
      </DetailSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Placeholder title="Documenti" />
        <Placeholder title="Storico" />
      </div>
    </div>
  );
}

function partnerRoles(partner: {
  isCustomer: boolean;
  isSupplier: boolean;
  isLead: boolean;
  isProspect: boolean;
  isCollaborator: boolean;
  isAgent: boolean;
  isCarrier: boolean;
  isProfessional: boolean;
}) {
  return [
    partner.isCustomer && "Cliente",
    partner.isSupplier && "Fornitore",
    partner.isLead && "Lead",
    partner.isProspect && "Prospect",
    partner.isCollaborator && "Collaboratore",
    partner.isAgent && "Agente",
    partner.isCarrier && "Trasportatore",
    partner.isProfessional && "Professionista",
  ]
    .filter(Boolean)
    .join(", ");
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
      <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">{value || "—"}</dd>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-xl border border-dashed bg-white p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">
        Sezione predisposta per una futura integrazione del modulo.
      </p>
    </section>
  );
}
