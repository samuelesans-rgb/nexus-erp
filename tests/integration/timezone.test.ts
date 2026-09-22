import assert from "node:assert/strict";
import test from "node:test";

import {
  addZonedDays,
  atZonedTime,
  startOfZonedDay,
  zonedParts,
  zonedTimeToUtc,
  zonedWeekday,
} from "@/lib/timezone";

const ROME = "Europe/Rome";
const iso = (d: Date) => d.toISOString();

test("ora legale: mezzogiorno a Roma d'estate è le 10:00 UTC", () => {
  assert.equal(iso(zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 12 }, ROME)), "2026-07-15T10:00:00.000Z");
});

test("ora solare: mezzogiorno a Roma d'inverno è le 11:00 UTC", () => {
  assert.equal(iso(zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 12 }, ROME)), "2026-01-15T11:00:00.000Z");
});

test("25 ottobre 2026: il servizio serale resta alla stessa ora di parete", () => {
  // Il giorno del ritorno all'ora solare. Un servizio dichiarato 19:00-23:00
  // deve valere 19:00-23:00 locali sia il giorno prima sia il giorno dopo:
  // e' l'ora di parete a essere fissa, non lo scarto da UTC.
  assert.equal(iso(zonedTimeToUtc({ year: 2026, month: 10, day: 24, hour: 19 }, ROME)), "2026-10-24T17:00:00.000Z");
  assert.equal(iso(zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 19 }, ROME)), "2026-10-25T18:00:00.000Z");
  // Un'ora di scarto diversa, stessa ora sull'orologio del locale.
  assert.equal(zonedParts(new Date("2026-10-24T17:00:00.000Z"), ROME).hour, 19);
  assert.equal(zonedParts(new Date("2026-10-25T18:00:00.000Z"), ROME).hour, 19);
});

test("25 ottobre 2026: l'ora ambigua risolve alla prima occorrenza", () => {
  // Alle 03:00 locali l'orologio torna alle 02:00: le 02:30 accadono due volte.
  // Si sceglie la prima, con l'ora legale ancora in vigore (+02:00).
  const ambiguous = zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 }, ROME);
  assert.equal(iso(ambiguous), "2026-10-25T00:30:00.000Z");
  assert.equal(zonedParts(ambiguous, ROME).hour, 2);
});

test("29 marzo 2026: un'ora che non esiste scivola in avanti invece di sparire", () => {
  // Alle 02:00 locali l'orologio salta alle 03:00: le 02:30 non esistono.
  const missing = zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, ROME);
  assert.equal(zonedParts(missing, ROME).hour, 3, "deve cadere nell'ora successiva, non fallire");
});

test("prenotazione a cavallo della mezzanotte: il giorno è quello del locale", () => {
  // Sabato 19 settembre 2026, 23:30 UTC = domenica 20 alle 01:30 a Roma.
  const instant = new Date("2026-09-19T23:30:00.000Z");
  assert.equal(instant.getUTCDay(), 6, "in UTC è sabato");
  assert.equal(zonedWeekday(instant, ROME), 0, "a Roma è domenica");
  const p = zonedParts(instant, ROME);
  assert.deepEqual([p.day, p.hour, p.minute], [20, 1, 30]);
});

test("mezzanotte locale non è mezzanotte UTC", () => {
  const instant = new Date("2026-07-15T22:00:00.000Z"); // 16 luglio, 00:00 a Roma
  assert.equal(iso(startOfZonedDay(instant, ROME)), "2026-07-15T22:00:00.000Z");
  assert.equal(zonedParts(startOfZonedDay(instant, ROME), ROME).hour, 0);
});

test("l'orario di apertura si àncora al giorno locale, non a quello UTC", () => {
  // Istante che in UTC è ancora il 19, a Roma è il 20.
  const instant = new Date("2026-09-19T23:30:00.000Z");
  const noon = atZonedTime(instant, "12:00", ROME);
  const p = zonedParts(noon, ROME);
  assert.deepEqual([p.day, p.hour], [20, 12], "mezzogiorno del 20, il giorno del locale");
});

test("aggiungere un giorno attraverso il cambio d'ora tiene l'ora di parete", () => {
  const evening = zonedTimeToUtc({ year: 2026, month: 10, day: 24, hour: 20 }, ROME);
  const next = addZonedDays(evening, 1, ROME);
  assert.equal(zonedParts(next, ROME).hour, 20, "le 20:00 restano le 20:00");
  // 25 ore di distanza reale, perché quella notte dura un'ora in più.
  assert.equal((next.getTime() - evening.getTime()) / 3_600_000, 25);
});

test("un fuso diverso dà un risultato diverso, cioè il fuso conta davvero", () => {
  const rome = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 12 }, ROME);
  const london = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 12 }, "Europe/London");
  assert.notEqual(iso(rome), iso(london));
  assert.equal((london.getTime() - rome.getTime()) / 3_600_000, 1);
});
