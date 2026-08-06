# Booking email

Il flusso Restaurant Booking usa SMTP quando `SMTP_HOST` e `SMTP_FROM` sono configurati. In sviluppo e test, oppure con configurazione SMTP incompleta, usa un provider noop che non invia messaggi reali.

Variabili ambiente:

- `SMTP_HOST`: hostname del server SMTP.
- `SMTP_PORT`: porta SMTP; default `587`. La porta `465` abilita TLS implicito.
- `SMTP_USER`: utente SMTP opzionale.
- `SMTP_PASSWORD`: password SMTP opzionale.
- `SMTP_FROM`: mittente dei messaggi.
- `BOOKING_NOTIFICATION_EMAIL`: destinatario interno di fallback quando la sede non configura `internalNotificationEmail`.
- `AUTH_URL`: origine assoluta usata per costruire il link sicuro di cancellazione.

Le credenziali devono essere configurate soltanto nell'ambiente di esecuzione e non devono essere versionate. Gli errori SMTP sono registrati senza destinatari, token o dati cliente e non annullano la prenotazione.
