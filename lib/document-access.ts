import "server-only";
import { auth } from "@/auth";
import { MODULE_CODES } from "@/lib/module-catalog";
import { requireModule } from "@/lib/modules";
import { redirect } from "next/navigation";

const readers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER", "WAREHOUSE"]);
const writers = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]);
export async function requireDocumentContext(write = false) { const session = await auth(); if (!session?.user?.companyId) redirect("/login"); const allowed = write ? writers : readers; if (!session.user.roles.some((role) => allowed.has(role))) redirect("/dashboard"); try { await requireModule(session.user.companyId, MODULE_CODES.CORE_DOCUMENTS); } catch { redirect("/dashboard"); } return { companyId: session.user.companyId, userId: session.user.id, roles: session.user.roles }; }
