/**
 * Testo della conferma di "Incassato in cassa".
 *
 * Vive fuori dal componente, e senza `server-only`, per la stessa ragione di
 * lib/restaurant-fusion-dispatch.ts: e' logica pura con accordi di genere e
 * numero che va verificata da un test, non da un click.
 *
 * Il destinatario e' un cameriere di fretta su un tablet: titolo che dice su
 * quale tavolo sta per agire, tre punti che rispondono alle tre domande che si
 * fa (il tavolo si libera? devo stampare qualcosa? cosa succede alle righe?), e
 * un avviso separato solo quando c'e' davvero qualcosa che puo' sorprenderlo.
 */

export type SettleConfirmationInput = {
  tableNames: readonly string[];
  lineCount: number;
  unsentCount: number;
};

export type SettleConfirmation = {
  title: string;
  points: string[];
  /** Presente solo se esistono righe mai inviate in cucina. */
  warning: string | null;
};

export function buildSettleConfirmation({
  tableNames,
  lineCount,
  unsentCount,
}: SettleConfirmationInput): SettleConfirmation {
  const names = tableNames.filter((name) => name.trim().length > 0),
    many = names.length > 1;
  return {
    title: names.length
      ? `CHIUDI ${many ? "I TAVOLI" : "IL TAVOLO"} ${names.join(", ")}`
      : "CHIUDI LA COMANDA",
    points: [
      names.length && many
        ? "I tavoli tornano liberi subito"
        : "Il tavolo torna libero subito",
      "Nessun documento: il conto si fa in cassa",
      lineCount === 0
        ? "La comanda è vuota"
        : lineCount === 1
          ? "1 riga risulta servita"
          : `Le ${lineCount} righe risultano servite`,
    ],
    warning:
      unsentCount <= 0
        ? null
        : unsentCount === 1
          ? "1 riga non è mai stata inviata in cucina. Verrà comunque segnata come servita."
          : `${unsentCount} righe non sono mai state inviate in cucina. Verranno comunque segnate come servite.`,
  };
}
