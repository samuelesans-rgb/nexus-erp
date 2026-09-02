# Cleanup controllato placeholder FUSION

Questa procedura è solo preparatoria. Non eseguirla durante il deploy del filtro runtime.

## Ambito

I candidati sono esclusivamente mapping il cui nome sincronizzato coincide esattamente con `PLU` seguito dal proprio numero PLU. La selezione deve essere limitata a `companyId` e `locationId` approvati dall'operatore.

## Procedura

1. Fermare il connector e verificare che non vi siano Catalog Sync in corso.
2. Esportare in un file protetto gli ID di mapping e Item candidati con una query `SELECT` tenant-scoped.
3. Verificare manualmente che ogni Item non sia referenziato da righe documento, ricette, ordini, listini o altri dati applicativi.
4. Approvare esplicitamente l'elenco finale e predisporre un backup ripristinabile.
5. In una singola transazione, eliminare prima i soli mapping approvati e poi i soli Item senza riferimenti. Non usare cancellazioni per pattern senza un elenco di ID approvato.
6. Eseguire un Catalog Sync controllato: i placeholder resteranno nello snapshot come `PLACEHOLDER_SKIPPED`; gli eventuali nomi reali saranno importati normalmente.
7. Riconciliare conteggi, audit e riferimenti prima del commit della transazione operativa.

Query read-only per produrre i candidati (sostituire i parametri, non rimuovere i filtri tenant):

```sql
SELECT m.id AS mapping_id, m."itemId", m.plu, m."synchronizedName"
FROM "FusionCatalogMapping" m
WHERE m."companyId" = :company_id
  AND m."locationId" = :location_id
  AND m."synchronizedName" = 'PLU' || m.plu::text
ORDER BY m.plu;
```

Non è inclusa alcuna query di cancellazione intenzionalmente: il cleanup richiede revisione dei riferimenti e autorizzazione separata.
