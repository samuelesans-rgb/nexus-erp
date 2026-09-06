import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, Socket } from "node:net";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIAGNOSTIC_HOST, DIAGNOSTIC_PORTS, DIAGNOSTIC_TYPE, probeDiagnosticPort, runPosNetworkDiagnostic, validateDiagnosticJob, validateDiagnosticResult } from "../dist/kitchen-connector/pos-network-diagnostic.js";
import { PosNetworkDiagnosticController } from "../dist/kitchen-connector/pos-network-diagnostic-runtime.js";

const job = { id: "mission1", type: DIAGNOSTIC_TYPE };
const result = { host: DIAGNOSTIC_HOST, ports: DIAGNOSTIC_PORTS.map(port => ({ port, status: "CLOSED" })) };
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const close = server => new Promise(resolve => server.close(resolve));

test("reject arbitrary host, port, command, shell, script and file paths before connecting", async () => {
  for (const key of ["host", "port", "ports", "command", "shell", "script", "path", "timeout"]) assert.throws(() => validateDiagnosticJob({ ...job, [key]: "arbitrary" }));
  assert.throws(() => validateDiagnosticJob({ ...job, id: "../../file" }));
  assert.throws(() => probeDiagnosticPort("127.0.0.1", 22));
  assert.throws(() => probeDiagnosticPort(DIAGNOSTIC_HOST, 8000));
  await assert.rejects(runPosNetworkDiagnostic(job, "127.0.0.1"));
  assert.deepEqual(validateDiagnosticResult(result), result);
  assert.throws(() => validateDiagnosticResult({ ...result, ports: [...result.ports].reverse() }));
  assert.throws(() => validateDiagnosticResult({ ...result, command: "x" }));
});

test("mock TCP OPEN and passive banner, CLOSED; never sends application bytes", async () => {
  let received = 0;
  const server = createServer(socket => { socket.on("error", () => {}); socket.on("data", data => received += data.length); socket.end("SSH-2.0-Mock\r\n"); });
  await listen(server);
  const localPort = server.address().port;
  class LocalSocket extends Socket { connect(port, host) { assert.equal(host, DIAGNOSTIC_HOST); assert.ok(DIAGNOSTIC_PORTS.includes(port)); return super.connect(localPort, "127.0.0.1"); } }
  try {
    const open = await probeDiagnosticPort(DIAGNOSTIC_HOST, 22, () => new LocalSocket());
    assert.equal(open.status, "OPEN"); assert.equal(open.banner, "SSH-2.0-Mock");
    for (const port of [80, 443, 445, 139, 873, 1745]) assert.equal((await probeDiagnosticPort(DIAGNOSTIC_HOST, port, () => new LocalSocket())).status, "OPEN");
    assert.equal(received, 0);
  } finally { await close(server); }
  assert.equal((await probeDiagnosticPort(DIAGNOSTIC_HOST, 22, () => new LocalSocket())).status, "CLOSED");
});

test("mock stalled TCP connect expires with TIMEOUT and destroys socket", async () => {
  class StalledSocket extends Socket { connect() { return this; } }
  const socket = new StalledSocket();
  assert.equal((await probeDiagnosticPort(DIAGNOSTIC_HOST, 22, () => socket)).status, "TIMEOUT");
  assert.equal(socket.destroyed, true);
});

test("connected silent banner remains OPEN at timeout; network errors are ERROR", async () => {
  class SilentSocket extends Socket { connect() { queueMicrotask(() => this.emit("connect")); return this; } }
  assert.equal((await probeDiagnosticPort(DIAGNOSTIC_HOST, 23, () => new SilentSocket())).status, "OPEN");
  class ErrorSocket extends Socket { connect() { queueMicrotask(() => this.emit("error", Object.assign(new Error(), { code: "ENETUNREACH" }))); return this; } }
  assert.equal((await probeDiagnosticPort(DIAGNOSTIC_HOST, 23, () => new ErrorSocket())).status, "ERROR");
});

test("one execution across concurrent ticks, lost report and restart; report retry does not rescan", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pos-diagnostic-"));
  let runs = 0, reports = 0;
  const client = { async networkDiagnostic(body) { if (body.operation === "claim") return { job }; if (++reports === 1) throw new Error("lost response"); return { ok: true }; } };
  const run = async () => { runs++; return result; };
  try {
    const controller = new PosNetworkDiagnosticController(client, DIAGNOSTIC_HOST, directory, run);
    await Promise.allSettled([controller.tick(), controller.tick()]);
    await new PosNetworkDiagnosticController(client, DIAGNOSTIC_HOST, directory, run).tick();
    await controller.tick();
    assert.equal(runs, 1); assert.equal(reports, 2);
  } finally { await rm(directory, { recursive: true }); }
});

test("crash sentinel and invalid server payload cannot trigger another scan", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pos-diagnostic-"));
  try {
    await mkdir(join(directory, "pos-network-diagnostic-v1"));
    const run = async () => { assert.fail("must not connect"); };
    await new PosNetworkDiagnosticController({ async networkDiagnostic() { return { job }; } }, DIAGNOSTIC_HOST, directory, run).tick();
    await assert.rejects(new PosNetworkDiagnosticController({ async networkDiagnostic() { return { job: { ...job, host: "evil" } }; } }, DIAGNOSTIC_HOST, directory, run).tick());
  } finally { await rm(directory, { recursive: true }); }
});

test("diagnostic-only entrypoint sends heartbeat and claims, never polls print jobs or syncs catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pos-diagnostic-entry-"));
  const requests = [];
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const server = createHttpServer((request, response) => {
    requests.push(request.url);
    assert.equal(request.headers.authorization, "Bearer device_mock");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(request.url.endsWith("network-diagnostic") ? { job: null } : { ok: true }));
    if (requests.length >= 2) resolveReady();
  });
  await listen(server);
  const config = { driver: "FUSION_XML_1745", host: "127.0.0.1", port: server.address().port, connectTimeoutMs: 200, readTimeoutMs: 200, writeTimeoutMs: 200, maxResponseBytes: 4096, maxMul: 1000000, tableMappings: {}, productMappings: {} };
  await writeFile(join(directory, "fusion.json"), JSON.stringify(config));
  const child = spawn(process.execPath, ["dist/kitchen-connector/fusion.js", "network-diagnostic-only"], { env: { ...process.env, KITCHEN_CONNECTOR_URL: `http://127.0.0.1:${server.address().port}`, KITCHEN_CONNECTOR_CREDENTIAL: "device_mock", FUSION_XML1745_CONFIG: join(directory, "fusion.json"), KITCHEN_CONNECTOR_SPOOL: join(directory, "spool"), CATALOG_SYNC_ENABLED: "true", FUSION_CATALOG_MAX_PLU: "" }, stdio: "pipe" });
  let stderr = ""; child.stderr.on("data", data => stderr += data);
  const exited = once(child, "exit");
  let timer;
  try {
    await Promise.race([ready, exited.then(() => { throw new Error(`Entrypoint exited: ${stderr}`); }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Entrypoint timeout: ${stderr}`)), 5000); })]);
    assert.deepEqual(requests.sort(), ["/api/kitchen-connector/v1/heartbeat", "/api/kitchen-connector/v1/network-diagnostic"]);
  } finally {
    clearTimeout(timer); child.kill("SIGTERM"); await exited; await close(server); await rm(directory, { recursive: true });
  }
});
