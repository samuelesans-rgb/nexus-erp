/**
 * Testo dell'avviso di cucina scollegata.
 *
 * Fuori dal componente e senza `server-only`, come
 * lib/restaurant-floor-settle-copy.ts: e' logica pura, con accordi di numero e
 * una durata da formattare, e va verificata da un test.
 *
 * Deve essere leggibile in tre secondi da chi sta in piedi con un tablet in
 * mano: il fatto, la conseguenza operativa, e da quanto dura. La finestra oltre
 * la quale i job scadono arriva da PRINT_JOB_MAX_AGE_MINUTES invece di essere
 * scritta qui, cosi' il testo non puo' divergere dal comportamento reale.
 */

export type ConnectorAlertInput = {
  /** Da quanti minuti nessun connector batte. Null: non ha mai battuto. */
  staleForMinutes: number | null;
  maxAgeMinutes: number;
};

export type ConnectorAlert = { title: string; lines: string[] };

/** "45 minuti", "2 ore", "3 giorni" — sempre con l'unita' piu' leggibile. */
export function formatDowntime(minutes: number): string {
  if (minutes < 1) return "meno di un minuto";
  if (minutes < 60) return minutes === 1 ? "1 minuto" : `${minutes} minuti`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora" : `${hours} ore`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 giorno" : `${days} giorni`;
}

export function buildConnectorAlert({
  staleForMinutes,
  maxAgeMinutes,
}: ConnectorAlertInput): ConnectorAlert {
  return {
    title: "CUCINA NON COLLEGATA",
    lines: [
      "Le comande inviate ora NON arrivano al POS.",
      `Escono al ripristino. Oltre ${formatDowntime(maxAgeMinutes)}, da rimandare a mano.`,
      staleForMinutes === null
        ? "Mai collegata. Avvisa chi gestisce il locale."
        : `Ferma da ${formatDowntime(staleForMinutes)}. Avvisa chi gestisce il locale.`,
    ],
  };
}

export type OfflineDispatchConfirmation = {
  title: string;
  lines: string[];
  /** L'unica cosa che il cameriere puo' fare adesso perche' i piatti si facciano. */
  instruction: string;
  cancelLabel: string;
  confirmLabel: string;
};

/**
 * Conferma richiesta prima di inviare a canale fermo.
 *
 * Non blocca: e' proprio l'invio a mettere la comanda in coda, ed e' la coda a
 * farla uscire al ripristino. Impedire il gesto trasformerebbe un ritardo in
 * una perdita, perche' le righe resterebbero da inviare e la cucina non le
 * vedrebbe nemmeno dopo. Serve invece che il cameriere sappia due cose: che
 * adesso non esce niente, e che la cucina va avvisata a voce.
 */
export function buildOfflineDispatchConfirmation({
  maxAgeMinutes,
}: {
  maxAgeMinutes: number;
}): OfflineDispatchConfirmation {
  return {
    title: "CUCINA NON COLLEGATA",
    lines: [
      "La comanda NON esce in cucina adesso.",
      `Resta in coda ed esce al ripristino. Oltre ${formatDowntime(maxAgeMinutes)}, da rimandare a mano.`,
    ],
    instruction: "Avvisa la cucina a voce.",
    cancelLabel: "ANNULLA",
    confirmLabel: "INVIA LO STESSO",
  };
}
