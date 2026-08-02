import Link from "next/link";
export const euro = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
export function Header({ title, subtitle, action, href }: { title: string; subtitle: string; action?: string; href?: string }) { return <div className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">{title}</h1><p className="text-slate-500">{subtitle}</p></div>{action && href ? <Link className="rounded bg-slate-900 px-4 py-2 text-white" href={href}>{action}</Link> : null}</div>; }
export function Empty({ children = "Nessun dato disponibile." }: { children?: React.ReactNode }) { return <p className="rounded border bg-white p-6 text-slate-500">{children}</p>; }
export const inputClass = "w-full rounded border px-3 py-2";
export function Notice({ error, success }: { error?: string; success?: string }) { if (!error && !success) return null; return <p className={`rounded border p-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>; }
