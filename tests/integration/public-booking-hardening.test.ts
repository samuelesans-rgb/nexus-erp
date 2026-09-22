import assert from "node:assert/strict";
import test from "node:test";

import { clientAddress, TRUSTED_PROXY_HOPS } from "@/lib/client-address";
import { PublicBookingRateLimiter } from "@/lib/public-booking";

const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null;

test("§3 la chiave di conteggio non è quella che il client dichiara", () => {
  // Il client scrive il primo elemento, il proxy appende il vero indirizzo.
  // Prendere il primo significava lasciargli scegliere il proprio contatore.
  assert.equal(
    clientAddress(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })),
    "203.0.113.9",
  );
  assert.notEqual(clientAddress(headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })), "1.2.3.4");
});

test("§3 con un solo hop l'indirizzo è quello, senza catena da scartare", () => {
  assert.equal(clientAddress(headers({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  assert.equal(TRUSTED_PROXY_HOPS, 1);
});

test("§3 due client diversi dietro lo stesso proxy restano distinti", () => {
  const a = clientAddress(headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" }));
  const b = clientAddress(headers({ "x-forwarded-for": "10.0.0.2, 203.0.113.8" }));
  assert.notEqual(a, b);
});

test("§3 senza intestazioni si ricade su un valore fisso, non su un vuoto", () => {
  assert.equal(clientAddress(headers({})), "anonymous");
  assert.equal(clientAddress(headers({ "x-forwarded-for": "  ,  " })), "anonymous");
  assert.equal(clientAddress(headers({ "x-real-ip": " 203.0.113.7 " })), "203.0.113.7");
});

test("§3 il limite si applica davvero a una singola chiave", () => {
  const limiter = new PublicBookingRateLimiter(3, 60_000);
  for (let i = 0; i < 3; i++) limiter.consume("stessa", 1000);
  assert.throws(() => limiter.consume("stessa", 1000), /Troppe richieste/);
});

test("§3 le voci scadute non restano in memoria per sempre", () => {
  const limiter = new PublicBookingRateLimiter(5, 1_000);
  // Mille chiavi diverse, come farebbe chi cambia indirizzo a ogni richiesta.
  for (let i = 0; i < 1000; i++) limiter.consume(`chiave-${i}`, 0);
  const grown = limiter.size;
  assert.ok(grown > 500, `la mappa deve essere cresciuta: ${grown}`);
  // Passata la finestra, nuove richieste ripuliscono le vecchie voci.
  for (let i = 0; i < 300; i++) limiter.consume(`altra-${i}`, 10_000);
  assert.ok(limiter.size < grown, `la mappa deve rimpicciolirsi: ${limiter.size} contro ${grown}`);
});
