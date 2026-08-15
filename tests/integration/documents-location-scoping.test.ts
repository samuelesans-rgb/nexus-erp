import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prisma } from "../../lib/prisma";
import { confirmDocument, createDraft, DocumentDomainError, getDocument, getDocuments, postDocument, updateDraft } from "../../lib/documents";

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("_test")) throw new Error("I test Documents richiedono un DATABASE_URL dedicato contenente _test.");

let companyId = ""; let otherCompanyId = ""; let userId = ""; let locationA = ""; let locationB = "";
let partnerId = ""; let itemId = ""; let unitId = ""; let vatId = ""; let seriesA = ""; let seriesB = ""; let legacySeries = "";
const documentIds: string[] = []; const seriesIds: string[] = []; const locationIds: string[] = [];

function draft(seriesId: string, locationId: string) { return { seriesId, partnerId, documentDate: new Date(), currency: "EUR", locationId, lines: [{ itemId, quantity: 1, unitOfMeasureId: unitId, unitPrice: 10, vatRateId: vatId }] }; }

before(async () => {
  const company = await prisma.company.findUniqueOrThrow({ where: { vatNumber: "IT00000000000" } }); companyId = company.id;
  const user = await prisma.user.findFirstOrThrow({ where: { memberships: { some: { companyId } } }, select: { id: true } }); userId = user.id;
  const suffix = randomUUID().slice(0, 8);
  const [partner, unit, vat] = await Promise.all([
    prisma.partner.create({ data: { companyId, code: `DOC-P-${suffix}`, name: "Documents Partner", isCustomer: true } }),
    prisma.unitOfMeasure.create({ data: { companyId, code: `DU-${suffix}`, name: "Unità Documents", symbol: "pz" } }),
    prisma.vatRate.create({ data: { companyId, code: `DV-${suffix}`, name: "IVA Documents", percentage: 22 } }),
  ]);
  const item = await prisma.item.create({ data: { companyId, code: `DI-${suffix}`, name: "Item Documents", type: "SERVICE", unitOfMeasureId: unit.id, vatRateId: vat.id, salePrice: 10 } });
  partnerId = partner.id; itemId = item.id; unitId = unit.id; vatId = vat.id;
  const [a, b] = await Promise.all([
    prisma.location.create({ data: { companyId, code: `DOC-A-${suffix}`, name: "Documents A" } }),
    prisma.location.create({ data: { companyId, code: `DOC-B-${suffix}`, name: "Documents B" } }),
  ]); locationA = a.id; locationB = b.id; locationIds.push(a.id, b.id);
  const [sa, sb, legacy] = await Promise.all([
    prisma.documentSeries.create({ data: { companyId, locationId: a.id, code: `DA-${suffix}`, name: "Serie A", documentType: "QUOTE" } }),
    prisma.documentSeries.create({ data: { companyId, locationId: b.id, code: `DB-${suffix}`, name: "Serie B", documentType: "QUOTE" } }),
    prisma.documentSeries.findFirst({ where: { companyId, locationId: null, documentType: "QUOTE", active: true }, select: { id: true } }),
  ]); seriesA = sa.id; seriesB = sb.id; legacySeries = legacy?.id ?? ""; seriesIds.push(sa.id, sb.id);
  const other = await prisma.company.create({ data: { name: `Documents tenant ${randomUUID()}` } }); otherCompanyId = other.id;
});

after(async () => {
  if (documentIds.length) await prisma.businessDocument.deleteMany({ where: { id: { in: documentIds } } });
  if (seriesIds.length) await prisma.documentSeries.deleteMany({ where: { id: { in: seriesIds } } });
  if (locationIds.length) await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  if (itemId) await prisma.item.delete({ where: { id: itemId } });
  if (partnerId) await prisma.partner.delete({ where: { id: partnerId } });
  if (vatId) await prisma.vatRate.delete({ where: { id: vatId } });
  if (unitId) await prisma.unitOfMeasure.delete({ where: { id: unitId } });
  if (otherCompanyId) await prisma.company.delete({ where: { id: otherCompanyId } });
  await prisma.$disconnect();
});

test("Documents: creazione su Location A e lettura isolata da Location B", async () => {
  const row = await createDraft(companyId, userId, draft(seriesA, locationA)); documentIds.push(row.id);
  assert.equal((await getDocument(companyId, locationA, row.id))?.locationId, locationA);
  assert.equal(await getDocument(companyId, locationB, row.id), null);
  assert.equal((await getDocuments(companyId, locationB)).rows.some(({ id }) => id === row.id), false);
});

test("Documents: modifica e posting cross-location sono rifiutati", async () => {
  const row = await createDraft(companyId, userId, draft(seriesA, locationA)); documentIds.push(row.id);
  const { seriesId: _seriesId, ...crossLocationUpdate } = draft(seriesA, locationB);
  await assert.rejects(updateDraft(companyId, userId, row.id, crossLocationUpdate), DocumentDomainError);
  await confirmDocument(companyId, userId, locationA, row.id);
  await assert.rejects(postDocument(companyId, userId, locationB, row.id), DocumentDomainError);
});

test("Documents: serie della stessa Location valida e serie di altra Location rifiutata", async () => {
  const valid = await createDraft(companyId, userId, draft(seriesA, locationA)); documentIds.push(valid.id);
  await assert.rejects(createDraft(companyId, userId, draft(seriesB, locationA)), DocumentDomainError);
});

test("Documents: isolamento tenant", async () => {
  const row = await createDraft(companyId, userId, draft(seriesA, locationA)); documentIds.push(row.id);
  assert.equal(await getDocument(otherCompanyId, locationA, row.id), null);
  await assert.rejects(confirmDocument(otherCompanyId, userId, locationA, row.id), DocumentDomainError);
});

test("Documents: serie globale storica resta compatibile con chiamanti legacy", async (t) => {
  if (!legacySeries) return t.skip("Nessuna serie globale storica presente nel fixture pre-migration.");
  const row = await createDraft(companyId, userId, draft(legacySeries, locationA)); documentIds.push(row.id);
  await confirmDocument(companyId, userId, locationA, row.id);
  assert.equal((await getDocument(companyId, locationA, row.id))?.status, "CONFIRMED");
});

test("Documents: nuove serie globali sono rifiutate", async () => {
  await assert.rejects(prisma.documentSeries.create({ data: { companyId, code: `DG-${randomUUID().slice(0, 8)}`, name: "Serie globale non consentita", documentType: "QUOTE" } }));
});
