"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppSidebar() {
  const items = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Partner", href: "/partners" },
    { label: "Magazzino" },
    { label: "Vendite" },
    { label: "Acquisti" },
    { label: "Contabilità" },
    { label: "Tesoreria" },
    { label: "Report" },
  ];
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-slate-900 text-white">
      <div className="border-b border-slate-800 p-6">
        <h1 className="text-xl font-bold">Nexus ERP</h1>
        <p className="mt-1 text-sm text-slate-400">
          Business Platform
        </p>
      </div>

      <nav className="space-y-1 p-4">
          {items.map((item) => {
            const isActive =
              item.href &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`block w-full rounded-lg px-3 py-2 transition ${
                    isActive
                      ? "bg-slate-700 font-medium"
                      : "hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            }

            return (
              <span
                key={item.label}
                className="block w-full cursor-not-allowed rounded-lg px-3 py-2 text-slate-500"
                aria-disabled="true"
              >
                {item.label}
              </span>
            );
          })}
      </nav>
    </aside>
  );
}
