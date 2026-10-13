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
| Android SDK | Plataformas y emuladores de API 24 (Android 7) y API 34 (Android 14) | App Android y pruebas de humo |
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

```powershell
winget install Google.AndroidStudio
```

1. Abra Android Studio una vez y deje que descargue el SDK (por defecto en `%LOCALAPPDATA%\Android\Sdk`).
2. Defina `ANDROID_HOME` con esa carpeta y añada al `PATH` `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator` y `%ANDROID_HOME%\cmdline-tools\latest\bin`.
3. Instale las plataformas y las imágenes de los emuladores:

```powershell
sdkmanager "platform-tools" "emulator" "platforms;android-24" "platforms;android-34" "system-images;android-24;google_apis;x86_64" "system-images;android-34;google_apis;x86_64"
```

### 1.6 Emuladores

```powershell
avdmanager create avd -n impocaribe-api24 -k "system-images;android-24;google_apis;x86_64" -d pixel
avdmanager create avd -n impocaribe-api34 -k "system-images;android-34;google_apis;x86_64" -d pixel
emulator -avd impocaribe-api24
```

La aceleración por hardware necesita la Plataforma de máquina virtual de Windows (Hyper-V) activada.

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
