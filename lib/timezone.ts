/**
 * Conversioni fra istanti e ore di parete in un fuso dato.
 *
 * Il server gira su UTC. Finora tutta l'aritmetica oraria delle prenotazioni
 * usava `setHours` e `getDay`, cioe' l'orologio del server: "12:00" in
 * configurazione significava mezzogiorno UTC, non mezzogiorno a Roma. D'estate
 * il servizio risultava spostato di due ore, d'inverno di una — e l'errore
 * cambiava da solo alle 03:00 dell'ultima domenica di ottobre.
 *
 * Gli istanti restano UTC in database, come devono. Qui si converte solo
 * l'interpretazione: cosa vuol dire "12:00" e "che giorno e'" per quella sede.
 *
 * Nessuna dipendenza aggiunta: `Intl` conosce gia' il database dei fusi.
 */

export type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = domenica, come Date.getDay(). */
  weekday: number;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let cached = formatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

/** Le parti calendariali di un istante, lette nel fuso indicato. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl rende mezzanotte come "24" in alcune versioni di ICU.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: Math.max(0, WEEKDAYS.indexOf(String(parts.weekday))),
  };
}

/** Giorno della settimana nel fuso indicato: 0 domenica, come Date.getDay(). */
export function zonedWeekday(instant: Date, timeZone: string) {
  return zonedParts(instant, timeZone).weekday;
}

/** Scarto del fuso rispetto a UTC, in millisecondi, valido per quell'istante. */
function offsetMs(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // I millisecondi non compaiono nelle parti: si riprendono dall'istante.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * L'istante che corrisponde a una data e ora di parete nel fuso indicato.
 *
 * Due passaggi, e servono entrambi: lo scarto dipende dall'istante, che e'
 * proprio quello che stiamo cercando. Il primo tentativo usa lo scarto valido
 * per l'ora "letta come UTC", il secondo lo corregge con lo scarto valido per
 * il risultato. E' il caso del cambio d'ora, dove i due scarti differiscono.
 *
 * Ore che non esistono (il salto in avanti di marzo) scivolano in avanti; ore
 * ambigue (il ritorno di ottobre) risolvono alla prima occorrenza, cioe'
 * all'ora legale ancora in vigore.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone: string,
): Date {
  const hour = parts.hour ?? 0,
    minute = parts.minute ?? 0,
    second = parts.second ?? 0;
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second);
  // Lo scarto dipende dall'istante, che e' proprio l'incognita. Si provano i due
  // scarti in vigore attorno alla data — prima e dopo un eventuale cambio d'ora —
  // e si tengono i candidati che rileggono l'ora richiesta.
  const around = [naive - 86_400_000, naive + 86_400_000].map((t) =>
    offsetMs(new Date(t), timeZone),
  );
  const candidates = [...new Set(around)]
    .map((offset) => naive - offset)
    .filter((time) => {
      const p = zonedParts(new Date(time), timeZone);
      return (
        p.year === parts.year &&
        p.month === parts.month &&
        p.day === parts.day &&
        p.hour === hour &&
        p.minute === minute
      );
    });
  // Ora ambigua (il ritorno di ottobre): due candidati validi, si sceglie il
  // primo in ordine di tempo, cioe' con l'ora legale ancora in vigore.
  if (candidates.length) return new Date(Math.min(...candidates));
  // Ora inesistente (il salto di marzo): nessun candidato rilegge l'ora
  // richiesta, quindi si scivola in avanti invece di fallire.
  const first = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(first, timeZone));
}

/** Mezzanotte locale del giorno che contiene l'istante. */
export function startOfZonedDay(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** L'istante dell'ora "HH:mm" nello stesso giorno locale dell'istante dato. */
export function atZonedTime(instant: Date, time: string, timeZone: string) {
  const [hour, minute] = time.split(":").map(Number);
  const p = zonedParts(instant, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.day, hour, minute },
    timeZone,
  );
}

/** Aggiunge giorni restando alla stessa ora di parete, anche attraverso il cambio d'ora. */
export function addZonedDays(instant: Date, days: number, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return zonedTimeToUtc(
    { year: p.year, month: p.month, day: p.day + days, hour: p.hour, minute: p.minute, second: p.second },
    timeZone,
  );
}

/**
 * La data di calendario locale, nella forma in cui Prisma rappresenta una
 * colonna `@db.Date`: mezzanotte UTC di quel giorno.
 *
 * Serve perche' una colonna di tipo data non e' un istante: confrontarla con
 * una finestra di istanti la tronca al giorno e puo' escludere proprio il
 * giorno cercato. Una chiusura per Natale e' "il 25 dicembre" nel calendario
 * del locale, non un intervallo di ventiquattro ore in UTC.
 */
export function zonedCalendarDate(instant: Date, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}
