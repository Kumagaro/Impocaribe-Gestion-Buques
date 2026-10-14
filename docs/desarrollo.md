# Desarrollo

Cómo preparar el equipo, qué comandos existen y cómo se trabaja cada tarea. Fuente: plan §13.

## 1. Equipo de desarrollo (plan §13.1)

| Requisito | Versión | Para qué |
|---|---|---|
| Windows | 10 u 11 de 64 bits | Electron, ayudante de instalación, servicios e instaladores |
| Node.js | 24 LTS (`.nvmrc` y `engines`) | Todo el monorepo |
| pnpm | La de `packageManager` en `package.json` | Espacios de trabajo |
| Git | Reciente, con `core.autocrlf=false` | Control de versiones |
| PostgreSQL | 16, como servicio local | Desarrollo y pruebas de integración contra base real |
| JDK | 21 (lo exige Capacitor 8) | App Android |
| Android SDK | Plataforma de compilación API 36 y emuladores de API 24 (Android 7) y API 34 (Android 14) | App Android y pruebas de humo |
| Máquinas virtuales | Windows 10 y Windows 11 limpias, una con 4 GB de RAM | Pruebas de instalación y de consumo |
| Editor | VS Code con las extensiones recomendadas (`.vscode/extensions.json`) | Uniformidad |

**Comprobación:** `pnpm run doctor` (no `pnpm doctor`, que es un comando propio de pnpm) revisa Node, pnpm, Git, PostgreSQL, JDK, Android SDK y emuladores, y dice cómo corregir lo que falte. Las máquinas virtuales se comprueban a mano (sección 1.7).

### 1.1 Node.js y pnpm

```powershell
winget install OpenJS.NodeJS.LTS
npm install -g pnpm@<versión de packageManager>   # o, como administrador: corepack enable
```

### 1.2 Git

```powershell
winget install Git.Git
git config --global core.autocrlf false
```

Los finales de línea los fija `.gitattributes` (LF en el repositorio), no la configuración de cada equipo.

### 1.3 PostgreSQL 16

```powershell
winget install PostgreSQL.PostgreSQL.16
```

- El instalador crea el servicio `postgresql-x64-16`, que arranca con Windows.
- Añada `C:\Program Files\PostgreSQL\16\bin` al `PATH` del usuario.
- La contraseña del usuario `postgres` que elija va solo en su `.env` local, nunca en el repositorio.

### 1.4 JDK 21

```powershell
winget install Microsoft.OpenJDK.21
```

Defina `JAVA_HOME` con la carpeta de instalación (por ejemplo `C:\Program Files\Microsoft\jdk-21…`) y ponga `%JAVA_HOME%\bin` antes que cualquier otro Java en el `PATH`.

### 1.5 Android SDK

Basta con las herramientas de línea de comandos del SDK (unos 150 MB); Android Studio (1,4 GB) es opcional. Si el disco C: va justo de espacio, ponga el SDK y los emuladores en otra unidad (en el equipo de desarrollo actual, `D:\Android`).

1. Descargue `commandlinetools-win-*_latest.zip` de https://developer.android.com/studio#command-line-tools-only y descomprímalo para que quede `<SDK>\cmdline-tools\latest\bin\android.exe`.
2. Defina en las variables de usuario `ANDROID_HOME=<SDK>` y, si quiere los emuladores fuera de C:, `ANDROID_AVD_HOME`. Añada al `PATH` `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator` y `%ANDROID_HOME%\cmdline-tools\latest\bin`.
3. Acepte las licencias e instale la plataforma de compilación y las imágenes de los emuladores. Las herramientas actuales usan `android sdk install` con nombres separados por `/`; `sdkmanager` está obsoleto y no acepta los nombres con `;`:

```powershell
sdkmanager --licenses
android sdk install platform-tools emulator build-tools/36.0.0 platforms/android-36
android sdk install system-images/android-24/google_apis/x86_64 system-images/android-34/google_apis/x86_64
```

Cada imagen pesa 1–1,5 GB. Si la red se corta, `android sdk install` vuelve a empezar desde cero; con una conexión inestable conviene descargar el ZIP con `curl -C -` (la URL y el SHA-1 están en `https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-3.xml`) y descomprimirlo en `<SDK>\system-images\android-NN\google_apis\`.

### 1.6 Emuladores

```powershell
avdmanager create avd -n impocaribe-api24 -k "system-images;android-24;google_apis;x86_64" -d pixel
avdmanager create avd -n impocaribe-api34 -k "system-images;android-34;google_apis;x86_64" -d pixel
emulator -avd impocaribe-api24
```

La aceleración por hardware necesita la Plataforma de máquina virtual de Windows (WHPX); `emulator -accel-check` dice si está disponible.

**WebView del emulador de Android 7:** la imagen trae Chromium 53, por debajo del mínimo 87 (DT-15), y la interfaz queda en blanco (`SyntaxError: Unexpected token ?`). Para ver la app en Android 7 hay que instalar en el emulador Chrome o Android System WebView ≥ 87 compatible con Android 7 (`adb install <apk>`); es el mismo caso que resuelve el instalador del WebView de T125. El emulador de Android 14 ya trae un WebView moderno.

### 1.7 Máquinas virtuales Windows

Con Hyper-V (Windows Pro) o VirtualBox:

| Nombre | Sistema | RAM | Red | Uso |
|---|---|---|---|---|
| `impocaribe-w10-4gb` | Windows 10 de 64 bits | 4 GB | Solo interna (sin internet) | Instalación y consumo (RNF-21) |
| `impocaribe-w11` | Windows 11 de 64 bits | 8 GB | Solo interna (sin internet) | Instalación |

Ambas con Defender activo y un punto de control "limpia" tomado justo después de instalar Windows.

### 1.8 VS Code

Al abrir el repositorio, VS Code ofrece instalar las extensiones recomendadas.

## 2. Comandos

| Comando | Qué hace |
|---|---|
| `pnpm run doctor` | Comprueba el equipo de desarrollo |
| `pnpm dev` | Servidor (`http://localhost:8443/api/v1/health`) y web (Vite) en modo desarrollo |
| `pnpm build` | Compila shared, server, web y desktop |
| `pnpm test` | Pruebas de todos los paquetes |
| `pnpm lint` | ESLint y Prettier (`pnpm format` corrige el formato) |
| `pnpm typecheck` | Tipos en modo `strict` |
| `pnpm verify` | Tipos, lint y pruebas: obligatorio antes de integrar |
| `pnpm --filter @impocaribe/desktop start` | Abre la app de escritorio con el build de web (`pnpm build` antes) |
| `pnpm --filter @impocaribe/android apk` | Copia el build de web al proyecto nativo y genera el APK de depuración en `packages/android/android/app/build/outputs/apk/debug/` |

**Paquetes** (`packages/`): `shared` (lógica y esquemas comunes), `server` (NestJS), `web` (React + Vite), `desktop` (Electron) y `android` (Capacitor). Todos son ESM. Los imports relativos llevan extensión `.ts` (TypeScript los reescribe a `.js` al compilar), y `shared` se consume desde su código fuente en pruebas, tipos y Vite gracias a la condición de exportación `source`.

### 2.1 Configuración y base de datos

La configuración sale de las variables de entorno y del `.env` de la raíz (copia de `.env.example`); una variable ya definida en el entorno tiene prioridad sobre el `.env`. `NODE_ENV` elige el entorno: `development` (por defecto), `test` o `production`.

| Comando | Qué hace |
|---|---|
| `pnpm db:create` | Crea la base del entorno actual si no existe y la carpeta de datos |
| `pnpm db:migrate` | Aplica las migraciones de Drizzle (`packages/server/drizzle/`) |
| `pnpm db:reset` | Borra la base, la vuelve a crear y migra (prohibido en `production`) |
| `pnpm db:seed` | Carga datos sintéticos de desarrollo (solo en `development`) |
| `pnpm db:generate` | Genera una migración nueva en `packages/server/drizzle/` a partir del esquema (`src/db/schema/`) |

- **Base de pruebas aparte.** En `test` se usa `TEST_DATABASE_URL`, nunca `DATABASE_URL`, y su nombre debe terminar en `_test`; fuera de `test`, una base `_test` se rechaza. Para prepararla: `$env:NODE_ENV='test'; pnpm db:reset`.
- **Rol de la aplicación:** el servidor se conecta con el rol `impocaribe_app` (sin permiso para cambiar el esquema ni para modificar tablas de solo inserción); las migraciones las aplica el dueño de la base.
- **Pruebas de integración:** `pnpm test` prepara una vez la plantilla `TEST_DATABASE_URL` (la borra, la crea y la migra) y cada archivo `*.int.test.ts` trabaja en su propia copia, que se borra al terminar.
- **Carpeta de datos fuera del repositorio:** por defecto `%LOCALAPPDATA%\Impocaribe\dev-data` (se cambia con `IMPOCARIBE_DATA_DIR`).

**Puertos:** Windows reserva rangos de puertos para Hyper-V (`netsh int ipv4 show excludedportrange protocol=tcp`). El servidor usa 8443 (plan §6); si está reservado en su equipo, defina `PORT`.

## 3. Flujo de trabajo por tarea (plan §13.3)

1. Crear una rama desde `main` con el nombre `tNNN-descripcion-corta` (por ejemplo `t042-endpoints-sincronizacion`).
2. Leer la tarea y las secciones de su fase en el mapa de lectura de `specs/MVP/tasks.md`.
3. Escribir las pruebas desde la spec y verlas fallar (Constitución, art. XIII).
4. Implementar.
5. `pnpm verify` en verde.
6. Cada commit empieza por el ID de la tarea: `T042: endpoints de sincronización`. Si modifica o borra una prueba existente, el mensaje explica qué requisito cambió o por qué la prueba estaba mal.
7. Abrir la solicitud de integración con la plantilla (`.github/pull_request_template.md`), que repite la definición de terminado.
8. El responsable revisa cuando la tarea lo exige (maquetas, referencias visuales, escenario Excel). Solo se integra en `main` con la integración continua en verde.

**Secretos:** solo se sube `.env.example`. El `.env`, el código de instalación, las contraseñas y las claves nunca entran al repositorio.

## 4. Integración continua (plan §13.4)

`.github/workflows/ci.yml` se ejecuta en cada envío a cualquier rama, en cada solicitud de integración hacia `main`, cada noche y a mano:

| Trabajo | Sistema | Qué ejecuta hoy |
|---|---|---|
| Verificación | Linux con PostgreSQL 16 | `pnpm db:reset` sobre la base de pruebas y `pnpm verify` |
| Escritorio | Windows | `pnpm build` (los instaladores llegan con T117) |
| Android | Linux con JDK 21 y Android SDK | APK de depuración, publicado como artefacto `apk-debug` |
| Nocturno | — | Hoy repite los anteriores; la mutación completa, el extremo a extremo y la regresión visual se añaden con sus tareas (T007, T026) |

**Bloqueo de `main`.** En GitHub, *Settings → Branches → Branch protection rules* para `main`: exigir solicitud de integración y los tres trabajos (`Verificación`, `Escritorio`, `APK de depuración`) en verde antes de integrar.

**Hook previo al envío.** `pnpm install` configura Git para usar `.githooks/` (script `prepare`), y `.githooks/pre-push` ejecuta `pnpm verify`: si falla, el envío se cancela. Es obligatorio mientras no haya un servicio de CI, y se mantiene después como primera barrera.

## 5. Barreras de calidad (plan §11.3, Const. art. XIII)

`pnpm verify` ejecuta, en orden, tipos, lint, pruebas con cobertura y mutación. Falla si cualquiera de estas barreras no se cumple:

| Barrera | Dónde | Regla |
|---|---|---|
| Lint de pruebas | `**/*.test.ts(x)` | Sin `skip`, `only`, `todo`, `skipIf`; sin `expect.anything()`, `toBeTruthy`, `toBeFalsy` ni `toBeDefined`; sin `try/catch` |
| Lint de producción | `packages/*/src` | Sin `NODE_ENV` ni `VITEST` fuera de `server/src/config.ts`; sin importar `fixtures/` |
| Dominio exacto | `shared/src/domain` | Sin `parseFloat` ni `Number()`: toneladas con `domain/tons.ts` |
| Presentaciones sin lógica | `*.phone.tsx`, `*.tablet.tsx`, `*.desktop.tsx` | Sin importar API, repositorio local, validación ni permisos |
| Movimiento barato | `web/src/motion` | Solo posición, escala y opacidad |
| Integración sin simulaciones | `*.int.test.ts` | Sin `vi.mock`, `vi.doMock`, `vi.spyOn` ni `vi.stubGlobal` |
| Cobertura | `shared` y `server` | ≥ 85 % de líneas |
| Mutación | `shared/src/domain` y los módulos críticos del servidor (`mutate` en `packages/server/stryker.config.mjs`) | ≥ 90 %. La de `shared` corre en cada `verify`; la del servidor (contra PostgreSQL real, lenta) solo si la rama toca un módulo crítico, sus pruebas o la configuración de Stryker. `pnpm mutation:full` corre las dos completas, y el CI lo hace cada noche. Informes en `packages/*/reports/mutation/` |
| Cambio de pruebas | hook `commit-msg` | Si el commit modifica o borra aserciones de pruebas existentes, el mensaje debe incluir `Motivo de cambio de prueba: …` |

Las pruebas de `scripts/quality/` demuestran que cada regla de lint rechaza su ejemplo prohibido.

**Convención:** las pruebas de integración contra PostgreSQL real se nombran `*.int.test.ts`.
