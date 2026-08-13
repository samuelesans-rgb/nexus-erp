# Booking Widget API v1

Il Booking Widget V1 consente di incorporare le prenotazioni di una Location in qualsiasi sito senza framework o fogli di stile esterni. La `PUBLIC_KEY` è un identificatore pubblico casuale: individua solo la configurazione pubblica del widget e non concede privilegi amministrativi.

## Configurazione nell'ERP

Aprire **Restaurant → Widget** nella Location corretta, configurare aspetto e comportamento, inserire i domini autorizzati e abilitare il widget. Le Booking Settings della Location devono essere abilitate e devono esistere tavoli attivi compatibili.

Non inserire schemi o percorsi nei domini: usare `example.com`. Un dominio autorizza anche i suoi sottodomini. Una lista vuota consente l'incorporamento da qualsiasi dominio ed è sconsigliata in produzione.

## Snippet

Usare lo snippet generato dall'ERP:

```html
<script async src="https://erp.example.com/widget/v1/widget.js" data-nexus-booking="PUBLIC_KEY"></script>
```

`data-mode` può sovrascrivere la modalità salvata:

```html
<script async src="https://erp.example.com/widget/v1/widget.js" data-nexus-booking="PUBLIC_KEY" data-mode="MODAL"></script>
```

Valori supportati: `INLINE`, `MODAL`, `FLOATING_BUTTON`. Gli snippet V1 già generati che includono `data-mode` restano compatibili. Più tag script possono convivere nella stessa pagina.

## Modalità

- `INLINE`: iframe nel flusso della pagina con altezza aggiornata automaticamente.
- `MODAL`: pulsante nel punto dello snippet; apre un dialog accessibile e chiudibile con ESC, click sullo sfondo o pulsante di chiusura.
- `FLOATING_BUTTON`: come MODAL, con launcher fisso entro viewport e safe area mobile.

Il widget è responsive da 320 px in su, non applica CSS globale al sito host e gestisce internamente lo scroll del modal.

## Personalizzazione e privacy

Il Designer controlla tema, colori, font ammessi, raggio, logo, testi, campi obbligatori e locale. Logo e Privacy URL accettano solo URL HTTP(S); in produzione usare HTTPS. Se configurato, il link privacy apre una nuova scheda con protezioni `noopener noreferrer`.

## Public key

La chiave viene generata con entropia crittografica e può essere esposta nello snippet. Rigenerarla revoca immediatamente gli snippet precedenti: aggiornare tutti i siti host dopo la rotazione. Non costruire né modificare manualmente la chiave.

## Sicurezza

- isolamento Company/Location risolto server-side dalla public key;
- validazione Zod per configurazione e prenotazione;
- allowlist Origin/Referer e CSP `frame-ancestors`;
- CORS riflesso solo dopo autorizzazione del dominio;
- CSP con nonce, output HTML/JSON escapato e messaggi server sicuri;
- idempotency key per impedire duplicati;
- rate limit sulle prenotazioni;
- API dinamiche e embed con `Cache-Control: no-store`;
- POST reservation mai cacheabile.

Il rate limit V1 è in memoria per processo. In un deployment multi-replica dovrà essere sostituito con uno store condiviso (per esempio Redis); questo è debito tecnico noto e non cambia l'idempotenza persistente.

## Cache

`/widget/v1/widget.js` è versionato nel percorso V1 e usa cache browser controllata con breve `max-age` e `stale-while-revalidate`. Config, disponibilità, prenotazione ed embed sono `no-store` per evitare dati dinamici obsoleti. Non è richiesta una CDN.

## Integrazione HTML

Inserire lo snippet nel punto desiderato del `<body>`. Per `FLOATING_BUTTON` la posizione del tag non influenza la posizione del launcher.

## Integrazione Next.js

Usare `next/script` senza trasformare gli attributi `data-*`:

```tsx
import Script from "next/script";

export function BookingWidget() {
  return <Script async src="https://erp.example.com/widget/v1/widget.js" data-nexus-booking="PUBLIC_KEY" />;
}
```

## Integrazione WordPress

Aggiungere un blocco **HTML personalizzato** e incollare lo snippet. Evitare plugin che rimuovono attributi `data-*`, differiscono indefinitamente JavaScript esterno o riscrivono l'URL del loader.

## Deployment

Pubblicare loader, embed e API sulla stessa origine HTTPS. Il reverse proxy deve preservare `Host`, `X-Forwarded-Proto`, `Origin`, `Referer` e gli header CSP/CORS della risposta. Non mettere in cache `/api/widget/v1/`, `/embed/booking/` o richieste POST.

## Troubleshooting

- **Widget non disponibile**: controllare public key, abilitazione Widget, Location e Booking Settings.
- **Dominio non autorizzato**: aggiungere il solo hostname effettivo del sito all'allowlist.
- **Nessun orario disponibile**: verificare orari, anticipo, capacità e tavoli attivi.
- **Il modal non si apre**: verificare che il CMS non abbia rimosso il tag script o gli attributi `data-*`.
- **Altezza errata**: verificare che CSP/proxy non blocchino `postMessage` o l'embed.
- **Errore temporaneo**: controllare rete, health ERP e log strutturati, senza condividere token o dati cliente.

## Accessibilità

Il form usa label native, focus visibile, target touch, regioni `aria-live` e submit disabilitato durante l'invio. MODAL espone `role="dialog"`, `aria-modal`, focus trap, chiusura ESC e ripristino del focus al launcher.
