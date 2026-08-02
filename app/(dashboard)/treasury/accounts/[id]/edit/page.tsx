import { notFound } from "next/navigation";
import { getTreasuryAccount } from "@/lib/treasury";
import { requireTreasuryContext } from "@/lib/treasury-access";
import { updateAccountAction } from "../../../actions";
import { Header, inputClass, Notice } from "../../../treasury-ui";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { companyId } = await requireTreasuryContext("manage"); const row = await getTreasuryAccount(companyId, (await params).id); if (!row) notFound(); const query = await searchParams;
  return <><Header title="Modifica conto" subtitle="Saldo e movimenti posted restano invariati." /><Notice error={query.error} /><form action={updateAccountAction} className="grid gap-4 rounded border bg-white p-6 md:grid-cols-2"><input name="id" type="hidden" value={row.id} /><label>Codice<input className={inputClass} defaultValue={row.code} name="code" required /></label><label>Nome<input className={inputClass} defaultValue={row.name} name="name" required /></label><label>Tipo<select className={inputClass} defaultValue={row.type} name="type">{["BANK","CASH","CARD","PAYPAL","OTHER"].map(v => <option key={v}>{v}</option>)}</select></label><label>Valuta<input className={inputClass} defaultValue={row.currency} maxLength={3} name="currency" required /></label><label>IBAN<input className={inputClass} defaultValue={row.iban ?? ""} name="iban" /></label><label>BIC<input className={inputClass} defaultValue={row.bic ?? ""} name="bic" /></label><label>Banca<input className={inputClass} defaultValue={row.bankName ?? ""} name="bankName" /></label><label className="flex items-center gap-2"><input defaultChecked={row.active} name="active" type="checkbox" />Conto attivo</label><button className="rounded bg-slate-900 px-4 py-2 text-white md:col-span-2">Salva modifiche</button></form></>;
}
