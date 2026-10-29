# Pruebas manuales de Órdenes de Carga

Guía paso a paso para el responsable. Cubre lo que no se puede probar en el equipo de desarrollo:

- **T135:** la instalación en Windows (crear, reparar, actualizar, trasladar y desinstalar el servidor), en PC reales en lugar de máquinas virtuales;
- **T136:** las redes reales;
- **T123:** la revisión de experiencia en dispositivos reales;
- **T133:** el aviso al apagar Windows;
- **T141:** la parte manual de la accesibilidad;
- **T143:** la lista manual de las apps, que incluye Android 7.

Cada prueba dice **qué hacer** y **qué debe pasar**. Si pasa otra cosa, se anota como explica el apartado «Cómo anotar los resultados» y se sigue con la siguiente, salvo que la prueba diga que se pare.

> **Importante:** crear el servidor instala servicios de Windows, reglas del firewall y cambia la energía de la PC. Use para el servidor una PC que se pueda dedicar a las pruebas. Al final (prueba A12) se desinstala y la PC vuelve a quedar como estaba.

---

## 0. Lo que hace falta

### Equipos

| Equipo | Para qué | Pruebas |
|---|---|---|
| **PC 1** con Windows 10 de 64 bits, con wifi | Servidor; es mejor una laptop, que tiene batería | A, D, E |
| **PC 2** con Windows 11 de 64 bits | Segundo servidor (bloqueo), destino del traslado y app ligera | A, B, C |
| **Teléfono Android 10 o superior** (el de referencia) | App de teléfono | B, C, E |
| **Teléfono o tablet con Android 7** | WebView antiguo y app en Android 7 | B |
| **Tablet** Android | App en tablet | E |
| **Router wifi** sin internet (o con internet desconectado) | Montaje «router» | A, B, C |
| **Celular dedicado** con Android 11 o superior | Montaje «hotspot» | C |
| **Adaptador wifi USB** (si alguna PC de escritorio no tiene wifi) | Hotspot con PC de escritorio | C |
| **Memoria USB** | Respaldo diario y archivo de traslado | A |
| **8 dispositivos** en total (sirven teléfonos y PC prestados) | Límite del hotspot | C |

Las PC deben estar **sin internet** durante las pruebas (como en el almacén) y con **Windows Defender activo** (no lo desactive).

### El paquete

Lo prepara el desarrollo con `pnpm paquete "Nombre de la empresa"`. Llega en una carpeta `paquete/<empresa>-<fecha>/` con:

- `impocaribe-completo-<versión>.exe`: el instalador **completo**, para la PC servidor;
- `impocaribe-<versión>.exe`: el instalador **ligero**, para las demás PC;
- `impocaribe-<versión>.apk`: la app para teléfonos y tablets;
- un `.sha256` por archivo, y un `.sig` por instalador de Windows;
- `webview/`: los instaladores del navegador interno para Android 7 a 9 (Chrome) y 10 o más (WebView);
- `LEEME.txt`.

**Aparte**, fuera de esa carpeta, está la **hoja del código de instalación** (`…-CODIGO-IMPRIMIR-Y-BORRAR.html`): ábrala, imprímala y borre el archivo. El código tiene la forma `XXXX-XXXX-XXXX`.

Para la prueba de **actualizar** (A9) hace falta un **segundo paquete con una versión más nueva**: pídalo cuando llegue a esa prueba.

### Antes de empezar, en cada PC

1. Compruebe la hora y la zona horaria (La Habana) de Windows.
2. Copie el paquete a la PC (por la memoria USB).
3. **Compruebe las huellas.** En PowerShell, dentro de la carpeta del paquete:
   `Get-FileHash .\impocaribe-completo-<versión>.exe -Algorithm SHA256`.
   **Debe** dar lo mismo que el `.sha256` del mismo nombre. Si no coincide, no lo instale: el archivo está dañado.

---

## Cómo anotar los resultados

Por cada prueba, anote:

- **Prueba** (por ejemplo, A2);
- **Resultado:** ✅ pasó, ❌ falló o ⚠️ pasó con algo raro;
- **Equipo** y versión de Windows o Android;
- **Hora** en que pasó;
- **Qué pasó** (si no es lo esperado): qué hizo, qué vio, el texto exacto del mensaje;
- **Captura** de la pantalla, o foto si es un teléfono.

Si una prueba del servidor falla, guarde también estos archivos:

- `C:\ProgramData\Impocaribe\setup-journal.json` (el diario de la creación);
- la carpeta `C:\ProgramData\Impocaribe\registros` (los registros del servicio).

Para abrirlos hace falta un usuario administrador. En P-28 y P-29, el **«Detalle técnico»** desplegable también sirve: cópielo entero.

Mande todo junto al desarrollo: con eso se corrige y se vuelve a probar.

---

## A. Instalación del servidor (T135)

### A1. Comprobación de la PC (PC 1)

1. Conecte la PC 1 al router por wifi o por cable. No debe haber ningún otro servidor de Órdenes de Carga en esa red.
2. Ejecute `impocaribe-completo-<versión>.exe`.
   - Windows mostrará «Windows protegió su PC» o «Editor desconocido»: el instalador no tiene certificado de firma de Windows (decidido). Pulse **Más información → Ejecutar de todas formas**.
   - Instale para todos los usuarios, en la carpeta propuesta.
3. Abra **Órdenes de Carga**. Aparece **P-01 Conexión**, «Buscando el servidor». Tras unos segundos: «No se encontró el servidor».

**Debe pasar:**

- Aparecen dos botones: **Crear servidor en este equipo** y **Crear servidor desde un respaldo de traslado**.
- Defender no bloquea ni pone en cuarentena nada. Si lo hace, anote el aviso exacto.

4. Pulse **Crear servidor en este equipo**. Se abre **P-28, paso 1 «Comprobación»**: «Buscando otro servidor en la red y comprobando esta PC…».

**Debe pasar:**

- «No hay otro servidor en la red», con los segundos que tardó.
- Windows 10 u 11 de 64 bits.
- Memoria: si la PC tiene **4 GB**, marca **ámbar** («Funcionará, aunque más lento; se recomiendan 8 GB») y deja continuar. Con 8 GB o más, verde.
- Disco: los GB libres en C:. Con menos de 20 GB, rojo y no deja continuar.
- **Red:** wifi o cable, con el nombre de la red y **la dirección de la red local** (por ejemplo 192.168.1.x). Si la PC tiene una VPN o VirtualBox, **no** debe salir su dirección.
- Puertos del servidor libres.
- Si es laptop, «Laptop con batería».

### A2. Crear el servidor con montaje «router» (PC 1)

1. **Continuar** → paso 2 «Permisos».
2. Escriba un código **equivocado** (cambie la última letra) y pulse **Continuar**.
   **Debe pasar:** «El código no es el de esta empresa. Revíselo en la hoja impresa…», y no avanza.
3. Escriba el código bien, **en minúsculas y sin guiones**. Pulse **Continuar**.
   **Debe pasar:** lo acepta y pasa al paso 3.
4. Paso 3 «¿Cómo se conectan los dispositivos a esta PC?»: elija **Router wifi** y pulse **Crear el servidor**.
5. Windows pide permiso de administrador: el aviso muestra **impocaribe-setup.exe** con «Editor desconocido». Pulse **Sí**.
6. Paso 4 «Creando el servidor»: mire la lista de 10 pasos.

**Debe pasar:**

- Cada paso pasa de pendiente a en curso y a hecho (✓), con su tiempo.
- La barra avanza y se ve el tiempo total.
- Tarda menos de 20 minutos. **Anote cuánto tardó.**
- Al terminar, paso 5 «El servidor está listo»:
  - el nombre `IMPOCARIBE-XXXX`, la dirección, «puerto 8443 · router wifi» y un **QR**;
  - la guía «Para conectar los dispositivos (router wifi)» y el botón **Crear la primera Apoderada**.

7. Mientras crea (paso 4), **cierre la ventana** (queda en la bandeja) y vuelva a abrirla desde el icono.
   **Debe pasar:** sigue en el paso 4, donde iba.

**Compruebe en Windows**, con «Servicios» (`services.msc`):

- existen **ImpocaribeBaseDatos** e **ImpocaribeServidor**, «En ejecución» e «Automático»;
- el firewall tiene las reglas de Órdenes de Carga.

### A3. Permiso de Windows denegado (PC 1, antes de A2 o en otra creación)

En el paso 3, pulse **Crear el servidor** y en el aviso de Windows pulse **No**.

**Debe pasar:** vuelve al paso 3 con «No se concedió el permiso de administrador de Windows.», y no se instaló nada.

### A4. La primera Apoderada (PC 1)

1. En el paso 5, pulse **Crear la primera Apoderada**.
   **Debe pasar:** P-01 se empareja sola («Emparejado con IMPOCARIBE-XXXX») y lleva a **P-02 Primer arranque**.
2. Llene los datos y la contraseña. Anote los **8 códigos de recuperación** (en papel), marque «Los copié a mano» y pulse **Terminar y entrar**.
   **Debe pasar:**
   - el Tablero;
   - en el menú, **Estado del servidor** (solo aparece en esta PC).
3. Vaya a **Respaldos y restauración** y defina la **contraseña de respaldo**. Guárdela: hará falta para el traslado y la desinstalación.

### A5. Estado del servidor, P-29 (PC 1)

Abra **Estado del servidor**.

**Debe pasar:**

- Servicio «En marcha», versión y «encendido hace…».
- Energía: con corriente.
- Red: Router wifi, dirección, puerto 8443, conectados.
- Memoria: «X MB de 1,2 GB», con el reparto entre base de datos, servicio y PDF.
- El QR para emparejar.
- «Mantenimiento» con:
  - Reparar el servidor;
  - Reiniciar el servicio;
  - Actualizar el servidor, **desactivado** con «Para actualizar, instale en esta PC el instalador completo de la versión nueva.»;
  - Preparar traslado;
  - Restablecer la contraseña de una Apoderada;
  - Desinstalar el servidor.

Cierre la sesión. En el login aparece **«Estado del servidor y emparejamientos»**: ábralo. **Debe** verse el estado sin sesión.

### A6. Arranque con Windows y aviso al apagar (PC 1) · T133, P-31

1. **Reinicie Windows** con la app abierta.
   **Debe pasar:**
   - Windows **no** se reinicia directamente: muestra «Esta PC es el servidor de Órdenes de Carga: hay X dispositivos conectados», con la opción de reiniciar de todos modos;
   - si se emparejaron dispositivos (prueba B), X es el número de conectados.
2. Elija reiniciar de todos modos.
3. Tras reiniciar, **sin iniciar sesión en Windows**, desde un teléfono emparejado (prueba B), abra la app.
   **Debe pasar:** el teléfono se conecta: el servidor arrancó solo.
4. Inicie sesión en Windows.
   **Debe pasar:** la app de Órdenes de Carga se abre sola (inicio con Windows).
5. En el icono de la bandeja, desmarque **Iniciar con Windows** y reinicie.
   **Debe pasar:** la app ya no se abre sola (se respeta la elección). Vuelva a marcarlo.

Repita los pasos 1 y 2 en **Windows 11** cuando la PC 2 sea el servidor (prueba A10).

### A7. Reparar y reiniciar (PC 1)

1. En «Servicios», **detenga** ImpocaribeServidor.
2. En P-29, pulse **Reiniciar el servicio**, escriba el código y acepte el permiso de Windows.
   **Debe pasar:** los pasos «Detener el servidor» y «Arrancar y comprobar», y luego «El servidor volvió a arrancar.»
3. Pulse **Reparar el servidor** con un código **equivocado**.
   **Debe pasar:** «El código de instalación no es correcto…».
4. Repita con el código bueno.
   **Debe pasar:**
   - rehace los servicios, el firewall y la energía y termina con «El servidor quedó reparado y en marcha.»;
   - los datos (órdenes, usuarios) siguen igual.

### A8. Restablecimiento de emergencia (PC 1) · RF-INS-11

1. En P-29, pulse **Restablecer la contraseña de una Apoderada**.
2. Elija la Apoderada, escriba una contraseña temporal (dos veces) y el código. Acepte el permiso de Windows.
   **Debe pasar:**
   - «Contraseña restablecida: deberá cambiarla al entrar…»;
   - al entrar con la temporal, la app obliga a cambiarla;
   - las sesiones abiertas de esa Apoderada en otros dispositivos se cierran;
   - las Apoderadas reciben la alerta **AL-11**;
   - en la Bitácora aparece el restablecimiento.

### A9. Actualizar el servidor (PC 1) · RF-INS-06

Necesita el **paquete de la versión nueva** (pídalo).

1. Antes de actualizar, emita al menos 2 órdenes y anote sus números y el saldo de su DM.
2. En la PC 1, ejecute el **instalador completo nuevo** (sobre la app instalada).
3. Abra la app y vaya a P-29.
   **Debe pasar:** **Actualizar el servidor a la X.Y.Z** activo.
4. Púlselo, escriba el código y acepte el permiso.
   **Debe pasar:**
   - los pasos: detener, guardar la copia, copiar la nueva versión, actualizar la estructura, arrancar y comprobar, y publicar;
   - al final, «El servidor quedó actualizado y en marcha…»;
   - P-29 muestra la versión nueva;
   - las órdenes y los saldos siguen exactamente igual;
   - en **Versiones de la app** están publicadas la app ligera y el APK nuevos;
   - en los teléfonos y PC conectados aparece la banda **AL-15** «Hay una versión nueva de la app».

**La actualización con fallo** (que la vuelta atrás deje la versión anterior con sus datos) no se puede provocar a mano sin herramientas: la cubren las pruebas automáticas. Si alguna vez una actualización real falla, **debe** verse «La actualización no se completó. El servidor volvió a la versión anterior con sus datos intactos…», con el servidor funcionando.

### A10. Trasladar el servidor (PC 1 → PC 2) · RF-INS-07

1. En la PC 1, P-29 → **Preparar traslado**:
   - elija la carpeta (la memoria USB);
   - escriba la contraseña de respaldo y el código;
   - marque «Entiendo que esta PC dejará de ser el servidor» y pulse **Preparar traslado**.

   **Debe pasar:**
   - se crea `IMPOCARIBE-XXXX-<fecha>.icmove` en la USB;
   - «Este servidor quedó detenido…»;
   - en «Servicios», ImpocaribeServidor queda detenido y **deshabilitado**.
2. Pruebe con una contraseña de respaldo equivocada antes de la buena.
   **Debe pasar:** «La contraseña de respaldo no es correcta.» y no se traslada nada.
3. En la PC 2 (Windows 11), instale el **instalador completo**. En P-01, pulse **Crear servidor desde un respaldo de traslado**.
4. Paso 1: **no** debe haber otro servidor: el de la PC 1 está detenido.
5. Paso 2: el código. Paso 3, «Archivo de traslado»: **Elegir el archivo** (el `.icmove` de la USB) y la contraseña de respaldo.
   **Debe pasar:**
   - con una contraseña equivocada, el error en el campo;
   - con la buena, «Servidor IMPOCARIBE-XXXX · Misma identidad: los N dispositivos emparejados se reconectarán solos…», y el traslado.
6. Al terminar:
   - los teléfonos y la PC ligera **se reconectan solos, sin volver a emparejarse** (pueden tardar unos segundos);
   - las órdenes, los usuarios y los saldos son los mismos;
   - el montaje de red es el mismo.
7. En la PC 1, intente arrancar ImpocaribeServidor desde «Servicios».
   **Debe pasar:** no arranca (está deshabilitado). Si se habilita y arranca a mano, **se detiene solo**: el registro dice que se trasladó a otra PC.
8. En la PC 1, P-29 → Reparar o Reiniciar.
   **Debe pasar:** «Este servidor se trasladó a otra PC… no puede volver a arrancar aquí.»

### A11. Segundo servidor bloqueado (PC 2 con la PC 1 de servidor) · RF-INS-03.1

Con un servidor funcionando en la red, en otra PC con el instalador completo abra la app.

**Debe pasar:**

- En P-01 aparece «Servidor encontrado».
- **Crear servidor en este equipo** está **desactivado**, con «Ya hay un servidor en esta red (IMPOCARIBE-XXXX): solo puede haber uno.»
- Si se llega a P-28, el paso 1 muestra la marca roja «Ya hay un servidor en esta red…» y no hay **Continuar**.

### A12. Desinstalar (PC 1, al final) · RF-INS-08

1. P-29 → **Desinstalar el servidor**. Escriba `desinstalar` (en minúsculas) y el código.
   **Debe pasar:** «Escriba exactamente DESINSTALAR, en mayúsculas.» y no hace nada.
2. Escriba `DESINSTALAR` y el código, **sin** marcar «Borrar también los datos».
   **Debe pasar:**
   - un respaldo final;
   - se quitan los dos servicios, las reglas del firewall y el programa (`C:\Program Files\Impocaribe\Server`);
   - la energía de Windows vuelve a como estaba (la suspensión, por ejemplo);
   - los datos quedan en `C:\ProgramData\Impocaribe\desinstalado-<fecha>`.
3. En otra creación, repita con **«Borrar también los datos»** marcado.
   **Debe pasar:** solo queda el respaldo final (`respaldo-final.icbak`) en esa carpeta.
4. Para quitar también la app: Configuración de Windows → Aplicaciones.

### A13. Deshacer una creación (PC 1 o PC 2)

Para ver «Si un paso falla» sin herramientas, la forma más sencilla es **desconectar la red de la PC justo después de aceptar el permiso**, para que falle «Arrancar y comprobar». Si no falla así, anótelo: no es un error.

**Debe pasar** si falla:

- «No se pudo terminar», con lo que falló en palabras claras, y **Reintentar** y **Deshacer**;
- **Deshacer** quita lo hecho en orden inverso y termina con «La PC quedó como estaba»;
- en «Servicios» y en el firewall no queda nada de Órdenes de Carga.

---

## B. Las apps (T143, T123)

### B1. App ligera en otra PC (PC 2 con la PC 1 de servidor)

1. Instale `impocaribe-<versión>.exe` (ligero).
   **Debe pasar:** P-01 **no** ofrece «Crear servidor…».
2. P-01 encuentra el servidor solo. Pulse **Emparejar con código**: aparece un código de 6 dígitos.
3. En la PC 1, **en cualquier pantalla** (incluso con la ventana minimizada o en la bandeja):
   **Debe pasar:**
   - la ventana viene al frente y parpadea en la barra de tareas;
   - aparece el aviso «Solicitud de emparejamiento» con **el mismo código** y el nombre del equipo (AL-22).
4. Pulse **Confirmar**.
   **Debe pasar:** la PC 2 dice «Emparejado con IMPOCARIBE-XXXX». Inicie sesión.
5. Repita con otro equipo y pulse **Rechazar**.
   **Debe pasar:** ese equipo dice que se rechazó.

### B2. Teléfono Android 10 o superior: instalar, emparejar por QR, alertas

1. Copie el APK al teléfono e instálelo (permita «Instalar apps de origen desconocido»).
2. Abra la app.
   **Debe pasar:** encuentra el servidor (con el teléfono en la wifi del router).
3. Pulse **Escanear QR del servidor** y escanee el QR de P-29 en la PC 1.
   **Debe pasar:** se empareja **sin código**. Un QR ya usado, o de hace más de 5 minutos, no sirve.
4. Inicie sesión. La app pide permiso de **notificaciones** y la exclusión de la **optimización de batería**: acepte las dos.
   **Debe pasar:** la primera sincronización termina y se ve el Tablero.
5. **Cierre la app** (quítela de las recientes). En la PC 1, haga algo que genere una alerta (por ejemplo, una DM que llegue al día 25 del plazo, o pida al desarrollo cómo provocar una).
   **Debe pasar:**
   - llega la notificación al teléfono con la app cerrada;
   - el aviso fijo «Impocaribe conectado» está en la barra de notificaciones.
6. Reinicie el teléfono, sin abrir la app.
   **Debe pasar:** el aviso «Impocaribe conectado» vuelve solo (puede tardar unos minutos), y la siguiente alerta llega.

### B3. Emitir una orden y el PDF en el teléfono

1. Nueva orden: DM, transportista, camión, chofer, toneladas y carta de porte. Pulse **Emitir**.
   **Debe pasar:**
   - el número de la orden;
   - el saldo de la DM baja en esas toneladas (en el Tablero y en la PC).
2. Abra la orden y descargue el PDF.
   **Debe pasar:**
   - la notificación «Guardado en Descargas» con **Compartir**;
   - el PDF se abre con el visor del teléfono.

### B4. Trabajar sin conexión (teléfono)

1. Apague la wifi del teléfono.
   **Debe pasar:**
   - la banda «Sin conexión · datos al…»;
   - el Tablero, las órdenes y las DM se ven igual;
   - una orden ya abierta se ve con su documento.
2. Empiece una orden nueva y déjela a medias (es un borrador).
3. Vuelva a encender la wifi.
   **Debe pasar:** el borrador sube al servidor (en **Borradores**, como privado).

### B5. Android 7 con el WebView antiguo (P-27)

1. En el teléfono o tablet con Android 7, instale el APK y ábralo.
   **Debe pasar:**
   - si el navegador interno es anterior al 87, aparece la pantalla nativa que pide actualizarlo, en lugar de la app;
   - si ya está actualizado, entra directo y esta parte no aplica.
2. Siga la pantalla.
   **Debe pasar:**
   - descarga del servidor el instalador del navegador interno (Chrome 119) con su progreso, y lo abre;
   - después de instalarlo, la app entra.
3. Si el servidor no tiene publicados los instaladores del WebView, publíquelos desde **Versiones de la app** (Android System WebView y Chrome), con los APK de la carpeta `webview/` del paquete. Use el de Chrome para Android 7 a 9.
4. Repita en Android 7 las pruebas B2 a B4.
   **Debe pasar:** todo funciona igual, también la descarga del PDF (que en Android 7 a 9 pide el permiso de almacenamiento la primera vez).

### B6. Actualizar la app desde el servidor

Después de A9 (o publicando a mano una versión nueva en **Versiones de la app**):

- **En la PC ligera:**
  **Debe pasar:**
  - la banda AL-15 con **Actualizar ahora**: descarga del servidor con progreso;
  - abre el instalador (pide confirmación) y la app se cierra;
  - después, la app tiene la versión nueva.
- **En Android:**
  **Debe pasar:**
  - lo mismo, y Android pide confirmar la instalación;
  - si el APK estuviera firmado con otra clave, Android lo rechaza (no debería pasar con el paquete oficial).

---

## C. Pruebas de red reales (T136)

| Prueba | Qué hacer | Debe pasar |
|---|---|---|
| **C1 · Router** | Todo (PC 1 servidor, PC 2 y teléfonos) en la wifi del router. | Todos encuentran el servidor solos. Anote cuánto tarda cada uno. |
| **C2 · Cambio de dirección** | En el router, dele a la PC 1 otra dirección (o reinicie el router si la cambia). | Los dispositivos ya emparejados lo vuelven a encontrar **en menos de 10 segundos**, sin emparejarse. |
| **C3 · Hotspot** | Cree el servidor con montaje **Hotspot** (o cámbielo). PC 1 y los dispositivos, en el hotspot del celular dedicado. | Todos se conectan. En P-29 la Red dice «Hotspot de un celular». |
| **C4 · Reiniciar el hotspot** | Apague y encienda el hotspot (suele cambiar la subred). | Los dispositivos vuelven a encontrar el servidor solos. |
| **C5 · PC de escritorio con adaptador USB** | Una PC sin wifi, con el adaptador, como servidor en el hotspot. | Igual que C3. Si en el paso 3 de P-28 elige hotspot en una PC sin wifi, avisa: «Esta PC no está conectada por wifi: necesitará un adaptador wifi USB.» |
| **C6 · 8 dispositivos en hotspot** | Conecte 8 dispositivos con la app abierta. | Con 7, nada. Con el 8.º, la alerta **AL-21** a las Apoderadas, y en P-29 el aviso «8 dispositivos conectados al hotspot…». Al bajar a 7 se resuelve sola. |
| **C7 · Multidifusión bloqueada** | En el router, desactive la multidifusión o el mDNS (si lo permite). | Los dispositivos encuentran el servidor igual (por difusión o por la subred), tardando algo más. |
| **C8 · Aislamiento de clientes** | Active en el router el «aislamiento de clientes» (AP isolation). | Los dispositivos no encuentran el servidor. El **Diagnóstico de red** dice «La red bloquea la comunicación entre equipos» y qué hacer. |
| **C9 · Equipo intruso** | Requiere un programa que se haga pasar por el servidor: lo prepara el desarrollo cuando llegue el momento. | El dispositivo emparejado lo rechaza y no le manda nada. |

---

## D. Energía (laptop o UPS por USB) · RF-ENE

Con la PC 1 (laptop) de servidor y dispositivos conectados:

1. **Desenchufe la corriente.**
   **Debe pasar:**
   - en todas las apps, la banda «El servidor funciona con batería (N %)»;
   - la alerta **AL-20**;
   - P-29 dice «Con batería · N %».
2. **Vuelva a enchufar.**
   **Debe pasar:** la banda se va y AL-20 se resuelve sola.
3. **Desenchufe y deje que baje al 15 %** (lleva tiempo; anote las horas).
   **Debe pasar:**
   - la banda roja «Servidor en modo protegido por batería baja: solo consulta»;
   - emitir una orden se rechaza con ese motivo;
   - consultar y entrar sí funcionan.
4. **Enchufe** antes del 5 %.
   **Debe pasar:** sale solo del modo protegido y se vuelve a emitir.
5. Opcional: **déjela llegar al 5 %.**
   **Debe pasar:**
   - el servidor y la base de datos se detienen ordenadamente;
   - al enchufar y encender, el servidor arranca solo;
   - no falta ninguna orden emitida antes.

---

## E. Revisión de experiencia y accesibilidad (T123, T141)

### E1. Recorrido de pantallas

Recorra **todas** las pantallas del menú en:

- el **teléfono de referencia**;
- la **tablet**, en vertical y en horizontal;
- **Windows 10** y **Windows 11**;
- **Android 7**, con el WebView actualizado.

En cada una, anote lo que **cueste entender o usar**:

- un texto confuso;
- un botón difícil de tocar;
- algo que no cabe;
- un paso que sobra;
- algo que no se ve bien en el tema oscuro.

No hace falta que sea un error: también cuentan las cosas incómodas.

### E2. Teclado en escritorio

En la PC, sin ratón: recorra con **Tab** las pantallas principales (Tablero, Nueva orden, Órdenes, DM, Usuarios, Respaldos).

**Debe pasar:**

- se ve siempre dónde está el foco;
- se llega a todo;
- **Enter** y **Espacio** activan;
- **Esc** cierra los diálogos;
- al cerrar un diálogo, el foco vuelve a donde estaba.

### E3. Texto al 130 %

- **En el teléfono:** Ajustes → Pantalla → Tamaño de fuente, al máximo o cerca del 130 %.
- **En Windows:** Configuración → Accesibilidad → Tamaño del texto, al 130 %.

**Debe pasar:** nada se corta ni se monta, y no hay que desplazarse a lo ancho.

### E4. Lector de pantalla en las acciones principales

- **En el teléfono:** active **TalkBack**.
- **En la PC:** active **Narrador** (Ctrl + Windows + Enter) o **NVDA**.

Haga: entrar, emitir una orden, buscar una DM y abrir una alerta.

**Debe pasar:** cada botón y cada campo se anuncia con un nombre que se entiende (no «botón» a secas), y los errores de los campos se leen.

---

## F. Al terminar

Envíe al desarrollo las anotaciones de todas las pruebas, con capturas y los archivos de las que fallaron. Con eso:

- se corrigen los fallos y se prepara un paquete nuevo;
- se repiten solo las pruebas que fallaron;
- se marcan como terminadas T135, T136, T123, T133 y T143, y la parte manual de T141.
