import AppShell from "@/components/layout/app-shell";
import { requireAuthorizationContext } from "@/lib/authorization";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthorizationContext();
  return <AppShell>{children}</AppShell>;
}
