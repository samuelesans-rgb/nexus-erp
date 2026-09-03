# PT15, BTAP e note cucina su KUBEIIx-F

## Conclusione

L'analisi offline degli artefatti PT15 non ha individuato un percorso remoto completo per stampare una `kitchenNote` Nexus sulla KUBEIIx-F tramite BTAP/XzbLpr.

```text
REMOTE_TO_TEXT_BRIDGE = NO
REMOTE_TO_PRINT       = YES
COMPLETE_PATH         = NO
```

Con le evidenze attuali non deve essere implementato un adapter Realme BTAP per le `kitchenNotes`.

## Evidenze

L'architettura legacy attualmente funzionante è:

```text
Nexus → Realme → FUSION XML1745 → PT15 → KUBEIIx-F
```

- Nel comando `ORDER` di XML1745 non è stato trovato supporto per `kitchenNotes`.
- PT15 possiede una funzione UI locale per inserire testo libero da stampare in cucina.
- Il setter del testo libero è circa `0x080da8e0` e scrive nel buffer runtime `+0xF3C`.
- I writer individuati (`0x080ba1d0`, `0x080ba447`, `0x080ba7c0`, `0x080ba7db`) appartengono a percorsi UI locali.
- BTAP/XzbLpr può provocare la stampa cucina; il caller identificato è `0x0807d6f6`.
- Nessuno dei comandi BTAP analizzati raggiunge il setter del testo libero o fornisce la stringa richiesta.

Le `kitchenNotes` restano persistenti in Nexus. Se in futuro emergerà documentazione vendor BTAP/XzbLpr relativa a un comando nativo free-text, il percorso potrà essere rivalutato.

## Vincoli architetturali

È vietato l'accesso diretto da Nexus alla KUBE fiscale. Il commit Kitchen Printing V2 Hybrid `1b70066` supporta due percorsi distinti:

```text
LEGACY_FUSION
Nexus → FUSION/PT15 → KUBE

NEXUS_DIRECT
Nexus → Connector → stampante NON fiscale
```

La KUBE deve rimanere sul percorso `LEGACY_FUSION`; `NEXUS_DIRECT` è riservato a stampanti non fiscali.
