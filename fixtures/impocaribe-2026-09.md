# Escenario real del Excel (T016)

| Campo | Valor |
|---|---|
| Fuente | Excel "Orden De Carga puerto habana ULTIMO2", tal como está en el prototipo aprobado (`docs/referencia/`) |
| Datos | `fixtures/impocaribe-2026-09.json` |
| Anonimización | Personas físicas como PARTICULAR A a D, choferes como CHOFER 01 a 65. Empresas, marcas, DM, pesos y fechas, sin cambios |
| Estado | **Pendiente de aprobación del responsable** |

Uso: T091 ejecuta estas 92 órdenes contra el sistema y compara con el resultado esperado de este documento (Const. art. XIII.8).

## Reglas de conversión

- Las toneladas de cada orden son su peso de patio; sin peso, el intento se rechaza (VALIDATION_ERROR).
- El total del buque Eagle 1 es la suma de los totales declarados de sus DM; cada DM con total se asigna completa al buque.
- La DM sin total queda pendiente: sus órdenes se rechazan (DECLARATION_PENDING_TOTAL).
- Cada orden se asocia a la DM por cliente y marca; si no coincide con ninguna, se rechaza (DM inexistente).
- Orden de comprobación: DM inexistente, sin toneladas, DM pendiente de total, sobregiro.
- Los números de DM se completan a 5 dígitos.
- Cada orden se emite en su fecha del Excel (fecha de emisión = fecha de carga); las DM se crean el 2026-09-04, día del arribo real, así que el plazo de 30 días no interviene.
- Las órdenes marcadas CANCELADA o CANCELADAS se emiten y se anulan enseguida con el motivo "Cancelada en el Excel"; si no tienen peso, quedan como intento rechazado.
- Las órdenes emitidas se numeran EAGLE1-2026-V1-0001 en adelante, en el orden de las filas: la segunda 516 recibe el siguiente número y los 517 a 520, que no existen en el Excel, no dejan hueco.
- El Excel no trae camiones: cada orden usa un camión sintético distinto con 34,000 t de capacidad, para que la capacidad (D4) y el camión repetido (D5) no intervengan.

## Buque

| Buque | Arribo real | Viaje | Total (suma de las DM con total) |
|---|---|---|---|
| Eagle 1 (EAGLE1) | 04/09/2026 | V1 | 2 700,500 t |

## Resultado esperado por DM

| DM | Cliente | Marca | Total | Cargado | Saldo | Estado |
|---|---|---|---|---|---|---|
| 00436 | PANNIS S.U.R.L. | ARMALIN ALMIRAL | 123,750 | 0,000 | 123,750 | Asignada |
| 00435 | GA&A S.R.L. | ARMALIN ALMIRAL | 19,750 | 17,440 | 2,310 | En extracción |
| 00437 | PARTICULAR A | DELICIA DYD | — | 0,000 | — | Pendiente de total |
| 00443 | PARTICULAR B | DELICIA DYD | 24,500 | 0,000 | 24,500 | Asignada |
| 00431 | NUEVOS TIEMPOS S.R.L. | DOSEL | 900,250 | 307,200 | 593,050 | En extracción |
| 00442 | GRUPO COMERCIAL RB S.R.L. | DOST (DO) | 118,750 | 0,000 | 118,750 | Asignada |
| 00434 | FUSION S.R.L. | KENLOQUIN POLACO | 631,500 | 127,740 | 503,760 | En extracción |
| 00433 | SLEO S.R.L. | PLANTIN 1 (p) | 24,750 | 0,000 | 24,750 | Asignada |
| 00432 | LOS SAAVEDRAS S.U.R.L. | PLANTIN 1 (p) | 24,750 | 0,000 | 24,750 | Asignada |
| 00439 | PARTICULAR C | YIN DYD | 412,500 | 176,720 | 235,780 | En extracción |
| 00441 | PARTICULAR D | YIN DYD | 172,000 | 0,000 | 172,000 | Asignada |
| 00440 | BOSCARGO S.U.R.L | YIN DYD | 248,000 | 71,360 | 176,640 | En extracción |

**Buque:** total 2 700,500 t · asignado 2 700,500 t · libre 0,000 t · cargado 700,460 t · restante 2 000,040 t.

**Órdenes:** 41 emitidas, 1 emitida y anulada, 50 rechazadas. Último número: EAGLE1-2026-V1-0042.

## Lo que demuestra frente a los errores del Excel

- **Número repetido (516 dos veces):** las dos órdenes reciben números distintos y consecutivos.
- **Saltos (517 a 520 no existen):** la numeración del sistema es correlativa, sin huecos.
- **Saldos negativos** (00437 con −223,18 y 00442 con −30,05 en el Excel): la 00437 no tiene total y sus órdenes se rechazan; las órdenes de la 00442 no tienen peso de patio. Ningún saldo queda negativo.
- **Cancelaciones sin rastro:** la 501, única cancelada con peso, se emite y se anula con motivo y autor; las demás canceladas no tienen peso y quedan como intentos rechazados.
- **Órdenes sin peso (38):** quedan registradas como intentos rechazados, no descuentan saldo.

## Resultado esperado por orden

| Fila | Nº Excel | Fecha | Cliente | Marca | Chofer | Peso (t) | Nota | DM | Resultado | Número o código |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 500 | 04/09/2026 | PARTICULAR C | YIN DYD | CHOFER 01 | 18,060 |  | 00439 | Emitida | EAGLE1-2026-V1-0001 |
| 3 | 501 | 04/09/2026 | PARTICULAR C | YIN DYD | CHOFER 02 | 17,320 | CANCELADAS | 00439 | Emitida y anulada | EAGLE1-2026-V1-0002 |
| 4 | 502 | 04/09/2026 | PARTICULAR C | YIN DYD | CHOFER 03 | 18,460 | OJO | 00439 | Emitida | EAGLE1-2026-V1-0003 |
| 5 | 503 | 05/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 04 | 17,240 |  | 00431 | Emitida | EAGLE1-2026-V1-0004 |
| 6 | 504 | 05/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 05 | 16,340 |  | 00431 | Emitida | EAGLE1-2026-V1-0005 |
| 7 | 505 | 05/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 06 | 17,180 |  | 00431 | Emitida | EAGLE1-2026-V1-0006 |
| 8 | 506 | 05/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 07 | 17,320 |  | 00431 | Emitida | EAGLE1-2026-V1-0007 |
| 9 | 507 | 05/09/2026 | PARTICULAR C | YIN DYD | CHOFER 08 | — | CANCELADA | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 10 | 508 | 05/09/2026 | PARTICULAR C | YIN DYD | CHOFER 09 | 17,520 |  | 00439 | Emitida | EAGLE1-2026-V1-0008 |
| 11 | 509 | 05/09/2026 | PARTICULAR C | YIN DYD | CHOFER 10 | 17,100 |  | 00439 | Emitida | EAGLE1-2026-V1-0009 |
| 12 | 510 | 05/09/2026 | PARTICULAR C | YIN DYD | CHOFER 11 | 17,340 |  | 00439 | Emitida | EAGLE1-2026-V1-0010 |
| 13 | 511 | 05/09/2026 | PARTICULAR D | ARMALIN ALMIRAL | CHOFER 12 | 17,600 |  | — | Rechazada | VALIDATION_ERROR (DM inexistente) |
| 14 | 512 | 05/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 13 | 16,820 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 15 | 513 | 05/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 13 | — | CANCELADA | 00437 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 16 | 514 | 05/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 14 | 17,960 |  | 00434 | Emitida | EAGLE1-2026-V1-0011 |
| 17 | 515 | 05/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 15 | 12,220 |  | 00434 | Emitida | EAGLE1-2026-V1-0012 |
| 18 | 516 | 05/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 16 | 17,240 |  | 00434 | Emitida | EAGLE1-2026-V1-0013 |
| 19 | 516 | 05/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 17 | 17,640 |  | 00434 | Emitida | EAGLE1-2026-V1-0014 |
| 20 | 521 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 18 | 17,280 |  | 00431 | Emitida | EAGLE1-2026-V1-0015 |
| 21 | 522 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 19 | 18,060 |  | 00431 | Emitida | EAGLE1-2026-V1-0016 |
| 22 | 523 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 20 | 17,200 |  | 00431 | Emitida | EAGLE1-2026-V1-0017 |
| 23 | 524 | 06/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 21 | 17,820 |  | 00434 | Emitida | EAGLE1-2026-V1-0018 |
| 24 | 525 | 06/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 14 | 17,460 |  | 00434 | Emitida | EAGLE1-2026-V1-0019 |
| 25 | 526 | 06/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 15 | 13,980 |  | 00434 | Emitida | EAGLE1-2026-V1-0020 |
| 26 | 527 | 06/09/2026 | PARTICULAR D | DELICIA DYD | CHOFER 22 | 18,020 |  | — | Rechazada | VALIDATION_ERROR (DM inexistente) |
| 27 | 528 | 06/09/2026 | PARTICULAR D | DELICIA DYD | CHOFER 23 | 18,040 |  | — | Rechazada | VALIDATION_ERROR (DM inexistente) |
| 28 | 529 | 06/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 13 | 18,080 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 29 | 530 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 24 | 17,180 |  | 00431 | Emitida | EAGLE1-2026-V1-0021 |
| 30 | 531 | 06/09/2026 | PARTICULAR C | YIN DYD | CHOFER 25 | 17,980 |  | 00439 | Emitida | EAGLE1-2026-V1-0022 |
| 31 | 532 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 26 | 16,420 |  | 00431 | Emitida | EAGLE1-2026-V1-0023 |
| 32 | 533 | 06/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 27 | 16,780 |  | 00431 | Emitida | EAGLE1-2026-V1-0024 |
| 33 | 534 | 06/09/2026 | PARTICULAR C | YIN DYD | CHOFER 09 | 16,800 |  | 00439 | Emitida | EAGLE1-2026-V1-0025 |
| 34 | 535 | 06/09/2026 | PARTICULAR C | YIN DYD | CHOFER 11 | 18,100 |  | 00439 | Emitida | EAGLE1-2026-V1-0026 |
| 35 | 536 | 06/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 28 | 16,800 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 36 | 537 | 06/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 29 | 17,240 |  | 00440 | Emitida | EAGLE1-2026-V1-0027 |
| 37 | 538 | 06/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 30 | 17,440 |  | 00440 | Emitida | EAGLE1-2026-V1-0028 |
| 38 | 539 | 06/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 31 | 18,260 |  | 00440 | Emitida | EAGLE1-2026-V1-0029 |
| 39 | 540 | 06/09/2026 | GA&A S.R.L. | ARMALIN ALMIRAL | CHOFER 32 | 17,440 |  | 00435 | Emitida | EAGLE1-2026-V1-0030 |
| 40 | 541 | 06/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 33 | 18,420 |  | 00440 | Emitida | EAGLE1-2026-V1-0031 |
| 41 | 542 | 06/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 34 | 16,540 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 42 | 543 | 06/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 35 | 17,200 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 43 | 544 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 06 | 17,200 |  | 00431 | Emitida | EAGLE1-2026-V1-0032 |
| 44 | 545 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 05 | 16,700 |  | 00431 | Emitida | EAGLE1-2026-V1-0033 |
| 45 | 546 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 36 | 18,160 |  | 00431 | Emitida | EAGLE1-2026-V1-0034 |
| 46 | 547 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 37 | 16,660 |  | 00431 | Emitida | EAGLE1-2026-V1-0035 |
| 47 | 548 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 15 | 13,420 |  | 00434 | Emitida | EAGLE1-2026-V1-0036 |
| 48 | 549 | 07/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 13 | 17,480 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 49 | 550 | 07/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 38 | 17,520 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 50 | 551 | 07/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 39 | 17,340 |  | 00437 | Rechazada | DECLARATION_PENDING_TOTAL (DM pendiente de total) |
| 51 | 552 | 07/09/2026 | PARTICULAR C | YIN DYD | CHOFER 10 | 17,780 |  | 00439 | Emitida | EAGLE1-2026-V1-0037 |
| 52 | 553 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 40 | 16,600 |  | 00431 | Emitida | EAGLE1-2026-V1-0038 |
| 53 | 554 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 41 | 17,080 |  | 00431 | Emitida | EAGLE1-2026-V1-0039 |
| 54 | 555 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 42 | 16,640 |  | 00431 | Emitida | EAGLE1-2026-V1-0040 |
| 55 | 556 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 43 | 17,160 |  | 00431 | Emitida | EAGLE1-2026-V1-0041 |
| 56 | 557 | 07/09/2026 | PANNIS S.U.R.L. | ARMALIN ALMIRAL | CHOFER 44 | — |  | 00436 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 57 | 558 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 45 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 58 | 559 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 21 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 59 | 560 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 46 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 60 | 561 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 47 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 61 | 562 | 07/09/2026 | PARTICULAR C | YIN DYD | CHOFER 31 | 17,580 |  | 00439 | Emitida | EAGLE1-2026-V1-0042 |
| 62 | 563 | 07/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 33 | — |  | 00440 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 63 | 564 | 07/09/2026 | PANNIS S.U.R.L. | ARMALIN ALMIRAL | CHOFER 12 | — |  | 00436 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 64 | 565 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 48 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 65 | 566 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 49 | — | CANCELADA | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 66 | 567 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 50 | — | CANCELADA | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 67 | 568 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 51 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 68 | 569 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 52 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 69 | 570 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 53 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 70 | 571 | 07/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 54 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 71 | 572 | 07/09/2026 | PARTICULAR C | YIN DYD | CHOFER 55 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 72 | 573 | 07/09/2026 | PARTICULAR C | YIN DYD | CHOFER 56 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 73 | 574 | 07/09/2026 | PARTICULAR C | YIN DYD | CHOFER 57 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 74 | 575 | 07/09/2026 | GRUPO COMERCIAL RB S.R.L. | DOST (DO) | CHOFER 58 | — |  | 00442 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 75 | 576 | 07/09/2026 | GRUPO COMERCIAL RB S.R.L. | DOST (DO) | CHOFER 59 | — |  | 00442 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 76 | 577 | 07/09/2026 | GRUPO COMERCIAL RB S.R.L. | DOST (DO) | CHOFER 60 | — |  | 00442 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 77 | 578 | 07/09/2026 | GRUPO COMERCIAL RB S.R.L. | DOST (DO) | CHOFER 61 | — |  | 00442 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 78 | 579 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 24 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 79 | 580 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 06 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 80 | 581 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 05 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 81 | 582 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 37 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 82 | 583 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 36 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 83 | 584 | 07/09/2026 | NUEVOS TIEMPOS S.R.L. | DOSEL | CHOFER 62 | — |  | 00431 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 84 | 585 | 08/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 13 | — |  | 00437 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 85 | 586 | 08/09/2026 | PARTICULAR A | DELICIA DYD | CHOFER 34 | — |  | 00437 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 86 | 587 | 08/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 51 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 87 | 588 | 08/09/2026 | PARTICULAR C | YIN DYD | CHOFER 02 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 88 | 589 | 08/09/2026 | PARTICULAR C | YIN DYD | CHOFER 01 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 89 | 590 | 08/09/2026 | FUSION S.R.L. | KENLOQUIN POLACO | CHOFER 45 | — |  | 00434 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 90 | 591 | 08/09/2026 | PARTICULAR C | YIN DYD | CHOFER 59 | — |  | 00439 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 91 | 592 | 08/09/2026 | BOSCARGO S.U.R.L | YIN DYD | CHOFER 63 | — |  | 00440 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 92 | 593 | 08/09/2026 | PANNIS S.U.R.L. | ARMALIN ALMIRAL | CHOFER 64 | — |  | 00436 | Rechazada | VALIDATION_ERROR (Intento sin toneladas) |
| 93 | 594 | 08/09/2026 | — | — | — | — |  | — | Rechazada | VALIDATION_ERROR (DM inexistente) |
