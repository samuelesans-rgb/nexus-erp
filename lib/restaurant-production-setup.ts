import "server-only";
import { z } from "zod";
import type { PrismaClient, RestaurantTableStatus } from "@/generated/prisma/client";
import { parseRestaurantBookingSettings } from "@/lib/restaurant-booking-settings";

export class RestaurantProductionSetupError extends Error { constructor(message: string) { super(message); this.name = "RestaurantProductionSetupError"; } }
const code = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform((value) => value.toUpperCase());
const area = z.object({ code, name: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).nullable().optional(), sortOrder: z.number().int().min(0).max(100000).optional(), active: z.boolean().optional() }).strict();
const table = z.object({ areaCode: code, code, name: z.string().trim().min(1).max(200), seats: z.number().int().min(1).max(1000), minSeats: z.number().int().min(1).max(1000).nullable().optional(), maxSeats: z.number().int().min(1).max(1000).nullable().optional(), active: z.boolean().optional(), status: z.enum(["AVAILABLE", "RESERVED", "OCCUPIED", "DIRTY", "OUT_OF_SERVICE"]).optional() }).strict().superRefine((value, context) => {
  if (value.minSeats != null && value.maxSeats != null && value.minSeats > value.maxSeats) context.addIssue({ code: "custom", message: "minSeats non può superare maxSeats." });
  if (value.minSeats != null && value.minSeats > value.seats) context.addIssue({ code: "custom", message: "minSeats non può superare seats." });
  if (value.maxSeats != null && value.maxSeats < value.seats) context.addIssue({ code: "custom", message: "maxSeats non può essere inferiore a seats." });
});
export const restaurantProductionConfigSchema = z.object({
  company: z.object({ vatNumber: z.string().trim().min(5).max(32) }).strict(), location: z.object({ slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) }).strict(), areas: z.array(area).min(1), tables: z.array(table),
  bookingSettings: z.object({ bookingEnabled: z.boolean(), weeklyOpeningHours: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.array(z.tuple([z.string(), z.string()]))), slotIntervalMinutes: z.number().int(), defaultDurationMinutes: z.number().int(), minimumAdvanceMinutes: z.number().int(), maximumAdvanceDays: z.number().int(), maxCoversPerSlot: z.number().int(), internalNotificationEmail: z.string().nullable(), confirmationMessage: z.string().nullable() }).strict(),
}).strict().superRefine((config, context) => {
  const duplicate = (values: string[]) => values.find((value, index) => values.indexOf(value) !== index);
  const duplicateArea = duplicate(config.areas.map((value) => value.code)); const duplicateTable = duplicate(config.tables.map((value) => value.code));
  if (duplicateArea) context.addIssue({ code: "custom", path: ["areas"], message: `Codice area duplicato: ${duplicateArea}.` });
  if (duplicateTable) context.addIssue({ code: "custom", path: ["tables"], message: `Codice tavolo duplicato: ${duplicateTable}.` });
  const areaCodes = new Set(config.areas.map((value) => value.code)); config.tables.forEach((value, index) => { if (!areaCodes.has(value.areaCode)) context.addIssue({ code: "custom", path: ["tables", index, "areaCode"], message: `Area non presente nella configurazione: ${value.areaCode}.` }); });
});
export type RestaurantProductionConfig = z.output<typeof restaurantProductionConfigSchema>;
export type SetupAction = { entity: "area" | "table" | "bookingSettings"; code: string; action: "create" | "update" | "unchanged" };
type SetupOptions = { dryRun?: boolean; allowTestMode?: boolean; failAfter?: "areas" };
function settings(config: RestaurantProductionConfig) { const value = config.bookingSettings; return parseRestaurantBookingSettings({ enabled: value.bookingEnabled, openingHours: value.weeklyOpeningHours, slotIntervalMinutes: value.slotIntervalMinutes, defaultDurationMinutes: value.defaultDurationMinutes, minAdvanceMinutes: value.minimumAdvanceMinutes, maxAdvanceDays: value.maximumAdvanceDays, maxCoversPerSlot: value.maxCoversPerSlot, internalNotificationEmail: value.internalNotificationEmail, confirmationMessage: value.confirmationMessage }); }
export function parseRestaurantProductionConfig(input: unknown) { const parsed = restaurantProductionConfigSchema.safeParse(input); if (!parsed.success) throw new RestaurantProductionSetupError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ")); settings(parsed.data); return parsed.data; }
export function assertRestaurantProductionEnvironment(environment: NodeJS.ProcessEnv, allowTestMode = false) {
  if (environment.NODE_ENV === "production") return;
  let testDatabase = false;
  try { testDatabase = new URL(environment.DATABASE_URL ?? "").pathname.replace(/^\//, "").endsWith("_test"); } catch { /* handled by the common error below */ }
  if (allowTestMode && environment.RESTAURANT_SETUP_ALLOW_TEST_MODE === "true" && testDatabase) return;
  throw new RestaurantProductionSetupError("Setup consentito solo con NODE_ENV=production; i test richiedono opt-in esplicito e DATABASE_URL _test.");
}
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
export async function setupRestaurantProduction(client: PrismaClient, rawConfig: unknown, environment: NodeJS.ProcessEnv, options: SetupOptions = {}) {
  assertRestaurantProductionEnvironment(environment, options.allowTestMode); const config = parseRestaurantProductionConfig(rawConfig);
  return client.$transaction(async (tx) => {
    const company = await tx.company.findUnique({ where: { vatNumber: config.company.vatNumber }, select: { id: true } }); if (!company) throw new RestaurantProductionSetupError("Company non trovata.");
    const location = await tx.location.findUnique({ where: { slug: config.location.slug }, select: { id: true, companyId: true, active: true, deletedAt: true } }); if (!location) throw new RestaurantProductionSetupError("Location non trovata."); if (location.companyId !== company.id) throw new RestaurantProductionSetupError("La Location appartiene a un'altra Company."); if (!location.active || location.deletedAt) throw new RestaurantProductionSetupError("La Location non è attiva.");
    const [oldAreas, oldTables, oldSettings] = await Promise.all([tx.restaurantArea.findMany({ where: { companyId: company.id, locationId: location.id } }), tx.restaurantTable.findMany({ where: { companyId: company.id, locationId: location.id } }), tx.restaurantBookingSettings.findUnique({ where: { companyId_locationId: { companyId: company.id, locationId: location.id } } })]);
    const actions: SetupAction[] = []; const areaIds = new Map<string, string>();
    for (const value of config.areas) {
      const current = oldAreas.find((row) => row.code === value.code); const data = { name: value.name, description: value.description ?? null, sortOrder: value.sortOrder ?? 0, active: value.active ?? true, deletedAt: null }; const changed = !current || !same({ name: current.name, description: current.description, sortOrder: current.sortOrder, active: current.active, deletedAt: current.deletedAt }, data); actions.push({ entity: "area", code: value.code, action: !current ? "create" : changed ? "update" : "unchanged" });
      if (options.dryRun) { areaIds.set(value.code, current?.id ?? `dry-run:${value.code}`); continue; }
      const row = !current ? await tx.restaurantArea.create({ data: { companyId: company.id, locationId: location.id, code: value.code, ...data }, select: { id: true } }) : changed ? await tx.restaurantArea.update({ where: { id: current.id }, data, select: { id: true } }) : current; areaIds.set(value.code, row.id);
    }
    if (options.failAfter === "areas") throw new RestaurantProductionSetupError("Errore setup simulato.");
    for (const value of config.tables) {
      const current = oldTables.find((row) => row.code === value.code); const data = { areaId: areaIds.get(value.areaCode)!, name: value.name, seats: value.seats, minSeats: value.minSeats ?? null, maxSeats: value.maxSeats ?? null, active: value.active ?? true, status: (value.status ?? "AVAILABLE") as RestaurantTableStatus, deletedAt: null }; const changed = !current || !same({ areaId: current.areaId, name: current.name, seats: current.seats, minSeats: current.minSeats, maxSeats: current.maxSeats, active: current.active, status: current.status, deletedAt: current.deletedAt }, data); actions.push({ entity: "table", code: value.code, action: !current ? "create" : changed ? "update" : "unchanged" });
      if (!options.dryRun && !current) await tx.restaurantTable.create({ data: { companyId: company.id, locationId: location.id, code: value.code, ...data } }); else if (!options.dryRun && changed) await tx.restaurantTable.update({ where: { id: current!.id }, data });
    }
    const data = settings(config); const comparable = oldSettings && { enabled: oldSettings.enabled, openingHours: oldSettings.openingHours, slotIntervalMinutes: oldSettings.slotIntervalMinutes, defaultDurationMinutes: oldSettings.defaultDurationMinutes, minAdvanceMinutes: oldSettings.minAdvanceMinutes, maxAdvanceDays: oldSettings.maxAdvanceDays, maxCoversPerSlot: oldSettings.maxCoversPerSlot, bufferBeforeMinutes: oldSettings.bufferBeforeMinutes, bufferAfterMinutes: oldSettings.bufferAfterMinutes, confirmationPolicy: oldSettings.confirmationPolicy, cancellationEnabled: oldSettings.cancellationEnabled, cancellationDeadlineMinutes: oldSettings.cancellationDeadlineMinutes, customerCancellationMessage: oldSettings.customerCancellationMessage, noShowThresholdMinutes: oldSettings.noShowThresholdMinutes, internalNotificationEmail: oldSettings.internalNotificationEmail, confirmationMessage: oldSettings.confirmationMessage, cancellationMessage: oldSettings.cancellationMessage }; const changed = !oldSettings || !same(comparable, data); actions.push({ entity: "bookingSettings", code: config.location.slug, action: !oldSettings ? "create" : changed ? "update" : "unchanged" });
    if (!options.dryRun && !oldSettings) await tx.restaurantBookingSettings.create({ data: { companyId: company.id, locationId: location.id, ...data } }); else if (!options.dryRun && changed) await tx.restaurantBookingSettings.update({ where: { companyId_locationId: { companyId: company.id, locationId: location.id } }, data });
    return { companyId: company.id, locationId: location.id, dryRun: options.dryRun ?? false, actions };
  }, { isolationLevel: "Serializable" });
}
