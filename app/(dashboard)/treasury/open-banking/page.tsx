import { requireTreasuryContext } from "@/lib/treasury-access";
import { checkProviderConfiguration } from "@/lib/open-banking/config";
import { discoverInstitutions, getOpenBankingDashboard, maskIban } from "@/lib/open-banking/service";
import { connectBankAction, linkBankAccountAction, refreshBankAction, revokeBankAction, syncBankAction } from "./actions";

const button = "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50";
const secondary = "rounded border px-3 py-2 text-sm";
const date = (value?: Date | null) => value ? value.toLocaleString("it-IT") : "—";
const yesNo = (value: boolean) => value ? "Sì" : "No";

export default async function Page({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { companyId, locationId } = await requireTreasuryContext(); const query = await searchParams;
  const data = await getOpenBankingDashboard(companyId, locationId); const health = checkProviderConfiguration();
  let institutions: Awaited<ReturnType<typeof discoverInstitutions>> = []; let configurationError = "";
  if (health.ready) try { institutions = await discoverInstitutions(""); } catch (error) { configurationError = error instanceof Error ? error.message : "Provider non configurato."; }
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">Open Banking</h1><p className="text-slate-500">Collegamento read-only dei conti bancari alla riconciliazione Treasury.</p></div>
    {(query.success || query.error || configurationError) && <div className={`rounded border p-3 text-sm ${query.error || configurationError ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{query.error ?? query.success ?? configurationError}</div>}
    <section className="space-y-4 rounded border bg-white p-5">
      <div><h2 className="font-semibold">Configurazione Provider</h2><p className="text-sm text-slate-500">Diagnostica locale; non effettua chiamate verso provider esterni.</p></div>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <p><span className="text-slate-500">Provider</span><br/><b>{health.provider}</b></p>
        <p><span className="text-slate-500">Stato</span><br/><b>{health.status}</b></p>
        <p><span className="text-slate-500">Ambiente</span><br/><b>{health.sandbox ? "Sandbox" : "Live"}</b></p>
        <p className="md:col-span-2"><span className="text-slate-500">Callback URL</span><br/><b className="break-all">{health.callbackUrl || "Non configurata"}</b></p>
        <p><span className="text-slate-500">Callback valida</span><br/><b>{yesNo(health.callbackValid)}</b></p>
        <p><span className="text-slate-500">Credenziali configurate</span><br/><b>{yesNo(health.credentialsConfigured)}</b></p>
        <p><span className="text-slate-500">BNL configurata</span><br/><b>{yesNo(health.institutionMappings.BNL)}</b></p>
        <p><span className="text-slate-500">Intesa configurata</span><br/><b>{yesNo(health.institutionMappings.INTESA)}</b></p>
      </div>
      {health.missingVariables.length > 0 && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>{health.status}</b><ul className="mt-2 list-inside list-disc">{health.missingVariables.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    </section>
    <section className="rounded border bg-white p-5"><h2 className="font-semibold">Collega banca</h2><p className="mb-4 text-sm text-slate-500">Nexus non richiede né memorizza username o password bancarie.</p><form action={connectBankAction} className="flex gap-3"><select className="rounded border px-3 py-2" name="institutionId" required><option value="">Seleziona banca</option>{institutions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select><button className={button} disabled={!health.ready || !institutions.length}>Collega banca</button></form></section>
    {data.connections.length ? data.connections.map(connection => <section className="space-y-4 rounded border bg-white p-5" key={connection.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{connection.institutionName}</h2><p className="text-sm">Provider: {connection.provider} · Stato: {connection.status} · Ultima sync: {date(connection.lastSuccessfulSyncAt)} · Consenso: {date(connection.consentExpiresAt)}</p>{connection.safeError && <p className="text-sm text-red-700">{connection.safeError}</p>}</div><div className="flex flex-wrap gap-2"><form action={syncBankAction}><input type="hidden" name="connectionId" value={connection.id}/><button className={button}>Sincronizza</button></form><form action={refreshBankAction}><input type="hidden" name="connectionId" value={connection.id}/><button className={secondary}>Rinnova consenso</button></form><form action={revokeBankAction}><input type="hidden" name="connectionId" value={connection.id}/><button className={secondary}>Revoca</button></form></div></div>
      {connection.accounts.map(account => <div className="grid gap-3 border-t pt-4 md:grid-cols-3" key={account.id}><div><b>{account.accountName}</b><p className="text-sm text-slate-500">{maskIban(account.iban)} · {account.currency}</p><p className="text-sm">Saldo {account.currentBalance?.toFixed(2) ?? "—"} {account.currency}</p></div><div className="text-sm">{account.financialAccountId ? "Collegato al Treasury" : "Non collegato"}</div><form action={linkBankAccountAction} className="flex gap-2"><input type="hidden" name="openBankingAccountId" value={account.id}/><select className="min-w-0 rounded border px-2" name="financialAccountId" required><option value="">FinancialAccount</option>{data.financialAccounts.filter(row => row.currency === account.currency).map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select><button className={secondary}>Collega</button></form></div>)}
    </section>) : <p className="rounded border bg-white p-5 text-slate-500">Nessun conto collegato.</p>}
  </div>;
}
