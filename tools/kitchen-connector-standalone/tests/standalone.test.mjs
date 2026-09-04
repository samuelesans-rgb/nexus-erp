import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FusionCatalogSyncController } from "../dist/kitchen-connector/catalog-sync-runtime.js";
import { catalogFingerprint, FusionCatalogError, FusionCatalogReader, FusionCatalogSnapshotStore, parseFusionCatalogFrame, reconcileCatalog } from "../dist/kitchen-connector/fusion-catalog.js";
import { FusionDeliveryLedger, FusionXml1745Error, FusionXml1745PrinterAdapter, validateFusionConfig } from "../dist/kitchen-connector/fusion-xml1745.js";
import { JsonSpool, KitchenConnectorClient, SimulatorPrinterAdapter } from "../dist/kitchen-connector/runtime.js";

const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

test("catalog parser exposes bounded fail-closed diagnostics in standalone", () => {
  const frame = `<CE><DATA_SEND><PLU>201<DESC></DESC><PRICE>1000</PRICE></PLU></DATA_SEND></CE>${"x".repeat(600)}`;
  assert.throws(() => parseFusionCatalogFrame(frame), error => {
    assert.ok(error instanceof FusionCatalogError);
    assert.equal(error.code, "INVALID_FRAME_STRUCTURE");
    assert.equal(error.diagnostic.frameByteLength, Buffer.byteLength(frame));
    assert.equal(Buffer.from(error.diagnostic.frameHex, "hex").length, 512);
    assert.equal(error.diagnostic.truncated, true);
    return true;
  });
});

test("heartbeat, claim, ACK and restart recovery use the standalone HTTP client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-standalone-http-"));
  const events = [];
  const server = createHttpServer(async (request, response) => {
    assert.equal(request.headers.authorization, "Bearer device_standalone");
    response.setHeader("content-type", "application/json");
    if (request.url.endsWith("/heartbeat")) { events.push("heartbeat"); response.end(JSON.stringify({ ok: true, catalogSyncRequested: true, requestVersion: 4 })); }
    else if (request.url.includes("/jobs?")) response.end(JSON.stringify({ jobs: [{ id: "job-1" }] }));
    else if (request.url.endsWith("/claim")) { events.push("claim"); response.end(JSON.stringify({ jobId: "job-1", leaseToken: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), payload: "TEST", printType: "TEST", copies: 1, paperWidth: 80, printerType: "MOCK", connectionType: "MOCK" })); }
    else if (request.url.endsWith("/ack")) { events.push("ack"); response.end(JSON.stringify({ ok: true })); }
    else { response.statusCode = 404; response.end(JSON.stringify({ error: "not found" })); }
  });
  await listen(server);
  try {
    const address = server.address(), printer = new SimulatorPrinterAdapter(), spool = new JsonSpool(join(directory, "spool")), client = new KitchenConnectorClient(`http://127.0.0.1:${address.port}`, "device_standalone", spool, printer);
    const heartbeat = await client.heartbeat(); assert.equal(heartbeat.requestVersion, 4);
    await client.pollOnce(); assert.deepEqual(events, ["heartbeat", "claim", "ack"]); assert.equal(printer.printed.length, 1);
    await spool.save({ jobId: "recover", leaseToken: "lease-r", leaseExpiresAt: new Date().toISOString(), payload: "RECOVER", printType: "TEST", copies: 1, paperWidth: 80, printerType: "MOCK", connectionType: "MOCK", state: "RECEIVED", updatedAt: new Date().toISOString() });
    await client.recover(); assert.equal(printer.printed.length, 2); assert.equal((await spool.load()).length, 0);
  } finally { await close(server); await rm(directory, { recursive: true }); }
});

test("FUSION ORDER keeps ordered multi-PLU mapping, atomic ACK ledger and uncertain delivery protection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-standalone-order-")); let payload = "";
  const ackServer = createTcpServer(socket => socket.on("data", chunk => { payload += chunk; socket.end("<CE><ACK></ACK></CE>"); })); await listen(ackServer);
  const config = port => validateFusionConfig({ driver: "FUSION_XML_1745", host: "127.0.0.1", port, connectTimeoutMs: 100, readTimeoutMs: 60, writeTimeoutMs: 100, maxResponseBytes: 4096, maxMul: 1_000_000, tableMappings: { table: 199 }, productMappings: { item: 2 } });
  const job = { jobId: "order", leaseToken: "lease", leaseExpiresAt: new Date().toISOString(), payload: "ignored", printType: "KITCHEN_TICKET", copies: 1, paperWidth: 80, printerType: "FUSION_XML_1745", connectionType: "TCP", fusionOrder: { tableIds: ["table"], lines: [{ lineId: "main", itemId: "item", plu: 2, quantity: 1, hasModifiers: false, hasNotes: false }, { lineId: "variant", itemId: "variant", plu: 107, quantity: 0.5, hasModifiers: false, hasNotes: false }] } };
  try { const ledger = new FusionDeliveryLedger(join(directory, "ack-ledger.json")), adapter = new FusionXml1745PrinterAdapter(config(ackServer.address().port), ledger); await adapter.print(job); await adapter.print(job); assert.equal(payload, "<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU><PLU>107<MUL>500</MUL></PLU></TABLE></ORDER></CE>"); assert.equal(await ledger.state("order", "main"), "ACKED"); assert.equal(await ledger.state("order", "variant"), "ACKED"); } finally { await close(ackServer); }
  const timeoutServer = createTcpServer(socket => socket.on("data", () => undefined)); await listen(timeoutServer);
  try { const ledger = new FusionDeliveryLedger(join(directory, "uncertain-ledger.json")), adapter = new FusionXml1745PrinterAdapter(config(timeoutServer.address().port), ledger); await assert.rejects(adapter.print({ ...job, jobId: "uncertain" }), error => error instanceof FusionXml1745Error && error.outcome === "UNCERTAIN_DELIVERY"); assert.equal(await ledger.state("uncertain", "main"), "UNCERTAIN"); assert.equal(await ledger.state("uncertain", "variant"), "UNCERTAIN"); await adapter.print({ ...job, jobId: "uncertain" }); } finally { await close(timeoutServer); await rm(directory, { recursive: true }); }
});

test("catalog reader skips an empty slot in a mixed completed upload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nexus-standalone-catalog-")); let stage = 0; const acknowledgements = [];
  const fusion = createTcpServer(socket => socket.on("data", chunk => { const text = chunk.toString(); if (stage === 0 && text.includes("<DATA_REQ>")) { stage = 1; socket.write("<CE><DATA_SEND><PLU>3<DESC> </DESC><PRICE>0</PRICE></PLU></DATA_SEND></CE>"); } else if (text.includes("<ACK>")) { acknowledgements.push(text); if (stage === 1) { stage = 2; socket.write("<CE><DATA_SEND><PLU>2<DESC>CONTORNO</DESC><PRICE>400</PRICE></PLU></DATA_SEND></CE>"); } else if (stage === 2) { stage = 3; socket.write("<CE><DB_END/></CE>"); } else socket.end(); } })); await listen(fusion);
  const uploads = [], nexus = createHttpServer(async (request, response) => { let body = ""; for await (const chunk of request) body += chunk; uploads.push(JSON.parse(body)); response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ok: true })); }); await listen(nexus);
  try {
    const reader = new FusionCatalogReader({ host: "127.0.0.1", port: fusion.address().port, upperBoundPlu: 10, connectTimeoutMs: 100, readTimeoutMs: 100, writeTimeoutMs: 100, maxFrameBytes: 4096, maxItems: 10 }), store = new FusionCatalogSnapshotStore(join(directory, "catalog.json")), client = new KitchenConnectorClient(`http://127.0.0.1:${nexus.address().port}`, "device_catalog", new JsonSpool(join(directory, "spool")), new SimulatorPrinterAdapter()), controller = new FusionCatalogSyncController({ enabled: true, intervalMs: 10_000, fullIntervalMs: 900_000, maxBackoffMs: 30_000 }, reader, store, client);
    controller.request(7); assert.equal(await controller.tick(true), true); assert.equal(uploads[0].status, "SYNCING"); assert.equal(typeof uploads[0].runId, "string"); assert.equal(uploads[0].runId, uploads[1].runId); assert.equal(uploads[1].idempotencyKey, `catalog:${uploads[0].runId}`); assert.equal(uploads[1].requestVersion, 7); assert.deepEqual(uploads[1].items.map(item => item.plu), [2]); assert.equal(uploads[1].emptySlotsSkipped, 1); assert.equal(uploads[1].totalCount, 2); assert.equal(acknowledgements.length, 3);
    const snapshot = await store.load(); assert.equal(snapshot.items["2"].syncState, "SYNCED"); const unchanged = reconcileCatalog(snapshot, [{ plu: 2, name: "CONTORNO", priceCents: 400, rawFingerprint: catalogFingerprint({ plu: 2, name: "CONTORNO", priceCents: 400 }) }]); assert.equal(unchanged.changed.length, 0); assert.equal(unchanged.unchanged, 1);
  } finally { await close(fusion); await close(nexus); await rm(directory, { recursive: true }); }
});
