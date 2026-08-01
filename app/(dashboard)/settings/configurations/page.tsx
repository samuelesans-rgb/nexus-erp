import { auth } from "@/auth";
import { CONFIGURATION_CATALOG } from "@/lib/configuration-catalog";
import { getCompanyModules } from "@/lib/modules";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ConfigurationsPage() {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");
  if (!session.user.roles.some((role) => role === "ADMIN" || role === "SUPER_ADMIN")) redirect("/dashboard");
  const modules = await getCompanyModules(session.user.companyId);
  const activeCodes = new Set(modules.map(({ moduleDefinition }) => moduleDefinition.code));
  const entries = CONFIGURATION_CATALOG.filter(({ requiredModule }) => activeCodes.has(requiredModule));
  return <div className="space-y-6"><div><h1 className="text-3xl font-bold">Configurazioni</h1><p className="text-slate-500">Anagrafiche condivise e tenant-safe della Company.</p></div><div className="grid gap-4 md:grid-cols-2">{entries.map((entry) => <Link key={entry.key} href={`/settings/configurations/${entry.key}`} className="rounded-xl border bg-white p-5 transition hover:border-slate-400"><h2 className="font-semibold">{entry.label}</h2><p className="mt-1 text-sm text-slate-500">{entry.description}</p></Link>)}</div></div>;
}
