# Restaurant sellable catalog

Il catalogo Restaurant riusa Item come unica anagrafica di prodotti, ingredienti e ricette. Le categorie sono company-scoped e dichiarano lo scopo SELLABLE, INVENTORY o BOTH; la gerarchia preesistente resta opzionale.

Gli allergeni sono master data aziendali associabili agli Item. Per una ricetta, la vista applicativa unisce senza duplicati gli allergeni espliciti della portata e quelli correnti degli ingredienti. Una modifica alla ricetta o agli allergeni degli ingredienti aggiorna quindi la vista derivata.

RestaurantOrderLine conserva lo snapshot commerciale della vendita: nome prodotto, variante, modifier selezionati, prezzo base, delta, prezzo finale, quantità, IVA e totale. BusinessDocumentLine conserva a sua volta nome e percentuale IVA usati nel documento. Le modifiche successive a catalogo, prezzi o aliquote non alterano ordini e documenti storici.

Gli allergeni non sono copiati sulla RestaurantOrderLine: lo storico ordine non è un archivio normativo degli allergeni. Per esigenze di conservazione normativa serve in futuro uno snapshot/versionamento dedicato della scheda allergeni pubblicata.

Gli impatti ricetta di varianti e modifier sono righe strutturate con delta quantità, Item componente e unità di misura. Il consumo Inventory aggrega ricetta base e impatti selezionati, rifiuta unità incoerenti e risultati negativi, e non interpreta testo libero.
