import "server-only";

import { getAuditLogs } from "@/lib/audit";
import { getAuthorizationContext } from "@/lib/authorization";

export class AuditAccessDeniedError extends Error {}

export async function getAdministrativeAuditLogs(options: { entityType?: string; entityId?: string; take?: number } = {}) {
  const context = await getAuthorizationContext();
  if (!context.roles.some((role) => role === "SUPER_ADMIN" || role === "ADMIN")) throw new AuditAccessDeniedError("Accesso audit non autorizzato.");
  return getAuditLogs(context.companyId, options);
}
