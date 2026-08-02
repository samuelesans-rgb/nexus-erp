import Link from "next/link";
import { requireTreasuryContext } from "@/lib/treasury-access";
import { TREASURY_ROUTES } from "@/lib/treasury-routing";
export default async function TreasuryLayout({ children }: { children: React.ReactNode }) { await requireTreasuryContext(); return <div className="space-y-6"><nav className="flex flex-wrap gap-2 border-b pb-3 text-sm">{Object.entries(TREASURY_ROUTES).map(([label, href]) => <Link className="rounded px-3 py-2 hover:bg-slate-100" href={href} key={href}>{label}</Link>)}</nav>{children}</div>; }
