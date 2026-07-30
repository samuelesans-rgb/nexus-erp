"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SidebarNav({
  items,
}: {
  items: Array<{ label: string; href: string }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 p-4">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block w-full rounded-lg px-3 py-2 transition ${
              isActive ? "bg-slate-700 font-medium" : "hover:bg-slate-800"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
