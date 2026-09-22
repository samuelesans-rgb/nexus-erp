/**
 * Sistemabilità di una sala: dato un insieme di gruppi e i tavoli disponibili,
 * esiste un modo di far sedere tutti?
 *
 * Serve perché la capienza non è la somma dei posti. Otto persone non si
 * siedono su quattro tavoli da due sparsi per la sala: o esiste un'unione
 * capace di accoglierle, o non entrano. Il canale pubblico verifica che tutti
 * siano sistemabili senza però decidere chi va dove — il tavolo lo sceglie il
 * cameriere all'arrivo.
 *
 * Modulo puro: nessun accesso al database, così la regola si prova con numeri
 * espliciti invece che con una sala finta.
 */

export type SeatingTable = {
  id: string;
  areaId: string;
  /** Posti massimi del tavolo: maxSeats se presente, altrimenti seats. */
  capacity: number;
  /** L'operatore dichiara che questo tavolo si può unire ad altri della sua area. */
  combinable: boolean;
};

export type SeatingGroup = {
  id: string;
  size: number;
  /** Tavoli già assegnati dallo staff: il gruppo non si muove da lì. */
  fixedTableIds?: readonly string[];
};

/**
 * Quanti tavoli al massimo si uniscono per un gruppo.
 *
 * Non è un limite tecnico ma di realismo: unire sei tavoli non è un tavolo, è
 * un banchetto, e si organizza a voce.
 */
export const MAX_UNION_TABLES = 4;

/**
 * Oltre questo numero di gruppi nella stessa fascia si smette di cercare un
 * assegnamento esatto e si ripiega su un criterio conservativo. Rifiuta più
 * del necessario, ma non accetta mai l'impossibile: un rifiuto di troppo costa
 * una prenotazione, un'accettazione di troppo costa un cliente in piedi.
 */
export const EXACT_SEARCH_MAX_GROUPS = 12;

export type SeatingOutcome = {
  seatable: boolean;
  /** "exact" se la risposta viene dalla ricerca, "conservative" dal ripiego. */
  method: "exact" | "conservative";
};

/** Sottoinsiemi di tavoli liberi che possono accogliere un gruppo di `size`. */
function candidateUnions(
  size: number,
  free: SeatingTable[],
  configured: readonly (readonly string[])[],
  maxUnion: number,
): number[] {
  const index = new Map(free.map((table, position) => [table.id, position]));
  const masks: number[] = [];

  // Un tavolo singolo che basta da solo: non serve unire nulla.
  free.forEach((table, position) => {
    if (table.capacity >= size) masks.push(1 << position);
  });

  // Le combinazioni configurate restano valide anche fra tavoli non
  // combinabili: qualcuno le ha dichiarate apposta.
  for (const combo of configured) {
    const positions: number[] = [];
    let complete = true;
    for (const id of combo) {
      const position = index.get(id);
      if (position === undefined) { complete = false; break; }
      positions.push(position);
    }
    if (!complete) continue;
    const capacity = positions.reduce((sum, p) => sum + free[p]!.capacity, 0);
    if (capacity >= size)
      masks.push(positions.reduce((mask, p) => mask | (1 << p), 0));
  }

  // Unioni al volo: tavoli combinabili della stessa area, fino al tetto.
  const byArea = new Map<string, number[]>();
  free.forEach((table, position) => {
    if (!table.combinable) return;
    const bucket = byArea.get(table.areaId) ?? [];
    bucket.push(position);
    byArea.set(table.areaId, bucket);
  });
  for (const positions of byArea.values()) {
    const walk = (start: number, chosen: number[], capacity: number) => {
      if (chosen.length >= 2 && capacity >= size) {
        // Solo unioni minime: se bastava già senza l'ultimo tavolo, quella
        // variante è stata generata prima e questa sprecherebbe un tavolo.
        masks.push(chosen.reduce((mask, p) => mask | (1 << p), 0));
        return;
      }
      if (chosen.length >= maxUnion) return;
      for (let i = start; i < positions.length; i++) {
        chosen.push(positions[i]!);
        walk(i + 1, chosen, capacity + free[positions[i]!]!.capacity);
        chosen.pop();
      }
    };
    walk(0, [], 0);
  }
  return [...new Set(masks)];
}

/**
 * Esiste un assegnamento che sistema tutti i gruppi?
 *
 * I gruppi con tavoli già assegnati dallo staff tolgono quei tavoli dal
 * disponibile; gli altri devono stare in ciò che resta.
 */
export function canSeatAll(
  groups: readonly SeatingGroup[],
  tables: readonly SeatingTable[],
  configured: readonly (readonly string[])[] = [],
  options: { maxUnion?: number; maxGroups?: number } = {},
): SeatingOutcome {
  const maxUnion = options.maxUnion ?? MAX_UNION_TABLES;
  const maxGroups = options.maxGroups ?? EXACT_SEARCH_MAX_GROUPS;

  const fixedTables = new Set<string>();
  const floating: SeatingGroup[] = [];
  for (const group of groups) {
    if (group.size < 1) continue;
    if (group.fixedTableIds?.length) {
      let capacity = 0;
      for (const id of group.fixedTableIds) {
        // Due gruppi sullo stesso tavolo: la sala è già incoerente.
        if (fixedTables.has(id)) return { seatable: false, method: "exact" };
        fixedTables.add(id);
        capacity += tables.find((table) => table.id === id)?.capacity ?? 0;
      }
      if (capacity < group.size) return { seatable: false, method: "exact" };
    } else floating.push(group);
  }

  const free = tables.filter((table) => !fixedTables.has(table.id));
  if (!floating.length) return { seatable: true, method: "exact" };
  if (free.length > 30 || floating.length > maxGroups) {
    // Ripiego conservativo: ogni gruppo deve almeno stare in una delle unità
    // possibili, e la somma dei posti deve bastare. Non prova che esista un
    // assegnamento, ma se fallisce l'assegnamento non esiste di sicuro.
    const total = free.reduce((sum, table) => sum + table.capacity, 0);
    const demand = floating.reduce((sum, group) => sum + group.size, 0);
    const everyGroupFits = floating.every(
      (group) => candidateUnions(group.size, free, configured, maxUnion).length > 0,
    );
    return { seatable: total >= demand && everyGroupFits, method: "conservative" };
  }

  // I gruppi grandi per primi: sono i più difficili da sistemare, e fallire
  // subito costa meno che scoprirlo in fondo all'albero.
  const ordered = [...floating].sort((a, b) => b.size - a.size);
  const unions = ordered.map((group) =>
    candidateUnions(group.size, free, configured, maxUnion),
  );
  const seen = new Set<string>();
  const search = (position: number, used: number): boolean => {
    if (position === ordered.length) return true;
    const key = `${position}:${used}`;
    if (seen.has(key)) return false;
    seen.add(key);
    for (const mask of unions[position]!)
      if (!(mask & used) && search(position + 1, used | mask)) return true;
    return false;
  };
  return { seatable: search(0, 0), method: "exact" };
}
