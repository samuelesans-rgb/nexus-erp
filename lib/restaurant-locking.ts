import "server-only";
import { Prisma } from "@/generated/prisma/client";

export async function lockRestaurantResources(tx: Prisma.TransactionClient, companyId: string, resourceIds: readonly string[]) {
  const keys = [...new Set(resourceIds)].sort();
  for (const resourceId of keys) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${companyId + ":" + resourceId}, 0))`);
  }
}
