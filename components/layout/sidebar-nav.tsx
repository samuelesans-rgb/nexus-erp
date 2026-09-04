"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SidebarNav({
  items,
}: {
  items: Array<{ label: string; href: string; icon?: "users" }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1 p-2 sm:p-4">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block w-full rounded-lg px-2 py-2 text-sm transition sm:px-3 sm:text-base ${
              isActive ? "bg-slate-700 font-medium" : "hover:bg-slate-800"
            }`}
          >
            <span className="flex items-center gap-2">
              {item.icon === "users" && (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5 fill-none stroke-current"
                  strokeWidth="1.8"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              )}
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
