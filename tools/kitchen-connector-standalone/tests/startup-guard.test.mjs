import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isFatalConnectorError, JsonSpool, KitchenConnectorClient, SimulatorPrinterAdapter, startupHeartbeat } from "../dist/kitchen-connector/runtime.js";
import { FATAL_HEARTBEAT_LIMIT, startFusionRuntime } from "../dist/kitchen-connector/catalog-sync-runtime.js";

const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

async function withClient(handler, run) {
  const server = createServer(handler);
  await listen(server);
  const directory = await mkdtemp(join(tmpdir(), "startup-guard-"));
  try {
    const client = new KitchenConnectorClient(
      `http://127.0.0.1:${server.address().port}`,
      "device_test",
      new JsonSpool(directory),
      new SimulatorPrinterAdapter(),
    );
    return await run(client);
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
}

const respond = (status, body) => (request, response) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

test("classifica solo il rifiuto per credenziale come fatale", () => {
  assert.equal(isFatalConnectorError(new Error("401:Connector non autorizzato.")), true);
  assert.equal(isFatalConnectorError(new Error("403:Vietato")), true);
  // Tutto cio' che e' passeggero non deve fermare il connector.
  assert.equal(isFatalConnectorError(new Error("500:Errore interno")), false);
  assert.equal(isFatalConnectorError(new Error("503:Non disponibile")), false);
  assert.equal(isFatalConnectorError(new TypeError("fetch failed")), false);
  assert.equal(isFatalConnectorError(new Error("The operation was aborted")), false);
  // Un 401 citato dentro un messaggio piu' lungo non conta: solo il prefisso.
  assert.equal(isFatalConnectorError(new Error("errore inatteso 401 nel corpo")), false);
});

test("avvio con server irraggiungibile: non muore, rimanda", async () => {
  const server = createServer(respond(200, {}));
  await listen(server);
  const port = server.address().port;
  await close(server); // la porta ora rifiuta le connessioni
  const directory = await mkdtemp(join(tmpdir(), "startup-guard-"));
  try {
    const client = new KitchenConnectorClient(
      `http://127.0.0.1:${port}`, "device_test",
      new JsonSpool(directory), new SimulatorPrinterAdapter(),
    );
    const result = await startupHeartbeat(client);
    assert.equal(result.ok, false);
    assert.equal(result.fatal, false, "rete assente non e' un motivo per fermarsi");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("avvio con 500: passeggero, si prosegue", async () => {
  const result = await withClient(respond(500, { error: "boom" }), client => startupHeartbeat(client));
  assert.equal(result.ok, false);
  assert.equal(result.fatal, false);
});

test("avvio con 401: fatale, il chiamante deve fermarsi", async () => {
  const result = await withClient(respond(401, { error: "Connector non autorizzato." }), client => startupHeartbeat(client));
  assert.equal(result.ok, false);
  assert.equal(result.fatal, true);
});

test("avvio riuscito: restituisce il comando del server", async () => {
  const result = await withClient(
    respond(200, { catalogSyncRequested: true, requestVersion: 7 }),
    client => startupHeartbeat(client),
  );
  assert.equal(result.ok, true);
  assert.equal(result.command.catalogSyncRequested, true);
  assert.equal(result.command.requestVersion, 7);
});

test("a regime servono piu' rifiuti di seguito prima di arrendersi", async () => {
  const catalog = { request() {}, async tick() {} };
  let fatal = 0, calls = 0;
  const client = {
    async pollOnce() {},
    async heartbeat() { calls += 1; throw new Error("401:Connector non autorizzato."); },
  };
  const stop = startFusionRuntime(client, catalog, {
    pollMs: 3600_000, heartbeatMs: 5, catalogMs: 3600_000,
    onError: () => {}, onFatal: () => { fatal += 1; },
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.ok(calls >= FATAL_HEARTBEAT_LIMIT, `battiti effettuati: ${calls}`);
    assert.ok(fatal > 0, "dopo la soglia il connector deve arrendersi");
  } finally { stop(); }
});

test("un heartbeat riuscito azzera il conteggio dei rifiuti", async () => {
  const catalog = { request() {}, async tick() {} };
  let fatal = 0, calls = 0;
  const client = {
    async pollOnce() {},
    async heartbeat() {
      calls += 1;
      // Un rifiuto, poi un successo, all'infinito: la soglia non si raggiunge mai.
      if (calls % 2 === 1) throw new Error("401:Connector non autorizzato.");
      return {};
    },
  };
  const stop = startFusionRuntime(client, catalog, {
    pollMs: 3600_000, heartbeatMs: 5, catalogMs: 3600_000,
    onError: () => {}, onFatal: () => { fatal += 1; },
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.ok(calls > FATAL_HEARTBEAT_LIMIT * 2, `battiti effettuati: ${calls}`);
    assert.equal(fatal, 0, "un successo in mezzo deve azzerare");
  } finally { stop(); }
});
