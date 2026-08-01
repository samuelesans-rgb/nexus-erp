# Catalogo moduli

## Convenzioni

Il `code` è un identificatore pubblico stabile, in maiuscolo e con prefisso di categoria. Non va rinominato dopo l'uso in configurazioni, permessi o audit. Le route sono proposte future e non attestano funzionalità già implementate.

Stati:

- `AVAILABLE`: fondazione già presente, anche se non completa;
- `PLANNED`: prevista dalla roadmap;
- `FUTURE`: fuori dalle prime release.

I permessi seguono la forma `dominio.azione`; `manage` comprende configurazione, non sostituisce automaticamente i permessi operativi.

## Core obbligatorio

| Code | Nome | Descrizione | Obbl. | Dipendenze | Route future | Permessi principali | Entità previste | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CORE_AUTH` | Identità | Autenticazione, utenti e sessioni | Sì | — | `/account` | `account.read`, `account.update` | User, Account, Session | AVAILABLE |
| `CORE_COMPANIES` | Company | Tenant e azienda attiva | Sì | `CORE_AUTH` | `/settings/company` | `company.read`, `company.update` | Company | AVAILABLE |
| `CORE_MEMBERSHIPS` | Membership | Appartenenza degli utenti alle aziende | Sì | `CORE_AUTH`, `CORE_COMPANIES` | `/settings/members` | `membership.read`, `membership.manage` | Membership | AVAILABLE |
| `CORE_LOCATIONS` | Sedi | Sedi, assegnazioni utenti e sede attiva | Sì | `CORE_COMPANIES`, `CORE_MEMBERSHIPS` | `/settings/locations` | `location.read`, `location.manage`, `location.switch` | Location, MembershipLocation | PLANNED |
| `CORE_ROLES_PERMISSIONS` | Ruoli e permessi | Autorizzazioni nel contesto aziendale | Sì | `CORE_MEMBERSHIPS` | `/settings/access` | `role.read`, `role.manage` | Role, Permission, MembershipRole | AVAILABLE |
| `CORE_MODULES` | Sistema moduli | Attivazioni e dipendenze per Company | Sì | `CORE_ROLES_PERMISSIONS` | `/settings/modules` | `module.read`, `module.manage` | ModuleDefinition, CompanyModule | AVAILABLE |
| `CORE_PARTNERS` | Partner | Anagrafica condivisa di persone e organizzazioni | Sì | `CORE_COMPANIES` | `/partners` | `partner.read`, `partner.create`, `partner.update`, `partner.archive` | Partner, Contact, Address | AVAILABLE |
| `CORE_DOCUMENTS` | Unified Document Engine | Documenti, serie, workflow e punti di estensione condivisi | Sì | `CORE_COMPANIES` | `/documents` | `document.read`, `document.create`, `document.issue`, `attachment.manage` | BusinessDocument, BusinessDocumentLine, DocumentSeries, DocumentAttachment, DocumentEvent | AVAILABLE |
| `CORE_AUDIT` | Audit minimo | Registro delle operazioni rilevanti | Sì | `CORE_COMPANIES` | `/settings/audit` | `audit.read`, `audit.export` | AuditEvent, RetentionPolicy | PLANNED |
| `CORE_NOTIFICATIONS` | Notifiche di sistema | Avvisi applicativi essenziali | Sì | `CORE_AUTH` | `/notifications` | `notification.read`, `notification.manage` | Notification, NotificationPreference | PLANNED |
| `CORE_DASHBOARD` | Dashboard base | Indicatori essenziali dei moduli attivi | Sì | `CORE_MODULES` | `/dashboard` | `dashboard.read` | DashboardWidget | AVAILABLE |

Categoria di tutte le righe precedenti: `CORE`.

## Core condiviso attivabile

In questa e nelle tabelle verticali il **Nome** è anche la descrizione funzionale sintetica del modulo; ambito, capacità e confini sono precisati da route, permessi ed entità previste.

| Code | Nome | Cat. | Obbl. | Dipendenze | Route future | Permessi principali | Entità previste | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CORE_PRODUCTS` | Catalogo Item: prodotti e servizi | SHARED | No | Core obbligatorio | `/items` | `catalog.read`, `catalog.manage` | Item, ItemCategory, UnitOfMeasure, VatRate, profili Item | AVAILABLE |
| `CORE_PRICE_LISTS` | Listini | SHARED | No | `CORE_PRODUCTS` | `/settings/configurations/price-lists` | `price_list.read`, `price_list.manage` | PriceList, PriceListItem | AVAILABLE |
| `CORE_SALES` | Vendite | SHARED | No | `CORE_PARTNERS`, `CORE_PRODUCTS` | `/sales` | `sales.read`, `sales.create`, `sales.approve` | SalesOrder, SalesLine | PLANNED |
| `CORE_PURCHASES` | Acquisti | SHARED | No | `CORE_PARTNERS`, `CORE_PRODUCTS` | `/purchases` | `purchase.read`, `purchase.create`, `purchase.approve` | PurchaseOrder, PurchaseLine | PLANNED |
| `CORE_INVENTORY` | Inventory Engine | SHARED | No | `CORE_PRODUCTS` | `/inventory` | `inventory.read`, `inventory.move`, `inventory.count` | Location, Warehouse, WarehouseBin, InventoryLot, InventorySerial, InventoryMovement, InventoryTransfer, InventoryCount, StockBalance, DomainEvent | AVAILABLE |
| `CORE_PAYMENTS` | Pagamenti | SHARED | No | `CORE_DOCUMENTS`, `CORE_PARTNERS` | `/payments` | `payment.read`, `payment.record`, `payment.reconcile` | PaymentMethod e PaymentTerm AVAILABLE; Payment e DueDate PLANNED | AVAILABLE |
| `CORE_TREASURY` | Tesoreria | SHARED | No | `CORE_PAYMENTS` | `/treasury` | `treasury.read`, `treasury.manage` | FinancialAccount, CashFlow, Reconciliation | FUTURE |
| `CORE_ACCOUNTING` | Contabilità V1 | SHARED | No | `CORE_DOCUMENTS`, `CORE_PAYMENTS` | `/accounting` | `accounting.read`, `journal.manage`, `reconciliation.manage`, `accounting.export` | JournalEntry, DueDate, BankTransaction, Reconciliation | PLANNED |
| `CORE_REPORTING` | Reporting avanzato | SHARED | No | `CORE_DASHBOARD` | `/reports` | `report.read`, `report.export` | ReportDefinition, ReportRun | PLANNED |
| `CORE_SEARCH` | Ricerca globale | SHARED | No | Core obbligatorio | `/search` | `search.use` | SearchDocument | FUTURE |
| `CORE_IMPORT_EXPORT` | Import/export | SHARED | No | Core obbligatorio | `/tools/import-export` | `import.run`, `export.run` | ImportJob, ExportJob, Mapping | FUTURE |
| `CORE_FISCAL_ITALY` | Fiscalità italiana | SHARED | No | `CORE_DOCUMENTS`, `CORE_PAYMENTS` | `/settings/fiscal` | `fiscal.read`, `fiscal.manage`, `fiscal.transmit` | FiscalRuleSet, TaxCode, FiscalTransmission | PLANNED |
| `CORE_INTEGRATIONS` | API e integrazioni | SHARED | No | Core obbligatorio | `/settings/integrations` | `integration.read`, `integration.manage` | Integration, CredentialRef, Webhook, SyncJob | PLANNED |
| `CORE_CRM` | CRM | SHARED | No | `CORE_PARTNERS`, `CORE_NOTIFICATIONS` | `/crm` | `crm.read`, `crm.manage` | Lead, Opportunity, Activity | FUTURE |

`CORE_ACCOUNTING` V1 include prima nota, incassi e pagamenti, scadenziario, riconciliazione bancaria, report essenziali ed export per commercialista. Non include paghe, dichiarazioni fiscali, bilancio civilistico completo o adempimenti fiscali avanzati proprietari.

## Restaurant

| Code | Nome | Obbl. | Dipendenze | Route future | Permessi principali | Entità previste | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RESTAURANT_RESERVATIONS` | Prenotazioni ristorante | No | `CORE_PARTNERS` | `/restaurant/reservations` | `restaurant_reservation.read`, `.manage` | RestaurantReservation, Party | PLANNED |
| `RESTAURANT_MENU` | Menu | No | `CORE_PRODUCTS`, `CORE_PRICE_LISTS` | `/restaurant/menu` | `restaurant_menu.read`, `.manage` | Menu, MenuCategory, MenuItem, Variant, Allergen | PLANNED |
| `RESTAURANT_RECIPES` | Ricette e food cost | No | `RESTAURANT_MENU`, `CORE_INVENTORY` | `/restaurant/recipes` | `recipe.read`, `recipe.manage`, `food_cost.read` | Recipe, RecipeIngredient, Preparation, Yield | PLANNED |
| `RESTAURANT_FLOOR` | Sala e comande | No | `RESTAURANT_MENU` | `/restaurant/floor` | `floor.read`, `order.create`, `order.manage` | DiningArea, Table, Order, OrderLine | PLANNED |
| `RESTAURANT_KITCHEN` | Cucina | No | `RESTAURANT_FLOOR` | `/restaurant/kitchen` | `kitchen.read`, `kitchen.advance` | KitchenStation, KitchenTicket, PrinterRoute | PLANNED |
| `RESTAURANT_POS` | Cassa e POS | No | `RESTAURANT_FLOOR`, `CORE_PAYMENTS`, `CORE_INTEGRATIONS` | `/restaurant/pos` | `pos.use`, `pos.close`, `pos.refund` | Check, TillSession, PosTransaction | PLANNED |
| `RESTAURANT_FOOD_INVENTORY` | Magazzino alimentare | No | `CORE_INVENTORY` | `/restaurant/inventory` | `food_inventory.read`, `.manage` | Lot, Expiry, Waste, FoodInventoryCount | PLANNED |
| `RESTAURANT_OMNICHANNEL` | Takeaway e delivery | No | `RESTAURANT_MENU`, `RESTAURANT_POS` | `/restaurant/orders` | `restaurant_order.read`, `.manage` | FulfilmentOrder, PickupSlot, Delivery | FUTURE |
| `RESTAURANT_LOYALTY` | Fidelity e gift card | No | `CORE_PARTNERS`, `CORE_PAYMENTS` | `/restaurant/loyalty` | `loyalty.read`, `loyalty.manage` | LoyaltyAccount, Reward, GiftCard | FUTURE |
| `RESTAURANT_ANALYTICS` | Analisi ristorante | No | `CORE_REPORTING`, `RESTAURANT_FLOOR` | `/restaurant/reports` | `restaurant_report.read`, `.export` | RestaurantMetric | FUTURE |

Categoria di tutte le righe precedenti: `RESTAURANT`.

## Hotel

| Code | Nome | Obbl. | Dipendenze | Route future | Permessi principali | Entità previste | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `HOTEL_ROOMS` | Strutture e camere | No | `CORE_LOCATIONS`, `CORE_PRODUCTS` | `/hotel/rooms` | `room.read`, `room.manage` | Property, RoomType, Room, RoomBlock | PLANNED |
| `HOTEL_RESERVATIONS` | Prenotazioni hotel | No | `HOTEL_ROOMS`, `CORE_PARTNERS`, `CORE_PRICE_LISTS` | `/hotel/reservations` | `hotel_reservation.read`, `.manage` | StayReservation, Guest, RatePlan, Deposit | PLANNED |
| `HOTEL_FRONT_DESK` | Front desk | No | `HOTEL_RESERVATIONS`, `CORE_DOCUMENTS`, `CORE_PAYMENTS` | `/hotel/front-desk` | `checkin.execute`, `checkout.execute`, `folio.manage` | Stay, RoomAssignment, GuestFolio | PLANNED |
| `HOTEL_HOUSEKEEPING` | Housekeeping | No | `HOTEL_ROOMS` | `/hotel/housekeeping` | `housekeeping.read`, `.manage` | HousekeepingTask, RoomStatus | PLANNED |
| `HOTEL_MAINTENANCE` | Manutenzione | No | `HOTEL_ROOMS` | `/hotel/maintenance` | `maintenance.read`, `.manage` | MaintenanceTicket, OutOfServicePeriod | FUTURE |
| `HOTEL_EXTRAS` | Extra, minibar ed eventi | No | `HOTEL_RESERVATIONS`, `CORE_PRODUCTS` | `/hotel/extras` | `hotel_extra.read`, `.charge` | ExtraService, MinibarCharge, EventRoomBooking | FUTURE |
| `HOTEL_DISTRIBUTION` | Distribuzione | No | `HOTEL_RESERVATIONS`, `CORE_INTEGRATIONS` | `/hotel/distribution` | `distribution.read`, `.manage` | Channel, RateMapping, AvailabilitySync | FUTURE |
| `HOTEL_GUEST_PORTAL` | Portale ospite | No | `HOTEL_FRONT_DESK`, `CORE_NOTIFICATIONS` | `/guest` | `guest_portal.use`, `guest_portal.manage` | GuestAccess, GuestRequest | FUTURE |
| `HOTEL_RESTAURANT_LINK` | Collegamento ristorante | No | `HOTEL_FRONT_DESK` e moduli Restaurant scelti | `/hotel/restaurant` | `room_charge.create`, `room_charge.reverse` | RoomChargeLink | FUTURE |

Categoria di tutte le righe precedenti: `HOTEL`.

## Beauty

| Code | Nome | Obbl. | Dipendenze | Route future | Permessi principali | Entità previste | Stato |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `BEAUTY_OPERATORS` | Operatori e risorse | No | `CORE_MEMBERSHIPS`, `CORE_PRODUCTS` | `/beauty/operators` | `beauty_operator.read`, `.manage` | OperatorProfile, Skill, Workstation, Cabin | PLANNED |
| `BEAUTY_APPOINTMENTS` | Agenda e appuntamenti | No | `BEAUTY_OPERATORS`, `CORE_PARTNERS`, `CORE_PRICE_LISTS` | `/beauty/calendar` | `appointment.read`, `appointment.manage` | Appointment, AppointmentService, Availability | PLANNED |
| `BEAUTY_CLIENT_RECORDS` | Scheda cliente | No | `BEAUTY_APPOINTMENTS`, `CORE_PARTNERS` | `/beauty/clients` | `client_record.read`, `.manage`, `consent.manage` | ClientRecord, Treatment, WorkPhoto, Consent | PLANNED |
| `BEAUTY_PACKAGES` | Pacchetti e abbonamenti | No | `BEAUTY_APPOINTMENTS`, `CORE_PAYMENTS` | `/beauty/packages` | `package.read`, `package.sell`, `package.redeem` | Package, Subscription, ClientCredit | PLANNED |
| `BEAUTY_INVENTORY` | Vendita e consumo prodotti | No | `CORE_INVENTORY`, `BEAUTY_APPOINTMENTS` | `/beauty/inventory` | `beauty_inventory.read`, `.consume`, `.sell` | TreatmentConsumption, RetailSale | PLANNED |
| `BEAUTY_REMINDERS` | Promemoria e richiami | No | `BEAUTY_APPOINTMENTS`, `CORE_NOTIFICATIONS` | `/beauty/reminders` | `reminder.read`, `reminder.manage` | ReminderRule, ReminderDelivery, Recall | PLANNED |
| `BEAUTY_ONLINE_BOOKING` | Prenotazione online | No | `BEAUTY_APPOINTMENTS`, `CORE_INTEGRATIONS` | `/book` | `online_booking.manage` | BookingPage, BookingRequest | FUTURE |
| `BEAUTY_LOYALTY` | Fidelity e gift card | No | `CORE_PARTNERS`, `CORE_PAYMENTS` | `/beauty/loyalty` | `beauty_loyalty.read`, `.manage` | LoyaltyAccount, GiftCard | FUTURE |
| `BEAUTY_COMMISSIONS` | Commissioni operatori | No | `BEAUTY_APPOINTMENTS`, `CORE_PAYMENTS` | `/beauty/commissions` | `commission.read`, `commission.calculate` | CommissionRule, CommissionStatement | FUTURE |
| `BEAUTY_CAMPAIGNS` | Campagne | No | `BEAUTY_CLIENT_RECORDS`, `CORE_CRM`, `CORE_NOTIFICATIONS` | `/beauty/campaigns` | `campaign.read`, `campaign.manage`, `campaign.send` | Segment, Campaign, CampaignDelivery | FUTURE |

Categoria di tutte le righe precedenti: `BEAUTY`.

## Bundle commerciali e configurazioni predefinite

Nexus Core è sempre attivo. I bundle Restaurant, Beauty e Hotel sono acquistabili e possono convivere nella stessa Company. I moduli opzionali restano acquistabili e attivabili singolarmente.

| Bundle | Moduli attivi per default |
| --- | --- |
| Restaurant | `CORE_PARTNERS`, `CORE_PRODUCTS`, `CORE_PURCHASES`, `CORE_INVENTORY`, `RESTAURANT_MENU`, `RESTAURANT_RESERVATIONS`, `RESTAURANT_RECIPES`, `CORE_SALES`, `CORE_PAYMENTS`, `CORE_REPORTING` |
| Beauty | `CORE_PARTNERS`, servizi di `CORE_PRODUCTS`, `BEAUTY_APPOINTMENTS`, `BEAUTY_OPERATORS`, prodotti di `CORE_PRODUCTS`, `CORE_INVENTORY`, `BEAUTY_PACKAGES`, `CORE_PAYMENTS`, `BEAUTY_REMINDERS`, `CORE_REPORTING` |
| Hotel | `CORE_PARTNERS`, `HOTEL_ROOMS` incluse disponibilità, `HOTEL_RESERVATIONS` inclusi ospiti, `HOTEL_FRONT_DESK`, `HOTEL_HOUSEKEEPING`, `CORE_PAYMENTS`, `CORE_DOCUMENTS`, `CORE_REPORTING` |

“Default” significa configurazione iniziale del bundle. Non duplica i moduli Core già obbligatori e non altera le dipendenze. Hotel e Restaurant possono essere attivati insieme; `HOTEL_RESTAURANT_LINK` resta opzionale.

## Note di governo

“Core obbligatorio” significa sempre attivo e non disattivabile. Gli altri moduli sono opzionali, anche quando inclusi per default in un bundle, ma una dipendenza può renderli necessari per una specifica configurazione. I nomi delle entità sono proposte concettuali e non autorizzano modifiche allo schema.

Vedere [Dipendenze fra moduli](MODULE_DEPENDENCIES.md), [Requisiti funzionali](FUNCTIONAL_REQUIREMENTS.md) e [Roadmap](ROADMAP.md).
