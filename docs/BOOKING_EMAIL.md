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

In produzione `AUTH_URL` deve essere l'origine HTTPS canonica dell'ERP, senza slash finale. Il widget può usare un'origine pubblica distinta tramite `WIDGET_PUBLIC_ORIGIN`; questa variabile non modifica i link email.

Le credenziali devono essere configurate soltanto nell'ambiente di esecuzione e non devono essere versionate. Gli errori SMTP sono registrati senza destinatari, token o dati cliente e non annullano la prenotazione. Se `SMTP_HOST` o `SMTP_FROM` non sono valorizzate, viene usato il provider `noop`: è un fallback sicuro, ma in produzione deve generare un allarme operativo perché non consegna messaggi.
