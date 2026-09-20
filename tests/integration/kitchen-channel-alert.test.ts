import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { runKitchenChannelAlertCheck } from "../../lib/kitchen-channel-alert";
import { prisma } from "../../lib/prisma";

const databaseName = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
).pathname.slice(1);
if (!databaseName.endsWith("_test"))
  throw new Error("Kitchen channel alert tests require a database ending in _test.");

const suffix = randomUUID().slice(0, 8);
let companyId: string, locationId: string, printerId: string;

before(async () => {
  const company = await prisma.company.create({
    data: { name: `Alert ${suffix}`, vatNumber: `AL${suffix}` },
  });
  companyId = company.id;
  const location = await prisma.location.create({
    data: { companyId, code: "AL", slug: `al-${suffix}`, name: "Frisà Prova" },
  });
  locationId = location.id;
  const station = await prisma.kitchenStation.create({
    data: { companyId, locationId, code: "K", name: "Cucina" },
  });
  printerId = (
    await prisma.restaurantPrinter.create({
      data: { companyId, locationId, stationId: station.id, code: "P", name: "P" },
    })
  ).id;
});

after(async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId } });
  await prisma.kitchenConnectorDevice.deleteMany({ where: { companyId } });
  await prisma.restaurantPrinter.deleteMany({ where: { companyId } });
  await prisma.kitchenStation.deleteMany({ where: { companyId } });
  await prisma.location.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

const device = (minutesAgo: number, name: string) =>
  prisma.kitchenConnectorDevice.create({
    data: {
      companyId, locationId, printerId, name: `${name}-${suffix}`,
      credentialHash: `h-${name}-${suffix}`, credentialPrefix: name.slice(0, 2),
      lastHeartbeatAt: new Date(Date.now() - minutesAgo * 60_000),
    },
  });
let tick = 0;
/** Mezzogiorno italiano, un minuto piu' avanti a ogni chiamata. */
const noon = () => {
  const d = new Date();
  d.setUTCHours(10, tick++, 0, 0);
  return d;
};
const reset = async () => {
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "KitchenChannel" } });
  await prisma.kitchenConnectorDevice.deleteMany({ where: { companyId } });
};
const events = () =>
  prisma.domainEvent.findMany({
    where: { companyId, aggregateType: "KitchenChannel" },
    orderBy: { occurredAt: "asc" },
  });

test("canale sano: nessun evento, nessun messaggio", async () => {
  await reset();
  const alive = await device(0, "vivo");
  const result = await runKitchenChannelAlertCheck(companyId, locationId, noon());
  assert.equal(result.action, "NONE");
  assert.equal(result.reason, "healthy");
  assert.equal((await events()).length, 0, "il silenzio non si registra");
  await prisma.kitchenConnectorDevice.delete({ where: { id: alive.id } });
});

test("caduta oltre soglia: un evento, e il secondo tick tace", async () => {
  await reset();
  const down = await device(30, "giu");
  const first = await runKitchenChannelAlertCheck(companyId, locationId, noon());
  assert.equal(first.action, "NOTIFY_DOWN");
  // Canale non configurato: registrato per quello che e', non come successo.
  assert.equal(first.outcome, "NOT_CONFIGURED");
  assert.equal(first.sent, false, "senza canale configurato non si e' avvisato nessuno");
  let log = await events();
  assert.equal(log.length, 1);
  assert.equal(log[0].eventType, "KitchenChannelDown");
  assert.equal((log[0].payload as { outcome: string }).outcome, "NOT_CONFIGURED");

  // Il tick successivo non deve ripetere: e' la tempesta che stiamo evitando.
  const second = await runKitchenChannelAlertCheck(companyId, locationId, noon());
  assert.equal(second.action, "NONE");
  assert.equal(second.reason, "already-notified");
  assert.equal((await events()).length, 1, "nessun evento in piu'");

  // Ripristino: un solo evento di risalita, poi di nuovo silenzio.
  await prisma.kitchenConnectorDevice.update({ where: { id: down.id }, data: { lastHeartbeatAt: new Date() } });
  const up = await runKitchenChannelAlertCheck(companyId, locationId, noon());
  assert.equal(up.action, "NOTIFY_UP");
  log = await events();
  assert.equal(log.length, 2);
  assert.equal(log[1].eventType, "KitchenChannelUp");
  assert.equal((await runKitchenChannelAlertCheck(companyId, locationId, noon())).action, "NONE");
  assert.equal((await events()).length, 2);
  await prisma.kitchenConnectorDevice.delete({ where: { id: down.id } });
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "KitchenChannel" } });
});

test("di notte non squilla, la mattina si", async () => {
  await reset();
  const down = await device(30, "notte");
  const night = new Date();
  night.setUTCHours(2, 0, 0, 0); // 04:00 italiane
  assert.equal((await runKitchenChannelAlertCheck(companyId, locationId, night)).action, "NONE");
  assert.equal((await events()).length, 0, "nessun evento: la caduta non e' stata annunciata");

  const morning = new Date();
  morning.setUTCHours(6, 0, 0, 0); // 08:00 italiane
  assert.equal((await runKitchenChannelAlertCheck(companyId, locationId, morning)).action, "NOTIFY_DOWN");
  assert.equal((await events()).length, 1);
  await prisma.kitchenConnectorDevice.delete({ where: { id: down.id } });
  await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "KitchenChannel" } });
});

test("un invio fallito viene registrato e non ritentato all'infinito", async () => {
  await reset();
  const down = await device(30, "fail");
  process.env.KITCHEN_ALERT_TELEGRAM_TOKEN = "token-di-prova";
  process.env.KITCHEN_ALERT_TELEGRAM_CHAT_ID = "12345";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const result = await runKitchenChannelAlertCheck(companyId, locationId, noon());
    assert.equal(result.outcome, "FAILED");
    assert.equal(result.sent, false);
    const log = await events();
    assert.equal(log.length, 1);
    const payload = log[0].payload as { outcome: string; error: string };
    assert.equal(payload.outcome, "FAILED");
    assert.match(payload.error, /chat not found/, "la ragione resta a registro");
    // Registrata comunque la transizione: il tick dopo non riprova.
    assert.equal((await runKitchenChannelAlertCheck(companyId, locationId, noon())).action, "NONE");
    assert.equal((await events()).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.KITCHEN_ALERT_TELEGRAM_TOKEN;
    delete process.env.KITCHEN_ALERT_TELEGRAM_CHAT_ID;
    await prisma.kitchenConnectorDevice.delete({ where: { id: down.id } });
    await prisma.domainEvent.deleteMany({ where: { companyId, aggregateType: "KitchenChannel" } });
  }
});
