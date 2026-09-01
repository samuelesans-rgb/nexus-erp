import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CustomKubePrinterAdapter, HARDWARE_PROTOCOL_REQUIRED, JsonSpool, SimulatorPrinterAdapter } from "../../tools/kitchen-connector/runtime";

test("atomic spool recovery and hardware fail-closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kitchen-spool-"));
  try {
    const spool = new JsonSpool(directory);
    const record = { jobId: "job-1", leaseToken: "lease-1", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(), payload: "TEST", printType: "TEST", copies: 1, paperWidth: 80, printerType: "MOCK", connectionType: "MOCK", state: "RECEIVED" as const, updatedAt: new Date().toISOString() };
    await spool.save(record);
    assert.deepEqual(await spool.load(), [record]);
    assert.equal((await spool.diagnostics()).temporaryFiles, 0);
    const simulator = new SimulatorPrinterAdapter();
    await simulator.print(record);
    assert.equal(simulator.printed.length, 1);
    await assert.rejects(new CustomKubePrinterAdapter().print(record), new RegExp(HARDWARE_PROTOCOL_REQUIRED));
  } finally { await rm(directory, { recursive: true }); }
});

test("simulator exposes deterministic printer failures", async () => {
  const job = { jobId: "job", leaseToken: "lease", leaseExpiresAt: new Date().toISOString(), payload: "TEST", printType: "TEST", copies: 1, paperWidth: 80, printerType: "MOCK", connectionType: "MOCK" };
  for (const [scenario, error] of [["timeout", "PRINTER_TIMEOUT"], ["paper_out", "PAPER_OUT"], ["busy", "PRINTER_BUSY"], ["malformed_response", "MALFORMED_PRINTER_RESPONSE"], ["failed_print", "PRINT_FAILED"], ["disconnect", "PRINTER_DISCONNECTED"]] as const) {
    await assert.rejects(new SimulatorPrinterAdapter(undefined, scenario).print(job), new RegExp(error));
  }
  const delayed = new SimulatorPrinterAdapter(undefined, "delayed_ack", 1);
  await delayed.print(job);
  assert.equal(delayed.printed.length, 1);
});
