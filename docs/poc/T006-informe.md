# T006 · Informe de la prueba de concepto técnica

| Campo | Valor |
|---|---|
| Fecha | 2026-10-13 |
| Cubre | R-01, R-10, R-13, R-14, RNF-21 |
| Equipo | PC de desarrollo con Windows 11 Home 10.0.26200, Node 24.21, Electron 44.7, PostgreSQL 16.15 |
| Código | Desechable: quedó en una carpeta temporal y no se sube al repositorio |
| Estado | **Parcial:** 2 puntos superados, 2 a medias y 2 pendientes de hardware |

## Resumen

| # | Punto | Resultado |
|---|---|---|
| 1 | Servidor como servicio de Windows (WinSW) en una VM con Defender, con la app de escritorio conectándose | ⏳ Pendiente: falta la VM Windows (T001) |
| 2 | Descubrimiento DNS-SD y por difusión en el hotspot de un celular real y con router, incluido el reinicio del hotspot | ⏳ Pendiente: necesita el celular y el router reales |
| 3 | Verificación de identidad del servidor (DT-18) en el transporte nativo de Electron y de Android | ✅ Electron · ⏳ Android (falta el Android SDK) |
| 4 | App en Android 7 con el WebView actualizado sin Play Store, y servicio en primer plano con la app cerrada | ◐ Parcial: el APK arranca en Android 7, pero el WebView de fábrica (Chromium 53) no ejecuta la interfaz; falta instalar el WebView ≥ 87 y probar el servicio |
| 5 | PDF A4 con Chromium | ✅ Superado, con un cambio en el plan (ver abajo) |
| 6 | Consumo de memoria base en la VM de 4 GB | ◐ Medido en la PC de desarrollo; falta repetirlo en la VM de 4 GB |

No hay ningún punto **fallido**. El único hallazgo que obliga a cambiar el plan (punto 5) ya está corregido en el plan §10.7.

## 3. Identidad del servidor en Electron (DT-18, DT-19)

**Montaje.**
- Una CA propia (EC P-256) y un certificado de servidor cuyo único nombre alternativo es `DNS:<uuid>.impocaribe`, **sin ninguna IP**.
- Un intruso con **otra CA** que emite un certificado con la misma identidad.
- Un certificado de la CA correcta, pero con **otra identidad**.
- Tres servidores HTTPS en `127.0.0.1`. El cliente se conecta **por IP**.

**Cliente.** Hace las peticiones con `net.fetch` de Electron (la red nativa, no la del WebView) y usa `session.setCertificateVerifyProc`. Acepta el certificado solo si se cumplen las tres condiciones:
- `checkIssued` y `verify` contra la CA aprendida;
- el nombre alternativo es igual a la identidad guardada;
- no se compara la IP.

| Servidor | Esperado | Obtenido |
|---|---|---|
| CA correcta, identidad correcta, por IP | Aceptar | ✅ Aceptado |
| CA intrusa, misma identidad | Rechazar | ✅ Rechazado (`net::ERR_FAILED`) |
| CA correcta, otra identidad | Rechazar | ✅ Rechazado (`net::ERR_FAILED`) |

**Conclusión:** DT-18 y DT-19 se pueden implementar en Electron tal como están en el plan.

**Pendiente:** la misma prueba en Android, con OkHttp y un `TrustManager` propio.

## 5. PDF A4 con Chromium

Se generó con Puppeteer una orden de prueba en HTML (A4, márgenes de 15 mm) cinco veces seguidas.

| Variante | Arranque | PDF (5 seguidos) | Memoria de Chromium (working set) |
|---|---|---|---|
| Chrome completo (`headless: true`) | 6,5 s | 938, 582, 920, 827 y 718 ms | **481 MB** ❌ (presupuesto: 300 MB) |
| `chrome-headless-shell` (`headless: 'shell'`) con un solo proceso de renderizado | 2,1 s | 829, 61, 57, 78 y 80 ms | **180 MB** ✅ |

- El archivo empieza por `%PDF-1.4`, con `MediaBox` de 595,92 × 841,92 pt. Es A4: Chromium redondea a 8,27 × 11,69 pulgadas.
- Con el Chrome completo se supera el presupuesto del plan §10.7. **Plan corregido:** el motor de PDF (T078) usa `chrome-headless-shell`.
- Con la variante ligera, generar un PDF dentro de la transacción de emisión (DT-06, R-02) cuesta menos de 100 ms con Chromium ya abierto, y unos 3 s en la primera emisión tras abrirlo.

## 6. Consumo de memoria base (medido en la PC de desarrollo)

| Componente | Medido | Presupuesto (plan §10.7) |
|---|---|---|
| Servidor Node (NestJS con `/health`, `--max-old-space-size=256`) en reposo | 79 MB | 300 MB |
| PostgreSQL 16 en reposo, sin configurar (7 procesos) | 24 MB privados | 400 MB |
| Chromium PDF (`chrome-headless-shell`) | 180 MB | 300 MB |
| App de escritorio Electron con la pantalla de prueba (4 procesos) | 324 MB de working set y 175 MB privados | 350 MB |

**Advertencias:**
- Son cifras de un esqueleto sin datos ni pantallas reales, en una máquina con más memoria.
- El working set de los servicios inactivos de Windows se recorta: PostgreSQL mostró 4 MB de working set. Por eso se usa la memoria privada.
- **Riesgo:** Electron ya roza su presupuesto con una sola pantalla. Hay que vigilarlo desde F0 (un solo proceso de renderizado, plan §10.7).

**Pendiente:** repetirlo en la VM de Windows 10 con 4 GB (tarea de rendimiento de F12, plan §10.7), con PostgreSQL configurado según el plan.

## 4. Android 7 (avance parcial)

En el emulador con Android 7.0 (imagen `google_apis` x86_64, API 24):
- El APK de depuración se instala y la actividad arranca.
- El WebView de fábrica es **Chromium 53.0.2785**, que no entiende el JavaScript compilado para Chromium 87 (`SyntaxError: Unexpected token ?`), así que la pantalla queda en blanco.

Esto confirma el riesgo R-10 y la necesidad de DT-15:
- comprobar la versión del WebView al iniciar y mostrar P-27 (T118);
- incluir el WebView actualizado en el paquete de instalación (T125).

**Pendiente:** instalar un WebView o Chrome ≥ 87 sin Play Store (la última versión compatible con Android 7 es la 119) y probar el servicio en primer plano con la app cerrada.

## Hallazgos de la fase FP que afectan a tareas futuras

- **Electron en ESM:** en el proceso principal no se puede usar `await app.whenReady()` en el nivel superior, porque el evento `ready` no llega hasta que el módulo termina de evaluarse y la app se queda sin ventana. Corregido en T003.
- **`ELECTRON_RUN_AS_NODE`:** los procesos que se lanzan desde una extensión de VS Code heredan esta variable, y Electron arranca entonces como Node. Hay que quitarla antes de abrir la app desde esos entornos.
- **Puertos reservados:** Windows (Hyper-V) reserva rangos de puertos (en este equipo, del 2853 al 3552). El ayudante de instalación (paso 0) debe comprobar que el 8443 no esté en un rango excluido (`netsh int ipv4 show excludedportrange`).

## Siguientes pasos para cerrar T006

1. Instalar el Android SDK y los emuladores (T001) y repetir el punto 3 en Android.
2. Crear la VM Windows 10 de 4 GB y hacer los puntos 1 y 6.
3. Con el celular dedicado y el router, hacer el punto 2.
4. Con un dispositivo o emulador Android 7 y el WebView sin Play Store, hacer el punto 4.
