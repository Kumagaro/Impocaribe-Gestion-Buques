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

- [ ] **T002. Repositorio.** Inicializar Git con la estructura del plan §13.2: `README.md`, `Constitution.md` y `specs/` en su sitio, el prototipo aprobado en `docs/referencia/`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.env.example`, plantilla de solicitud de integración con la definición de terminado y convención de ramas y commits (plan §13.3).
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

- [ ] **T004. Configuración y base de datos de desarrollo.** Carga de configuración por entorno (`development`, `test`, `production`) a partir de variables y de `.env`; scripts `db:create`, `db:migrate`, `db:reset` y `db:seed` (datos sintéticos de desarrollo); carpeta de datos de desarrollo fuera del repositorio.
  - *Cubre:* plan §13.2
  - *Depende:* T003
  - *Terminado:* `pnpm db:reset && pnpm db:seed` deja una base lista; las pruebas usan una base aparte que nunca toca la de desarrollo.

- [ ] **T005. Integración continua.** Trabajos del plan §13.4 (verificación en Linux con PostgreSQL 16, compilación en Windows, APK en Linux y trabajo nocturno), con caché de dependencias; integración en `main` bloqueada si algo falla. Hasta tener un servicio de CI, hook previo al envío que ejecuta `pnpm verify`.
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

## F0. Fundaciones, calidad y base de interfaz

- [ ] **T007. Barreras de calidad.**
  - Vitest con cobertura, fast-check y Stryker (90 % en los módulos críticos del plan §11.2).
  - Lint de pruebas y lint de producción (plan §11.3), incluidos el de **presentaciones sin lógica** y el de **movimiento barato**.
  - Hook de commit que exige el motivo al cambiar una prueba existente.
  - `pnpm verify` falla si no se cumplen los umbrales.
  - *Cubre:* Const. art. XIII, plan §11.3
  - *Depende:* T003
  - *Pruebas:* cada barrera se demuestra fallando con un ejemplo prohibido. Los ejemplos se borran después.

- [ ] **T008. Aritmética de toneladas.**
  - *Cubre:* Const. art. V, RNF-05
  - *Depende:* T007
  - *Pruebas:* `0,1 + 0,2 = 0,300`; rechazo de 4 decimales; `1 234,500`; propiedad `(a + b) − b = a`.
  - *Terminado:* mutación ≥ 90 %.

- [ ] **T009. Errores y permisos.**
  - *Cubre:* Spec §2, plan §6.3
  - *Depende:* T007
  - *Pruebas:* matriz rol × acción celda por celda; Solo lectura no ve borradores.

- [ ] **T010. Reloj inyectable.**
  - *Cubre:* RF-CON-10, plan §11.4
  - *Depende:* T007

- [ ] **T011. Servidor base.** NestJS, `health` con `serverTime`, errores 6.1, Zod, `helmet`, CORS y control 426.
  - *Cubre:* plan §6, DT-11
  - *Depende:* T009, T010

- [ ] **T012. Base de datos.** Drizzle, roles, migración inicial, `assert_append_only()` y base limpia por suite.
  - *Cubre:* plan §4, Const. art. IV
  - *Depende:* T011

- [ ] **T013. Bitácora.**
  - *Cubre:* RF-BIT-01, 02, D10
  - *Depende:* T012
  - *Pruebas:* `UPDATE` y `DELETE` fallan; un intento rechazado queda con `ok = false`.

- [ ] **T014. Registro de cambios.**
  - *Cubre:* DT-04
  - *Depende:* T012
  - *Pruebas:* 50 transacciones concurrentes sin huecos visibles; una transacción revertida no deja cambios.

- [ ] **T015. Idempotencia, concurrencia optimista y dispositivo obligatorio.** Tabla `idempotency_keys` con el resultado guardado en la misma transacción, header `Idempotency-Key` obligatorio en escrituras, `row_version` y `expectedVersion` en ediciones (`STALE_RECORD`), y guarda de dispositivo (DT-24) preparada para activarse con el emparejamiento.
  - *Cubre:* RF-ORD-23, RF-DM-12, D15, DT-22, DT-23, DT-24
  - *Depende:* T014
  - *Pruebas:* la misma petición 5 veces en paralelo produce un solo efecto y la misma respuesta; la misma clave con otro contenido da `IDEMPOTENCY_MISMATCH`; dos ediciones con la misma versión: una gana y la otra recibe `STALE_RECORD`.

- [ ] **T016. Escenario real del Excel.** Fixture con las 12 DM y las 92 órdenes, y su resultado esperado calculado a mano. Reglas de conversión: las toneladas de cada orden son su peso de patio; las órdenes sin peso se registran como intentos sin toneladas (rechazados); el total del buque Eagle 1 es la suma de los totales declarados de sus DM; las DM sin total quedan pendientes; los números de DM se completan a 5 dígitos; cada orden se asocia a la DM por cliente y marca, y las que no coinciden con ninguna DM (por ejemplo, las de Jorge Luis Vázquez Herrera con marcas ARMALIN ALMIRAL o DELICIA DYD) son intentos rechazados por "DM inexistente"; la segunda orden 516 recibe el siguiente número de la secuencia; las órdenes marcadas "CANCELADA" se emiten y luego se anulan con el motivo "Cancelada en el Excel"; el arribo real del Eagle 1 es el 04/09/2026.
  - *Cubre:* Const. art. XIII.8
  - *Depende:* T008
  - *Terminado:* aprobado por el responsable.

- [ ] **T017. Maquetas base.** Sistema de diseño renovado sobre el prototipo (paleta, tipografía, componentes, tema oscuro), `AppShell` de teléfono, tablet y escritorio, los siete estados EST, los patrones MOV y los **estados de un campo** (ayuda, error, advertencia, aviso legal, correcto) y el resumen de errores, ilustrados.
  - *Cubre:* RF-UI-02, 03, 04, 05, 09, `ui-spec.md` §1 a §3
  - *Depende:* —
  - *Terminado:* aprobadas por el responsable.

- [ ] **T018. Tokens, tema y Storybook.** Tokens del plan §7.2 como variables CSS y constantes, tema claro y oscuro, Storybook con selector de clase de dispositivo y de tema.
  - *Cubre:* RF-UI-03, RNF-06
  - *Depende:* T017, T008
  - *Pruebas:* contraste AA de todos los pares de color de texto y fondo, en ambos temas (prueba automática).

- [ ] **T019. Adaptador de plataforma.** `platform.ts` con `deviceInfo` e implementación de prueba (`sql.js`).
  - *Cubre:* DT-03
  - *Depende:* T018

- [ ] **T020. Cliente de API.** Bearer, `X-App-Version`, `X-Device-Time`, errores, 401, 426 y 410. Genera el **registro de llamadas** usado por la prueba de contrato.
  - *Cubre:* DT-05, DT-11
  - *Depende:* T011, T019

- [ ] **T021. Transporte seguro e identidad (cliente).** Contrato de `platform.http` y `platform.ws`, lógica pura de verificación (cadena hasta la CA aprendida y nombre alternativo igual a la identidad guardada, sin comparar la IP), e implementación de pruebas en Node con la misma verificación.
  - *Cubre:* DT-18, DT-19, RF-RED-03
  - *Depende:* T020
  - *Pruebas:* un certificado de otra CA se rechaza; uno de la CA correcta con otra identidad se rechaza; la identidad correcta en una IP distinta se acepta.

- [ ] **T022. Movimiento.** `MotionProvider` (`LazyMotion`, `MotionConfig`, preferencia "Reducir animaciones"), presets MOV-01 a MOV-10 con su variante reducida y `AnimatedIcon` (Lucide) con los estados de MOV-08.
  - *Cubre:* RF-UI-05, 06, DT-13, DT-14
  - *Depende:* T018
  - *Pruebas:* con movimiento reducido (del sistema o del usuario), cada preset produce la variante reducida; ninguna duración supera la máxima de `ui-spec.md` §3; el lint de movimiento rechaza un preset que anima `height`.

- [ ] **T023. Componentes base.** La lista del plan §7.2, cada uno con historias de todos sus estados y pruebas de componente: estados, teclado y foco, objetivos táctiles de 48 dp en teléfono y tablet, y movimiento.
  - *Cubre:* RF-UI-03 a 08, RNF-16
  - *Depende:* T022
  - *Pruebas:* `Sheet` se cierra al arrastrar hacia abajo más del umbral y no por debajo; `DataTable` virtualiza por encima de 100 filas y no anima reordenamientos ahí; `OverrideDialog` no permite confirmar con menos de 10 caracteres de motivo.
  - *Terminado:* referencias visuales de los componentes aprobadas.

- [ ] **T024. Sistema de validación de formularios.** `Field` (mensaje único con prioridad error → advertencia → ayuda, marca de correcto), `ErrorSummary`, `LegalNotice`, máscaras de entrada (dígitos, mayúsculas, teléfono, toneladas), `useValidatedForm` y `UnsavedChangesGuard`, con los movimientos MOV-11 a MOV-13 y su variante reducida.
  - *Cubre:* RF-VAL-01 a 03, 07, 09 a 11, Const. art. XIV.9, plan §7.7, HU-18
  - *Depende:* T023
  - *Pruebas:* un campo no muestra error mientras se escribe por primera vez y sí al salir; tras marcarse, el error desaparece al corregir sin salir; al enviar, el foco va al primer error y el resumen enlaza a cada campo; un error del servidor con `details.fields` aparece en su campo; salir con cambios pregunta y sin cambios no; con movimiento reducido no hay temblor.

- [ ] **T025. Clases de dispositivo y AppShell.** `useDeviceClass` y los tres `AppShell` de `ui-spec.md` §1.1 (barra inferior y hoja "Más"; riel y vista dividida; menú lateral, cabecera y atajos), con los elementos globales de §1.2.
  - *Cubre:* RF-UI-02, `ui-spec.md` §1
  - *Depende:* T023
  - *Pruebas:* 599 dp da teléfono y 600 dp da tablet; Electron siempre escritorio; los atajos de escritorio navegan; Solo lectura no ve "Nueva orden" en ninguna clase.

- [ ] **T026. Infraestructura de pruebas de interfaz.**
  - **Contrato:** registro de llamadas de `web` contra las rutas y esquemas del servidor.
  - **Componente:** utilidades con la copia local en `sql.js` y respuestas generadas desde los esquemas Zod.
  - **Extremo a extremo:** Playwright contra el servidor y PostgreSQL reales, con dos usuarios, consultas directas a la base y perfiles de teléfono, tablet y escritorio.
  - **Visual:** capturas por pantalla, estado, tema y clase.
  - *Cubre:* plan §7.6, §11.2
  - *Depende:* T020, T025, T014
  - *Pruebas:* una pantalla de ejemplo con una llamada inexistente en el servidor hace fallar el contrato; un cambio de un píxel en una referencia visual se detecta.

## F1. Autenticación y usuarios

- [ ] **T027. Tablas de usuarios y sesiones.** Carné único de 11 dígitos y teléfono de 8 dígitos (se guarda sin `+53`).
  - *Cubre:* RF-USR-01
  - *Depende:* T013
  - *Pruebas:* `+53 52345678` se guarda como `52345678`; 7 dígitos se rechazan.

- [ ] **T028. Primer arranque**, solo desde `127.0.0.1` (la propia PC servidor).
  - *Cubre:* RF-USR-05, RF-REC-01
  - *Depende:* T027

- [ ] **T029. Login y sesiones absolutas.** Bloqueo, revocación por contraseña, desactivación y cambio de rol.
  - *Cubre:* RF-AUT-01 a 07, 10
  - *Depende:* T028
  - *Pruebas:* expira a las 24:00 h exactas aunque haya actividad; el 5.º fallo bloquea y el 4.º no.

- [ ] **T030. Recuperación de contraseña.**
  - *Cubre:* RF-REC-02 a 05
  - *Depende:* T029

- [ ] **T031. Gestión de usuarios.**
  - *Cubre:* RF-USR-02 a 04, RF-REC-06
  - *Depende:* T029

- [ ] **T032. Token de dispositivo.**
  - *Cubre:* DT-05
  - *Depende:* T029

- [ ] **T033. Identidad del servidor y certificado.** UUID, nombre `IMPOCARIBE-XXXX`, CA de la instalación y certificado por identidad, guardados con la protección de datos de Windows; el servidor arranca con ellos.
  - *Cubre:* DT-18, RF-RED-03
  - *Depende:* T011
  - *Pruebas:* el certificado no contiene ninguna IP; regenerar la identidad sin borrar la anterior es imposible sin la acción explícita del ayudante.

- [ ] **T034. Descubrimiento: anuncio del servidor.** Servicio DNS-SD `_impocaribe._tcp`, respuesta a difusión UDP 47800 y `GET /discovery`.
  - *Cubre:* RF-RED-02, DT-20
  - *Depende:* T033
  - *Pruebas:* el anuncio incluye identidad, versión y huella; la respuesta a difusión no revela nada más.

- [ ] **T035. Emparejamiento: servidor.** Tablas `devices` y `pairing_requests`, código de comparación, token de QR, caducidad a los 5 min, endpoints `/local/*` solo desde `127.0.0.1`, revocación y secreto por dispositivo exigido junto a la sesión. Activa la guarda de dispositivo de DT-24 en todos los endpoints; la app de la PC servidor se empareja sola por `/local`.
  - *Cubre:* RF-RED-04, 05
  - *Depende:* T033, T029
  - *Pruebas:* `/local/*` desde otra IP responde 403; un código caducado no se puede confirmar; un QR no sirve dos veces; un dispositivo revocado recibe `DEVICE_REVOKED` y `device.revoked`.

- [ ] **T036. Descubrimiento y emparejamiento: cliente.** Lógica de los métodos en orden (última dirección, DNS-SD, difusión, subred, QR o manual), redescubrimiento tras cambio de IP, cálculo del código y almacenamiento de la identidad y la huella. Interfaz `platform.discovery` con implementación de prueba.
  - *Cubre:* RF-RED-02 a 04, RNF-17
  - *Depende:* T021, T034, T035
  - *Pruebas:* con multidifusión bloqueada cae a difusión y luego a la subred; tras cambiar la IP del servidor, lo vuelve a encontrar en menos de 10 s; un intermediario produce códigos distintos en cada extremo.

- [ ] **T037. Maquetas de P-01 a P-05, P-21 y P-30.**
  - *Cubre:* RF-UI-09
  - *Depende:* T017
  - *Terminado:* aprobadas.

- [ ] **T038. (PP) Pantallas P-01 a P-04:** Conexión y emparejamiento, Primer arranque, Login y Recuperar.
  - *Cubre:* HU-05, RF-AUT, RF-REC, RF-RED-02 a 04, RNF-09, HU-15
  - *Depende:* T026, T030, T037, T036

- [ ] **T039. (PP) Pantalla P-05 Perfil.** Sesiones, contraseña, códigos, tema y "Reducir animaciones".
  - *Cubre:* RF-AUT-07, RF-REC-03, RF-UI-06
  - *Depende:* T038

- [ ] **T040. (PP) Pantalla P-21 Usuarios.**
  - *Cubre:* HU-11, RF-USR, RF-AUT-10
  - *Depende:* T031, T038

- [ ] **T041. Guardas de rol en la interfaz.**
  - *Cubre:* Spec §2, EST-05
  - *Depende:* T038
  - *Pruebas:* E2E con los tres roles en las tres clases.

## F2. Sincronización base y copia local

Desde aquí, **toda pantalla lee de la copia local** y toda escritura registra sus cambios.

- [ ] **T042. Endpoints de sincronización.**
  - *Cubre:* RF-CON-02, 03, 09, 10
  - *Depende:* T014, T032

- [ ] **T043. WebSocket.**
  - *Cubre:* RNF-04
  - *Depende:* T042

- [ ] **T044. Base local.**
  - *Cubre:* DT-03
  - *Depende:* T019

- [ ] **T045. Motor de sincronización.**
  - *Cubre:* RF-CON-03, 04, 09
  - *Depende:* T043, T044
  - *Pruebas:* propiedad de convergencia con 1 000 operaciones y cortes de red.

- [ ] **T046. Lecturas locales.** Hooks e invalidación; el resaltado MOV-02 se aplica a las filas modificadas por la sincronización.
  - *Cubre:* Const. art. VII, RNF-13
  - *Depende:* T045

- [ ] **T047. Modo sin conexión.** Banda, escrituras desactivadas (EST-03), sesión vencida con 72 horas de consulta, hora desfasada e icono de sin conexión (MOV-08).
  - *Cubre:* HU-06, RF-CON-01, 05, 06, 10, RF-AUT-09
  - *Depende:* T046

- [ ] **T048. (PP) Pantalla P-30 Diagnóstico de red.**
  - *Cubre:* RF-RED-06
  - *Depende:* T036, T047
  - *Pruebas E2E adicionales:* servidor apagado → "El servidor no responde"; aislamiento simulado detectado y explicado.

- [ ] **T049. Cierre de sesión y revocación.**
  - *Cubre:* RF-AUT-08
  - *Depende:* T045

## F3. Empresa, firma, cuño y configuración

- [ ] **T050. Archivos.**
  - *Depende:* T013

- [ ] **T051. Empresa, firma oficial y cuño oficial.**
  - *Cubre:* RF-EMP-01, 02, 05, 06
  - *Depende:* T050, T031

- [ ] **T052. Configuración del sistema**, incluidos el montaje de red declarado, el texto del aviso legal del plazo y el cambio del código de instalación.
  - *Cubre:* RF-CFG-01 a 04
  - *Depende:* T031

- [ ] **T053. Maquetas de P-22 y P-23.**
  - *Depende:* T017

- [ ] **T054. (PP) Pantallas P-22 Empresa y P-23 Configuración.**
  - *Cubre:* RF-EMP, RF-CFG, RNF-09
  - *Depende:* T051, T052, T053, T041, T046

## F4. Catálogos

- [ ] **T055. Tablas y servicios de catálogos.** Normalización, unicidad (clientes por nombre normalizado), al menos un remolque por camión, carné (identificador) y licencia de 11 dígitos, obligatorios y únicos, y transportista obligatorio del chofer y del remolque (los remolques habituales de un camión, del mismo transportista). Desactivación de transportistas (sus camiones, remolques y choferes dejan de poder elegirse) y de clientes (bloqueada con DM abiertas).
  - *Cubre:* RF-CAT-01 a 05, 07, RF-CAT-09, RF-CAT-10, RF-CAT-11
  - *Depende:* T013
  - *Pruebas:* "w 011 612" es duplicado de "W011612"; camión sin remolque rechazado; licencias de 10 y 12 dígitos rechazadas; chofer sin transportista, carné o licencia rechazado; licencia repetida rechazada; "Nuevos Tiempos S.R.L." y "NUEVOS TIEMPOS SRL" son el mismo cliente; "Nuevos Tiempos" y "Nuevo Tiempo" solo se avisan como parecidos.

- [ ] **T056. Endpoints y DTO de catálogos**, con los esquemas F-11 a F-13, el filtro de choferes por transportista, el cambio de transportista con motivo y `/validation/unique`.
  - *Cubre:* RF-CAT-06 a 08, RF-CAT-09, RF-VAL-04 a 06
  - *Depende:* T055, T042

- [ ] **T057. Maquetas de P-18 a P-20.**
  - *Depende:* T017

- [ ] **T058. (PP) Pantalla P-18 Choferes y camiones**, con choferes por transportista y búsqueda por carné.
  - *Cubre:* RF-CAT-03 a 08, HU-08
  - *Depende:* T056, T057, T046, T041

- [ ] **T059. (PP) Pantallas P-19 Clientes y P-20 Transportistas.**
  - *Cubre:* RF-CAT-01, 02
  - *Depende:* T058

## F5. Buques, DM y asignaciones

- [ ] **T060. Dominio de saldos, estados y plazo.**
  - *Cubre:* spec §6, RF-DM-06, 10, RF-PLZ-01, 02, 05
  - *Depende:* T008, T010
  - *Pruebas:* tabla de RF-PLZ-01; fin de mes, fin de año y cambio de horario; prioridad de estados.
  - *Terminado:* mutación ≥ 90 %.

- [ ] **T061. Código de buque y número de orden.**
  - *Cubre:* RF-BUQ-02, RF-ORD-15
  - *Depende:* T007

- [ ] **T062. Buques.**
  - *Cubre:* RF-BUQ-01 a 07
  - *Depende:* T060, T061, T014

- [ ] **T063. DM y versiones**, con conflicto de edición (`STALE_RECORD`) y fecha de creación asignada por el servidor.
  - *Cubre:* RF-DM-01 a 05, D6, D13
  - *Depende:* T062, T055

- [ ] **T064. Asignaciones.**
  - *Cubre:* RF-ASG-01 a 04, D2, D11
  - *Depende:* T063

- [ ] **T065. Vistas de saldo.**
  - *Cubre:* Const. art. I, RF-BUQ-06, D1
  - *Depende:* T064

- [ ] **T066. DTO de buques, DM y asignaciones.**
  - *Depende:* T065, T042

- [ ] **T067. Vencimiento y reactivación.**
  - *Cubre:* RF-PLZ-03, 04, D7, HU-09
  - *Depende:* T066

- [ ] **T068. Cierre de buque y sobrante.** Destinos `allocate`, `transfer` (aumenta el total del buque destino y queda registrado en ambos) y `loss` (solo Apoderada), combinables. `SURPLUS_UNRESOLVED`. Sobrante posterior al cierre.
  - *Cubre:* RF-BUQ-08, 09
  - *Depende:* T066
  - *Pruebas:* no se cierra con 0,001 t sin destino; una transferencia a un buque cerrado se rechaza; un Operador recibe `FORBIDDEN` en `loss`; dos transferencias cruzadas concurrentes no se interbloquean.

- [ ] **T069. Propiedades de F5.**
  - *Cubre:* D2, D7, D11, D13
  - *Depende:* T067, T068

- [ ] **T070. Maquetas de P-07 a P-11.**
  - *Depende:* T017

- [ ] **T071. (PP) Pantallas P-07 Buques y P-08 Ficha de buque**, incluido el flujo de cierre con los tres destinos.
  - *Cubre:* RF-BUQ-01 a 09, RF-TAB-05
  - *Depende:* T068, T070, T046, T041

- [ ] **T072. (PP) Pantallas P-09 a P-11 DM:** lista, ficha, alta (con el aviso legal obligatorio de RF-DM-13), edición, asignación y reactivación.
  - *Cubre:* RF-DM, RF-ASG, RF-PLZ-04, 05, RF-TAB-02, 04, HU-04, HU-09, RF-DM-13
  - *Depende:* T067, T071

## F6. Órdenes, numeración y PDF

- [ ] **T073. Validación de emisión y corrección**, incluido que chofer, camión y remolques sean del mismo transportista (`DRIVER_CARRIER_MISMATCH`, `TRAILER_CARRIER_MISMATCH`).
  - *Cubre:* RF-ORD-13, 17, RF-DM-07, 11, D3, D4, D5
  - *Depende:* T060
  - *Terminado:* mutación ≥ 90 %.

- [ ] **T074. Advertencias de negocio y aviso legal.** Funciones puras de ADV-01 a ADV-07, de la advertencia del carné (AAMMDD) y del aviso legal del plazo, en `shared/validation/warnings.ts`.
  - *Cubre:* RF-VAL-08, RF-DM-13
  - *Depende:* T073
  - *Pruebas:* límites exactos calculados a mano: quedarían 1,000 t (sin ADV-02) y 0,999 t (con ADV-02); 95 % exacto (sin ADV-03) y 95,001 % (con ADV-03); días 24 y 25 para ADV-01; 3 y 4 órdenes del chofer para ADV-07; 5 % y 4,999 % libre para ADV-06; carné `84011905548` sin advertencia y `84133105548` con advertencia.
  - *Terminado:* mutación ≥ 90 %.

- [ ] **T075. Tablas de órdenes.**
  - *Cubre:* RF-ORD-01, 02, Const. art. III
  - *Depende:* T064

- [ ] **T076. Borradores en el servidor.**
  - *Cubre:* RF-ORD-06 a 11, D9
  - *Depende:* T075, T014

- [ ] **T077. Plantilla del PDF A4**, con los formatos del documento actual (`pdfFormat.ts`, plan §8.1).
  - *Cubre:* RF-PDF-01
  - *Depende:* T003
  - *Pruebas:* `29.08.2026`, `30/08/2026`, `17.280` y `1 125.000` exactos, calculados a mano.

- [ ] **T078. Motor de PDF**, con una sola instancia de Chromium y una página a la vez, que se abre con la primera emisión y se cierra tras 10 minutos sin emisiones (plan §10.7).
  - *Cubre:* DT-06, RNF-21
  - *Depende:* T077, T050
  - *Pruebas adicionales:* tras 10 minutos sin emisiones, Chromium está cerrado y la siguiente emisión lo vuelve a abrir y genera el PDF correctamente; dos emisiones simultáneas se encolan sin abrir dos instancias.

- [ ] **T079. Emitir orden.**
  - *Cubre:* RF-ORD-03, 12 a 16, RF-EMP-03, 04, RF-DM-07, 08, HU-01, D8, RF-ORD-23, RF-ORD-24, D15
  - *Depende:* T073, T076, T078, T051, T066
  - *Pruebas adicionales:* emitir a las 23:59:59 del día 30 pasa y a las 00:00:00 del día 31 se rechaza aunque la tarea de vencimiento no haya corrido; un reintento tras perder la respuesta devuelve la misma orden.

- [ ] **T080. Concurrencia de emisión.**
  - *Cubre:* D1, D2, Const. art. II y VI, RNF-07
  - *Depende:* T079

- [ ] **T081. Corregir.**
  - *Cubre:* RF-ORD-17, 18, 20, RF-DM-09, 11, HU-02.1
  - *Depende:* T079
  - *Pruebas adicionales:* reducir toneladas en una DM vencida libera la diferencia al buque; con buque cerrado abre AL-17.

- [ ] **T082. Anular.**
  - *Cubre:* RF-ORD-19, RF-EMP-03, RF-BUQ-09, HU-02.2
  - *Depende:* T081, T068

- [ ] **T083. Descargas del PDF.**
  - *Cubre:* RF-ORD-21
  - *Depende:* T079

- [ ] **T084. Propiedades de órdenes.**
  - *Depende:* T082

- [ ] **T085. Maquetas de P-13 a P-16**, incluida la vista previa del documento y el formulario por pasos de teléfono.
  - *Depende:* T017

- [ ] **T086. (PP) Pantalla P-13 Nueva orden**, con el transportista primero, que filtra camiones y choferes, y las advertencias ADV-01 a ADV-04 y ADV-07 en sus campos.
  - *Cubre:* HU-01, RF-ORD-03 a 05, 12, 13, RF-VAL-08
  - *Depende:* T079, T085, T058, T072
  - *Pruebas E2E adicionales:* sobregiro, capacidad, camión repetido, fecha de carga fuera de rango; emisión verificada en la base y en la copia local de otro usuario.

- [ ] **T087. (PP) Borradores locales y pantalla P-14 Borradores.**
  - *Cubre:* RF-ORD-06 a 11, HU-06
  - *Depende:* T086, T047

- [ ] **T088. (PP) Pantalla P-15 Orden**, con el visor del PDF y la línea de tiempo de versiones.
  - *Cubre:* HU-02, RF-ORD-21, 22, RF-BIT-04, RF-CON-08
  - *Depende:* T082, T083, T085

- [ ] **T089. (PP) Pantalla P-16 Corregir y Anular.**
  - *Cubre:* RF-ORD-17 a 19, RF-DM-11
  - *Depende:* T088

- [ ] **T090. Comparación visual del PDF.**
  - *Cubre:* RF-PDF-01
  - *Depende:* T083
  - *Terminado:* referencias aprobadas por el responsable.

- [ ] **T091. Reproducción del Excel.**
  - *Cubre:* spec §11.5, Const. art. XIII.8
  - *Depende:* T082, T016

## F7. Alertas

- [ ] **T092. Motor de alertas.**
  - *Cubre:* RF-ALR-03, 05
  - *Depende:* T042

- [ ] **T093. Alertas por eventos.**
  - *Depende:* T092, T079, T064, T030

- [ ] **T094. Alertas por condición y tiempo** (AL-01, 03, 04, 08, 09, 12, 16, 17, 18, 19 y 23).
  - *Depende:* T092, T067, T068

- [ ] **T095. Maquetas de P-17**, incluido el panel lateral de alertas de escritorio.
  - *Depende:* T017

- [ ] **T096. (PP) Pantalla P-17 Alertas**, con el contador y la campana animada en los tres `AppShell`.
  - *Cubre:* RF-ALR-01 a 05, HU-07
  - *Depende:* T093, T094, T095, T046

- [ ] **T097. Alertas locales** (AL-13, 14 y 15).
  - *Depende:* T047

- [ ] **T098. Notificaciones del sistema con la app abierta.**
  - *Cubre:* RF-ALR-01, 02
  - *Depende:* T096

## F8. Tablero, búsqueda y bitácora

- [ ] **T099. Maquetas de P-06, P-12, P-25 y P-32.**
  - *Depende:* T017

- [ ] **T100. (PP) Pantalla P-06 Tablero**, con las cifras por buque según RF-TAB-01 y las etapas de RF-TAB-04.
  - *Cubre:* RF-TAB-01, HU-03, RF-TAB-04
  - *Depende:* T096, T099
  - *Pruebas E2E adicionales:* con dos usuarios, el saldo cambia con animación en menos de 5 segundos; los números coinciden con las vistas SQL en el escenario Excel.

- [ ] **T101. (PP) Pantalla P-12 Buscar** y archivo en línea, incluida la búsqueda por la parte final del número de orden.
  - *Cubre:* RF-TAB-03, RF-CON-07, HU-10
  - *Depende:* T072, T099

- [ ] **T102. (PP) Pantalla P-32 Órdenes**, con filtros, totales del rango y filtro rápido "Hoy".
  - *Cubre:* RF-TAB-07, HU-17
  - *Depende:* T100

- [ ] **T103. [∥] Seguimiento en PDF.**
  - *Cubre:* RF-TAB-06
  - *Depende:* T078

- [ ] **T104. (PP) Bitácora:** endpoint y pantalla P-25.
  - *Cubre:* RF-BIT-03, HU-13
  - *Depende:* T013, T099, T041

## F9. Respaldo y restauración

- [ ] **T105. Cifrado de respaldos** y confirmación periódica de la contraseña (RF-RES-08): confirmar verificando que descifra la clave privada, aplazar hasta 3 veces y AL-23.
  - *Cubre:* DT-07, RF-RES-04, RF-RES-08
  - *Depende:* T051

- [ ] **T106. Respaldos por hora y diarios.**
  - *Cubre:* RF-RES-01, 02, 05, RNF-14
  - *Depende:* T105, T094, T052

- [ ] **T107. Restauración y numeración.**
  - *Cubre:* RF-RES-03, 06, D12
  - *Depende:* T106, T045

- [ ] **T108. Modo de confirmación de numeración.**
  - *Depende:* T107

- [ ] **T109. Recuperar órdenes perdidas.**
  - *Cubre:* RF-RES-07
  - *Depende:* T107

- [ ] **T110. Propiedad de restauración.**
  - *Cubre:* D12
  - *Depende:* T109

- [ ] **T111. Maquetas de P-24.**
  - *Depende:* T017

- [ ] **T112. (PP) Pantalla P-24 Respaldos y restauración.**
  - *Cubre:* HU-12, RF-RES
  - *Depende:* T109, T108, T111

## F10. Cascarones y actualizaciones

- [ ] **T113. Publicación de versiones** del instalador ligero y del APK (el completo no se publica).
  - *Cubre:* RF-UPD-01 a 04, RNF-11
  - *Depende:* T050

- [ ] **T114. (PP) Pantalla P-26 Versiones y estado EST-07.** Incluye las maquetas de P-26 y P-27.
  - *Cubre:* RF-UPD-02 a 05
  - *Depende:* T113, T097

- [ ] **T115. Electron: base**, con el transporte nativo (DT-19) y el descubrimiento (DNS-SD, difusión y subred).
  - *Cubre:* DT-02, DT-03, RF-CON-01
  - *Depende:* T087, T036

- [ ] **T116. Electron: sistema.**
  - *Cubre:* RF-ORD-22, RNF-09, RF-ALR-01
  - *Depende:* T115

- [ ] **T117. Electron: instaladores completo y ligero, y actualización del ligero desde el servidor.**
  - *Depende:* T116, T114

- [ ] **T118. Android: base**, con la comprobación del WebView y la pantalla nativa P-27, el transporte nativo con OkHttp (DT-19), `NsdManager` con `MulticastLock`, difusión UDP y lector de QR.
  - *Cubre:* RNF-02, RF-CON-01, RF-UI-11, DT-15
  - *Depende:* T087, T114, T036
  - *Pruebas:* con un WebView 86 simulado se muestra P-27; con 87 arranca la interfaz.

- [ ] **T119. Android: servicio de alertas.**
  - *Cubre:* RF-ALR-01, RNF-02
  - *Depende:* T118, T043

- [ ] **T120. Android: sistema.**
  - *Cubre:* RF-ORD-22, RNF-09
  - *Depende:* T118

- [ ] **T121. Android: actualización.**
  - *Depende:* T120, T114

- [ ] **T122. Pruebas de humo en la app Android real.** Playwright para Android en emuladores Android 7 y 14: emparejar, iniciar sesión, primera sincronización, emitir una orden, recibir una alerta con la app cerrada y trabajar sin conexión.
  - *Cubre:* RNF-02, plan §11.2
  - *Depende:* T121
  - *Terminado:* pasan en ambos emuladores en tres ejecuciones seguidas.

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

- [ ] **T124. Maquetas de P-28 Crear servidor y P-29 Estado del servidor** (solo escritorio).
  - *Cubre:* RF-UI-09
  - *Depende:* T017
  - *Terminado:* aprobadas.

- [ ] **T125. Tres instaladores y paquete de distribución.** Compilación del instalador completo (app + `server-bundle`), del ligero y del APK con sus SHA-256; generación del código de instalación por empresa (solo su comprobación va en el instalador completo; el código se imprime aparte); instaladores del WebView (Chrome y Android System WebView en su última versión compatible con Android 7).
  - *Cubre:* RF-INS-01, 02, DT-16, DT-15
  - *Depende:* T117, T121
  - *Pruebas:* el instalador ligero no contiene `server-bundle` ni ofrece "Crear servidor"; el código no aparece en ningún archivo del paquete.

- [ ] **T126. Ayudante de instalación.** `impocaribe-setup.exe` con elevación de Windows, comprobaciones del paso 0 (incluido el bloqueo si ya hay un servidor en la red), pasos 1 a 10 del plan §10.3 con diario, idempotencia, deshacer por paso, reparar y progreso por tubería con nombre. Configura PostgreSQL y el servicio con los límites de memoria del plan §10.7, y ofrece el restablecimiento de emergencia (RF-INS-11).
  - *Cubre:* RF-INS-03, 05, D14, DT-17, RNF-01, RNF-08, RNF-10, RNF-19, RF-INS-11, RNF-21
  - *Depende:* T125, T034, T012
  - *Pruebas:* un fallo inyectado en cada paso y Deshacer deja la PC como estaba; ejecutar dos veces seguidas no duplica nada; con un servidor en la red, no pasa del paso 0; un código incorrecto da `INSTALL_CODE_INVALID`.
  - *Pruebas adicionales:* con 4 GB de RAM, la comprobación muestra advertencia ámbar y deja continuar; el restablecimiento de emergencia con un código incorrecto se rechaza, y con el correcto obliga a cambiar la contraseña, revoca las sesiones de esa Apoderada y emite AL-11.

- [ ] **T127. (PP, solo escritorio) Pantalla P-28 Crear servidor**, incluida la variante desde un respaldo de traslado y el paso a P-02.
  - *Cubre:* RF-INS-03, RNF-18, HU-14
  - *Depende:* T126, T124, T038

- [ ] **T128. (PP, solo escritorio) Pantalla P-29 Estado del servidor:** estado, energía, montaje, QR, solicitudes de emparejamiento (AL-22, con la ventana al frente), dispositivos, consumo de memoria y acciones de mantenimiento, incluido el restablecimiento de emergencia.
  - *Cubre:* RF-INS-04, RF-RED-04, 05, RF-INS-11
  - *Depende:* T127, T035

- [ ] **T129. Actualizar el servidor.** Respaldo previo, copia de la versión anterior, migración, comprobación, vuelta atrás si falla y publicación del instalador ligero y del APK.
  - *Cubre:* RF-INS-06, RF-UPD-01
  - *Depende:* T128, T106, T113
  - *Pruebas:* con un fallo inyectado en la migración, el servidor vuelve a la versión anterior con sus datos intactos.

- [ ] **T130. Trasladar el servidor.** Respaldo `.icmove`, estado `migrated`, creación desde traslado con la misma identidad.
  - *Cubre:* RF-INS-07, D14
  - *Depende:* T129, T107
  - *Pruebas:* los dispositivos emparejados se reconectan al servidor nuevo sin emparejarse; la PC anterior no puede volver a arrancar como servidor.

- [ ] **T131. Desinstalar el servidor.**
  - *Cubre:* RF-INS-08
  - *Depende:* T130
  - *Pruebas:* sin escribir "DESINSTALAR" no procede; los datos quedan en la carpeta de conservación salvo que se marque borrarlos.

- [ ] **T132. Energía.** Proveedor de estado de energía, `server.power`, AL-20, modo protegido al 15 %, parada al 5 % y reanudación; avisos en todas las apps.
  - *Cubre:* RF-ENE-01 a 05, Const. art. XV, HU-16
  - *Depende:* T094, T046
  - *Pruebas:* con un proveedor simulado: al 15 % una emisión en curso termina y la siguiente recibe `SERVER_PROTECTED_MODE`; al volver la corriente se aceptan escrituras; los límites 15,0 % y 15,1 % se comportan como dicen los requisitos.

- [ ] **T133. Aviso de apagado e inicio con Windows** (P-31) en la PC servidor.
  - *Cubre:* RF-INS-09, RF-INS-10
  - *Depende:* T128
  - *Terminado:* verificado en Windows 10 y 11 (lista manual).

- [ ] **T134. Límite de dispositivos con hotspot.** AL-21 con 8 o más dispositivos conectados y montaje `hotspot`.
  - *Cubre:* RF-RED-01
  - *Depende:* T035, T094
  - *Pruebas:* con 7 no hay alerta; con 8 sí; con montaje `router`, nunca.

- [ ] **T135. Pruebas de instalación en Windows.** Máquinas virtuales Windows 10 y 11 limpias, sin red externa y con Defender activo: crear, reparar, actualizar con fallo, trasladar, desinstalar y segundo servidor bloqueado.
  - *Cubre:* RF-INS, RNF-18
  - *Depende:* T131
  - *Terminado:* todas pasan en ambas versiones de Windows.

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

- [ ] **T140. Rendimiento.**
  - Servidor: RNF-03, RNF-04, RNF-12 y RNF-14 en la PC servidor real.
  - Red e instalación: RNF-17 con router y con hotspot, y RNF-18.
  - Interfaz: RNF-13, **RNF-15** y **RNF-20** en el dispositivo de referencia.
  - Consumo de recursos (RNF-21): en una máquina virtual Windows 10 con **4 GB** de RAM, con el servidor y la app de escritorio abiertos y 8 dispositivos simulados, se miden la memoria en reposo y en operación y los tiempos de RNF-03; en el dispositivo de referencia, la memoria de la app Android.
  - *Depende:* T139

- [ ] **T141. Accesibilidad.** Revisión automática de todas las pantallas en las tres clases, más una revisión manual: teclado en escritorio, texto al 130 % y lector de pantalla en las acciones principales.
  - *Cubre:* RNF-16
  - *Depende:* T138

- [ ] **T142. Trazabilidad automática.** `pnpm trace` falla si:
  - algún ID de la spec (RF, RNF, HU, D) no tiene al menos una prueba que lo cite;
  - alguna pantalla P-xx de `ui-spec.md` no tiene prueba de extremo a extremo y referencias visuales en sus clases de dispositivo.
  - *Depende:* T138

- [ ] **T143. Lista manual de cascarones.** Windows 10 y 11; Android 7, 10 y 14 y el dispositivo de referencia. Incluye los tres instaladores, el emparejamiento por código y por QR, el aviso de apagado y el comportamiento con batería.
  - *Depende:* T125

- [ ] **T144. Auditoría de pruebas.** Historial de cambios de pruebas, ausencia de casos especiales, mutación por módulo, una muestra de 20 pruebas con oráculo desde la spec, y una muestra de 10 pruebas de interfaz que verifican lo que ve el usuario y no detalles internos.
  - *Cubre:* Const. art. XIII
  - *Depende:* T142

- [ ] **T145. Verificación constitucional**, incluido el Artículo XIV pantalla por pantalla.
  - *Depende:* T144, T143, T123
  - *Terminado:* firmado por el responsable.





