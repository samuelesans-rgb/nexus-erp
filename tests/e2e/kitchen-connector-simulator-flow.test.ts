import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { JsonSpool, KitchenConnectorClient, SimulatorPrinterAdapter } from "../../tools/kitchen-connector/runtime";

test("simulator polls, claims, spools, prints and ACKs end to end", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kitchen-e2e-"));
  const events: string[] = [];
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer device_e2e");
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/kitchen-connector/v1/jobs?take=20") response.end(JSON.stringify({ jobs: [{ id: "job-e2e" }] }));
    else if (request.url?.endsWith("/claim")) { events.push("claim"); response.end(JSON.stringify({ jobId: "job-e2e", leaseToken: "lease_e2e", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), payload: "KITCHEN TEST", printType: "TEST", copies: 1, paperWidth: 80, printerType: "MOCK", connectionType: "MOCK" })); }
    else if (request.url?.endsWith("/ack")) { events.push("ack"); response.end(JSON.stringify({ status: "PRINTED" })); }
    else if (request.url?.endsWith("/heartbeat")) response.end(JSON.stringify({ ok: true }));
    else { response.statusCode = 404; response.end(JSON.stringify({ error: "not found" })); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    const printer = new SimulatorPrinterAdapter();
    const spool = new JsonSpool(directory);
    const client = new KitchenConnectorClient(`http://127.0.0.1:${address.port}`, "device_e2e", spool, printer);
    await client.pollOnce();
    assert.deepEqual(events, ["claim", "ack"]);
    assert.equal(printer.printed[0]?.payload, "KITCHEN TEST");
    assert.equal((await spool.load()).length, 0);
    assert.equal((await spool.diagnostics()).temporaryFiles, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true });
  }
});
