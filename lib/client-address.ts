/**
 * L'indirizzo del client su cui contare le richieste pubbliche.
 *
 * `x-forwarded-for` e' una lista in cui ogni proxy appende chi ha visto. Il
 * primo elemento e' quello che il client ha dichiarato di essere, e puo'
 * scriverci qualsiasi cosa: prenderlo significa lasciare che scelga da solo il
 * proprio contatore, cioe' non avere alcun limite.
 *
 * L'ultimo elemento e' invece quello scritto dal proxy piu' vicino a noi, che
 * e' l'unico di cui ci fidiamo. Vale finche' davanti c'e' esattamente un proxy:
 * se un domani si aggiunge una CDN, la posizione da prendere cambia e va
 * dichiarata qui, non scoperta da un abuso.
 */
export const TRUSTED_PROXY_HOPS = 1;

export function clientAddress(header: (name: string) => string | null): string {
  const forwarded = (header("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (forwarded.length) {
    const index = Math.max(0, forwarded.length - TRUSTED_PROXY_HOPS);
    return forwarded[index]!;
  }
  return header("x-real-ip")?.trim() || "anonymous";
}
