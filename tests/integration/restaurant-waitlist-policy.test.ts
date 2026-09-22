import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStaffCallMessage,
  decideOffer,
  fitsWaitlistWindow,
  OFFER_MAX_MINUTES,
  OFFER_MIN_MINUTES,
  OFFER_MIN_NOTICE_MINUTES,
} from "@/lib/restaurant-waitlist-policy";

const now = new Date("2026-11-10T12:00:00.000Z");
const inMinutes = (m: number) => new Date(now.getTime() + m * 60000);

test("la scadenza è una quota del tempo rimanente", () => {
  const decision = decideOffer(inMinutes(240), now); // 4 ore
  assert.equal(decision.kind, "OFFER");
  if (decision.kind !== "OFFER") return;
  assert.equal(decision.minutes, 60, "un quarto di quattro ore");
  assert.equal(decision.expiresAt.toISOString(), inMinutes(60).toISOString());
});

test("la quota ha un minimo: un'ora di preavviso non dà quindici minuti scarsi", () => {
  const decision = decideOffer(inMinutes(60), now);
  assert.equal(decision.kind, "OFFER");
  if (decision.kind !== "OFFER") return;
  assert.equal(decision.minutes, OFFER_MIN_MINUTES, "il quarto sarebbe 15, e coincide col minimo");
  const tight = decideOffer(inMinutes(50), now);
  if (tight.kind !== "OFFER") return assert.fail("attesa un'offerta");
  assert.equal(tight.minutes, OFFER_MIN_MINUTES, "il quarto sarebbe 12: si alza al minimo");
});

test("la quota ha un massimo: a tre giorni non si tiene il posto per venti ore", () => {
  const decision = decideOffer(inMinutes(3 * 24 * 60), now);
  if (decision.kind !== "OFFER") return assert.fail("attesa un'offerta");
  assert.equal(decision.minutes, OFFER_MAX_MINUTES);
});

test("sotto i 45 minuti non si offre: si fa chiamare", () => {
  const decision = decideOffer(inMinutes(30), now);
  assert.equal(decision.kind, "CALL_STAFF");
  if (decision.kind !== "CALL_STAFF") return;
  assert.equal(decision.minutesToStart, 30);
  // Sulla soglia esatta l'offerta è ancora ammessa.
  assert.equal(decideOffer(inMinutes(OFFER_MIN_NOTICE_MINUTES), now).kind, "OFFER");
  assert.equal(decideOffer(inMinutes(OFFER_MIN_NOTICE_MINUTES - 1), now).kind, "CALL_STAFF");
});

test("un orario già passato non produce né offerta né chiamata", () => {
  assert.equal(decideOffer(inMinutes(-10), now).kind, "TOO_LATE");
  assert.equal(decideOffer(now, now).kind, "TOO_LATE");
});

test("la compatibilità guarda la tolleranza dichiarata dal cliente", () => {
  const entry = { startTime: inMinutes(120), waitlistFromTime: inMinutes(90), waitlistToTime: inMinutes(180) };
  assert.equal(fitsWaitlistWindow(entry, inMinutes(120)), true);
  assert.equal(fitsWaitlistWindow(entry, inMinutes(90)), true, "estremo incluso");
  assert.equal(fitsWaitlistWindow(entry, inMinutes(180)), true, "estremo incluso");
  assert.equal(fitsWaitlistWindow(entry, inMinutes(89)), false);
  assert.equal(fitsWaitlistWindow(entry, inMinutes(181)), false);
});

test("senza tolleranza dichiarata vale solo l'orario esatto", () => {
  const entry = { startTime: inMinutes(120), waitlistFromTime: null, waitlistToTime: null };
  assert.equal(fitsWaitlistWindow(entry, inMinutes(120)), true);
  assert.equal(fitsWaitlistWindow(entry, inMinutes(121)), false);
});

test("l'avviso allo staff dice chi chiamare e perché", () => {
  const message = buildStaffCallMessage({ guestName: "Rossi", partySize: 4, phone: "+39340", timeLabel: "20:00", minutesToStart: 30 });
  assert.match(message.title, /CHIAMA IL CLIENTE/);
  assert.match(message.lines[0]!, /Rossi · 4 coperti · 20:00/);
  assert.match(message.lines[1]!, /\+39340/);
  assert.match(message.lines[2]!, /30 minuti/);
  // Senza telefono lo dice, invece di lasciare una riga vuota.
  const noPhone = buildStaffCallMessage({ guestName: "Rossi", partySize: 4, phone: null, timeLabel: "20:00", minutesToStart: 30 });
  assert.match(noPhone.lines[1]!, /Nessun telefono/);
});
