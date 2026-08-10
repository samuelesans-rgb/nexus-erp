# Restaurant Booking Widget V1 — produzione

## Prerequisiti e variabili ambiente

Usare Node.js e PostgreSQL compatibili con le versioni dichiarate dal progetto. Copiare `.env.example` nel secret store della piattaforma, senza creare o versionare `.env` sul server.

Variabili obbligatorie:

- `DATABASE_URL`: connessione PostgreSQL di produzione con TLS secondo il provider.
- `AUTH_SECRET`: segreto casuale distinto da sviluppo e test.
- `AUTH_URL=https://erp.frisabistro.com`: origine HTTPS canonica dell'ERP, senza slash finale.
- `AUTH_TRUST_HOST=true`: autorizza Auth.js a usare gli header host inoltrati dal reverse proxy.
- `WIDGET_PUBLIC_ORIGIN=https://erp.frisabistro.com`: origine pubblica da cui sono serviti loader, embed e API del widget.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`: trasporto e mittente SMTP.
- `BOOKING_NOTIFICATION_EMAIL=prenotazioni@frisabistro.com`: destinatario interno di fallback.

`SMTP_USER` e `SMTP_PASSWORD` sono obbligatorie solo se il relay richiede autenticazione. La porta `465` usa TLS implicito; le altre porte usano la negoziazione del provider. Se `SMTP_HOST` o `SMTP_FROM` mancano, l'app usa intenzionalmente il provider `noop`: la prenotazione resta valida ma nessuna email viene inviata. Monitorare gli eventi strutturati `booking-email` con esito `FAILED` o provider `noop`; non contengono destinatari, dati cliente o token.

## Configurazione Frisa Bistro

Nell'ERP aprire **Restaurant → Widget**, selezionare la sede di produzione e impostare:

- widget abilitato;
- domini consentiti: `frisabistro.com`;
- URL privacy e logo esclusivamente HTTPS;
- modalità e tema approvati.

La singola voce `frisabistro.com` autorizza anche i sottodomini, incluso `www.frisabistro.com`. L'embed genera `Content-Security-Policy: frame-ancestors 'self' https://frisabistro.com https://*.frisabistro.com`; richieste API provenienti da altri domini sono rifiutate. Non lasciare vuota la lista in produzione.

## Build e migrazioni

Eseguire in staging, poi in produzione, dalla stessa revisione Git:

```bash
npm ci
npx prisma validate
npx prisma generate
npm run build
DATABASE_URL="$DATABASE_URL" npx prisma migrate status
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
NODE_ENV=production PORT=3000 npm run start
```

Non usare `prisma migrate dev`, `prisma db push`, `prisma migrate reset` o il seed sul database di produzione. Prima di `migrate deploy`, creare e verificare un backup PostgreSQL consistente.

Le migrazioni Booking/Widget attese nel repository sono:

1. `20260806093000_booking_v1`
2. `20260806120000_location_global_slug`
3. `20260806150000_restaurant_booking_widget`
4. `20260807090000_booking_widget_designer`

`migrate deploy` applica in ordine tutte e sole le migrazioni ancora pendenti e registra l'esito in `_prisma_migrations`.

## Reverse proxy Nginx

Terminare TLS sul proxy, preservare host/protocollo e non mettere in cache API o embed. Un blocco minimo è:

```nginx
server {
    listen 443 ssl http2;
    server_name erp.frisabistro.com;

    client_max_body_size 2m;

    location = /api/health {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}
```

Configurare il bilanciatore con `GET /api/health`: risposta `200 {"status":"ok"}` quando applicazione e database sono disponibili, `503` altrimenti. Non riscrivere gli header CSP dell'embed e non nascondere gli header CORS restituiti dall'applicazione.

## URL previsti

- ERP: `https://erp.frisabistro.com`
- Health check: `https://erp.frisabistro.com/api/health`
- Loader: `https://erp.frisabistro.com/widget/v1/widget.js`
- Embed: `https://erp.frisabistro.com/embed/booking/<PUBLIC_KEY>`
- Config API: `https://erp.frisabistro.com/api/widget/v1/<PUBLIC_KEY>/config`
- Availability API: `https://erp.frisabistro.com/api/widget/v1/<PUBLIC_KEY>/availability`
- Reservation API: `https://erp.frisabistro.com/api/widget/v1/<PUBLIC_KEY>/reservation`

Lo snippet definitivo va copiato dall'ERP dopo il salvataggio della configurazione: la chiave pubblica non deve essere ricostruita o inserita manualmente.

## Rollback

1. Togliere temporaneamente il nodo dal bilanciatore se health check o smoke test falliscono.
2. Conservare log applicativi e output di `prisma migrate status`, senza esportare payload cliente.
3. Se le migrazioni sono riuscite, distribuire la precedente revisione applicativa. Le migrazioni Widget sono additive: non eseguire SQL inverso automatico.
4. Se una migrazione è fallita, non usare `migrate resolve` senza aver verificato manualmente schema e `_prisma_migrations`.
5. Ripristinare il backup PostgreSQL soltanto se è necessario annullare dati/schema, coordinando una finestra di manutenzione per evitare la perdita di prenotazioni create dopo il backup.
6. Riabilitare il traffico solo quando health check, login, pagina pubblica e widget sono nuovamente verdi.

## Checklist post-deploy

- [ ] `npx prisma migrate status` riporta il database aggiornato e nessuna migrazione fallita.
- [ ] `/api/health` restituisce HTTP 200 dal proxy pubblico.
- [ ] login ERP e selezione sede funzionano con cookie HTTPS.
- [ ] lo snippet ERP usa `https://erp.frisabistro.com/widget/v1/widget.js`.
- [ ] `frisabistro.com` compare nei domini consentiti e la lista non è vuota.
- [ ] il widget carica su `https://frisabistro.com` e `https://www.frisabistro.com`.
- [ ] un'origine non autorizzata non può caricare l'embed né usare le API.
- [ ] una prenotazione smoke test appare nella dashboard della sede corretta.
- [ ] cliente e ristorante ricevono una sola email; il link di cancellazione usa HTTPS.
- [ ] un errore SMTP lascia valida la prenotazione e produce un log privo di PII.
- [ ] rate limit e idempotenza rispondono correttamente a richieste ripetute.
- [ ] log e metriche non contengono email, telefoni, nomi, token o chiavi di cancellazione.
- [ ] backup, procedura di restore e revisione applicativa precedente sono disponibili.
- [ ] la prenotazione smoke test viene rimossa o annullata secondo la procedura operativa.
