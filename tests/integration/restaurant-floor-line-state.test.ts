import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_GRACE_SECONDS,
  DELIVERY_HINTS,
  DELIVERY_LABELS,
  DELIVERY_TONE,
  deriveLineDelivery,
  type FloorLineDelivery,
} from "@/lib/restaurant-floor-line-state";

const base = {
  hasUnsentQuantity: false,
  fusionStatus: "PENDING" as string | null,
  jobStatus: "PENDING" as string | null,
  jobErrorIsUncertain: false,
  jobAgeSeconds: 2 as number | null,
};
const derive = (patch: Partial<typeof base>) =>
  deriveLineDelivery({ ...base, ...patch });

test("verde solo con la conferma del POS", () => {
  assert.equal(derive({ fusionStatus: "ACCEPTED", jobStatus: "PRINTED" }), "ARRIVATA");
  assert.equal(DELIVERY_TONE.ARRIVATA, "green");
  // Ogni altro stato che non sia una conferma positiva non puo' essere verde.
  const positivi: FloorLineDelivery[] = ["ARRIVATA", "STAMPATA"];
  for (const [state, tone] of Object.entries(DELIVERY_TONE))
    if (tone === "green")
      assert.ok(positivi.includes(state as FloorLineDelivery), `${state} non deve essere verde`);
});

test("lo sconosciuto non passa piu' per inviato", () => {
  // Era il difetto strutturale: nessun job, o uno stato non riconosciuto,
  // cadeva sul ramo di scarto e la riga risultava consegnata.
  assert.equal(derive({ fusionStatus: null, jobStatus: null, jobAgeSeconds: null }), "DA_VERIFICARE");
  assert.equal(derive({ fusionStatus: "BOH", jobStatus: "BOH" }), "DA_VERIFICARE");
  assert.notEqual(DELIVERY_TONE.DA_VERIFICARE, "green");
});

test("un job annullato non risulta consegnato", () => {
  assert.equal(derive({ jobStatus: "CANCELLED" }), "ANNULLATA");
});

test("annullata e da verificare restano distinte", () => {
  // "Annullata" vuol dire non fare nulla, "da verificare" vuol dire andare a
  // controllare: accorparle manderebbe a controllare righe cancellate apposta.
  assert.notEqual(DELIVERY_LABELS.ANNULLATA, DELIVERY_LABELS.DA_VERIFICARE);
  assert.equal(DELIVERY_HINTS.ANNULLATA, undefined);
  assert.ok(DELIVERY_HINTS.DA_VERIFICARE);
});

test("l'incerto vince su tutto e porta l'istruzione", () => {
  assert.equal(derive({ fusionStatus: "UNCERTAIN" }), "INCERTA");
  assert.equal(derive({ jobStatus: "UNCERTAIN" }), "INCERTA");
  // Anche quando un altro segnale rassicurerebbe.
  assert.equal(derive({ fusionStatus: "ACCEPTED", jobStatus: "UNCERTAIN" }), "INCERTA");
  assert.match(DELIVERY_HINTS.INCERTA ?? "", /POS prima di rimandare/);
});

test("un fallimento con consegna in dubbio non e' un fallimento secco", () => {
  // I byte erano gia' partiti: il POS potrebbe avere la comanda, quindi
  // rimandare raddoppierebbe il conto. Il server rifiuta il retry per questi,
  // e la Sala deve dire la stessa cosa invece di invitare a riprovare.
  assert.equal(
    derive({ jobStatus: "FAILED", jobErrorIsUncertain: true }),
    "INCERTA",
  );
  assert.equal(derive({ jobStatus: "FAILED", jobErrorIsUncertain: false }), "NON_ARRIVATA");
});

test("rifiutata dal POS o fallita: non arrivata", () => {
  assert.equal(derive({ fusionStatus: "REJECTED" }), "NON_ARRIVATA");
  assert.equal(derive({ jobStatus: "FAILED" }), "NON_ARRIVATA");
  // Un job scaduto e' un FAILED, quindi ricade qui e non resta in volo.
  assert.equal(derive({ jobStatus: "FAILED", jobAgeSeconds: 9999 }), "NON_ARRIVATA");
});

test("oltre la tolleranza un invio in volo diventa in ritardo", () => {
  assert.equal(derive({ jobAgeSeconds: DELIVERY_GRACE_SECONDS }), "IN_INVIO");
  assert.equal(derive({ jobAgeSeconds: DELIVERY_GRACE_SECONDS + 1 }), "IN_RITARDO");
  assert.equal(DELIVERY_TONE.IN_RITARDO, "amber");
});

test("quello che il cameriere non ha ancora mandato viene prima di tutto", () => {
  assert.equal(derive({ hasUnsentQuantity: true, fusionStatus: "ACCEPTED" }), "DA_INVIARE");
});

test("stampante che col POS non parla: conferma e' la stampa", () => {
  assert.equal(derive({ fusionStatus: "NOT_REQUIRED", jobStatus: "PRINTED" }), "STAMPATA");
  assert.equal(derive({ fusionStatus: "NOT_REQUIRED", jobStatus: "PENDING" }), "IN_INVIO");
  // Non deve mai affermare l'arrivo al POS per una stampante diretta.
  assert.notEqual(derive({ fusionStatus: "NOT_REQUIRED", jobStatus: "PRINTED" }), "ARRIVATA");
});

test("job stampato ma dispatch non ancora confermato: e' ancora in volo", () => {
  // Multi-postazione: un ticket stampato non basta, il verdetto e' del dispatch.
  assert.equal(derive({ fusionStatus: "PENDING", jobStatus: "PRINTED", jobAgeSeconds: 3 }), "IN_INVIO");
  assert.equal(derive({ fusionStatus: "DISPATCHING", jobStatus: "PRINTED", jobAgeSeconds: 120 }), "IN_RITARDO");
});

test("ogni stato ha un'etichetta e un tono", () => {
  for (const state of Object.keys(DELIVERY_LABELS) as FloorLineDelivery[]) {
    assert.ok(DELIVERY_LABELS[state]?.length, `${state} senza etichetta`);
    assert.ok(DELIVERY_TONE[state], `${state} senza tono`);
  }
});
