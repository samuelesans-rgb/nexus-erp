import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildFusionOrder,
  FusionDeliveryLedger,
  FusionXml1745Error,
  FusionXml1745PrinterAdapter,
  parseFusionOrderResponse,
  quantityToMul,
  sendFusionOrder,
  validateFusionConfig,
} from "../../tools/kitchen-connector/fusion-xml1745";

const base = (port: number, readTimeoutMs = 150) =>
  validateFusionConfig({
    driver: "FUSION_XML_1745",
    host: "127.0.0.1",
    port,
    connectTimeoutMs: 150,
    readTimeoutMs,
    writeTimeoutMs: 150,
    maxResponseBytes: 4096,
    maxMul: 1_000_000,
    tableMappings: { table: 199 },
    productMappings: { item: 2 },
  });
async function server(handler: (socket: Socket, payload: string) => void) {
  let requests = 0;
  const instance = createServer((socket) => {
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString();
      if (data.includes("</CE>")) {
        requests++;
        handler(socket, data);
      }
    });
  });
  await new Promise<void>((resolve) =>
    instance.listen(0, "127.0.0.1", resolve),
  );
  const address = instance.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return { instance, port: address.port, count: () => requests };
}
const close = (instance: Server) =>
  new Promise<void>((resolve, reject) =>
    instance.close((error) => (error ? reject(error) : resolve())),
  );

test("builder emits the byte-exact proven grammar and millesimal quantities", () => {
  assert.equal(
    buildFusionOrder(199, 2, quantityToMul(1)),
    "<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU></TABLE></ORDER></CE>",
  );
  assert.equal(quantityToMul(2), 2000);
  assert.equal(quantityToMul(0.5), 500);
  assert.equal(
    buildFusionOrder(199, [
      { plu: 2, mul: 1000 },
      { plu: 107, mul: 500 },
    ]),
    "<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU><PLU>107<MUL>500</MUL></PLU></TABLE></ORDER></CE>",
  );
  assert.throws(() => buildFusionOrder(199, []));
  for (const value of [0, -1, NaN, Infinity])
    assert.throws(() => quantityToMul(value));
  for (const values of [
    [0, 2, 1000],
    [199, 0, 1000],
    [199, 2, 0],
  ] as const)
    assert.throws(() => buildFusionOrder(values[0], values[1], values[2]));
});

test("multi-item transport preserves 2 -> 107 and classifies ACK, NACK and timeout once", async () => {
  for (const response of ["<CE><ACK></ACK></CE>", "<CE><NACK>1</NACK></CE>", null]) {
    let payload = "";
    const fake = await server((socket, value) => {
      payload = value;
      if (response) socket.end(response);
    });
    try {
      const order = buildFusionOrder(199, [
        { plu: 2, mul: 1000 },
        { plu: 107, mul: 2000 },
      ]);
      if (response === "<CE><ACK></ACK></CE>") await sendFusionOrder(base(fake.port), order);
      else
        await assert.rejects(
          sendFusionOrder(base(fake.port, 50), order),
          (error) =>
            error instanceof FusionXml1745Error &&
            error.outcome === (response ? "NACK" : "UNCERTAIN_DELIVERY"),
        );
      assert.equal(fake.count(), 1);
      assert.equal(payload, order);
      assert.ok(payload.indexOf("<PLU>2<") < payload.indexOf("<PLU>107<"));
    } finally {
      await close(fake.instance);
    }
  }
});
test("configuration and closed response parser fail closed", () => {
  for (const host of ["", "http://localhost", "x;touch /tmp/x"])
    assert.throws(() => validateFusionConfig({ ...base(1745), host }));
  assert.deepEqual(parseFusionOrderResponse("<CE><ACK></ACK></CE>"), {
    kind: "ACK",
  });
  for (const [frame, code] of [
    ["<CE><NACK>1</NACK></CE>", "FUSION_NACK_1"],
    ["<CE><NACK>2</NACK></CE>", "FUSION_NACK_2"],
    ["", "FUSION_PROTOCOL_ERROR"],
    ["<CE><DB_END/></CE>", "FUSION_PROTOCOL_ERROR"],
  ])
    assert.throws(
      () => parseFusionOrderResponse(frame),
      (error) => error instanceof FusionXml1745Error && error.code === code,
    );
});
test("transport accepts fragmented ACK and classifies NACK", async () => {
  for (const [response, code] of [
    ["<CE><ACK></ACK></CE>", null],
    ["<CE><NACK>1</NACK></CE>", "FUSION_NACK_1"],
    ["<CE><NACK>2</NACK></CE>", "FUSION_NACK_2"],
  ] as const) {
    const fake = await server((socket) => {
      socket.write(response.slice(0, 8));
      setTimeout(() => socket.end(response.slice(8)), 5);
    });
    try {
      if (code)
        await assert.rejects(
          sendFusionOrder(base(fake.port), buildFusionOrder(199, 2, 1000)),
          (error) =>
            error instanceof FusionXml1745Error &&
            error.code === code &&
            error.outcome === "NACK",
        );
      else
        await sendFusionOrder(base(fake.port), buildFusionOrder(199, 2, 1000));
    } finally {
      await close(fake.instance);
    }
  }
});
test("pre-send refusal is retryable; post-write close and timeout are uncertain", async () => {
  const unused = await server((socket) => socket.end());
  const port = unused.port;
  await close(unused.instance);
  await assert.rejects(
    sendFusionOrder(base(port), buildFusionOrder(199, 2, 1000)),
    (error) =>
      error instanceof FusionXml1745Error &&
      error.outcome === "PRE_SEND_FAILURE" &&
      error.retryable,
  );
  for (const behavior of ["close", "timeout"]) {
    const fake = await server((socket) => {
      if (behavior === "close") socket.end();
    });
    try {
      await assert.rejects(
        sendFusionOrder(base(fake.port, 50), buildFusionOrder(199, 2, 1000)),
        (error) =>
          error instanceof FusionXml1745Error &&
          error.outcome === "UNCERTAIN_DELIVERY",
      );
      assert.equal(fake.count(), 1);
    } finally {
      await close(fake.instance);
    }
  }
});
test("persistent mapping wins over JSON fallback and ledger suppresses duplicates", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusion-ledger-"));
  let payload = "";
  const fake = await server((socket, value) => {
    payload = value;
    socket.end("<CE><ACK></ACK></CE>");
  });
  try {
    const ledger = new FusionDeliveryLedger(join(directory, "ledger.json")),
      adapter = new FusionXml1745PrinterAdapter(
        base(fake.port),
        ledger,
        () => undefined,
      ),
      job = {
        jobId: "job",
        leaseToken: "lease",
        leaseExpiresAt: new Date().toISOString(),
        payload: "ignored",
        printType: "KITCHEN_TICKET",
        copies: 1,
        paperWidth: 80,
        printerType: "FUSION_XML_1745",
        connectionType: "TCP",
        fusionOrder: {
          tableIds: ["table"],
          lines: [
            {
              lineId: "line",
              itemId: "item",
              plu: 3,
              quantity: 1,
              hasModifiers: false,
              hasNotes: true,
            },
          ],
        },
      };
    await adapter.print(job);
    await adapter.print(job);
    assert.match(payload, /<PLU>3</);
    assert.doesNotMatch(payload, /<PLU>2</);
    assert.doesNotMatch(payload, /note|ignored/i);
    assert.equal(fake.count(), 1);
    await ledger.mark("uncertain-job", "line", "UNCERTAIN");
    await adapter.print({ ...job, jobId: "uncertain-job" });
    assert.equal(fake.count(), 1);
  } finally {
    await close(fake.instance);
    await rm(directory, { recursive: true });
  }
});

test("adapter delivers a multi-line job atomically and never resends ACKed or uncertain orders", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fusion-multi-ledger-"));
  let payload = "";
  const fake = await server((socket, value) => {
    payload = value;
    socket.end("<CE><ACK></ACK></CE>");
  });
  const lines = [
    { lineId: "main", itemId: "main", plu: 2, quantity: 1, hasModifiers: false, hasNotes: false },
    { lineId: "variant", itemId: "variant", plu: 107, quantity: 0.5, hasModifiers: false, hasNotes: false },
  ];
  try {
    const ledger = new FusionDeliveryLedger(join(directory, "ledger.json")),
      adapter = new FusionXml1745PrinterAdapter(base(fake.port), ledger, () => undefined),
      job = {
        jobId: "multi",
        leaseToken: "lease",
        leaseExpiresAt: new Date().toISOString(),
        payload: "ignored <tag>",
        printType: "KITCHEN_TICKET",
        copies: 1,
        paperWidth: 80,
        printerType: "FUSION_XML_1745",
        connectionType: "TCP",
        fusionOrder: { tableIds: ["table"], lines },
      };
    await adapter.print(job);
    await adapter.print(job);
    assert.equal(fake.count(), 1);
    assert.equal(
      payload,
      "<CE><ORDER><TABLE>199<PLU>2<MUL>1000</MUL></PLU><PLU>107<MUL>500</MUL></PLU></TABLE></ORDER></CE>",
    );
    assert.doesNotMatch(payload, /ignored|tag/);
    assert.equal(await ledger.state("multi", "main"), "ACKED");
    assert.equal(await ledger.state("multi", "variant"), "ACKED");
    await ledger.markMany("uncertain", ["main", "variant"], "UNCERTAIN");
    await adapter.print({ ...job, jobId: "uncertain" });
    assert.equal(fake.count(), 1);
  } finally {
    await close(fake.instance);
    await rm(directory, { recursive: true });
  }
});
