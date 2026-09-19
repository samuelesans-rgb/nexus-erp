/**
 * Stato di consegna di una riga di comanda verso il POS.
 *
 * Modulo puro e client-safe, come gli altri testi della Sala. La derivazione
 * stava dentro getOperationalRestaurantFloor e aveva un difetto strutturale:
 * "INVIATO" era il ramo di scarto, raggiunto anche quando non esisteva alcun
 * job, quando era annullato, e quando l'esito era incerto con un messaggio che
 * non combaciava con una regex. E non guardava mai il fusionStatus, cioe' il
 * solo dato che sappia dell'ACK del POS.
 *
 * Qui la gerarchia e' esplicita: prima il verdetto del dispatch, poi il
 * dettaglio del job, poi l'eta'. E il caso ignoto non e' mai verde.
 */

export type FloorLineDelivery =
  | "DA_INVIARE"
  | "IN_INVIO"
  | "IN_RITARDO"
  | "ARRIVATA"
  | "STAMPATA"
  | "NON_ARRIVATA"
  | "INCERTA"
  | "ANNULLATA"
  | "DA_VERIFICARE";

/**
 * Oltre questa eta' un invio ancora in volo e' in ritardo.
 * La latenza peggiore mai osservata in produzione e' 5,7 secondi: trenta
 * secondi sono cinque volte tanto, quindi non allarmano per una rete lenta ma
 * rendono visibile un canale fermo sulla singola riga, non solo nel banner.
 */
export const DELIVERY_GRACE_SECONDS = 30;

export type DeliveryInput = {
  /** Resta quantita' che il cameriere non ha ancora mandato. */
  hasUnsentQuantity: boolean;
  /** fusionStatus del dispatch dell'ultimo tentativo. */
  fusionStatus: string | null;
  /** Stato del job di stampa dell'ultimo tentativo. */
  jobStatus: string | null;
  /**
   * L'errore del job indica una consegna in dubbio. Un job FAILED con un errore
   * di questo tipo non e' "non arrivata": i byte erano gia' partiti, quindi il
   * POS potrebbe avere la comanda e rimandare raddoppierebbe il conto.
   */
  jobErrorIsUncertain: boolean;
  /** Eta' del job in secondi; null se non c'e' job. */
  jobAgeSeconds: number | null;
};

export function deriveLineDelivery({
  hasUnsentQuantity,
  fusionStatus,
  jobStatus,
  jobErrorIsUncertain,
  jobAgeSeconds,
}: DeliveryInput): FloorLineDelivery {
  const inFlight = (): FloorLineDelivery =>
    jobAgeSeconds === null
      ? "DA_VERIFICARE"
      : jobAgeSeconds <= DELIVERY_GRACE_SECONDS
        ? "IN_INVIO"
        : "IN_RITARDO";
  if (hasUnsentQuantity) return "DA_INVIARE";
  // Fra segnali contraddittori vince il peggiore: se qualcosa risulta incerto
  // o fallito, dirlo e' utile anche quando un altro segnale rassicura.
  if (
    fusionStatus === "UNCERTAIN" ||
    jobStatus === "UNCERTAIN" ||
    jobErrorIsUncertain
  )
    return "INCERTA";
  if (fusionStatus === "REJECTED" || jobStatus === "FAILED")
    return "NON_ARRIVATA";
  if (fusionStatus === "ACCEPTED") return "ARRIVATA";
  if (jobStatus === "CANCELLED") return "ANNULLATA";
  // Stampante che col POS non parla: l'unica conferma possibile e' la stampa.
  if (fusionStatus === "NOT_REQUIRED")
    return jobStatus === "PRINTED" ? "STAMPATA" : inFlight();
  if (fusionStatus === "PENDING" || fusionStatus === "DISPATCHING")
    return inFlight();
  return "DA_VERIFICARE";
}

export const DELIVERY_LABELS: Record<FloorLineDelivery, string> = {
  DA_INVIARE: "DA INVIARE",
  IN_INVIO: "IN INVIO",
  IN_RITARDO: "IN RITARDO",
  ARRIVATA: "ARRIVATA AL POS",
  STAMPATA: "STAMPATA",
  NON_ARRIVATA: "NON ARRIVATA",
  INCERTA: "INVIO INCERTO",
  ANNULLATA: "ANNULLATA",
  DA_VERIFICARE: "DA VERIFICARE",
};

/** Verde solo dove esiste una conferma positiva: l'ACK del POS o la stampa. */
export const DELIVERY_TONE: Record<
  FloorLineDelivery,
  "green" | "amber" | "red" | "grey"
> = {
  DA_INVIARE: "amber",
  IN_INVIO: "grey",
  IN_RITARDO: "amber",
  ARRIVATA: "green",
  STAMPATA: "green",
  NON_ARRIVATA: "red",
  INCERTA: "red",
  ANNULLATA: "grey",
  DA_VERIFICARE: "grey",
};

/**
 * Istruzione accanto al badge dove sapere lo stato non basta.
 * Sull'incerto il rinvio cieco puo' raddoppiare le righe sul tavolo al POS, e
 * quindi il conto del cliente: il sistema lo rifiuta gia', ma l'operatore deve
 * sapere cosa fare al posto di rimandare.
 */
export const DELIVERY_HINTS: Partial<Record<FloorLineDelivery, string>> = {
  INCERTA: "Controlla il tavolo sul POS prima di rimandare.",
  DA_VERIFICARE: "Stato non confermato: controlla il tavolo sul POS.",
};
