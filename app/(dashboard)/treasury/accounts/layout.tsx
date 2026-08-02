import { requireTreasuryContext } from "@/lib/treasury-access";
export default async function Layout({ children }: { children: React.ReactNode }) { await requireTreasuryContext("operations"); return children; }
