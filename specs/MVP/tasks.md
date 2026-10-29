# Tareas 001: MVP del Sistema de Órdenes de Carga

| Campo | Valor |
|---|---|
| Versión | 1.1.0 |
| Fecha | 2026-10-12 |
| Spec | `spec.md` 1.0.0 y `ui-spec.md` 1.0.0 |
| Plan | `plan.md` 1.1.0 |
| Constitución | 1.0.0 |
| Estado | Aprobado · listo para implementación |

## Mapa de lectura para el agente

Los artefactos suman unas 3 800 líneas. Antes de cada tarea se leen **siempre** la Constitución y la propia tarea, y además lo que indica su fase:

| Fase | Leer de la spec | Leer de `ui-spec.md` | Leer del plan |
|---|---|---|---|
| FP | §1, §2 | — | §2, §3, §10.7, §12, §13 |
| F0 | §2, §3, 5.19, 5.23 | §1 a §3, §5 | §1 a §3, §7, §8, §11 |
| F1 | 5.1 a 5.3, 5.21 | P-01 a P-05, P-21, P-30, F-01 a F-04 | §4.2 (usuarios, dispositivos), §6, §9 |
| F2 | 5.16 | §1.2, §2 | §4.4, §5.9, §6.4, §7.1 |
| F3 | 5.4, 5.18 | P-22, P-23, F-05, F-06 | §4.2 (empresa), §6.2 |
| F4 | 5.9 | P-18 a P-20, F-11 a F-13 | §4.2 (catálogos) |
| F5 | 5.5 a 5.8, §6 | P-07 a P-11, F-07 a F-10 | §4.2 y §4.3, §5.5 a §5.7, §5.11 |
| F6 | 5.10, 5.11 | P-13 a P-16, F-14, F-15 | §5.1 a §5.4, §5.8, §8.1 |
| F7 | 5.13 | P-17 | §4.2 (alertas), §6.4 |
| F8 | 5.12, 5.14 | P-06, P-12, P-25, P-32 | §6.2 |
| F9 | 5.15 | P-24, F-16 | §5.10, §10.4 |
| F10 | 5.17, RF-UI-11 | P-26, P-27 | §10.1, §10.2 |
| F11 | 5.20 a 5.22 | P-28 a P-31, F-16 | §10.3, §10.5 a §10.7 |
| F12 | Todo | Todo | §11 |

Si algo de la tarea no está en las secciones indicadas, se busca por su identificador (RF, P, F, DT…) en el documento correspondiente.

## Reglas de ejecución

1. Las tareas se ejecutan **en orden de ID**. Las marcadas **[∥]** pueden hacerse en paralelo con la anterior.
2. Una tarea no empieza hasta que sus dependencias estén terminadas.
3. Cada tarea se trabaja en su propia rama (`tNNN-descripcion`) siguiendo el flujo del plan §13.3, y es pequeña y cerrada: se hace commit con su ID (`T078: …`).
4. Si una tarea revela un error en la spec o en el plan, primero se corrige el documento y después el código.
5. **Construir interfaces es parte del trabajo, no un añadido.** Ninguna fase se cierra sin las pantallas de sus funciones, en teléfono, tablet y escritorio (Constitución, Artículo XIV).

## Reglas de pruebas (Constitución, Artículo XIII)

**Las pruebas confirman que el código cumple la spec. El código nunca se escribe para "pasar las pruebas".** Si el código hace pasar las pruebas sin cumplir la spec, la tarea **no** está terminada.

En **toda** tarea con código, el orden es:

1. Leer los requisitos que cubre la tarea (spec y `ui-spec.md`).
2. Escribir las pruebas con los valores esperados **calculados a mano desde la spec**.
3. Comprobar que **fallan** por falta de la funcionalidad.
4. Implementar según la spec.
5. Ejecutar `pnpm verify`.

**Prohibido:**
- casos especiales para datos de prueba;
- aserciones débiles;
- `skip`, `only` o `todo`;
- simular el módulo probado, o la base de datos en integración;
- simular el hook de la pantalla que se prueba;
- cambiar valores esperados sin citar el cambio de spec;
- tragar errores.

## Paquete de pantalla (PP)

Toda tarea marcada **(PP)** construye una o más pantallas de `ui-spec.md` y solo se termina cuando cumple **los 10 puntos**:

1. **Maqueta aprobada** de teléfono, tablet y escritorio (tarea de maquetas de su fase).
2. **Hook de lógica** (`use<Pantalla>.ts`) con sus pruebas escritas primero: datos de la copia local, acciones, validaciones, permisos y estados EST-01 a EST-07.
3. **Tres presentaciones** (`.phone.tsx`, `.tablet.tsx`, `.desktop.tsx`) según `ui-spec.md` §1.1 y la ficha de la pantalla, sin lógica (lo verifica un lint).
4. **Movimiento** con los presets MOV correspondientes y su variante reducida.
5. **Historias de Storybook** de cada estado, en las tres clases y en los dos temas.
6. **Pruebas de componente:** estados, permisos por rol, mensajes de error del catálogo, movimiento presente y movimiento reducido.
7. **Contrato en verde** para todas las llamadas que usa la pantalla.
8. **Prueba de extremo a extremo contra el servidor y PostgreSQL reales** con el criterio de aceptación de la ficha en `ui-spec.md`, en las tres clases, **verificando el efecto directamente en la base de datos**, en la bitácora y, cuando aplica, en la copia local de un segundo usuario.
9. **Referencias visuales aprobadas** (estados clave, dos temas, tres clases) y cumplimiento de RNF-16.
10. **Validación de campos** según el catálogo de `ui-spec.md` §6: cada regla, advertencia y ayuda de sus formularios, en el momento de RF-VAL-02, con pruebas de componente; y el esquema compartido usado también por el servidor.

**Excepción:** las pantallas exclusivas de la PC servidor (P-28, P-29 y P-31) existen solo en escritorio, así que para ellas el PP se aplica solo a escritorio.

## Esquemas de validación

Toda tarea de servidor que crea o edita datos implementa, en `shared/validation`, el esquema del formulario F-xx correspondiente del catálogo de campos, con pruebas de cada regla y de sus límites exactos. La interfaz usa después ese mismo esquema.

## Tareas con aclaraciones pendientes

- **ACLARAR-23** (verificación legal del plazo): no bloquea ninguna tarea, porque el texto del aviso es configurable. Si la verificación cambiara la **regla** del plazo, se corrige primero la spec.

## Definición de terminado de cada tarea

Además del criterio propio de la tarea:
- pruebas escritas primero y vistas fallar;
- oráculo desde la spec;
- `pnpm verify` en verde, con mutación ≥ 90 % en los módulos críticos y cobertura ≥ 85 %;
- bitácora y sincronización de las acciones nuevas;
- mensajes en español;
- **PP completo** si la tarea es de pantalla.

**Formato:** `Cubre` = requisitos · `Depende` = tareas previas · `Pruebas` = lo mínimo que debe demostrarse · `Terminado` = aceptación.

| Fase | Contenido | Tareas |
|---|---|---|
| FP | Creación del proyecto | T001 – T006 |
| F0 | Fundaciones, calidad y base de interfaz | T007 – T026 |
| F1 | Autenticación y usuarios | T027 – T041 |
| F2 | Sincronización base y copia local | T042 – T049 |
| F3 | Empresa, firma, cuño y configuración | T050 – T054 |
| F4 | Catálogos | T055 – T059 |
| F5 | Buques, DM y asignaciones | T060 – T072 |
| F6 | Órdenes, numeración y PDF | T073 – T091 |
| F7 | Alertas | T092 – T098 |
| F8 | Tablero, búsqueda y bitácora | T099 – T104 |
| F9 | Respaldo y restauración | T105 – T112 |
| F10 | Cascarones y actualizaciones | T113 – T123 |
| F11 | Servidor desde la app, red, energía y despliegue | T124 – T137 |
| F12 | Verificación final | T138 – T145 |

---

## FP. Creación del proyecto

El código empieza desde cero. Esta fase deja el proyecto creado, el entorno listo, la integración continua funcionando y los riesgos técnicos despejados antes de escribir la primera regla de negocio.

- [ ] **T001. Entorno de desarrollo.** Instalar y documentar en `docs/desarrollo.md` todo lo del plan §13.1, y crear el script `pnpm run doctor`, que comprueba versiones de Node, pnpm, Git, PostgreSQL, JDK, Android SDK y emuladores, y explica cómo corregir lo que falte.
  - *Cubre:* plan §13.1
  - *Depende:* —
  - *Terminado:* `pnpm run doctor` en verde en el equipo de desarrollo; los emuladores Android 7 y 14 arrancan; las máquinas virtuales Windows existen.
  - *Estado (2026-10-14):* `pnpm run doctor` en verde: Node, pnpm, Git, PostgreSQL 16, JDK 21, Android SDK (en `D:\Android`) y emuladores de API 24 y 34, que arrancan con aceleración WHPX. Solo faltan las máquinas virtuales Windows (aplazadas por decisión del responsable).

- [x] **T002. Repositorio.** Inicializar Git con la estructura del plan §13.2: `README.md`, `Constitution.md` y `specs/` en su sitio, el prototipo aprobado en `docs/referencia/`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`, plantilla de solicitud de integración con la definición de terminado y convención de ramas y commits (plan §13.3).
  - *Cubre:* plan §13.2, §13.3
  - *Depende:* T001
  - *Terminado:* el primer commit `T002: …` contiene la estructura; un archivo `.env` creado a propósito queda ignorado por Git.

- [ ] **T003. Esqueleto del monorepo.** Espacios de trabajo pnpm (`shared`, `server`, `web`, `desktop`, `android`) con `tsconfig.base.json` en modo `strict`, ESLint y Prettier, y en cada paquete el mínimo que arranca:
  - `shared`: biblioteca que exporta una función de ejemplo;
  - `server`: NestJS que responde `GET /api/v1/health`;
  - `web`: React + Vite que muestra "Órdenes de Carga" y la usa;
  - `desktop`: Electron que abre el build de `web` con el protocolo `app://`;
  - `android`: proyecto Capacitor que genera un APK de depuración con el build de `web`.

  Scripts raíz `dev`, `build`, `test`, `lint`, `typecheck`, `verify` y `doctor`.
  - *Cubre:* Const. §5, plan §3.1
  - *Depende:* T002
  - *Terminado:* `pnpm verify` en limpio; el servidor responde; la web, la app de escritorio y el APK en el emulador Android 7 muestran la pantalla de prueba.
  - *Estado (2026-10-14):* `pnpm verify` en verde; el servidor responde; la web y la app de escritorio muestran la pantalla; el APK de depuración (minSdk 24) se instala y muestra la pantalla en el emulador de Android 14. En el de Android 7 el APK arranca, pero su WebView de fábrica (Chromium 53 < 87, DT-15) no ejecuta la interfaz: falta instalarle un WebView ≥ 87 (punto 4 de T006, T118 y T125).

- [x] **T004. Configuración y base de datos de desarrollo.** Carga de configuración por entorno (`development`, `test`, `production`) a partir de variables y de `.env`; scripts `db:create`, `db:migrate`, `db:reset` y `db:seed` (datos sintéticos de desarrollo); carpeta de datos de desarrollo fuera del repositorio.
  - *Cubre:* plan §13.2
  - *Depende:* T003
  - *Terminado:* `pnpm db:reset && pnpm db:seed` deja una base lista; las pruebas usan una base aparte que nunca toca la de desarrollo.

- [x] **T005. Integración continua.** Trabajos del plan §13.4 (verificación en Linux con PostgreSQL 16, compilación en Windows, APK en Linux y trabajo nocturno), con caché de dependencias; integración en `main` bloqueada si algo falla. Hasta tener un servicio de CI, hook previo al envío que ejecuta `pnpm verify`.
  - *Cubre:* plan §13.4
  - *Depende:* T004
  - *Terminado:* un commit que rompe una prueba se marca en rojo y no puede integrarse.

- [ ] **T006. Prueba de concepto técnica (desechable).** Antes de construir en serio, comprobar en el terreno los riesgos que la documentación no puede resolver, con código mínimo que luego se descarta:
  1. el servidor de prueba como servicio de Windows (WinSW) en una VM con Defender activo, y la app de escritorio conectándose a él;
  2. descubrimiento por DNS-SD y por difusión en el **hotspot del celular real** y con un router, incluido el reinicio del hotspot;
  3. verificación de identidad del servidor (DT-18) en el transporte nativo de Electron y de Android;
  4. la app en un Android 7 con el WebView actualizado sin Play Store, y el servicio en primer plano recibiendo un mensaje con la app cerrada;
  5. generación de un PDF A4 con Chromium;
  6. consumo de memoria base (PostgreSQL, Node, Chromium y la app) en la VM de 4 GB.
  - *Cubre:* R-01, R-10, R-13, R-14, RNF-21
  - *Depende:* T003
  - *Terminado:* informe con el resultado de cada punto. Si alguno falla, se corrige primero el plan (y, si hace falta, la spec) antes de seguir con la fase F0.
  - *Estado (2026-10-14):* informe parcial en `docs/poc/T006-informe.md`. Superados los puntos 3 (Electron) y 5. Parciales: el punto 4 (el APK arranca en Android 7, falta el WebView ≥ 87 y el servicio en primer plano) y el punto 6 (medido en la PC de desarrollo). Pendientes de hardware: los puntos 1 y 2, el punto 3 en Android y el punto 6 en la VM de 4 GB.

## F0. Fundaciones, calidad y base de interfaz

- [x] **T007. Barreras de calidad.**
  - Vitest con cobertura, fast-check y Stryker (90 % en los módulos críticos del plan §11.2).
  - Lint de pruebas y lint de producción (plan §11.3), incluidos el de **presentaciones sin lógica** y el de **movimiento barato**.
  - Hook de commit que exige el motivo al cambiar una prueba existente.
  - `pnpm verify` falla si no se cumplen los umbrales.
  - *Cubre:* Const. art. XIII, plan §11.3
  - *Depende:* T003
  - *Pruebas:* cada barrera se demuestra fallando con un ejemplo prohibido. Los ejemplos se borran después.

- [x] **T008. Aritmética de toneladas.**
  - *Cubre:* Const. art. V, RNF-05
  - *Depende:* T007
  - *Pruebas:* `0,1 + 0,2 = 0,300`; rechazo de 4 decimales; `1 234,500`; propiedad `(a + b) − b = a`.
  - *Terminado:* mutación ≥ 90 %.

- [x] **T009. Errores y permisos.**
  - *Cubre:* Spec §2, plan §6.3
  - *Depende:* T007
  - *Pruebas:* matriz rol × acción celda por celda; Solo lectura no ve borradores.

- [x] **T010. Reloj inyectable.**
  - *Cubre:* RF-CON-10, plan §11.4
  - *Depende:* T007

- [x] **T011. Servidor base.** NestJS, `health` con `serverTime`, errores 6.1, Zod, `helmet`, CORS y control 426.
  - *Cubre:* plan §6, DT-11
  - *Depende:* T009, T010

- [x] **T012. Base de datos.** Drizzle, roles, migración inicial, `assert_append_only()` y base limpia por suite.
  - *Cubre:* plan §4, Const. art. IV
  - *Depende:* T011

- [x] **T013. Bitácora.**
  - *Cubre:* RF-BIT-01, 02, D10
  - *Depende:* T012
  - *Pruebas:* `UPDATE` y `DELETE` fallan; un intento rechazado queda con `ok = false`.

- [x] **T014. Registro de cambios.**
  - *Cubre:* DT-04
  - *Depende:* T012
  - *Pruebas:* 50 transacciones concurrentes sin huecos visibles; una transacción revertida no deja cambios.

- [x] **T015. Idempotencia, concurrencia optimista y dispositivo obligatorio.** Tabla `idempotency_keys` con el resultado guardado en la misma transacción, header `Idempotency-Key` obligatorio en escrituras, `row_version` y `expectedVersion` en ediciones (`STALE_RECORD`), y guarda de dispositivo (DT-24) preparada para activarse con el emparejamiento.
  - *Cubre:* RF-ORD-23, RF-DM-12, D15, DT-22, DT-23, DT-24
  - *Depende:* T014
  - *Pruebas:* la misma petición 5 veces en paralelo produce un solo efecto y la misma respuesta; la misma clave con otro contenido da `IDEMPOTENCY_MISMATCH`; dos ediciones con la misma versión: una gana y la otra recibe `STALE_RECORD`.

- [x] **T016. Escenario real del Excel.** Fixture con las 12 DM y las 92 órdenes, y su resultado esperado calculado a mano. Reglas de conversión: las toneladas de cada orden son su peso de patio; las órdenes sin peso se registran como intentos sin toneladas (rechazados); el total del buque Eagle 1 es la suma de los totales declarados de sus DM; las DM sin total quedan pendientes; los números de DM se completan a 5 dígitos; cada orden se asocia a la DM por cliente y marca, y las que no coinciden con ninguna DM (por ejemplo, las de Jorge Luis Vázquez Herrera con marcas ARMALIN ALMIRAL o DELICIA DYD) son intentos rechazados por "DM inexistente"; la segunda orden 516 recibe el siguiente número de la secuencia; las órdenes marcadas "CANCELADA" se emiten y luego se anulan con el motivo "Cancelada en el Excel"; el arribo real del Eagle 1 es el 04/09/2026.
  - *Cubre:* Const. art. XIII.8
  - *Depende:* T008
  - *Terminado:* aprobado por el responsable.
  - *Estado (2026-10-14):* `fixtures/impocaribe-2026-09.json` (anonimizado, a partir del prototipo, porque no hay Excel aparte) y `fixtures/impocaribe-2026-09.md` con las reglas, los supuestos añadidos y el resultado esperado fila por fila. Aprobado por el responsable.

- [x] **T017. Maquetas base.** Sistema de diseño renovado sobre el prototipo (paleta, tipografía, componentes, tema oscuro), `AppShell` de teléfono, tablet y escritorio, los siete estados EST, los patrones MOV y los **estados de un campo** (ayuda, error, advertencia, aviso legal, correcto) y el resumen de errores, ilustrados.
  - *Cubre:* RF-UI-02, 03, 04, 05, 09, `ui-spec.md` §1 a §3
  - *Depende:* —
  - *Terminado:* aprobadas por el responsable.
  - *Estado (2026-10-14):* `docs/maquetas/T017-base.html`, aprobadas por el responsable.

- [x] **T018. Tokens, tema y Storybook.** Tokens del plan §7.2 como variables CSS y constantes, tema claro y oscuro, Storybook con selector de clase de dispositivo y de tema.
  - *Cubre:* RF-UI-03, RNF-06
  - *Depende:* T017, T008
  - *Pruebas:* contraste AA de todos los pares de color de texto y fondo, en ambos temas (prueba automática).
  - *Estado (2026-10-14):* colores, tipografía, espaciado (`--s-*`), radios, sombras y duraciones de movimiento (`--dur-*`, que usan los presets de `motion/`) como constantes y variables CSS; contraste AA comprobado en 22 pares por tema, incluidos los de los componentes de T023.

- [x] **T019. Adaptador de plataforma.** `platform.ts` con `deviceInfo` e implementación de prueba (`sql.js`).
  - *Cubre:* DT-03
  - *Depende:* T018

- [x] **T020. Cliente de API.** Bearer, `X-App-Version`, `X-Device-Time`, errores, 401, 426 y 410. Genera el **registro de llamadas** usado por la prueba de contrato.
  - *Cubre:* DT-05, DT-11
  - *Depende:* T011, T019

- [x] **T021. Transporte seguro e identidad (cliente).** Contrato de `platform.http` y `platform.ws`, lógica pura de verificación (cadena hasta la CA aprendida y nombre alternativo igual a la identidad guardada, sin comparar la IP), e implementación de pruebas en Node con la misma verificación.
  - *Cubre:* DT-18, DT-19, RF-RED-03
  - *Depende:* T020
  - *Pruebas:* un certificado de otra CA se rechaza; uno de la CA correcta con otra identidad se rechaza; la identidad correcta en una IP distinta se acepta.
  - *Estado (2026-10-14):* la verificación y el transporte HTTP de Node están en `@impocaribe/shared/node`. El equivalente de Node de `platform.ws` se hace en T043, con el servidor WebSocket contra el que probarlo.

- [x] **T022. Movimiento.** `MotionProvider` (`LazyMotion`, `MotionConfig`, preferencia "Reducir animaciones"), presets MOV-01 a MOV-10 con su variante reducida y `AnimatedIcon` (Lucide) con los estados de MOV-08.
  - *Cubre:* RF-UI-05, 06, DT-13, DT-14
  - *Depende:* T018
  - *Pruebas:* con movimiento reducido (del sistema o del usuario), cada preset produce la variante reducida; ninguna duración supera la máxima de `ui-spec.md` §3; el lint de movimiento rechaza un preset que anima `height`.
  - *Estado (2026-10-14):* presets MOV-01 a MOV-13 (MOV-05 incluido, aplicado en `Field`) y `AnimatedIcon` con historia propia; la variante reducida se prueba con la preferencia del sistema y con la del usuario.

- [x] **T023. Componentes base.** La lista del plan §7.2, cada uno con historias de todos sus estados y pruebas de componente: estados, teclado y foco, objetivos táctiles de 48 dp en teléfono y tablet, y movimiento.
  - *Cubre:* RF-UI-03 a 08, RNF-16
  - *Depende:* T022
  - *Pruebas:* `Sheet` se cierra al arrastrar hacia abajo más del umbral y no por debajo; `DataTable` virtualiza por encima de 100 filas y no anima reordenamientos ahí; `OverrideDialog` no permite confirmar con menos de 10 caracteres de motivo.
  - *Terminado:* referencias visuales de los componentes aprobadas.
  - *Estado (2026-10-14):* componentes en `packages/web/src/ui/` (`controls`, `presentation`, `overlays` y `structure`, con `ui.css`), 78 pruebas de componente en verde e historias de todos los estados, con selectores de tema, clase de dispositivo y movimiento en Storybook. Las reglas de F-15 están en `@impocaribe/shared/validation`. `PdfViewer` se hace con su pantalla, en T088. Referencias visuales (`packages/web/e2e/visual/references/`) aprobadas por el responsable el 2026-10-14; `Card` y los objetivos táctiles en tablet tienen prueba propia.

- [x] **T024. Sistema de validación de formularios.** `Field` (mensaje único con prioridad error → advertencia → ayuda, marca de correcto), `ErrorSummary`, `LegalNotice`, máscaras de entrada (dígitos, mayúsculas, teléfono, toneladas), `useValidatedForm` y `UnsavedChangesGuard`, con los movimientos MOV-11 a MOV-13 y su variante reducida.
  - *Cubre:* RF-VAL-01 a 03, 07, 09 a 11, Const. art. XIV.9, plan §7.7, HU-18
  - *Depende:* T023
  - *Pruebas:* un campo no muestra error mientras se escribe por primera vez y sí al salir; tras marcarse, el error desaparece al corregir sin salir; al enviar, el foco va al primer error y el resumen enlaza a cada campo; un error del servidor con `details.fields` aparece en su campo; salir con cambios pregunta y sin cambios no; con movimiento reducido no hay temblor.

- [x] **T025. Clases de dispositivo y AppShell.** `useDeviceClass` y los tres `AppShell` de `ui-spec.md` §1.1 (barra inferior y hoja "Más"; riel y vista dividida; menú lateral, cabecera y atajos), con los elementos globales de §1.2.
  - *Cubre:* RF-UI-02, `ui-spec.md` §1
  - *Depende:* T023
  - *Pruebas:* 599 dp da teléfono y 600 dp da tablet; Electron siempre escritorio; los atajos de escritorio navegan; Solo lectura no ve "Nueva orden" en ninguna clase.

- [x] **T026. Infraestructura de pruebas de interfaz.**
  - **Contrato:** registro de llamadas de `web` contra las rutas y esquemas del servidor.
  - **Componente:** utilidades con la copia local en `sql.js` y respuestas generadas desde los esquemas Zod.
  - **Extremo a extremo:** Playwright contra el servidor y PostgreSQL reales, con dos usuarios, consultas directas a la base y perfiles de teléfono, tablet y escritorio.
  - **Visual:** capturas por pantalla, estado, tema y clase.
  - *Cubre:* plan §7.6, §11.2
  - *Depende:* T020, T025, T014
  - *Pruebas:* una pantalla de ejemplo con una llamada inexistente en el servidor hace fallar el contrato; un cambio de un píxel en una referencia visual se detecta.
  - *Estado (2026-10-14):* contrato en `scripts/quality/contract.test.ts` (rutas con `@Contract`, llamadas con `defineEndpoint`); `createFakeServer` y `sampleOf` en `packages/web/test/`; `pnpm e2e` (Playwright, base `impocaribe_e2e_test`, tres clases) y `pnpm visual` (Storybook, sin tolerancia), con Chrome for Testing 155 fijo. La CI de Linux ejecuta el extremo a extremo; la regresión visual corre en `pnpm verify` en Windows, porque sus referencias son de Windows. Detalle en `docs/desarrollo.md` §5.1.

## F1. Autenticación y usuarios

- [x] **T027. Tablas de usuarios y sesiones.** Carné único de 11 dígitos y teléfono de 8 dígitos (se guarda sin `+53`).
  - *Cubre:* RF-USR-01
  - *Depende:* T013
  - *Pruebas:* `+53 52345678` se guarda como `52345678`; 7 dígitos se rechazan.

- [x] **T028. Primer arranque**, solo desde `127.0.0.1` (la propia PC servidor).
  - *Cubre:* RF-USR-05, RF-REC-01
  - *Depende:* T027

- [x] **T029. Login y sesiones absolutas.** Bloqueo, revocación por contraseña, desactivación y cambio de rol.
  - *Cubre:* RF-AUT-01 a 07, 10
  - *Depende:* T028
  - *Pruebas:* expira a las 24:00 h exactas aunque haya actividad; el 5.º fallo bloquea y el 4.º no.

- [x] **T030. Recuperación de contraseña.**
  - *Cubre:* RF-REC-02 a 05
  - *Depende:* T029
  - *Estado (2026-10-15):* recuperación con 8 comprobaciones argon2id siempre y el mismo error para cualquier dato, exista o no el usuario; la alerta AL-11 se emite con el motor de alertas (T093).

- [x] **T031. Gestión de usuarios.**
  - *Cubre:* RF-USR-02 a 04, RF-REC-06
  - *Depende:* T029

- [x] **T032. Token de dispositivo.**
  - *Cubre:* DT-05
  - *Depende:* T029
  - *Estado (2026-10-15):* T027 a T032 revisados por una auditoría adversarial; sus 10 hallazgos confirmados están corregidos con pruebas (bfaabbf).

- [x] **T033. Identidad del servidor y certificado.** UUID, nombre `IMPOCARIBE-XXXX`, CA de la instalación y certificado por identidad, guardados con la protección de datos de Windows; el servidor arranca con ellos.
  - *Cubre:* DT-18, RF-RED-03
  - *Depende:* T011
  - *Pruebas:* el certificado no contiene ninguna IP; regenerar la identidad sin borrar la anterior es imposible sin la acción explícita del ayudante.
  - *Estado (2026-10-15):* `server/src/identity/`: CA y certificado ECDSA P-256 con `@peculiar/x509` (DT-26), claves protegidas con DPAPI de la máquina (PowerShell, sin dependencias nativas); el servidor sirve HTTPS con ella y en producción no arranca sin ella. `pnpm --filter @impocaribe/server identity:create` crea la de desarrollo.

- [x] **T034. Descubrimiento: anuncio del servidor.** Servicio DNS-SD `_impocaribe._tcp`, respuesta a difusión UDP 47800 y `GET /discovery`.
  - *Cubre:* RF-RED-02, DT-20 
  - *Depende:* T033
  - *Pruebas:* el anuncio incluye identidad, versión y huella; la respuesta a difusión no revela nada más.
  - *Estado (2026-10-15):* `server/src/discovery/`: DNS-SD con `multicast-dns` (DT-27) en cada interfaz IPv4 de la red local (con varias tarjetas, Windows envía la multidifusión por una sola), revisadas cada 10 s; difusión UDP 47800 que solo responde a su sonda; `GET /discovery`.

- [x] **T035. Emparejamiento: servidor.** Tablas `devices` y `pairing_requests`, código de comparación, token de QR, caducidad a los 5 min, endpoints `/local/*` solo desde `127.0.0.1`, revocación y secreto por dispositivo exigido junto a la sesión. Activa la guarda de dispositivo de DT-24 en todos los endpoints; la app de la PC servidor se empareja sola por `/local`.
  - *Cubre:* RF-RED-04, 05
  - *Depende:* T033, T029
  - *Pruebas:* `/local/*` desde otra IP responde 403; un código caducado no se puede confirmar; un QR no sirve dos veces; un dispositivo revocado recibe `DEVICE_REVOKED` y `device.revoked`.
  - *Estado (2026-10-15):* guarda de dispositivo activa en toda la API (salvo health, discovery, pairing y /local, que solo atiende a 127.0.0.1); la sesión solo vale desde su dispositivo; `device.revoked` sale por el bus interno `ServerEvents`, que el WebSocket (T043) reenviará. Las pruebas de integración firman cada petición como un dispositivo emparejado (`t.fetch`).

- [x] **T036. Descubrimiento y emparejamiento: cliente.** Lógica de los métodos en orden (última dirección, DNS-SD, difusión, subred, QR o manual), redescubrimiento tras cambio de IP, cálculo del código y almacenamiento de la identidad y la huella. Interfaz `platform.discovery` con implementación de prueba.
  - *Cubre:* RF-RED-02 a 04, RNF-17
  - *Depende:* T021, T034, T035
  - *Pruebas:* con multidifusión bloqueada cae a difusión y luego a la subred; tras cambiar la IP del servidor, lo vuelve a encontrar en menos de 10 s; un intermediario produce códigos distintos en cada extremo.
  - *Estado (2026-10-15):* `web/src/connection/`: búsqueda en orden con presupuesto de 9,2 s, solo la identidad emparejada; emparejamiento por código (calculado en el dispositivo con `shared/domain/pairingCode`) y por QR; lo aprendido en el almacenamiento seguro. `platform.discovery` con red simulada para las pruebas (la nativa llega con T115 y T118). El cliente de API firma cada petición con el secreto del dispositivo (DT-24), con hora estrictamente creciente.

- [x] **T037. Maquetas de P-01 a P-05, P-21 y P-30.**
  - *Cubre:* RF-UI-09
  - *Depende:* T017
  - *Terminado:* aprobadas.
  - *Estado (2026-10-15):* `docs/maquetas/T037-acceso.html`, aprobadas por el responsable.

- [x] **T038. (PP) Pantallas P-01 a P-04:** Conexión y emparejamiento, Primer arranque, Login y Recuperar.
  - *Cubre:* HU-05, RF-AUT, RF-REC, RF-RED-02 a 04, RNF-09, HU-15
  - *Depende:* T026, T030, T037, T036
  - *Estado (2026-10-15):* referencias visuales (`Pantallas/Acceso`, 84) aprobadas por el responsable el 2026-10-17, con dos cambios pedidos en la revisión: el logo es el barco de Buques en el color principal (`ui/logo.tsx`, también en el menú lateral, el favicon y los iconos de Android y Electron, generados con `pnpm --filter @impocaribe/web brand-icons`) y todos los campos de contraseña llevan el ojo dentro, a la derecha (`PasswordField`). `web/src/screens/{connection,setup,login,recover}` con hook, tres presentaciones, historias y pruebas de componente; rutas y `SessionGate` (`web/src/app/routes.tsx`, router por hash). E2E contra el servidor real en las tres clases con el efecto en la base y la bitácora (`e2e/setup.e2e.ts`, `e2e/access.e2e.ts`): primer arranque en la PC servidor, emparejamiento por código, login, bloqueo y recuperación con código válido y usado. El navegador de pruebas llega al servidor por el mismo origen (proxy de vite) y el servidor de E2E sirve HTTP con `IMPOCARIBE_TLS=off`, prohibido en producción. Queda fuera, con su tarea: "Crear servidor en este equipo" (P-28), "Abrir el Diagnóstico de red" (P-30), la primera sincronización (F2, RNF-20), y la cámara para el QR y la verificación de la identidad en el transporte nativo (T115 y T118); el QR, el rechazo de un servidor con otra identidad y el redescubrimiento en menos de 10 s se prueban en componente y en T036, no en E2E del navegador. El código entra sin la hoja de MOV-04 (se muestra en el mismo paso).

- [x] **T039. (PP) Pantalla P-05 Perfil.** Sesiones, contraseña, códigos, tema y "Reducir animaciones".
  - *Cubre:* RF-AUT-07, RF-REC-03, RF-UI-06
  - *Depende:* T038
  - *Estado (2026-10-15):* referencias visuales (`Pantallas/Perfil`, 36, y las de la estructura, con la entrada al perfil y el logo) aprobadas por el responsable el 2026-10-17. `web/src/screens/profile/`; preferencias del dispositivo (tema y "Reducir animaciones") en `AppSession`, aplicadas a toda la app. E2E (`e2e/profile.e2e.ts`): cerrar otra sesión la invalida en el servidor y "Reducir animaciones" quita los desplazamientos en toda la app y se recuerda.

- [x] **T040. (PP) Pantalla P-21 Usuarios.**
  - *Cubre:* HU-11, RF-USR, RF-AUT-10
  - *Depende:* T031, T038
  - *Estado (2026-10-15):* referencias visuales (`Pantallas/Usuarios`, 30) aprobadas por el responsable el 2026-10-17. `web/src/screens/users/`: alta con códigos y capturas bloqueadas, edición con aviso de cambio de rol, última Apoderada protegida, activar, desactivar y restablecer contraseña. E2E (`e2e/users.e2e.ts`): cambiar el rol cierra la sesión del usuario en su dispositivo, comprobado en la base y la bitácora.

- [x] **T041. Guardas de rol en la interfaz.**
  - *Cubre:* Spec §2, EST-05
  - *Depende:* T038
  - *Pruebas:* E2E con los tres roles en las tres clases.
  - *Estado (2026-10-15):* `web/src/app/SectionGuard.tsx` usa la misma tabla de permisos que el menú (`navigation.ts`): lo prohibido no aparece y, si se llega por enlace, se explica y se ofrece volver. Pruebas de componente y E2E con los tres roles en las tres clases (`e2e/roles.e2e.ts`). Cada pantalla nueva añade su ruta bajo esta guarda.

## F2. Sincronización base y copia local

Desde aquí, **toda pantalla lee de la copia local** y toda escritura registra sus cambios.

- [x] **T042. Endpoints de sincronización.**
  - *Cubre:* RF-CON-02, 03, 09, 10
  - *Depende:* T014, T032
  - *Estado (2026-10-19):* `server/src/sync/sync.controller.ts`: `/sync/state` (época, último seq, versión de esquema y hora del servidor; guarda el desfase del dispositivo y queda fuera de la comprobación de ±5 min, que es justo lo que mide), `/sync/changes` filtrado por audiencia (todos, editores, Apoderada o un usuario) y `410 RESYNC_REQUIRED` si el cursor quedó atrás, y `/sync/snapshot` por páginas en una transacción de solo lectura. `change_log` se poda a los 30 días al arrancar y cada día. Cada escritura registra sus cambios como último paso antes de confirmar (`recordUserChange`). Entidades replicadas hoy: `user_directory` y `user_admin` (`shared/validation/sync.ts`); cada fase añade las suyas.

- [x] **T043. WebSocket.** Incluye el equivalente de Node de `platform.ws`, con la misma verificación de identidad que el transporte HTTP de T021.
  - *Cubre:* RNF-04
  - *Depende:* T042
  - *Estado (2026-10-19):* `server/src/sync/realtime.ts` en `/api/v1/ws`: autenticación por mensaje en 10 s (si no, cierre 4401), avisos `sync.available`, `sync.epoch_changed`, `session.revoked` y `device.revoked` que salen de `NOTIFY` en la base (migración 0006), así que solo se avisa tras confirmar; ping cada 25 s. Sustituye al bus interno `ServerEvents`. Equivalente de Node: `shared/src/node/node-socket.ts` (librería `ws`) con la misma verificación de identidad que el transporte HTTP.

- [x] **T044. Base local.**
  - *Cubre:* DT-03
  - *Depende:* T019
  - *Estado (2026-10-19):* `web/src/local/local-store.ts`: una tabla por entidad y `sync_meta`, migraciones por `PRAGMA user_version`, cada aplicación de cambios en una transacción y en cola, poda a los 12 meses. En el navegador de pruebas, sql.js; la copia cifrada (SQLCipher) llega con los cascarones nativos (T115, T118).

- [x] **T045. Motor de sincronización.**
  - *Cubre:* RF-CON-03, 04, 09
  - *Depende:* T043, T044
  - *Pruebas:* propiedad de convergencia con 1 000 operaciones y cortes de red.
  - *Estado (2026-10-19):* `web/src/sync/engine.ts`: instantánea inicial, cambios incrementales, reconstrucción ante nueva época, esquema o `RESYNC_REQUIRED`, reconexión del WebSocket de 1 a 30 s y sondeo cada 60 s de respaldo. Prueba de propiedad de convergencia (≥ 1 000 operaciones, 12 ejecuciones, con fallos de red aleatorios) contra un servidor simulado (`web/test/sync-server.ts`).

- [x] **T046. Lecturas locales.** Hooks e invalidación; el resaltado MOV-02 se aplica a las filas modificadas por la sincronización.
  - *Cubre:* Const. art. VII, RNF-13
  - *Depende:* T045
  - *Estado (2026-10-19):* TanStack Query sobre la copia local (`useLocalList`, clave `['local', entidad]`), invalidada por el motor; `useRecentlyChanged` resalta 1,5 s las filas que cambió la sincronización (MOV-02, sin transición con movimiento reducido) en `DataTable` y `ListCard`. P-21 ya lee de la copia local.

- [x] **T047. Modo sin conexión.** Banda, escrituras desactivadas (EST-03), sesión vencida con 72 horas de consulta, hora desfasada e icono de sin conexión (MOV-08).
  - *Cubre:* HU-06, RF-CON-01, 05, 06, 10, RF-AUT-09
  - *Depende:* T046
  - *Estado (2026-10-19):* banda e icono de sin conexión con la hora de la copia; escrituras desactivadas con su motivo (EST-03) en P-05 y P-21; primera descarga con progreso y, sin conexión, explicación (`SyncGate`, RNF-20); sesión vencida que sigue en consulta 72 h según la hora del servidor; banda de hora desfasada (> 5 min). La alerta AL-18 de hora desfasada queda para T092.

- [x] **T048. (PP) Pantalla P-30 Diagnóstico de red.**
  - *Cubre:* RF-RED-06
  - *Depende:* T036, T047
  - *Pruebas E2E adicionales:* servidor apagado → "El servidor no responde"; aislamiento simulado detectado y explicado.
  - *Estado (2026-10-19):* referencias visuales (`Pantallas/Diagnóstico de red`, 30, y las de P-01 "no encontrado" con el botón al diagnóstico) aprobadas por el responsable el 2026-10-19. `web/src/screens/diagnostics/`: semáforo, qué hacer, detalle y "Volver a probar"; se abre con sesión dentro de la estructura (también sin copia local), y sin sesión o sin emparejar en su propio marco; P-01 lleva a ella cuando no encuentra el servidor. El estado de la red llega por `platform.discovery.lan()`, que implementan los cascarones (T115, T118); en el navegador solo lo simula la E2E (`e2e/diagnostics.e2e.ts`). "En la PC servidor: dispositivos conectados y montaje de red" pasa a T128, que trae `/local/status` (el montaje se guarda en T052).

- [x] **T049. Cierre de sesión y revocación.**
  - *Cubre:* RF-AUT-08
  - *Depende:* T045
  - *Estado (2026-10-19):* cerrar sesión detiene la sincronización y borra la copia local; `session.revoked` por WebSocket o `SESSION_EXPIRED` llevan al login, y `device.revoked` (o `DEVICE_REVOKED` en cualquier petición) olvida además el emparejamiento.

> **Pendiente de F2 (2026-10-20):** la mutación del servidor (`src/sync/**` e `idempotency.ts`) no se ha pasado; el responsable la correrá a mano junto con la de F3 a F6.

## F3. Empresa, firma, cuño y configuración

- [ ] **T050. Archivos.**
  - *Depende:* T013
  - *Estado (2026-10-20):* hecha. `server/src/files/files.ts`: el binario en la carpeta de datos con el nombre de su SHA-256 (la misma imagen ocupa un archivo), escrito por un temporal y renombrado; la fila `files` (solo inserción) guarda huella, tipo, tamaño y ruta relativa. Carpeta de datos inyectable (`DATA_DIR`).

- [ ] **T051. Empresa, firma oficial y cuño oficial.**
  - *Cubre:* RF-EMP-01, 02, 05, 06
  - *Depende:* T050, T031
  - *Estado (2026-10-20):* hecha. `server/src/company/company.controller.ts`: `GET/PATCH /company`, `GET/PUT /company/signature` y `/stamp` (solo Apoderada), `GET /company/official-status` (A y O). Cada reemplazo es una fila nueva (solo inserción) y queda en la bitácora sin la imagen. Decisión del responsable: las imágenes viajan en base64 dentro del JSON (no multipart), para que la firma del dispositivo (DT-24) y la idempotencia (DT-22) sigan usando el cuerpo de texto; límite de 3 MB solo en esas dos rutas. El tipo y el tamaño se leen de la cabecera (`shared/domain/imageInfo.ts`, sin dependencias). La alerta AL-16 llega con las alertas. Pendiente de la mutación del servidor, que el responsable correrá a mano (pasa de 30 min).

- [ ] **T052. Configuración del sistema**, incluidos el montaje de red declarado, el texto del aviso legal del plazo y el cambio del código de instalación.
  - *Cubre:* RF-CFG-01 a 04
  - *Depende:* T031
  - *Estado (2026-10-20):* hecha. `system_settings` de una sola fila con los valores por defecto de RF-CFG-02; `GET/PATCH /settings` (la carpeta externa la comprueba el servidor solo si cambia) y `POST /settings/installation-code` (argon2id; los códigos no entran en la bitácora ni en la huella de idempotencia). En desarrollo, `db:reset` guarda el hash de `IMPOCARIBE_INSTALL_CODE` (.env); en producción lo hará el ayudante de instalación (T126). Pendiente de la mutación del servidor, que el responsable correrá a mano (pasa de 30 min).

- [x] **T053. Maquetas de P-22 y P-23.**
  - *Depende:* T017
  - *Estado (2026-10-20):* `docs/maquetas/T053-empresa-configuracion.html`, aprobadas por el responsable el 2026-10-19.

- [x] **T054. (PP) Pantallas P-22 Empresa y P-23 Configuración.**
  - *Cubre:* RF-EMP, RF-CFG, RNF-09
  - *Depende:* T051, T052, T053, T041, T046
  - *Estado (2026-10-20):* hecha; referencias visuales (`Pantallas/Empresa` y `Pantallas/Configuración`, 48) aprobadas por el responsable el 2026-10-22. `web/src/screens/{company,settings}/` con hook, tres presentaciones, historias y pruebas de componente; capturas bloqueadas en P-22; aviso de cambios sin guardar; conflicto de edición recuperable. E2E (`e2e/company.e2e.ts`) con el efecto en la base y la bitácora. La aceptación que necesita órdenes ("la siguiente orden usa la firma nueva" y "Nueva orden rechaza el día 4") se hará con las órdenes (F6). La firma y el cuño no se replican: sin conexión estas pantallas no se pueden consultar.

## F4. Catálogos

- [ ] **T055. Tablas y servicios de catálogos.** Normalización, unicidad (clientes por nombre normalizado), al menos un remolque por camión, carné (identificador) y licencia de 11 dígitos, obligatorios y únicos, y transportista obligatorio del chofer y del remolque (los remolques habituales de un camión, del mismo transportista). Desactivación de transportistas (sus camiones, remolques y choferes dejan de poder elegirse) y de clientes (bloqueada con DM abiertas).
  - *Cubre:* RF-CAT-01 a 05, 07, RF-CAT-09, RF-CAT-10, RF-CAT-11
  - *Depende:* T013
  - *Pruebas:* "w 011 612" es duplicado de "W011612"; camión sin remolque rechazado; licencias de 10 y 12 dígitos rechazadas; chofer sin transportista, carné o licencia rechazado; licencia repetida rechazada; "Nuevos Tiempos S.R.L." y "NUEVOS TIEMPOS SRL" son el mismo cliente; "Nuevos Tiempos" y "Nuevo Tiempo" solo se avisan como parecidos.
  - *Estado (2026-10-20):* hecha. `server/src/db/schema/catalogs.ts` y `drizzle/0008_catalogs.sql`: nombres normalizados únicos (`shared/domain/names.ts`), chapas, carné y licencia únicos, capacidad de 0 a 100 t y un disparador diferido que exige al menos un remolque por camión al confirmar. Sin `DELETE` (solo se desactiva). Se replican a todos los dispositivos. La comprobación de DM abiertas al desactivar un cliente (RF-CAT-11) llega con las DM (F5), y el recuento de borradores de RF-CAT-10, con las órdenes (F6). Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T056. Endpoints y DTO de catálogos**, con los esquemas F-11 a F-13, el filtro de choferes por transportista, el cambio de transportista con motivo y `/validation/unique`.
  - *Cubre:* RF-CAT-06 a 08, RF-CAT-09, RF-VAL-04 a 06
  - *Depende:* T055, T042
  - *Estado (2026-10-20):* hecha. `server/src/catalogs/catalogs.controller.ts` (alta, edición con versión, activar y desactivar de los cinco catálogos; `POST /drivers/:id/carrier` con motivo en la bitácora) y `web/src/api/endpoints/catalogs.ts`. Decisiones: el repetido y el parecido se comprueban contra la copia local mientras se escribe y el servidor confirma la unicidad al guardar (sin `/validation/unique`); el cliente se guarda con sus destinatarios en una sola petición; las chapas y el carné repetidos dan `DUPLICATE_PLATE` y `DUPLICATE_NATIONAL_ID`, y el nombre y la licencia, `VALIDATION_ERROR` con el campo. 17 pruebas de integración. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [x] **T057. Maquetas de P-18 a P-20.**
  - *Depende:* T017
  - *Estado (2026-10-20):* `docs/maquetas/T057-catalogos.html` (claro y oscuro, tres clases), aprobada por el responsable el 2026-10-22.

- [x] **T058. (PP) Pantalla P-18 Choferes y camiones**, con choferes por transportista y búsqueda por carné.
  - *Cubre:* RF-CAT-03 a 08, HU-08
  - *Depende:* T056, T057, T046, T041
  - *Estado (2026-10-20):* hecha; pantallas y referencias visuales (`Pantallas/Catálogos`) aprobadas por el responsable el 2026-10-22. `web/src/screens/catalogs/` (`useFleet`, `Fleet.*`): pestañas Camiones, Remolques y Choferes con filtro por transportista y búsqueda por chapa o carné; remolques del mismo transportista activo como fichas, con la capacidad total; en TEL el alta del camión va por pasos; cambio de transportista del chofer con motivo. 10 pruebas de componente y E2E (`e2e/catalogs.e2e.ts`).

- [x] **T059. (PP) Pantallas P-19 Clientes y P-20 Transportistas.**
  - *Cubre:* RF-CAT-01, 02
  - *Depende:* T058
  - *Estado (2026-10-20):* hecha y aprobada por el responsable el 2026-10-22. P-19 (destinatarios que se añaden o se desactivan, nunca se borran) y P-20 (desactivar avisa cuántos camiones, remolques y choferes deja sin elegir). 8 y 7 pruebas de componente; en el E2E, cliente con dos destinatarios y uno desactivado, y el nombre repetido bloqueado.

## F5. Buques, DM y asignaciones

- [x] **T060. Dominio de saldos, estados y plazo.**
  - *Cubre:* spec §6, RF-DM-06, 10, RF-PLZ-01, 02, 05
  - *Depende:* T008, T010
  - *Pruebas:* tabla de RF-PLZ-01; fin de mes, fin de año y cambio de horario; prioridad de estados.
  - *Terminado:* mutación ≥ 90 %.
  - *Estado (2026-10-21):* hecha. `shared/domain/deadline.ts` (día del plazo en La Habana, aviso desde el 25, vence al empezar el 31) y `shared/domain/balances.ts` (saldos de §6, sobrante del buque y estado de la DM en el orden de RF-DM-06), con la tabla de RF-PLZ-01, fin de mes y de año, los dos cambios de horario y propiedades. Mutación de shared: 93,66 % en total (deadline 95,7 %, numbering 94,9 %, balances 88,3 %); los 7 mutantes vivos de balances son constantes del módulo (los nombres de estado y el cero) que las pruebas sí comprueban, pero Stryker con Vitest no recarga el módulo para mutantes estáticos.

- [x] **T061. Código de buque y número de orden.**
  - *Cubre:* RF-BUQ-02, RF-ORD-15
  - *Depende:* T007
  - *Estado (2026-10-21):* hecha. `shared/domain/numbering.ts`: código del buque (sin tildes, espacios ni símbolos) y número de orden reversible (propiedad). Mutación de shared: 94,9 %.

- [ ] **T062. Buques.**
  - *Cubre:* RF-BUQ-01 a 07
  - *Depende:* T060, T061, T014
  - *Estado (2026-10-21):* hecha. `server/src/vessels/vessels.controller.ts` y la migración 0009. Decisiones: el viaje es el siguiente del código en el año de arribo real al registrarlo (corregir la fecha dentro del mismo año lo conserva); tras el arribo, el nombre solo cambia si da el mismo código; el total no baja de lo asignado más lo que ya salió del buque (transferido o merma). Pendiente de la mutación, que el responsable correrá a mano.

- [ ] **T063. DM y versiones**, con conflicto de edición (`STALE_RECORD`) y fecha de creación asignada por el servidor.
  - *Cubre:* RF-DM-01 a 05, D6, D13
  - *Depende:* T062, T055
  - *Estado (2026-10-21):* hecha. `declarations.controller.ts`: fecha de La Habana puesta por el servidor, número único para siempre, versiones de solo inserción con motivo, disparador que impide cambiar número, cliente o fecha (D13) y `STALE_RECORD`. Pendiente de la mutación, que el responsable correrá a mano.

- [ ] **T064. Asignaciones.**
  - *Cubre:* RF-ASG-01 a 04, D2, D11
  - *Depende:* T063
  - *Estado (2026-10-21):* hecha. `vessels/allocate.ts`: buque bloqueado antes que la DM (DT-09), `ALLOCATION_EXCEEDS_VESSEL` con exceso y libre, asignación parcial solo con `confirmPartial` y motivo, `PATCH /allocations/:id` con versión y motivo. La alerta AL-10 llega con las alertas (F7). Pendiente de la mutación, que el responsable correrá a mano.

- [ ] **T065. Vistas de saldo.**
  - *Cubre:* Const. art. I, RF-BUQ-06, D1
  - *Depende:* T064
  - *Estado (2026-10-21):* hecha. Vistas `v_allocation_balance`, `v_declaration_balance` y `v_vessel_balance`; una prueba compara sus saldos con `shared/domain`. Decisión: lo cargado es 0 hasta que existan las órdenes (F6 redefine `v_allocation_balance` con las mismas columnas), y el estado de la DM se calcula solo en `shared/domain` con la hora del servidor (no en SQL), porque depende del día y el reloj se inyecta en las pruebas. Pendiente de la mutación, que el responsable correrá a mano.

- [x] **T066. DTO de buques, DM y asignaciones.**
  - *Depende:* T065, T042
  - *Estado (2026-10-21):* hecha. `shared/validation/vessels.ts`, endpoints de la web y réplica de `vessel` y `declaration` (con sus asignaciones) a todos; migración 3 de la copia local.

- [ ] **T067. Vencimiento y reactivación.**
  - *Cubre:* RF-PLZ-03, 04, D7, HU-09
  - *Depende:* T066
  - *Estado (2026-10-21):* hecha. `vessels/expiry.ts`: al arrancar y cada 10 minutos; reduce las asignaciones a lo cargado, marca la DM y añade la versión `expire`. Reactivar inicia el plazo hoy y, si la tarea aún no pasó, libera en ese momento. Las alertas AL-03 y AL-04 llegan con las alertas (F7). Pendiente de la mutación, que el responsable correrá a mano.

- [ ] **T068. Cierre de buque y sobrante.** Destinos `transfer` (aumenta el total del buque destino y queda registrado en ambos) y `loss` (solo Apoderada), combinables. `SURPLUS_UNRESOLVED`. Sobrante posterior al cierre.
  - *Cubre:* RF-BUQ-08, 09
  - *Depende:* T066
  - *Pruebas:* no se cierra con 0,001 t sin destino; una transferencia a un buque cerrado se rechaza; un Operador recibe `FORBIDDEN` en `loss`; dos transferencias cruzadas concurrentes no se interbloquean.
  - *Estado (2026-10-21):* hecha. Decisión del modelo del sobrante: sobrante = total − cargado − lo que salió del buque; «transferir» y «merma» salen de lo libre (suben el total del destino o lo pierden) y «asignar a DM» lo cubre con una asignación; lo asignado y no cargado se destina después de reducir esa asignación (RF-BUQ-08). Con las cuatro pruebas pedidas, incluidas las transferencias cruzadas concurrentes. AL-17 llega con las alertas (F7). Decisión del responsable (2026-10-22): «asignar a DM» no es destino del sobrante, porque el buque cerrado no admite órdenes; lo que deba cargarse se asigna y se emite antes de cerrar. Los destinos son transferir y merma (RF-BUQ-08 actualizado); las referencias visuales de «Sobrante y destinos» con el cambio, aprobadas por el responsable el 2026-10-23. Pendiente de la mutación, que el responsable correrá a mano.

- [x] **T069. Propiedades de F5.**
  - *Cubre:* D2, D7, D11, D13
  - *Depende:* T067, T068
  - *Estado (2026-10-21):* hecha. En `vessels.int.test.ts`: secuencias aleatorias (fast-check) de asignar, cambiar asignaciones y totales, transferir, vencer y reactivar contra el servidor real, sin romper D2, D7, D11 ni D13. Las de órdenes (D1, D4, D12) llegan con F6.

- [x] **T070. Maquetas de P-07 a P-11.**
  - *Depende:* T017
  - *Estado (2026-10-21):* `docs/maquetas/T070-buques-dm.html` (claro y oscuro, tres clases), aprobada por el responsable el 2026-10-22.

- [x] **T071. (PP) Pantallas P-07 Buques y P-08 Ficha de buque**, incluido el flujo de cierre con los tres destinos.
  - *Cubre:* RF-BUQ-01 a 09, RF-TAB-05
  - *Depende:* T068, T070, T046, T041
  - *Estado (2026-10-21):* hecha; pantallas y referencias visuales (`Pantallas/Buques y DM`) aprobadas por el responsable el 2026-10-22. `web/src/screens/vessels/`: lista con saldos, ficha con Resumen, DM, Sobrante e Historial, alta y edición, arribo con candado, asignación con el diálogo de HU-04, destinos (merma solo A) y cierre desactivado mientras falte destino. 11 pruebas de componente y E2E (`e2e/vessels.e2e.ts`). Simplificación: en TEL el cierre no es un asistente de tres pasos; se dan los destinos en la pestaña Sobrante y se confirma el cierre.

- [x] **T072. (PP) Pantallas P-09 a P-11 DM:** lista, ficha, alta (con el aviso legal obligatorio de RF-DM-13), edición, asignación y reactivación.
  - *Cubre:* RF-DM, RF-ASG, RF-PLZ-04, 05, RF-TAB-02, 04, HU-04, HU-09, RF-DM-13
  - *Depende:* T067, T071
  - *Estado (2026-10-21):* hecha y aprobada por el responsable el 2026-10-22. `web/src/screens/declarations/`: filtros por estado con contadores, buque, cliente y búsqueda; ficha con saldos, etapas, plazo con barra ámbar desde el 25 y aviso legal; alta con fecha fija y aviso legal (en TEL en dos pasos), asignación inicial y diálogo de HU-04; edición con versión; reactivación. 12 pruebas de componente y E2E de HU-04. Pendientes: las órdenes de la DM y «Nueva orden para esta DM» llegan con F6; el aviso legal es el texto por defecto hasta que la configuración se replique a todos (F7).

## F6. Órdenes, numeración y PDF

- [x] **T073. Validación de emisión y corrección**, incluido que chofer, camión y remolques sean del mismo transportista (`DRIVER_CARRIER_MISMATCH`, `TRAILER_CARRIER_MISMATCH`).
  - *Cubre:* RF-ORD-13, 17, RF-DM-07, 11, D3, D4, D5
  - *Depende:* T060
  - *Terminado:* mutación ≥ 90 %.
  - *Estado (2026-10-22):* hecha. `shared/domain/orderRules.ts` (`checkOrder`): todas las validaciones de RF-ORD-13 y de la corrección, con su mensaje exacto y su campo, en el orden de la tabla; la usan el servidor (dentro de la transacción) y la interfaz (panel de comprobaciones). Mutación de shared: 100 %.

- [x] **T074. Advertencias de negocio y aviso legal.** Funciones puras de ADV-01 a ADV-07, de la advertencia del carné (AAMMDD) y del aviso legal del plazo, en `shared/validation/warnings.ts`.
  - *Cubre:* RF-VAL-08, RF-DM-13
  - *Depende:* T073
  - *Pruebas:* límites exactos calculados a mano: quedarían 1,000 t (sin ADV-02) y 0,999 t (con ADV-02); 95 % exacto (sin ADV-03) y 95,001 % (con ADV-03); días 24 y 25 para ADV-01; 3 y 4 órdenes del chofer para ADV-07; 5 % y 4,999 % libre para ADV-06; carné `84011905548` sin advertencia y `84133105548` con advertencia.
  - *Terminado:* mutación ≥ 90 %.
  - *Estado (2026-10-22):* hecha. `shared/validation/warnings.ts` con ADV-01 a ADV-04, ADV-06 y ADV-07 y la del contenedor (y reexporta las del carné y el nombre parecido; el aviso legal sigue en F06), probadas en los límites exactos de la tarea. Mutación: 92,6 %.

- [ ] **T075. Tablas de órdenes.**
  - *Cubre:* RF-ORD-01, 02, Const. art. III
  - *Depende:* T064
  - *Estado (2026-10-22):* hecha. `server/src/db/schema/orders.ts` y la migración 0010: versiones de solo inserción (un disparador solo deja pasar de oficial a reemplazada), índice de apoyo para D5, la vista de saldo con lo cargado de verdad y el arribo real fijo en cuanto el buque tiene órdenes. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T076. Borradores en el servidor.**
  - *Cubre:* RF-ORD-06 a 11, D9
  - *Depende:* T075, T014
  - *Estado (2026-10-22):* hecha. `orders/drafts.controller.ts`: guardar (idempotente por `clientDraftId`), subir en lote como privados, editar, compartir, bloquear con latido de 10 min, liberar (forzado solo A) y descartar. Revisión de seguridad: un borrador privado ajeno no existe para los demás, y emitir desde un borrador exige poder editarlo. Réplica: compartidos a los editores, privados a su autor. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [x] **T077. Plantilla del PDF A4**, con los formatos del documento actual (`pdfFormat.ts`, plan §8.1).
  - *Cubre:* RF-PDF-01
  - *Depende:* T003
  - *Pruebas:* `29.08.2026`, `30/08/2026`, `17.280` y `1 125.000` exactos, calculados a mano.
  - *Estado (2026-10-22):* hecha. `shared/domain/pdfFormat.ts` (los ejemplos exactos de la spec) y `server/src/orders/pdf-template.ts` (el formato del prototipo, sin bultos y con toneladas; marcas ANULADA y COPIA; «Versión n»). Mutación de pdfFormat: 92,6 %.

- [x] **T078. Motor de PDF**, con una sola instancia de Chromium y una página a la vez, que se abre con la primera emisión y se cierra tras 10 minutos sin emisiones (plan §10.7).
  - *Cubre:* DT-06, RNF-21
  - *Depende:* T077, T050
  - *Pruebas adicionales:* tras 10 minutos sin emisiones, Chromium está cerrado y la siguiente emisión lo vuelve a abrir y genera el PDF correctamente; dos emisiones simultáneas se encolan sin abrir dos instancias.
  - *Estado (2026-10-22):* hecha. Decisión: `playwright-core` (ya estaba en el proyecto, sin descargas nuevas) en vez de Puppeteer, con el mismo `chrome-headless-shell` que pide el plan; su ruta en producción se indica con `IMPOCARIBE_CHROMIUM` (la pondrá el instalador, T126). Una instancia, una página a la vez, 10 s por documento y cierre a los 10 min sin emisiones, con las pruebas pedidas contra Chromium real.

- [ ] **T079. Emitir orden.**
  - *Cubre:* RF-ORD-03, 12 a 16, RF-EMP-03, 04, RF-DM-07, 08, HU-01, D8, RF-ORD-23, RF-ORD-24, D15
  - *Depende:* T073, T076, T078, T051, T066
  - *Pruebas adicionales:* emitir a las 23:59:59 del día 30 pasa y a las 00:00:00 del día 31 se rechaza aunque la tarea de vencimiento no haya corrido; un reintento tras perder la respuesta devuelve la misma orden.
  - *Estado (2026-10-22):* hecha. `orders/orders.controller.ts` y `order-context.ts`: bloqueos de DT-09, validación compartida, número en la fila del buque, documento congelado, PDF generado y archivado en la transacción (si falla no se consume el número), idempotencia y bitácora también de los rechazos; `POST /orders/check` para la simulación. Pruebas de las 23:59:59 del día 30 y del reintento. Las alertas AL-05 a AL-07 llegan con F7. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T080. Concurrencia de emisión.**
  - *Cubre:* D1, D2, Const. art. II y VI, RNF-07
  - *Depende:* T079
  - *Estado (2026-10-22):* hecha. Seis emisiones a la vez por más de lo que queda: tres pasan, tres dan sobregiro, números 1 a 3 sin huecos y saldo exacto. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T081. Corregir.**
  - *Cubre:* RF-ORD-17, 18, 20, RF-DM-09, 11, HU-02.1
  - *Depende:* T079
  - *Pruebas adicionales:* reducir toneladas en una DM vencida libera la diferencia al buque; con buque cerrado abre AL-17.
  - *Estado (2026-10-22):* hecha. Versión n+1 con el mismo número, la anterior reemplazada, saldo por diferencia, fecha de carga contra la versión 1, DM vencida sin aumentar y la reducción libre al buque (`void_release`). AL-17 llega con F7. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T082. Anular.**
  - *Cubre:* RF-ORD-19, RF-EMP-03, RF-BUQ-09, HU-02.2
  - *Depende:* T081, T068
  - *Estado (2026-10-22):* hecha. Versión anulada con el documento de la anterior, PDF marcado con la firma y el cuño de esa versión, saldo repuesto y sin más versiones. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [ ] **T083. Descargas del PDF.**
  - *Cubre:* RF-ORD-21
  - *Depende:* T079
  - *Estado (2026-10-22):* hecha. El original (el archivado, idéntico byte a byte) para quien emitió la versión durante 24 h; si no, una copia generada del documento congelado con la marca COPIA (y ANULADA si corresponde); cada descarga en la bitácora. El PDF viaja en base64 dentro del JSON, como las imágenes de F3. Pendiente de la mutación del servidor, que el responsable correrá a mano.

- [x] **T084. Propiedades de órdenes.**
  - *Depende:* T082
  - *Estado (2026-10-22):* hecha. Secuencias aleatorias de emitir, corregir y anular: nunca saldo negativo y numeración 1..n sin huecos ni repeticiones.

- [x] **T085. Maquetas de P-13 a P-16**, incluida la vista previa del documento y el formulario por pasos de teléfono.
  - *Depende:* T017
  - *Estado (2026-10-22):* `docs/maquetas/T085-ordenes.html` (claro y oscuro, tres clases), aprobada por el responsable el 2026-10-22.

- [x] **T086. (PP) Pantalla P-13 Nueva orden**, con el transportista primero, que filtra camiones y choferes, y las advertencias ADV-01 a ADV-04 y ADV-07 en sus campos.
  - *Cubre:* HU-01, RF-ORD-03 a 05, 12, 13, RF-VAL-08
  - *Depende:* T079, T085, T058, T072
  - *Pruebas E2E adicionales:* sobregiro, capacidad, camión repetido, fecha de carga fuera de rango; emisión verificada en la base y en la copia local de otro usuario.
  - *Estado (2026-10-22):* hecha; pantallas y referencias visuales (`Pantallas/Órdenes`) aprobadas por el responsable el 2026-10-22. `web/src/screens/orders/`: elecciones encadenadas desde la copia local, panel de saldo con las mismas comprobaciones del servidor y las advertencias, excepciones con motivo (también las dos seguidas), vista previa A4, autoguardado como borrador local y orden emitida con la descarga del original. 7 pruebas de componente y E2E (sobregiro, capacidad, camión repetido, emisión en la base y original idéntico al archivado). Atajo: el máximo de días de la fecha de carga se toma por defecto (7) en la interfaz hasta que la configuración se replique (F7); el servidor decide con el real.

- [x] **T087. (PP) Borradores locales y pantalla P-14 Borradores.**
  - *Cubre:* RF-ORD-06 a 11, HU-06
  - *Depende:* T086, T047
  - *Estado (2026-10-22):* hecha y aprobada por el responsable el 2026-10-22. P-14 con Míos (de este dispositivo y privados) y Compartidos (autor, edición y bloqueo); los locales suben como privados al recuperar la conexión (RF-ORD-08). E2E: un borrador abierto por otra persona se ve en edición (EST-06).

- [x] **T088. (PP) Pantalla P-15 Orden**, con el visor del PDF y la línea de tiempo de versiones.
  - *Cubre:* HU-02, RF-ORD-21, 22, RF-BIT-04, RF-CON-08
  - *Depende:* T082, T083, T085
  - *Estado (2026-10-22):* hecha y aprobada por el responsable el 2026-10-22. P-15 con el documento congelado de la versión vigente (también sin conexión), versiones con sus cambios y la descarga original o copia. E2E: copia para quien no emitió (el original idéntico se prueba en T086).

- [x] **T089. (PP) Pantalla P-16 Corregir y Anular.**
  - *Cubre:* RF-ORD-17 a 19, RF-DM-11
  - *Depende:* T088
  - *Estado (2026-10-22):* hecha y aprobada por el responsable el 2026-10-22. P-16: corregir con la DM y el buque fijos y los cambios resaltados; anular con lo que repone. E2E: la versión 2 cambia el saldo por la diferencia y la anulación lo repone.

- [x] **T090. Comparación visual del PDF.**
  - *Cubre:* RF-PDF-01
  - *Depende:* T083
  - *Terminado:* referencias aprobadas por el responsable.
  - *Estado (2026-10-22):* hecha; referencias (`e2e/visual/references/documento-orden--*.png`: original, versión 2, ANULADA y COPIA) aprobadas por el responsable el 2026-10-22. Se compara la plantilla HTML que el servidor convierte en PDF, dibujada en A4 con Chrome for Testing fijo, porque Chromium sin interfaz no muestra PDF.

- [x] **T091. Reproducción del Excel.**
  - *Cubre:* spec §11.5, Const. art. XIII.8
  - *Depende:* T082, T016
  - *Estado (2026-10-22):* hecha. `orders/excel.int.test.ts`: las 92 filas del fixture, en su fecha, dan exactamente lo calculado a mano (41 emitidas, 1 emitida y anulada, 50 rechazadas con su código; saldos de las 12 DM y del buque; última orden EAGLE1-2026-V1-0042).

## F7. Alertas

- [ ] **T092. Motor de alertas.**
  - *Cubre:* RF-ALR-03, 05
  - *Depende:* T042
  - *Estado (2026-10-22):* hecha. `server/src/db/schema/alerts.ts` y `drizzle/0011_alerts.sql`: tabla `alerts` (sin `DELETE`) con clave única parcial de las abiertas (una de condición no se repite mientras sigue abierta) y un disparador que avisa `impocaribe_alert` al confirmar. `server/src/alerts/alerts.ts`: alertas de evento (`raiseEvent`) y de condición (`openCondition`, `resolveMissing`), replicadas a la audiencia de quien las ve (todos, editores, Apoderada y, en AL-08, el autor). `GET /alerts` y `POST /alerts/:id/attend` (solo de evento y según la tabla AL, con nombre y hora en la bitácora). El WebSocket manda `alert.created` (tipo y referencia) solo a los roles que la ven o a su destinatario, también al token de dispositivo. Catálogo compartido `shared/domain/alerts.ts`. 11 pruebas de integración. Pendiente de la mutación del servidor (`alerts.ts` y `conditions.ts` añadidos), que el responsable correrá a mano.

- [ ] **T093. Alertas por eventos.**
  - *Depende:* T092, T079, T064, T030
  - *Estado (2026-10-22):* hecha. AL-02 al registrar una DM con otras pendientes (las lista); AL-04 al vencer; AL-05 ante un intento real de emitir o corregir bloqueado por sobregiro (en una transacción aparte, porque la escritura se revierte; la simulación no la dispara); AL-06 y AL-07 solo cuando la excepción hizo falta; AL-10 en la asignación parcial; AL-11 en cada recuperación, exitosa o fallida. El restablecimiento de emergencia (RF-INS-11) la emitirá cuando exista (F11). Pendiente de la mutación del servidor.

- [ ] **T094. Alertas por condición y tiempo** (AL-01, 03, 04, 08, 09, 12, 16, 17, 18, 19 y 23).
  - *Depende:* T092, T067, T068
  - *Estado (2026-10-22):* hecha para AL-01, 03, 08, 09, 16, 17 y 18 (`server/src/alerts/conditions.ts`); AL-04 es de evento y sale del vencimiento (T093). La pasada corre al arrancar, cada 10 minutos, 1,5 s después de cada cambio sincronizado y al medir la hora de un dispositivo (AL-18), con un candado para que no se solapen. AL-12, 19, 20, 21 y 23 llegan con respaldos, restauración y energía (F9 y F10). Pendiente de la mutación del servidor.

- [x] **T095. Maquetas de P-17**, incluido el panel lateral de alertas de escritorio.
  - *Depende:* T017
  - *Estado (2026-10-22):* `docs/maquetas/T095-alertas.html` (claro y oscuro, tres clases y el panel lateral), aprobada por el responsable el 2026-10-22.

- [x] **T096. (PP) Pantalla P-17 Alertas**, con el contador y la campana animada en los tres `AppShell`.
  - *Cubre:* RF-ALR-01 a 05, HU-07
  - *Depende:* T093, T094, T095, T046
  - *Estado (2026-10-22):* hecha; pantallas y referencias visuales (`Pantallas/Alertas`, 30) aprobadas por el responsable el 2026-10-22. `web/src/screens/alerts/`: lista con las de este dispositivo arriba, filtros por estado, tipo y DM o buque (en TEL, en una hoja), lista y detalle en TAB, página completa en ESC y el panel lateral desde la campana en cualquier pantalla; abrir el origen y Atender según la tabla AL. Contador en los tres `AppShell` con la campana que se agita y la fila nueva resaltada (MOV-02, MOV-08). Historias `Pantallas/Alertas` y sus referencias visuales, 10 pruebas de componente y E2E (`e2e/alerts.e2e.ts`, pasa en las tres clases): la alerta de otra persona en menos de 5 s y el Operador sin AL-05.

- [x] **T097. Alertas locales** (AL-13, 14 y 15).
  - *Depende:* T047
  - *Estado (2026-10-22):* hecha para AL-13 (sin conexión) y AL-14 (borradores sin subir, que además llegan a la banda de sin conexión); no salen del dispositivo. AL-15 llega con la publicación de versiones (T113 y T114).

- [x] **T098. Notificaciones del sistema con la app abierta.**
  - *Cubre:* RF-ALR-01, 02
  - *Depende:* T096
  - *Estado (2026-10-22):* hecha. Con la app abierta, cada `alert.created` sale por `platform.notify` con solo el tipo y la referencia; con la app cerrada, en F10 (servicio de Android y bandeja de Windows).

## F8. Tablero, búsqueda y bitácora

- [x] **T099. Maquetas de P-06, P-12, P-25 y P-32.**
  - *Depende:* T017
  - *Estado (2026-10-23):* `docs/maquetas/T099-tablero-consultas.html` (claro y oscuro, tres clases), aprobada por el responsable el 2026-10-23.

- [x] **T100. (PP) Pantalla P-06 Tablero**, con las cifras por buque según RF-TAB-01 y las etapas de RF-TAB-04.
  - *Cubre:* RF-TAB-01, HU-03, RF-TAB-04
  - *Depende:* T096, T099
  - *Pruebas E2E adicionales:* con dos usuarios, el saldo cambia con animación en menos de 5 segundos; los números coinciden con las vistas SQL en el escenario Excel.
  - *Estado (2026-10-23):* hecha; pantallas y referencias visuales (`Pantallas/Tablero y consultas`) aprobadas por el responsable el 2026-10-24. `web/src/screens/dashboard/`: filtro de buque (con un buque, las cifras de sus asignaciones), contratado, extraído y pendiente con cifras vivas (MOV-03, `LiveNumber`), órdenes oficiales, borradores (A y O) y anuladas, «Requieren atención» (AL-01, 03 y 04 abiertas), tabla ordenable por DM con su etapa (RF-TAB-04, `shared/domain/stages.ts`) y las alertas de hoy; TAB con la ficha y sus etapas; TEL en carrusel y tarjetas. 4 pruebas de componente; E2E: la orden de otra persona cambia la fila de su DM en menos de 5 s. Los números salen de las vistas SQL vía la copia local; su coincidencia con el escenario Excel ya la prueba `excel.int.test.ts` (T091).

- [x] **T101. (PP) Pantalla P-12 Buscar** y archivo en línea, incluida la búsqueda por la parte final del número de orden.
  - *Estado (2026-10-23):* hecha y aprobada por el responsable el 2026-10-24. `GET /archive/orders` y `/archive/declarations` (lo de más de 12 meses, mismo corte que la copia local). P-12 busca en la copia local por DM, cliente, marca y número de orden (completo o su parte final, en todos los buques), con la ficha de la DM (etapas, saldos, asignaciones, órdenes, «Nueva orden para esta DM» y el seguimiento en PDF) y «Buscar en el archivo» con conexión. Decisión de alcance: la búsqueda vive en la página `/buscar` en las tres clases (la lupa y `/` llevan ahí), no desplegada bajo la cabecera de TAB y ESC como en la maqueta. 16 pruebas de componente; E2E: la orden por su número y una DM de hace 14 meses solo con el archivo.
  - *Cubre:* RF-TAB-03, RF-CON-07, HU-10
  - *Depende:* T072, T099

- [x] **T102. (PP) Pantalla P-32 Órdenes**, con filtros, totales del rango y filtro rápido "Hoy".
  - *Estado (2026-10-23):* hecha y aprobada por el responsable el 2026-10-24. «Hoy» por defecto, «Esta semana» y «Rango» (por fecha de carga o de emisión), filtros por estado, buque, DM, cliente, transportista y chofer, cantidad y toneladas del rango (las anuladas no suman), tabla ordenable con la orden al lado (abrir y descargar el PDF) en ESC, lista y orden en TAB y tarjetas por día en TEL. 8 pruebas de componente; E2E: la orden de otra persona aparece en «Hoy» y el filtro por chofer coincide con la base.
  - *Cubre:* RF-TAB-07, HU-17
  - *Depende:* T100

- [x] **T103. [∥] Seguimiento en PDF.**
  - *Estado (2026-10-23):* hecha. `GET /declarations/:id/tracking.pdf` (`server/src/vessels/tracking.ts`): etapa, saldos, plazo, asignaciones por buque y órdenes con su estado, con el motor de PDF de las órdenes. Se descarga desde la ficha de P-12.
  - *Cubre:* RF-TAB-06
  - *Depende:* T078

- [x] **T104. (PP) Bitácora:** endpoint y pantalla P-25.
  - *Estado (2026-10-23):* hecha y aprobada por el responsable el 2026-10-24. `GET /audit` (todos los roles; por usuario, fechas de La Habana, grupo de acciones y DM u orden, también por la parte final; páginas de 50) con nombres de usuario, dispositivo y entidad. El motivo de correcciones, anulaciones y cambios con motivo se guarda ahora también en su columna (`auditedWrite`). P-25 con filtros F-17, tabla con el detalle antes → después (TAB y ESC) o tarjetas (TEL); sin conexión explica que se consulta en el servidor. 5 pruebas de integración (con el archivo y el seguimiento) y 6 de componente; E2E: filtrar por la orden y ver su emisión y su corrección.
  - *Cubre:* RF-BIT-03, HU-13
  - *Depende:* T013, T099, T041

## F9. Respaldo y restauración

- [ ] **T105. Cifrado de respaldos** y confirmación periódica de la contraseña (RF-RES-08): confirmar verificando que descifra la clave privada, aplazar hasta 3 veces y AL-23.
  - *Estado (2026-10-23):* hecha. `server/src/backups/crypto.ts`: par X25519 (pública en `system_settings`, privada sellada con argon2id + AES-256-GCM) y archivos `.icbak` cifrados por flujo con una clave efímera (ECDH + HKDF, cabecera autenticada). `/backups/password`: estado, definir o cambiar (exige la actual y vuelve a sellar la misma clave), confirmar (abre la clave privada) y aplazar hasta 3 veces. Diálogo tras el login de una Apoderada (ui-spec §1.2); sin aplazamientos se cierra con «Ahora no» y AL-23 sigue abierta (evaluador de condiciones). Definirla desde la pantalla llega con P-24 (T112). 5 pruebas del cifrado, 4 de integración, 6 de reglas y F-16 y 4 de componente. Pendiente de la mutación del servidor.
  - *Decisiones del responsable (2026-10-23):* (1) la restauración usa una segunda conexión de mantenimiento con el rol dueño de la base, con sus credenciales protegidas como las del rol de la app, solo para respaldar y restaurar; (2) cambiar la contraseña de respaldo vuelve a cifrar la misma clave privada, así los respaldos anteriores se restauran con la contraseña nueva; (3) las pruebas de integración hacen respaldos y restauraciones reales con pg_dump y pg_restore.
  - *Cubre:* DT-07, RF-RES-04, RF-RES-08
  - *Depende:* T051

- [ ] **T106. Respaldos por hora y diarios.**
  - *Cubre:* RF-RES-01, 02, 05, RNF-14
  - *Depende:* T105, T094, T052
  - *Estado (2026-10-23):* hecha. `server/src/backups/`: `pg_dump -Fc` con prioridad baja y la contraseña por variable de entorno, con la conexión de mantenimiento (rol dueño); el volcado y la carpeta de archivos van en un paquete propio (`pack.ts`, sin depender de tar) cifrado en `backups/<fecha>-<tipo>.icbak` con su SHA-256; tabla `backups` (sin DELETE: al vencer la retención solo se quita el archivo). Programador cada minuto (DT-08): uno por hora en la jornada de La Habana (inicio y fin incluidos) y el diario a su hora, copiado a la carpeta externa; si la USB no está queda pendiente y se reintenta cada 30 min. Retención: 48 h los de cada hora y 30 los diarios (también en la carpeta externa). Respaldo manual (`POST /backups`) y lista (`GET /backups`). AL-12: sin contraseña, el último falló, más de 2 h sin respaldo bueno en la jornada (desde su inicio), sin carpeta externa o más de 24 h sin copia en ella. 17 pruebas del calendario, 3 del paquete y 6 de integración con pg_dump real (incluida RNF-14: se emiten órdenes mientras se respalda). Pendiente de la mutación del servidor.

- [ ] **T107. Restauración y numeración.**
  - *Cubre:* RF-RES-03, 06, D12
  - *Depende:* T106, T045
  - *Estado (2026-10-24):* hecha. `server/src/backups/restore.ts` y `POST /restores` (Apoderada, contraseña de respaldo y «RESTAURAR»): modo mantenimiento (503 `RESTORE_IN_PROGRESS` salvo estado y descubrimiento; las tareas en segundo plano paran), respaldo `pre_restore`, `pg_restore --clean` en una sola transacción (si falla, la base queda como estaba) y los archivos. Se reponen el historial de respaldos y restauraciones, los dispositivos (emparejados y revocados después del respaldo) y las claves de respaldo. D12: el contador de cada buque toma el mayor entre el restaurado y el de antes; las órdenes que ya no están quedan en `lost_orders` con sus versiones, remolques, firma, cuño y archivos. Época nueva, todas las sesiones revocadas y `backup.restore` en la bitácora restaurada. Decisiones: el estado de antes se lee de la base viva justo antes de restaurar (equivale al `pre_restore`, sin base temporal); solo se restaura un respaldo de la misma versión del esquema (va en su cabecera); restaurar entre versiones, con F10. AL-19 mientras queden órdenes perdidas pendientes. 6 pruebas de integración con pg_dump y pg_restore reales (la orden siguiente es la 0004 tras perder la 0002 y la 0003). Pendiente de la mutación del servidor.

- [ ] **T108. Modo de confirmación de numeración.**
  - *Depende:* T107
  - *Estado (2026-10-24):* hecha. Si no se pudo hacer el respaldo previo, la restauración marca `numbering_confirmation_required`: emitir responde `NUMBERING_CONFIRMATION_REQUIRED` hasta que una Apoderada confirma el último número impreso de cada buque abierto (`GET/POST /restores/numbering`, nunca menor que el restaurado); el contador toma el mayor. Prueba de integración: confirmado el 7, la siguiente orden es la 0008. La pantalla, con P-24 (T112).

- [ ] **T109. Recuperar órdenes perdidas.**
  - *Cubre:* RF-RES-07
  - *Depende:* T107
  - *Estado (2026-10-24):* hecha. `GET /lost-orders`, `POST /lost-orders/:id/recover` y `/discard` (Apoderada). Recuperar es una transacción con el orden de bloqueos de DT-09: vuelve a registrar la orden con su id, su número, su secuencia, sus fechas, sus versiones, sus remolques, su firma, su cuño y su PDF original (los archivos siguen en la carpeta de datos), y valida el saldo; si no alcanza (o falta el buque, la DM, la asignación o un archivo), responde con el motivo, que queda en `last_error`, y la orden sigue en la lista. Descartar pide motivo y va a la bitácora. AL-19 se resuelve cuando no quedan pendientes. 2 pruebas de integración. Pendiente de la mutación del servidor.

- [ ] **T110. Propiedad de restauración.**
  - *Cubre:* D12
  - *Depende:* T109
  - *Estado (2026-10-24):* hecha. `restore.property.int.test.ts`: fast-check con secuencias de emitir, respaldar y restaurar a cualquier respaldo (con pg_dump y pg_restore reales); ningún número se repite y cada uno es mayor que todos los emitidos antes, en todas las corridas. Pocas corridas (5) y secuencias cortas, porque cada restauración tarda segundos.

- [x] **T111. Maquetas de P-24.**
  - *Depende:* T017
  - *Estado (2026-10-24):* `docs/maquetas/T111-respaldos.html` (claro y oscuro, tres clases): estado de los respaldos, lista, contraseña, restauración por pasos, órdenes perdidas y confirmación de la numeración, aprobada por el responsable el 2026-10-24.

- [ ] **T112. (PP) Pantalla P-24 Respaldos y restauración.**
  - *Cubre:* HU-12, RF-RES
  - *Depende:* T109, T108, T111
  - *Estado (2026-10-24):* hecha; interfaz aprobada por el responsable el 2026-10-24. `web/src/screens/backups/` (hook, partes y tres presentaciones) en `/respaldos`, según la maqueta T111: arriba el último respaldo por hora y el diario (con su copia externa) y la contraseña con su próxima confirmación; «Hacer un respaldo ahora»; la lista (tabla en TAB y ESC, tarjetas en TEL) con «Restaurar» en los que aún tienen archivo y el error de los que fallaron. Sin contraseña, lo primero es definirla (F-16, con la advertencia «Guárdela impresa»); también se cambia desde ahí. Restaurar por pasos en un diálogo: contraseña → «RESTAURAR» con lo que pasará → resultado con las órdenes perdidas y «Volver a entrar» (cierra la sesión y borra la copia local, que se vuelve a descargar); con la contraseña equivocada vuelve a pedirla. Órdenes perdidas con Recuperar y Descartar (con motivo) y el motivo si no alcanza el saldo. Confirmación de la numeración por buque (un campo vacío se pide antes de enviar: se leería como 0). 7 historias, 4 pruebas de componente y una E2E en la PC contra el servidor real (definir la contraseña, respaldar a mano con pg_dump real y una restauración con contraseña equivocada que no cambia nada; la restauración completa cierra las sesiones de las otras E2E que corren a la vez, así que la cubren las pruebas de integración). Referencias visuales de las 7 historias en las tres clases y los dos temas (42).

## F10. Cascarones y actualizaciones

- [ ] **T113. Publicación de versiones** del instalador ligero y del APK (el completo no se publica).
  - *Cubre:* RF-UPD-01 a 04, RNF-11
  - *Depende:* T050
  - *Estado (2026-10-24):* hecha. Tabla `app_releases` (migración 0015, sin DELETE): `windows`, `android` y los dos instaladores del WebView para P-27; a lo sumo una mínima vigente por plataforma. `POST /updates` (Apoderada, multipart): comprueba que el archivo sea de su tipo (MZ o APK), que la versión sea semver, no esté publicada y sea más nueva que la última; lo guarda por flujo en la carpeta de datos con su SHA-256 (hasta 300 MB: el completo no cabe). `POST /updates/:id/min-supported` (solo apps). `GET /updates` (lista), `GET /updates/check` y `GET /updates/:plataforma/:versión/download` (públicas, sin dispositivo: P-27 las usa antes de que la interfaz arranque; la descarga lleva su huella en `X-Content-SHA256`). DT-11 por plataforma: la app envía `X-App-Platform` y la mínima es la mayor entre la del servidor (`MIN_APP_VERSION`) y la marcada; sin la cabecera vale la del servidor. Publicar y marcar la mínima avisan por WebSocket (`app.update`, para AL-15 en T114) y van a la bitácora (grupo nuevo «Respaldos y versiones», que también nombra las acciones de F9). Decisión: un fallo al leer la mínima publicada no bloquea las peticiones (vale la del servidor). 4 pruebas de integración, 6 de versiones semver y 1 del cliente. Pendiente de la mutación del servidor.

- [ ] **T114. (PP) Pantalla P-26 Versiones y estado EST-07.** Incluye las maquetas de P-26 y P-27.
  - *Cubre:* RF-UPD-02 a 05
  - *Depende:* T113, T097
  - *Estado (2026-10-24):* maqueta `docs/maquetas/T114-versiones.html` (claro y oscuro): P-26 por plataforma con la mínima, publicar con progreso, marcar la mínima con lo que pasará, la banda de AL-15 con «Actualizar ahora» y «Más tarde», la descarga con progreso, EST-07 en pantalla completa y P-27 nativa; aprobada por el responsable el 2026-10-24.
  - *Estado (2026-10-24):* hecha; pendiente de aprobar la interfaz y sus referencias. `web/src/screens/updates/`: P-26 en `/versiones` (todos ven; la Apoderada publica y marca la mínima) con las versiones por plataforma, la mínima, sus novedades y quién las publicó; publicar en un diálogo (hoja en TEL) con el archivo en multipart (el cliente ya envía `FormData`, firmando el cuerpo vacío); marcar la mínima dice a cuántos dispositivos deja fuera (el servidor anota ahora la versión de la app de cada dispositivo en cada petición, `devicesBelow`). `AppUpdateProvider`: pregunta al iniciar sesión, cada hora y al aviso `app.update` del WebSocket; banda de AL-15 con «Actualizar ahora» (descarga del servidor emparejado con su progreso, por `platform.installUpdate`, que ahora recibe la huella) y «Más tarde» (la oculta un día; la alerta local AL-15 sigue en Alertas); por debajo de la mínima o tras un 426, EST-07 en pantalla completa, que solo deja ir a Borradores (con una banda roja allí). El navegador de pruebas no instala: el botón dice por qué. Diferencia con la maqueta: la subida muestra «Subiendo N MB…» sin porcentaje, porque el transporte (DT-19) no informa del avance de lo que envía. P-27 es nativa y llega con Android (T118). 8 pruebas de componente, 2 del cliente, 1 de integración ampliada y una E2E en la PC contra el servidor real. Referencias visuales de las 8 historias (Pantallas/Versiones) en las tres clases y los dos temas (48).

- [ ] **T115. Electron: base**, con el transporte nativo (DT-19) y el descubrimiento (DNS-SD, difusión y subred).
  - *Cubre:* DT-02, DT-03, RF-CON-01
  - *Depende:* T087, T036
  - *Decisión del responsable (2026-10-24):* en escritorio la copia local usa SQLCipher nativo (`better-sqlite3-multiple-ciphers` en el proceso principal, por IPC) en lugar de `@capacitor-community/sqlite`, que exigiría montar la app sobre Capacitor-Electron. Android sigue con `@capacitor-community/sqlite` (DT-03); el cifrado es SQLCipher en los dos.
  - *Estado (2026-10-26):* hecha. `packages/desktop`:
    - **Arranque:** una sola instancia y ventana aislada (`contextIsolation`, `sandbox`, sin navegar fuera de `app://impocaribe` ni abrir ventanas).
    - **Puente:** un preload que solo deja pasar los canales de `NATIVE_CHANNELS` (contrato en `shared/domain/nativeBridge.ts`).
    - **Servicios del proceso principal:**
      - transporte HTTP y WebSocket con la verificación de identidad de `shared/node` (DT-18, DT-19), que solo sale por HTTPS y hacia el servidor esperado;
      - descubrimiento por DNS-SD, difusión UDP en cada interfaz, sonda a `/api/v1/discovery` y la `/24` (constantes compartidas con el servidor);
      - almacenamiento seguro con `safeStorage`;
      - copia local en SQLCipher (`better-sqlite3-multiple-ciphers`; su binario precompilado es Node-API y carga en Electron sin recompilar). La clave es aleatoria y vive en el almacenamiento seguro. Rechaza `ATTACH`, `DETACH`, `VACUUM`, `load_extension` y todo `PRAGMA` salvo `user_version`, para que un fallo en la interfaz no pueda escribir fuera de la base.
    - **Web:** `platform/electron-platform.ts` (serializa el multipart, WebSocket por número sin perder eventos tempranos, transacciones en cola con deshacer), registrada en `main.tsx` cuando existe el puente. La sesión pasa al transporte el servidor esperado: el emparejado, o el anunciado o el del QR mientras se empareja.
    - **Pruebas:**
      - 34 del proceso principal: SQLCipher real, mDNS, UDP y HTTP locales reales, y certificados de prueba para el intruso;
      - 4 de la plataforma de escritorio en la web;
      - 1 más del transporte de `shared`, con un cuerpo en bytes;
      - 2 E2E con la app real (Playwright y Electron): arranca sin servidor en P-01 con el puente; secreto, base cifrada y canal no permitido; una sola instancia.
    - **Para lanzarla desde una terminal de VS Code:** quitar `ELECTRON_RUN_AS_NODE`, que VS Code hereda.
    - **Pendiente:**
      - el estado de la red para el diagnóstico (`lan`, RF-RED-06): sin él, P-30 no distingue un servidor apagado de una red que aísla equipos;
      - emparejar con un servidor con TLS desde la app (las E2E corren sin TLS; la verificación está probada con certificados de prueba);
      - instalar actualizaciones (T117).

- [ ] **T116. Electron: sistema.**
  - *Cubre:* RF-ORD-22, RNF-09, RF-ALR-01
  - *Depende:* T115
  - *Estado (2026-10-26):* hecha.
    - **Bandeja (RF-ALR-01):** icono con «Abrir Órdenes de Carga», «Iniciar con Windows» (abre en la bandeja, sin ventana) y «Salir». Cerrar la ventana la oculta y la app sigue: la interfaz no frena sus temporizadores ni su conexión de alertas (`backgroundThrottling` apagado). Tocar una notificación o abrir la app otra vez trae la ventana; solo «Salir» (o el apagado) la cierra.
    - **«Guardar como» (RF-ORD-22):** con el filtro del tipo (PDF).
    - **Bloqueo de capturas (RNF-09):** `setContentProtection` en las pantallas de códigos y de firma o cuño, que ya lo pedían.
    - **Pruebas:** 7 de la lógica de la bandeja y del filtro, y una E2E más con la app real: cerrar oculta, la ventana sigue viva y es una sola. «Iniciar con Windows» no se prueba con la app real porque escribiría en el registro de este equipo; su lógica está en las pruebas unitarias.

- [ ] **T117. Electron: instaladores completo y ligero, y actualización del ligero desde el servidor.**
  - *Depende:* T116, T114
  - *Estado (2026-10-26):* hecha, salvo construir el completo, que espera a T125.
    - **Instaladores NSIS con electron-builder** (`pnpm --filter @impocaribe/desktop instalador` e `instalador:completo`):
      - el ligero (`impocaribe-<versión>.exe`, 123 MB, para el usuario) lleva la app y la interfaz en sus recursos;
      - el completo (`impocaribe-completo-<versión>.exe`, para todo el equipo) lleva además `server-bundle` y se niega a construirse sin él;
      - cada uno sale con su `.sha256` (DT-16), y la app sabe qué instalador la puso (para «Crear servidor», T127);
      - del binario de SQLCipher solo va el de Windows x64, fuera del asar.
    - **Actualización del ligero (RF-UPD-05):** el proceso principal descarga la versión del servidor emparejado por el transporte que verifica su identidad, con su progreso hacia la banda de AL-15 o EST-07; comprueba el SHA-256 publicado (si no coincide, lo borra y no instala); abre el instalador, que pide la confirmación del usuario, y cierra la app. La interfaz solo dice qué versión instalar: el servidor y su dirección salen del emparejamiento guardado, la versión tiene que ser más nueva que la instalada y la huella se le pide al servidor verificado (así un fallo en la interfaz no puede hacer que se descargue y abra otro programa). La dirección guardada se valida (IPv4 o nombre, puerto 1-65535).
    - **Firma del proyecto (decisión del responsable del 2026-10-26):** el build firma cada instalador con una clave Ed25519 propia (privada solo en `.env`, `IMPOCARIBE_FIRMA_CLAVE`; sin ella no construye) y deja el `.sig` junto al `.exe`. P-26 pide ese `.sig` al publicar uno de Windows (migración 0016: `app_releases.signature`) y `/updates/check` lo entrega. La app trae la clave pública (`resources/firma-publica.pem`) y no abre un instalador sin firma válida, venga de donde venga; así, aunque una interfaz comprometida reescribiera el emparejamiento, no podría hacer abrir otro programa. Android no lo necesita: el sistema rechaza una actualización firmada con otra clave.
    - **Pruebas:**
      - 4 de la descarga contra un servidor HTTPS de prueba (buena, huella cambiada, intruso, versión inexistente);
      - la de la plataforma de escritorio y la de AL-15 con el servidor esperado;
      - las 3 E2E de la app, también contra la app empaquetada (`IMPOCARIBE_APP_EXE`): interfaz desde los recursos, SQLCipher fuera del asar.
    - **Sin probar en este equipo:** ejecutar el instalador, porque instalaría la app en esta PC.

- [ ] **T118. Android: base**, con la comprobación del WebView y la pantalla nativa P-27, el transporte nativo con OkHttp (DT-19), `NsdManager` con `MulticastLock`, difusión UDP y lector de QR.
  - *Cubre:* RNF-02, RF-CON-01, RF-UI-11, DT-15
  - *Depende:* T087, T114, T036
  - *Pruebas:* con un WebView 86 simulado se muestra P-27; con 87 arranca la interfaz.
  - *Decisiones del responsable (2026-10-26):* (1) la app Android usa el mismo puente nativo que la de escritorio (los canales de `NATIVE_CHANNELS`, con el mismo filtro de SQL) implementado en un plugin propio, con la copia local en SQLCipher (`sqlcipher-android`) en lugar de `@capacitor-community/sqlite`; (2) el QR se lee con ML Kit con el modelo incluido en el APK (no depende de Play Store, R-10).
  - *Estado (2026-10-26):* hecha.
    - **Puente nativo** (plugin `ImpocaribeNative`, `nativo/`): los mismos canales que la PC; los bytes viajan como `{ $bytes: base64 }` (`web/src/platform/capacitor-bridge.ts`). La interfaz arranca con el puente que encuentre (Electron o Capacitor) en `main.tsx`.
      - transporte con OkHttp que verifica la identidad del servidor como en la PC (DT-18, `ServerIdentity`, portada a Java);
      - descubrimiento con `NsdManager` y `MulticastLock`, difusión UDP, sondeo y subred;
      - almacenamiento seguro con una clave AES-GCM del Keystore;
      - copia local en SQLCipher con el mismo filtro de SQL que la PC (`SqlGuard`).
    - **P-27 nativa:** `EntryActivity` comprueba el WebView antes de cargar la interfaz; si es anterior a 87 abre `WebViewOutdatedActivity`, que busca el servidor (el emparejado, si lo hay), descarga el instalador publicado con su progreso y su SHA-256, y solo lo abre si es el paquete esperado firmado por el mismo fabricante que el WebView instalado (`ApkTrust`). El nombre del archivo es fijo: el servidor no decide la ruta.
    - **QR:** `QrScanActivity` con CameraX y ML Kit; pide el permiso de cámara la primera vez. Si se deniega, la interfaz dice que se empareje con el código; si se cancela, devuelve nada.
    - **Pruebas:** 19 JUnit (identidad con los certificados de prueba, filtro de SQL, cálculo de la subred, comprobación del WebView y su proveedor). En el emulador de Android 14:
      - el puente: almacenamiento seguro, SQLCipher con un BLOB de ida y vuelta, filtro, lista de canales y rechazo sin servidor;
      - P-01 en formato teléfono;
      - P-27 con WebView 86 simulado y la app con 87; sin servidor, el error y «Volver a intentarlo»;
      - el QR: permiso denegado, cámara abierta y cancelar.
    - **Pendiente, con su tarea:**
      - leer un QR real con la cámara (T123, en un teléfono);
      - `file.save`, `notify` y `update.install` responden «Todavía no está disponible» (T119 a T121);
      - la versión de la app sale aún de `versionName` 1.0 (T121);
      - el APK de depuración pesa 48,5 MB con todas las arquitecturas.
    - **Sin implementar en ningún cascarón y sin tarea que lo recoja:** el estado de la red que muestra P-30 (`discovery.lan()`, opcional, T048). Sin él, P-30 dice si el servidor responde, pero no distingue «sin red» ni «la red aísla a los equipos» (aislamiento de clientes del wifi): los dos salen como «El servidor no responde».

- [ ] **T119. Android: servicio de alertas.**
  - *Cubre:* RF-ALR-01, RNF-02
  - *Depende:* T118, T043
  - *Estado (2026-10-26):* hecha.
    - **Servicio en primer plano** (`nativo/AlertService`, tipo `specialUse` desde Android 14; en Android 7, `startService` y la notificación clásica):
      - abre su propio WebSocket con el servidor emparejado (el transporte que verifica la identidad, DT-18) y el token de dispositivo (DT-05), que solo recibe alertas y revocaciones;
      - aviso fijo «Impocaribe conectado» y una notificación por alerta, con el tipo y la referencia (RF-ALR-02), en el canal «Alertas»; tocarla abre la app;
      - se reconecta con espera creciente (2 a 30 s) y busca el servidor por su última dirección o por difusión, como P-27 (`PairedServer`);
      - vuelve a arrancar al encender el teléfono y tras actualizar la app (`BootReceiver`);
      - se detiene y borra su token y sus avisos al cerrar sesión, o si el servidor rechaza o revoca el token.
    - **Interfaz:** al arrancar la sincronización, si el servicio no tiene token pide uno (`POST /auth/device-token`; pedirlo en cada arranque llenaría la bitácora) y se lo pasa con los nombres de las alertas (canales `alerts.start` y `alerts.stop`). En Android `notify` no hace nada: notifica el servicio, también con la app abierta, para que no salga dos veces.
    - **Permisos:** notificaciones (Android 13 o superior; sin él el servicio sigue y las alertas se ven en el contador) y, una sola vez, la exclusión de la optimización de batería (plan §10.2).
    - **Arreglos de T118 encontrados al probarlo:**
      - Capacitor atiende el plugin en un solo hilo, y la búsqueda en la subred frenaba todas las demás llamadas: lo que espera a la red va a sus propios hilos;
      - las apps no podían hablar con el servidor de pruebas sin TLS: ahora la parte nativa lo dice (`plainHttp`) y la compilación de prueba de Android permite http. La app que se distribuye sigue sin permitirlo, y en la PC instalada `IMPOCARIBE_TLS` ya no cuenta.
    - **Pruebas:** 4 JUnit de los mensajes y la espera, y 2 de la sesión (pide el token solo si hace falta; cerrar sesión detiene el servicio). En el emulador de Android 14, contra el servidor real sin TLS:
      - emparejar por dirección y código, iniciar sesión y los dos permisos;
      - con la app cerrada (sin tarea), una alerta creada en la base llega como notificación;
      - tras reiniciar el teléfono, el servicio vuelve solo y la siguiente alerta llega;
      - al cerrar sesión, el servicio, su aviso y su token desaparecen.
    - **Límites:**
      - una alerta creada mientras el teléfono está apagado o sin conexión no se notifica después; se ve en el contador al abrir la app;
      - Android puede tardar varios minutos en avisar del encendido;
      - R-01 dice que la app avise si no está excluida de la batería; hoy solo se pide una vez. Falta el aviso en la interfaz;
      - en Android 7 no se probó aún (T122).

- [ ] **T120. Android: sistema.**
  - *Cubre:* RF-ORD-22, RNF-09
  - *Depende:* T118
  - *Estado (2026-10-26):* hecha.
    - **PDF a Descargas (RF-ORD-22, `nativo/Downloads`):**
      - desde Android 10, por MediaStore y sin permiso; si ya hay uno con ese nombre, el sistema le pone «(1)»;
      - en Android 7 a 9, en la carpeta Descargas con el permiso de almacenamiento, que se pide la primera vez, sin pisar otro con el mismo nombre;
      - del nombre que propone el servidor se quitan carpetas y caracteres no válidos.
    - **Compartir:** una notificación «Guardado en Descargas» con el nombre. Tocarla abre el PDF y su botón «Compartir» abre el selector de Android. Las pantallas no cambian: siguen diciendo «Se descargó…».
    - **Bloqueo de capturas (RNF-09):** `FLAG_SECURE` en las pantallas que lo piden, ya desde T118.
    - **Pruebas:** 3 JUnit (nombre seguro, no pisar, tipo). En el emulador de Android 14:
      - tres guardados del mismo nombre quedan como tres archivos;
      - «../» no sale de Descargas;
      - la notificación abre el PDF en el visor de Drive, y «Compartir» abre el selector.
    - **Límites:**
      - sin permiso de notificaciones (Android 13 o superior) el PDF se guarda igual, pero no aparece la opción de compartir;
      - en Android 14 el selector muestra un número en lugar del nombre del archivo; la app que lo recibe sí ve el nombre;
      - Android 7 a 9 no se probó aún (T122).

- [ ] **T121. Android: actualización.**
  - *Depende:* T120, T114
  - *Estado (2026-10-26):* hecha.
    - **Actualización (RF-UPD-05, `nativo/AppUpdate`)**, como la de la PC (T117):
      - la interfaz solo dice qué versión; tiene que ser x.y.z, más nueva que la instalada y la publicada en el servidor emparejado, cuya identidad se verifica (DT-18);
      - la primera vez lleva a «Instalar apps de este origen» y la banda dice que vuelva a tocar «Actualizar ahora»;
      - descarga con su progreso en la banda de AL-15 o en EST-07 y comprueba el SHA-256 publicado;
      - solo abre el instalador del sistema si el APK es esta app firmada con la misma clave que la instalada (`ApkTrust`), y el sistema pide la confirmación.
    - **Versión de la app:** `versionName` es la de `packages/android/package.json` y `versionCode` crece con ella (1 + mayor·10⁶ + menor·10³ + parche): Android no instala una actualización con un código menor o igual al instalado.
    - **Arreglo encontrado al probarlo:** la interfaz tomaba su versión de `packages/web/package.json`, no de la app instalada. Tras actualizar, seguía ofreciendo la misma versión y enviaba una versión equivocada en `X-App-Version` (DT-11). Ahora usa la de la parte nativa, también en la PC.
    - **Pruebas:** 2 JUnit de las versiones. En el emulador de Android 14, contra el servidor real sin TLS, se publicó un APK 0.0.2 como Apoderada (`POST /updates`) sobre una app 0.0.0:
      - la banda «Hay una versión nueva: 0.0.2»;
      - el permiso de instalar apps;
      - la descarga con su progreso (48 MB);
      - «¿Desea actualizar esta app?» y la app queda en 0.0.2 con la sesión y el emparejamiento intactos;
      - el servicio de alertas vuelve a arrancar solo tras actualizar;
      - la banda ya no aparece.
    - **Pendiente, con T125:** la clave de firma del APK que se distribuye. En las pruebas las dos versiones llevan la de depuración. Esa clave hay que guardarla siempre: con otra, Android no deja actualizar.

- [ ] **T122. Pruebas de humo en la app Android real.** Playwright para Android en emuladores Android 7 y 14: emparejar, iniciar sesión, primera sincronización, emitir una orden, recibir una alerta con la app cerrada y trabajar sin conexión.
  - *Cubre:* RNF-02, plan §11.2
  - *Depende:* T121
  - *Terminado:* pasan en ambos emuladores en tres ejecuciones seguidas.
  - *Decisión del responsable (2026-10-28):* las tres ejecuciones seguidas no se hacen en el equipo de desarrollo, que no tiene procesador ni memoria para el emulador junto al servidor de pruebas. Basta la ejecución completa que ya pasó en Android 14. Los fallos de las repeticiones fueron del equipo y no de la app: el sistema del emulador sin responder, el servidor de pruebas sin compilar por falta de memoria y la sesión cortada.
  - *Estado (2026-10-28):* hecha en Android 14 con esa decisión.
    - **Prueba** (`web/e2e/android.e2e.ts`, `pnpm --filter @impocaribe/web e2e:android` con el APK de prueba sin TLS):
      - emparejar por dirección y código;
      - entrar y la primera sincronización;
      - emitir una orden en el teléfono;
      - una alerta con la app cerrada;
      - abrir sin conexión con la copia local.
    - **Fallos de la app que encontró, ya corregidos:**
      - el borrador esperaba a la sincronización para borrarse al emitir (RF-ORD-06);
      - la versión de la app salía del paquete web;
      - el plugin atendía todo en un solo hilo;
      - el aviso fijo decía «conectado» mientras buscaba el servidor.
    - **Para el equipo cargado:** el primer arranque solo crea la Apoderada (los 15 usuarios del navegador sobran aquí) y, antes de abrir la app, se cierran los diálogos del sistema.
    - **Android 7 no se ejecutó en el emulador**, por la misma falta de recursos. Queda en la lista manual (T143), con el WebView actualizado con el Chrome 119 descargado y verificado (firma de Google).

- [ ] **T123. Revisión de experiencia en dispositivos reales.** Recorrer todas las pantallas en:
  - el dispositivo de referencia (teléfono);
  - una tablet en vertical y horizontal;
  - Windows 10 y 11;
  - Android 7 con el WebView actualizado.

  Se corrigen los problemas de uso encontrados.
  - *Cubre:* Const. art. XIV, RF-UI-10
  - *Depende:* T117, T121
  - *Terminado:* aprobada por el responsable.

## F11. Servidor desde la app, red, energía y despliegue

- [x] **T124. Maquetas de P-28 Crear servidor y P-29 Estado del servidor** (solo escritorio).
  - *Cubre:* RF-UI-09
  - *Depende:* T017
  - *Terminado:* aprobadas.
  - *Estado (2026-10-27):* `docs/maquetas/T124-servidor.html` (claro y oscuro, solo escritorio), aprobada por el responsable el 2026-10-27:
    - **P-28:** cinco pasos:
      - comprobación, con el bloqueo si ya hay un servidor y la marca ámbar con 4 GB;
      - permisos y código de instalación;
      - montaje de red;
      - creación, con los 10 pasos del plan §10.3, la barra y el detalle técnico;
      - listo, con el QR y «Crear la primera Apoderada».

      Además, el fallo de un paso con Reintentar y Deshacer, y la variante desde un respaldo de traslado.
    - **P-29:**
      - servicio, energía, red y memoria (contra el presupuesto del plan §10.7);
      - solicitudes de emparejamiento, dispositivos, QR y mantenimiento;
      - con batería, en modo protegido, con 8 dispositivos en hotspot, y la ventana al frente con una solicitud nueva (AL-20 a AL-22);
      - los asistentes de actualizar (con la vuelta atrás), preparar traslado y desinstalar, y el restablecimiento de emergencia.

- [ ] **T125. Tres instaladores y paquete de distribución.** Compilación del instalador completo (app + `server-bundle`), del ligero y del APK con sus SHA-256; generación del código de instalación por empresa (solo su comprobación va en el instalador completo; el código se imprime aparte); instaladores del WebView (Chrome y Android System WebView en su última versión compatible con Android 7).
  - *Cubre:* RF-INS-01, 02, DT-16, DT-15
  - *Depende:* T117, T121
  - *Pruebas:* el instalador ligero no contiene `server-bundle` ni ofrece "Crear servidor"; el código no aparece en ningún archivo del paquete.
  - *Decisión del responsable (2026-10-27):* la clave de firma del APK la genera el proyecto: `D:\Trabajo\Web\Islabeya\claves\impocaribe-release.jks` (fuera del repositorio; RSA 4096, válida unos 27 años), con su contraseña solo en el `.env`. Huella SHA-256 del certificado: `E4:E9:18:0C:03:4F:7B:60:10:FC:71:56:F0:37:67:7E:46:A7:40:5E:4F:0A:35:76:B2:10:73:71:AE:FB:03:62`. El responsable guarda una copia del archivo y de la contraseña fuera del equipo: sin ellos no se puede actualizar la app en los teléfonos.
  - *Estado (2026-10-27):* preparada (`pnpm paquete "Empresa"` y `pnpm --filter @impocaribe/desktop server-bundle`), sin ejecutar aún: faltan las descargas de Node.js, PostgreSQL, WinSW y los WebView.

- [ ] **T126. Ayudante de instalación.** `impocaribe-setup.exe` con elevación de Windows, comprobaciones del paso 0 (incluido el bloqueo si ya hay un servidor en la red), pasos 1 a 10 del plan §10.3 con diario, idempotencia, deshacer por paso, reparar y progreso por tubería con nombre. Configura PostgreSQL y el servicio con los límites de memoria del plan §10.7, y ofrece el restablecimiento de emergencia (RF-INS-11).
  - *Cubre:* RF-INS-03, 05, D14, DT-17, RNF-01, RNF-08, RNF-10, RNF-19, RF-INS-11, RNF-21
  - *Depende:* T125, T034, T012
  - *Pruebas:* un fallo inyectado en cada paso y Deshacer deja la PC como estaba; ejecutar dos veces seguidas no duplica nada; con un servidor en la red, no pasa del paso 0; un código incorrecto da `INSTALL_CODE_INVALID`.
  - *Pruebas adicionales:* con 4 GB de RAM, la comprobación muestra advertencia ámbar y deja continuar; el restablecimiento de emergencia con un código incorrecto se rechaza, y con el correcto obliga a cambiar la contraseña, revoca las sesiones de esa Apoderada y emite AL-11.
  - *Decisión del responsable (2026-10-27):* el ayudante es un ejecutable propio de un solo archivo, `impocaribe-setup.exe`, hecho con Node SEA. El aviso de permiso de Windows muestra ese nombre, con «Editor desconocido», porque no hay certificado de firma de código de Windows. Va en el paquete del servidor (`server/src/setup/`), para usar sus migraciones, su identidad y el hash del código.
  - *Estado (2026-10-28):* hecho lo que se puede probar en este equipo; falta la prueba real en las máquinas virtuales (T135).
    - **Motor** (`server/src/setup/`): pasos con diario, reintentar, deshacer y reparar; los 10 pasos del plan §10.3, cada uno limpia lo que dejó a medias si falla.
    - **Comprobación de la PC** (`shared/domain/serverChecks.ts`, la misma de P-28). La red es la de un adaptador real: una VPN, VirtualBox, Hyper-V o WSL no cuentan.
    - **Conversación con la app:** tubería con nombre al azar; la petición (con el código) va por ella, nunca en la línea de comandos. Si la app se cierra a mitad, el ayudante sigue y termina, y lo hecho queda en el diario.
    - **Ejecutable:** `impocaribe-setup.exe` con Node SEA (`server/scripts/setup-exe.mjs`, desde `server-bundle`). Sin elevar responde `comprobar` (los datos de la PC) y `codigo` (si el código es el de la empresa); elevado, `crear`, `reparar`, `deshacer` y `restablecer`.
    - **Restablecimiento de emergencia (RF-INS-11):** con el código que guarda el servidor; contraseña temporal que hay que cambiar, sesiones de esa Apoderada cerradas, bitácora (`auth.emergency_reset`) y AL-11. Un código incorrecto se rechaza y queda en la bitácora.
    - **Pruebas:**
      - 36 unitarias del motor, los pasos (con un fallo inyectado en cada uno), el diario y la tubería, y 2 de la red;
      - 3 de integración del restablecimiento contra PostgreSQL;
      - el ejecutable se construyó con el Node 24.21.0 oficial, y `comprobar` y `codigo` respondieron bien en este equipo.
    - **Sin probar aquí**, porque instalaría el servidor en esta PC: los pasos elevados de verdad (servicios, firewall, energía). Van en T135.

- [ ] **T127. (PP, solo escritorio) Pantalla P-28 Crear servidor**, incluida la variante desde un respaldo de traslado y el paso a P-02.
  - *Cubre:* RF-INS-03, RNF-18, HU-14
  - *Depende:* T126, T124, T038
  - *Estado (2026-10-28):* hecha. La variante desde un respaldo de traslado llegó con T130.
    - **P-01:** «Crear servidor en este equipo» solo en escritorio con el instalador completo; desactivado, con el motivo, si ya hay un servidor en la red.
    - **P-28** (`web/src/screens/server/`, maqueta T124):
      - comprobación: busca otro servidor por los métodos de P-01 y por la difusión del ayudante, y comprueba la PC; con uno en la red o una marca roja no deja continuar;
      - permisos: el código se comprueba sin elevar;
      - montaje de red;
      - creación: los pasos con su estado, la barra, el tiempo y el detalle técnico; si uno falla, lo dice en claro con Reintentar y Deshacer. Si Windows no da el permiso, vuelve al montaje y lo explica;
      - listo: nombre, dirección, QR de un solo uso, guía del montaje y «Crear la primera Apoderada» (P-01 se empareja sola y lleva a P-02).

      Si la ventana se cierra o se recarga durante la creación, al volver sigue en el paso 4.
    - **Escritorio** (`desktop/src/system/setup.ts`): lanza el ayudante con el permiso de Windows (Start-Process -Verb RunAs) y atiende solo la primera conexión a la tubería. Canales `setup.facts`, `setup.code`, `setup.run` y `setup.state`, con la petición filtrada campo a campo.
    - **QR:** se dibuja en la app con `uqr` (sin red).
    - **Pruebas:**
      - 5 de componente de P-28: recorrido completo con el código incorrecto y el correcto; otro servidor en la red; fallo con Reintentar y Deshacer; permiso denegado; retomar al volver a abrir;
      - 2 de P-01;
      - 5 de la tubería (incluido un segundo cliente, que no recibe la petición) y 1 de los canales;
      - 3 del estado de la creación (shared).
    - **Sin probar aquí:** el diálogo de permiso de Windows y la creación real. Van en T135.

- [ ] **T128. (PP, solo escritorio) Pantalla P-29 Estado del servidor:** estado, energía, montaje, QR, solicitudes de emparejamiento (AL-22, con la ventana al frente), dispositivos, consumo de memoria y acciones de mantenimiento, incluido el restablecimiento de emergencia. Añade también a P-30, en la PC servidor, los dispositivos conectados y el montaje de red (pendiente de T048).
  - *Cubre:* RF-INS-04, RF-RED-04, 05, RF-INS-11
  - *Depende:* T127, T035
  - *Estado (2026-10-28):* hecha, salvo las referencias visuales y la E2E (pendientes, igual que en P-28; las pide `pnpm trace`).
    - **Servidor:** `GET /local/status`, solo desde 127.0.0.1, con:
      - versión, arranque y energía;
      - montaje y dirección (la de un adaptador real, como en T126);
      - dispositivos, con los conectados ahora;
      - memoria contra el presupuesto de 1,2 GB (RNF-21, plan §10.7). Node mide su propio proceso; PostgreSQL y Chromium se miden con PowerShell, inyectable como la energía.

      Además, `GET /local/apoderadas` para el restablecimiento de emergencia.
    - **Ayudante:** operación `reiniciar`. Comprueba el código que guarda el servidor, detiene el servicio y lo arranca con la comprobación de «arranque». No toca el diario de la creación.
    - **P-29** (`web/src/screens/server/`, maqueta T124):
      - servicio, energía, red y memoria, y el aviso de 8 o más dispositivos con hotspot;
      - las solicitudes de emparejamiento con Confirmar y Rechazar, y los dispositivos (Revocar solo con una Apoderada con sesión, nunca la propia PC);
      - el QR, que se renueva antes de que caduque su token;
      - mantenimiento por el ayudante: reparar, reiniciar y restablecer la contraseña de una Apoderada (F-16).

      Sin sesión, en la PC servidor, se abre desde el login.
    - **AL-22:** en la PC servidor, una solicitud nueva trae la ventana al frente (también desde la bandeja, canal `window.attention`) con el código y Confirmar o Rechazar, en cualquier pantalla.
    - **P-30:** en la PC servidor añade el montaje de red y los dispositivos conectados.
    - **Pruebas:**
      - 4 de integración del estado (incluido el 403 desde otra IP) y 1 de la medida de memoria;
      - 8 de componente de P-29 y AL-22;
      - 1 de P-30, 1 del login y 2 del formulario F-16;
      - la de los canales del escritorio.
    - Actualizar (T129), preparar traslado (T130) y desinstalar (T131) se añadieron después a «Mantenimiento».

- [ ] **T129. Actualizar el servidor.** Respaldo previo, copia de la versión anterior, migración, comprobación, vuelta atrás si falla y publicación del instalador ligero y del APK.
  - *Cubre:* RF-INS-06, RF-UPD-01
  - *Depende:* T128, T106, T113
  - *Pruebas:* con un fallo inyectado en la migración, el servidor vuelve a la versión anterior con sus datos intactos.
  - *Estado (2026-10-28):* hecha; falta la prueba real en las máquinas virtuales (T135), porque instalaría el servidor en esta PC.
    - **Cómo:** se actualiza con el instalador completo nuevo. Su app ve que el servidor que trae (`manifest.json` de server-bundle) es más nuevo que el instalado, y P-29 ofrece «Actualizar el servidor a la X», con el código que guarda el servidor.
    - **Ayudante, operación `actualizar`** (`updateSteps`, plan §10.5):
      1. detiene el servidor y la base;
      2. guarda en frío una copia del programa y de la base (`ProgramDataImpocaribeactualizacion`, solo para el sistema y los administradores, como la base misma);
      3. pone el programa nuevo entero;
      4. arranca la base y migra;
      5. arranca y comprueba;
      6. publica el ligero y el APK.

      Si un paso falla, vuelve atrás sola: la base y el programa anteriores, y los arranca. Una actualización que quedó a medias (corte de luz) se deshace antes de empezar otra; no toca el diario de la creación. Se niega si el instalador no es más nuevo.
    - **Publicación (RF-UPD-01):** el paquete (`pnpm paquete`) mete el ligero (con su firma) y el APK en `server-bundle/publicar` antes de construir el completo. La tarea `publish-bundled` los publica como en P-26, sin Apoderada: en la bitácora, hecho por el instalador, con AL-15 a las apps. Lo ya publicado, o más viejo, se salta. Si no se puede publicar, la actualización sigue hecha y se dice que se publiquen a mano.
    - **P-29:** el botón, desactivado con el motivo si no hay un instalador más nuevo; el progreso por pasos; y el resultado. Si volvió atrás: «La actualización no se completó. El servidor volvió a la versión anterior con sus datos intactos…».
    - **Pruebas:**
      - 4 de los pasos en el PC simulado: la actualización completa; un fallo en la migración que deja la base a medias (vuelve a la versión anterior con sus datos y la arranca); el servidor nuevo que no responde; la publicación que falla;
      - 2 de integración de la publicación contra PostgreSQL;
      - 3 de componente de P-29.

- [ ] **T130. Trasladar el servidor.** Respaldo `.icmove`, estado `migrated`, creación desde traslado con la misma identidad.
  - *Cubre:* RF-INS-07, D14
  - *Depende:* T129, T107
  - *Pruebas:* los dispositivos emparejados se reconectan al servidor nuevo sin emparejarse; la PC anterior no puede volver a arrancar como servidor.
  - *Estado (2026-10-28):* hecha; falta la prueba real entre dos máquinas virtuales (T135).
    - **Archivo `.icmove`** (`server/src/backups/move.ts`):
      - lleva el volcado de la base, los archivos y la identidad, cifrado como los respaldos (DT-07);
      - la identidad va con sus claves: en la PC anterior están protegidas por esa máquina (DPAPI), y en la nueva se protegen con la suya (`exportIdentity` e `importIdentity`, que nunca pisa una identidad existente);
      - la clave privada sellada con la contraseña de respaldo va en la cabecera: en la PC nueva aún no hay base, y la contraseña basta.
    - **D14:** columna `system_settings.server_state` (migración 0017). Al preparar el traslado la base queda `migrated` (después del volcado, que va `active`). Un servidor `migrated` no arranca, y el ayudante no lo repara, reinicia, actualiza ni vuelve a trasladar. Queda en la bitácora (`server.move`).
    - **Ayudante:**
      - `trasladar` (PC anterior): el código del servidor; crea el archivo donde se eligió, detiene el servicio y lo deshabilita;
      - `crear` con el archivo (PC nueva): en «estructura» restaura la base, los archivos y la identidad del archivo antes de migrar (puede ser de una versión anterior: se migra), y conserva el montaje y el código. Si falla, Deshacer quita también lo traído;
      - `traslado`, sin elevar, lee de qué servidor es el archivo y comprueba la contraseña con el servidor que trae el instalador.
    - **P-29:** «Preparar traslado» con:
      - lo que pasará;
      - dónde guardar el archivo (con el nombre del servidor y la fecha);
      - la contraseña de respaldo;
      - «Entiendo que esta PC dejará de ser el servidor»;
      - el código de instalación.
    - **P-01 y P-28:** «Crear servidor desde un respaldo de traslado»: el paso 3 pide el archivo y la contraseña, y comprueba que es un traslado y que la abre antes de pedir el permiso de Windows.
    - **Pruebas:**
      - 4 de integración contra PostgreSQL con `pg_dump` y `pg_restore` reales. Preparar deja la base `migrated`, sin la identidad ni los datos en claro en el archivo; con otra contraseña no hace nada. Restaurar en una base vacía da la misma identidad, los mismos dispositivos y los archivos, activa. Un archivo que no es de traslado se rechaza;
      - 2 de la identidad, 2 de los pasos, 1 del formulario F-16, 3 de componente (P-28 y P-29) y la de los canales.
    - **Arreglo encontrado al probar el ejecutable:** una operación desconocida creaba y bloqueaba `C:ProgramDataImpocaribe` antes de rechazarse. Ahora se rechaza sin tocar nada.

- [ ] **T131. Desinstalar el servidor.**
  - *Cubre:* RF-INS-08
  - *Depende:* T130
  - *Pruebas:* sin escribir "DESINSTALAR" no procede; los datos quedan en la carpeta de conservación salvo que se marque borrarlos.
  - *Estado (2026-10-29):* hecha; falta la prueba real en las máquinas virtuales (T135).
    - **Ayudante, operación `desinstalar`** (`uninstallSteps`):
      1. respaldo final (tarea `backup-final`; sin contraseña de respaldo no sigue y no se quita nada);
      2. detener y quitar los dos servicios;
      3. quitar las reglas del firewall;
      4. devolver la energía de Windows a como estaba (con lo que guardó el diario de la creación);
      5. los datos (base, identidad, archivos y servicio) a `ProgramDataImpocaribedesinstalado-<fecha>`. Con «Borrar también los datos» se borran, y solo se conserva el respaldo final, que va cifrado;
      6. quitar el programa.

      Pide el código que guarda el servidor y la palabra DESINSTALAR. También desinstala una PC ya trasladada: es como se limpia. No se deshace.
    - **P-29:** «Desinstalar el servidor», con lo que pasará, «Borrar también los datos», la palabra (F-16, `uninstallSchema`) y el código. Al terminar dice dónde quedaron los datos y cómo quitar también la app.
    - **Pruebas:**
      - 3 de los pasos en el PC simulado: conserva los datos y deja Windows como antes de crear el servidor; borra los datos salvo el respaldo final; sin respaldo final no toca nada;
      - 1 del formulario, 1 de componente y la de los canales.

- [ ] **T132. Energía.** Proveedor de estado de energía, `server.power`, AL-20, modo protegido al 15 %, parada al 5 % y reanudación; avisos en todas las apps.
  - *Cubre:* RF-ENE-01 a 05, Const. art. XV, HU-16
  - *Depende:* T094, T046
  - *Pruebas:* con un proveedor simulado: al 15 % una emisión en curso termina y la siguiente recibe `SERVER_PROTECTED_MODE`; al volver la corriente se aceptan escrituras; los límites 15,0 % y 15,1 % se comportan como dicen los requisitos.
  - *Estado (2026-10-27):* hecha, pendiente de la mutación del servidor (la corre el responsable).
    - **Regla** (`shared/domain/power.ts`): con corriente, normal; con batería, aviso; al 15 % o menos, modo protegido; al 5 % o menos, parada.
    - **Servidor** (`server/src/power/`):
      - un proveedor inyectable: en Windows lee `Win32_Battery`, que también presenta un UPS conectado por USB;
      - se consulta cada 30 s;
      - en modo protegido rechaza las escrituras nuevas con `SERVER_PROTECTED_MODE`, salvo entrar, salir y emparejar; deja terminar las que están en curso (hasta 30 s) y hace `CHECKPOINT`;
      - al 5 % detiene la base de datos y su propio servicio; los nombres de los servicios los pone el ayudante (T126) en el entorno;
      - con corriente sale solo del modo protegido.
    - **Avisos:**
      - `server.power` por WebSocket a las apps conectadas, y a cada una al entrar;
      - AL-20 «El servidor funciona con batería» y, aparte, «Servidor en modo protegido por batería baja»; se resuelven solas. El porcentaje en vivo va en la banda de todas las apps, no en el título de la alerta, que no cambia mientras sigue abierta.
    - **Pruebas:**
      - 4 de los límites;
      - 6 de integración con el proveedor simulado: la emisión en curso termina y la siguiente se rechaza, vuelve a aceptar con corriente, 15,0 y 15,1 %, se puede consultar y entrar, el aviso por WebSocket, AL-20 y la parada una sola vez;
      - 1 del motor y la banda con el porcentaje desconocido.
    - **Sin probar aquí:** la lectura real de `Win32_Battery` con una laptop o un UPS, y la parada real de los servicios. Van en T135 (máquinas virtuales) y T143 (lista manual).

- [ ] **T133. Aviso de apagado e inicio con Windows** (P-31) en la PC servidor.
  - *Cubre:* RF-INS-09, RF-INS-10
  - *Depende:* T128
  - *Terminado:* verificado en Windows 10 y 11 (lista manual).
  - *Estado (2026-10-29):* hecha; falta la verificación en Windows 10 y 11 (lista manual, T143).
    - **Aviso (RF-INS-09, P-31):** en la PC servidor, la ventana retrasa el fin de la sesión (`query-session-end`), y Windows muestra el motivo con «Apagar de todos modos»: «Esta PC es el servidor de Órdenes de Carga: hay X dispositivos conectados». El texto lo fija `ShutdownBlockReasonCreate` de user32. Solo acepta la ventana del propio proceso, así que se llama desde la app con `koffi` 3.3.3 (FFI con binarios ya compilados, MIT; nueva dependencia del escritorio).
    - **El número:** la interfaz de la PC servidor lo pide cada 30 s a `/local/status` (la firma del dispositivo la hace ella) y se lo pasa a la parte nativa (canal `server.devices`). En otra PC dice que no es la servidor, y no se bloquea nada.
    - **Inicio con Windows (RF-INS-10):** la primera vez que la app sabe que es la PC servidor, lo activa; si alguien lo quita después desde la bandeja, se respeta.
    - **Pruebas:** 3 del escritorio (el texto, cuándo se bloquea y el inicio con Windows) y 2 de componente.

- [ ] **T134. Límite de dispositivos con hotspot.** AL-21 con 8 o más dispositivos conectados y montaje `hotspot`.
  - *Cubre:* RF-RED-01
  - *Depende:* T035, T094
  - *Pruebas:* con 7 no hay alerta; con 8 sí; con montaje `router`, nunca.
  - *Estado (2026-10-27):* hecha, pendiente de la mutación del servidor (la corre el responsable).
    - Con el montaje `hotspot` (`system_settings`, T052) y 8 o más dispositivos conectados se abre AL-21 (solo la ven las Apoderadas); se resuelve sola al bajar de 8.
    - Los conectados se cuentan por dispositivo: un teléfono con la app abierta y el servicio de alertas cuenta una vez. Cada vez que uno entra o sale se reevalúa.
    - **Pruebas:** 3 de integración:
      - 7 no avisa, 8 sí y se resuelve al bajar;
      - con router, nunca;
      - el conteo por dispositivo.
    - El aviso en P-29 llega con T128 (la maqueta T124 lo muestra).

- [ ] **T135. Pruebas de instalación en Windows.** Máquinas virtuales Windows 10 y 11 limpias, sin red externa y con Defender activo: crear, reparar, actualizar con fallo, trasladar, desinstalar y segundo servidor bloqueado.
  - *Cubre:* RF-INS, RNF-18
  - *Depende:* T131
  - *Terminado:* todas pasan en ambas versiones de Windows.
  - *Decisión del responsable (2026-10-29):* no habrá máquinas virtuales: el equipo de desarrollo no tiene recursos para ellas. Las pruebas las hace el responsable a mano, en PC reales con Windows 10 y 11, con la guía `docs/pruebas-manuales.md`. Esa guía cubre también T136, T123, T133, T143 y la parte manual de T141. La actualización con un fallo inyectado queda cubierta por las pruebas automáticas (`steps.test.ts`), porque a mano no se puede provocar.

- [ ] **T136. Pruebas de red reales.** Con router; con hotspot de un celular dedicado con Android 11 o superior (reiniciar el hotspot cambia la subred); PC de escritorio con adaptador wifi USB; 8 dispositivos (AL-21); multidifusión bloqueada; un equipo intruso que responde como servidor.
  - *Cubre:* RF-RED-01 a 07, RNF-17
  - *Depende:* T134, T119
  - *Terminado:* documentado con evidencia.

- [ ] **T137. Guía de instalación y operación.** Los dos montajes paso a paso, requisitos de hardware (UPS o laptop, adaptador USB), crear el servidor, emparejar dispositivos, actualizar el WebView, exclusión de batería por marca, hora del servidor, USB de respaldo, restauración, traslado y desinstalación.
  - *Cubre:* R-01, R-03, R-06, R-08 a R-10, R-13 a R-16
  - *Depende:* T136, T135
  - *Terminado:* revisada por el responsable.

## F12. Verificación final

- [ ] **T138. Extremo a extremo completo.** HU-01 a HU-18 y el recorrido de aceptación de **cada pantalla** P-01 a P-32, en las tres clases de dispositivo (P-28, P-29 y P-31 solo en escritorio), contra el servidor real.
  - *Cubre:* RF-UI-01, Const. art. XIV
  - *Depende:* F1 a F11
  - *Terminado:* pasa en tres ejecuciones seguidas.

- [ ] **T139. Simulación de un mes.** 15 usuarios concurrentes; verificación de D1 a D15, con cortes de red aleatorios y reintentos al final de cada día simulado.
  - *Depende:* T138
  - *Decisión del responsable (2026-10-29):* pospuesta a una actualización de calidad posterior a la entrega, por el plazo. Antes de la entrega solo se cierran F10 y F11, la accesibilidad (T141) y el extremo a extremo completo (T138).

- [ ] **T140. Rendimiento.**
  - Servidor: RNF-03, RNF-04, RNF-12 y RNF-14 en la PC servidor real.
  - Red e instalación: RNF-17 con router y con hotspot, y RNF-18.
  - Interfaz: RNF-13, **RNF-15** y **RNF-20** en el dispositivo de referencia.
  - Consumo de recursos (RNF-21): en una máquina virtual Windows 10 con **4 GB** de RAM, con el servidor y la app de escritorio abiertos y 8 dispositivos simulados, se miden la memoria en reposo y en operación y los tiempos de RNF-03; en el dispositivo de referencia, la memoria de la app Android.
  - *Depende:* T139
  - *Decisión del responsable (2026-10-29):* pospuesta a una actualización de calidad posterior a la entrega, por el plazo. Antes de la entrega solo se cierran F10 y F11, la accesibilidad (T141) y el extremo a extremo completo (T138).

- [ ] **T141. Accesibilidad.** Revisión automática de todas las pantallas en las tres clases, más una revisión manual: teclado en escritorio, texto al 130 % y lector de pantalla en las acciones principales.
  - *Cubre:* RNF-16
  - *Depende:* T138

- [ ] **T142. Trazabilidad automática.** `pnpm trace` falla si:
  - algún ID de la spec (RF, RNF, HU, D) no tiene al menos una prueba que lo cite;
  - alguna pantalla P-xx de `ui-spec.md` no tiene prueba de extremo a extremo y referencias visuales en sus clases de dispositivo.
  - *Depende:* T138
  - *Estado (2026-10-28):* la herramienta está hecha; el criterio se cumplirá con T138.
    - **`pnpm trace`** (`scripts/quality/trace.ts`):
      - lee los RF y RNF de la spec, las HU y los invariantes D de la Constitución;
      - los busca citados en las pruebas (unitarias, de integración, E2E, visuales y Java), también abreviados: «RF-ORD-13, 17», «RF-ENE-01 a 05», «D1 a D15»;
      - para cada pantalla de ui-spec, exige una E2E que la cite y referencias visuales de sus historias en cada clase. P-28, P-29 y P-31 solo en escritorio.
    - **Excepciones**, que el informe muestra con su motivo: P-27 (pantalla nativa de Android) y P-31 (diálogo de Windows) no son de la interfaz web y van en la lista manual (T143).
    - **Pruebas:** 6.
    - **Primer informe (2026-10-28), lo que falta:**
      - sin prueba que los cite (18): RF-ORD-01, 02, RF-TAB-01, 02, 05, RF-BIT-04, RF-CON-08, HU-03, 05, 07, 08, 11, 12, 14, 15, 16, 18 y D14;
      - sin E2E ni referencias visuales: P-28 y P-29.
    - **Los 18, revisados uno a uno (2026-10-29):**
      - la mayoría ya tenía una prueba que comprueba lo que piden, y se les añadió la cita: RF-ORD-01, 02; RF-TAB-01, 05; las HU; y D14, con la prueba del traslado;
      - se escribieron las que faltaban: P-15 sin conexión, con el documento desde la copia local (RF-CON-08), y el historial de la DM (RF-BIT-04);
      - a la ficha de la DM se le añadieron el plazo y el estado de cada orden (RF-TAB-02).

      Queda P-28 y P-29 sin E2E ni referencias visuales.

- [ ] **T143. Lista manual de cascarones.** Windows 10 y 11; Android 7, 10 y 14 y el dispositivo de referencia. Incluye los tres instaladores, el emparejamiento por código y por QR, el aviso de apagado y el comportamiento con batería.
  - *Depende:* T125

- [ ] **T144. Auditoría de pruebas.** Historial de cambios de pruebas, ausencia de casos especiales, mutación por módulo, una muestra de 20 pruebas con oráculo desde la spec, y una muestra de 10 pruebas de interfaz que verifican lo que ve el usuario y no detalles internos.
  - *Cubre:* Const. art. XIII
  - *Depende:* T142
  - *Decisión del responsable (2026-10-29):* pospuesta a una actualización de calidad posterior a la entrega, por el plazo. Antes de la entrega solo se cierran F10 y F11, la accesibilidad (T141) y el extremo a extremo completo (T138).

- [ ] **T145. Verificación constitucional**, incluido el Artículo XIV pantalla por pantalla.
  - *Depende:* T144, T143, T123
  - *Terminado:* firmado por el responsable.
  - *Decisión del responsable (2026-10-29):* pospuesta a una actualización de calidad posterior a la entrega, por el plazo. Antes de la entrega solo se cierran F10 y F11, la accesibilidad (T141) y el extremo a extremo completo (T138).





