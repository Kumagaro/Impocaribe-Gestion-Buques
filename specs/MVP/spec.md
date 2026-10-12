# Spec 001: MVP del Sistema de Órdenes de Carga

| Campo | Valor |
|---|---|
| Versión | 1.10.0 |
| Fecha | 2026-10-12 |
| Constitución | 1.9.1 |
| Estado | Aprobada, con una verificación legal pendiente (ACLARAR-23) |
| Parte 2 | `ui-spec.md` 1.6.0: especificación de interfaz por pantalla y catálogo de campos |
| Fuente | Prototipo `Ordenes-de-Carga-IMPOCARIBE.html` (9 vistas), Excel de Impocaribe y decisiones del responsable |

Esta spec describe **qué** hace el sistema y **por qué**. No menciona tecnología: eso va en `plan.md`.

---

## 1. Contexto

Impocaribe (Agencia Importadora Caribe S.U.R.L.) recibe harina de trigo por buque en el Puerto de La Habana, Terminal Haiphong. Sus clientes la retiran amparados por una DM, y cada camión que sale lleva una orden de carga firmada y cuñada que la terminal exige.

En el Excel actual se encontraron estos problemas, que el sistema debe impedir:

- Saldos negativos: 54 de 70 filas.
- Resúmenes escritos a mano, sin fórmulas.
- Números de orden repetidos (516) y perdidos (517 a 520).
- El mismo chofer escrito con varios nombres.
- Un cliente con marcas contradictorias.
- Cancelaciones anotadas como texto suelto, sin quién, cuándo ni por qué, y sin reponer saldo.

## 2. Actores y permisos

| Acción | Apoderada | Operador | Solo lectura |
|---|---|---|---|
| Ver tablero, buques, DM, órdenes, PDF, bitácora y alertas | ✓ | ✓ | ✓ |
| Ver borradores compartidos | ✓ | ✓ | — |
| Crear y editar buques, DM y asignaciones | ✓ | ✓ | — |
| Activar y desactivar clientes, destinatarios, transportistas, camiones, remolques y choferes | ✓ | ✓ | — |
| Crear y editar borradores | ✓ | ✓ | — |
| Oficializar, corregir (nueva versión) y anular | ✓ | ✓ | — |
| Tomar decisiones de excepción (capacidad, camión repetido, asignación parcial) | ✓ | ✓ | — |
| Reactivar una DM vencida | ✓ | ✓ | — |
| Crear, editar y desactivar usuarios | ✓ | — | — |
| Cargar y cambiar la firma oficial y el cuño oficial | ✓ | — | — |
| Hacer respaldo manual y restaurar | ✓ | — | — |
| Liberar el bloqueo de un borrador que tiene otra persona | ✓ | — | — |
| Cerrar un buque y dar destino a su sobrante | ✓ | ✓ | — |
| Cambiar la configuración del sistema (5.18) | ✓ | — | — |
| Recuperar órdenes perdidas tras una restauración | ✓ | — | — |
| Revocar dispositivos emparejados | ✓ | — | — |
| Cambiar el código de instalación | ✓ | — | — |

Puede haber varias Apoderadas. Siempre debe existir al menos una Apoderada activa (RF-USR-04).

**Fuera de los roles del sistema** hay dos capacidades ligadas a la PC servidor:

| Capacidad | Quién | Cómo se acredita |
|---|---|---|
| **Administrador de instalación:** crear, reparar, actualizar, trasladar y desinstalar el servidor | Quien tenga permisos de administrador de Windows en esa PC | Confirmación de administrador de Windows + código de instalación de la empresa |
| **Confirmar el emparejamiento** de un dispositivo nuevo | Cualquier persona que esté físicamente ante la pantalla de la PC servidor | Ver y confirmar el código en la pantalla del servidor (no requiere sesión) |

El Administrador de instalación no es un usuario del sistema: no inicia sesión ni accede a datos de negocio.

## 3. Glosario

| Término | Significado | Nombre en código |
|---|---|---|
| Buque | Un arribo de un barco: nombre, viaje, fecha de arribo, total en toneladas | `Vessel` |
| DM | Declaración de Mercancías de un cliente, con total en toneladas | `CustomsDeclaration` |
| Asignación | Toneladas de un buque reservadas para una DM | `Allocation` |
| Orden de carga | Autorización para que un camión retire carga de una asignación | `LoadOrder` |
| Emitir / oficializar | Sinónimos: convertir un borrador en orden oficial, con número, PDF y descuento de saldo. En la interfaz se usa siempre **Emitir** | `issue` |
| Versión | Cada estado inmutable de una orden oficial o de una DM | `…Version` |
| Borrador local | Orden en preparación guardada solo en el dispositivo, o subida pero privada | `Draft (private)` |
| Borrador compartido | Orden en preparación guardada en el servidor, editable por Apoderada u Operador | `Draft (shared)` |
| Cargado | Suma de toneladas de las órdenes oficiales vigentes | derivado |
| Saldo | Lo que queda por cargar | derivado |
| Camión | Vehículo tractor de un transportista | `Truck` |
| Remolque | Agregado del camión que determina su capacidad | `Trailer` |
| Firma oficial | Única firma de la empresa, con nombre, credencial y cargo del representante. Solo la cambian las Apoderadas | `OfficialSignature` |
| Cuño oficial | Único cuño de la empresa. Solo lo cambian las Apoderadas | `OfficialStamp` |
| Decisión de excepción | Confirmación con motivo escrito que autoriza saltar una regla que lo permite | `Override` |
| Bitácora | Registro inmutable de acciones | `AuditLog` |
| Identidad del servidor | Identificador único y nombre de la instalación, con su autoridad de certificación. No depende de la dirección IP | `ServerIdentity` |
| Emparejamiento | Alta de confianza de un dispositivo con el servidor, mediante código de 6 dígitos o QR | `DevicePairing` |
| Montaje de red | Forma en que se conectan los equipos: router wifi o hotspot de un celular | `NetworkSetup` |
| Instalador completo / ligero | Instalador de escritorio con o sin los componentes del servidor | — |
| Modo protegido | Estado del servidor con batería baja: no acepta escrituras | `ProtectedMode` |

---

## 4. Historias de usuario

Prioridad: **P1** sin esto no hay producto; **P2** necesario para el MVP; **P3** completa el MVP.

### HU-01 (P1): Emitir una orden de carga sin sobregiro

Como Operador, quiero crear una orden eligiendo DM, buque, camión y chofer, y escribir solo lo indispensable, para emitir el documento oficial sin errores.

1. **Dado** una DM con 10,000 t de saldo en la asignación del buque EAGLE1, **cuando** oficializo una orden de 17,280 t, **entonces** se bloquea con el mensaje "Sobregiro: la orden supera el saldo por 7,280 t".
2. **Dado** una orden válida, **cuando** oficializo, **entonces** recibe el siguiente número de la secuencia del buque (por ejemplo `EAGLE1-2026-V1-0042`), se genera y archiva el PDF y el saldo se descuenta.
3. **Dado** que dos usuarios oficializan al mismo tiempo contra un saldo que solo alcanza para una orden, **entonces** una se emite y la otra se bloquea por sobregiro.

### HU-02 (P1): Corregir o anular una orden oficial

Como Operador, quiero corregir o anular una orden ya emitida dejando constancia del motivo, para que el papel de la terminal y el sistema siempre coincidan.

1. **Dado** la orden 0042 v1 oficial, **cuando** la corrijo y escribo un motivo, **entonces** nace la v2 con el mismo número, la v1 queda como "Reemplazada" con su PDF intacto y el saldo se ajusta a la diferencia, todo en un solo paso.
2. **Dado** un camión que no salió, **cuando** anulo la orden con motivo, **entonces** nace una versión con estado "Anulada", el saldo se repone por completo y el PDF archivado muestra la marca ANULADA.
3. **Cuando** intento corregir o anular sin motivo, **entonces** el sistema no lo permite.

### HU-03 (P1): Saldos siempre correctos

Como Apoderada, quiero ver en el tablero el total, lo cargado y el saldo de cada DM y buque, calculados por el sistema, para no depender de cuentas a mano.

1. **Dado** cualquier combinación de órdenes, versiones y anulaciones, **entonces** el saldo es igual a lo asignado menos las órdenes oficiales vigentes y nunca es negativo.

### HU-04 (P1): Registrar buques y DM con asignación

Como Operador, quiero registrar un buque con su total y asignarle DM, para saber cuánto queda en cada buque y cuánto le falta a cada DM.

1. **Dado** un buque con 50,000 t libres, **cuando** asigno una DM de 80,000 t, **entonces** el sistema avisa "La DM supera la cantidad restante del buque EAGLE1 en 30,000 t" y pregunta si continuar.
2. Si respondo **no**, la DM no se asigna y el campo de buque queda vacío.
3. Si respondo **sí** y escribo el motivo, se asignan 50,000 t y quedan 30,000 t pendientes de asignar, que se podrán asignar a otro buque.

### HU-05 (P1): Iniciar sesión con usuario y contraseña

Como trabajador, quiero entrar con mi usuario y contraseña desde la PC o el teléfono, para que el sistema sepa quién hace cada cosa.

1. **Dado** un dispositivo emparejado y un usuario activo, **cuando** entro con mi contraseña, **entonces** veo el tablero con las acciones de mi rol.
2. **Dado** que me equivoco 5 veces seguidas, **entonces** mi usuario queda bloqueado 15 minutos y la pantalla me dice cuánto falta.
3. **Dado** que entré sin marcar "Mantener sesión", **entonces** a las 24 horas exactas debo volver a entrar, aunque haya estado trabajando.

### HU-06 (P2): Trabajar sin conexión

Como Operador, quiero seguir preparando órdenes si se cae la wifi, para no perder trabajo.

1. **Dado** que se pierde la conexión, **entonces** la app sigue abriendo, muestra "Sin conexión · datos al {fecha y hora}", permite consultar la copia local y crear y editar borradores locales.
2. **Cuando** vuelve la conexión, **entonces** la copia local se pone al día sola y los borradores locales se suben como borradores privados de su autor.
3. **Dado** que otro usuario emite una orden, **entonces** mi app muestra el nuevo saldo en segundos sin que yo haga nada.

### HU-07 (P2): Alertas en tiempo real

Como Apoderada, quiero recibir alertas, aunque tenga la app cerrada, de DM pendientes, plazos, sobregiros y decisiones de excepción, para actuar a tiempo.

1. **Dado** que un Operador emite una orden superando la capacidad con motivo, **entonces** recibo AL-06 en menos de 5 segundos, con la app abierta o cerrada, en PC y teléfono.
2. **Dado** que una DM llega al día 25, **entonces** todos los roles ven AL-03, y la alerta desaparece sola si la DM se cierra o vence.
3. **Dado** que soy Operador, **entonces** no recibo las alertas reservadas a las Apoderadas (por ejemplo AL-05 o AL-11).

### HU-08 (P2): Catálogos limpios

Como Operador, quiero elegir clientes, destinatarios, transportistas, camiones, remolques y choferes de listas, para que no haya nombres duplicados ni datos incompletos.

1. **Cuando** registro un chofer con un carné que ya existe, **entonces** el campo me lo indica mientras escribo y no puedo guardar.
2. **Cuando** escribo "Juan Carlos Miranda Glez", **entonces** se me advierte que existe "Juan Carlos Miranda González", pero puedo continuar si es otra persona.
3. **Dado** un chofer del transportista A, **entonces** no puedo asignarlo a un camión del transportista B en una orden.

### HU-09 (P2): Plazo de 30 días

Como Apoderada, quiero que el sistema avise el día 25 y desactive la DM al empezar el día 31, liberando su restante, para cumplir el plazo de Aduana.

1. **Dado** una DM creada el 01/09, **entonces** el 25/09 aparece AL-03 y el 30/09 todavía se puede emitir.
2. **Dado** esa misma DM, **cuando** se intenta emitir el 01/10 a las 00:00, **entonces** se rechaza por DM vencida y su restante vuelve al buque.
3. **Cuando** la reactivo con motivo, **entonces** el plazo vuelve a empezar ese día y el restante queda pendiente de asignar.

### HU-10 (P2): Buscar y seguir una DM

Como cualquier usuario, quiero buscar una DM por número, cliente o marca y ver su ficha completa, para responder consultas al instante.

1. **Cuando** escribo "00431", "Nuevos Tiempos" o "Dosel", **entonces** aparece la DM 00431 con su saldo, plazo, asignaciones y órdenes.
2. **Cuando** escribo "42", **entonces** aparecen las órdenes cuyo número termina en 0042.

### HU-11 (P2): Administrar usuarios y recuperar contraseñas

Como Apoderada, quiero crear y desactivar usuarios. Como cualquier usuario, quiero recuperar mi contraseña sin internet.

1. **Cuando** desactivo a un usuario, **entonces** sus sesiones se cierran en todos sus dispositivos y su copia local se borra.
2. **Dado** mi carné, mi teléfono y un código de recuperación válido, **entonces** puedo definir una contraseña nueva; el código ya no sirve una segunda vez y las Apoderadas reciben AL-11.

### HU-12 (P3): Respaldo y restauración

Como Apoderada, quiero respaldos automáticos (cada hora en la jornada y uno diario en la USB), respaldos manuales y la posibilidad de restaurar uno desde la app.

1. **Dado** que son las 10:00 en jornada, **entonces** existe un respaldo de las 10:00 en el disco y el de ayer en la USB.
2. **Cuando** restauro el respaldo de las 10:00 a las 15:00, **entonces** el sistema vuelve a ese estado, la numeración no retrocede y veo las órdenes perdidas para recuperarlas con su número original.

### HU-13 (P3): Bitácora consultable

Como Apoderada, quiero ver y filtrar la bitácora por usuario, fecha, DM u orden.

1. **Cuando** filtro por la orden 0042, **entonces** veo su emisión, sus correcciones con motivo, sus descargas (original o copia) y quién hizo cada cosa.
2. **Dado** cualquier usuario, **entonces** nadie puede modificar ni borrar un registro de la bitácora.

### HU-14 (P1): Crear el servidor desde la app

Como Administrador de instalación, quiero crear el servidor con un botón desde la app de escritorio, sin internet y viendo el progreso, para no depender de un técnico.

1. **Dado** una PC con Windows sin servidor en la red, **cuando** pulso "Crear servidor en este equipo", confirmo el permiso de Windows y escribo el código de instalación, **entonces** veo cada paso avanzar y al final puedo crear la primera Apoderada.
2. **Dado** que un paso falla, **cuando** pulso Deshacer, **entonces** la PC queda como estaba.
3. **Dado** que ya hay un servidor en la red, **entonces** no puedo crear otro.

### HU-15 (P1): Conectar un dispositivo nuevo

Como Operador, quiero que mi teléfono encuentre el servidor solo y se conecte de forma segura, para empezar a trabajar sin configurar nada técnico.

1. **Cuando** abro la app en la misma wifi, **entonces** encuentra el servidor sin escribir direcciones y me muestra un código de 6 dígitos.
2. **Cuando** alguien confirma ese código en la pantalla del servidor, **entonces** mi teléfono queda emparejado y puedo iniciar sesión.
3. **Dado** que se reinicia el hotspot y el servidor cambia de dirección, **entonces** mi teléfono lo vuelve a encontrar solo en menos de 10 segundos.

### HU-16 (P2): Seguir trabajando con apagones

Como Apoderada, quiero que un apagón no deje órdenes a medias y que el servidor se proteja solo con batería baja.

1. **Dado** que el servidor pasa a batería, **entonces** todos los usuarios ven el aviso con el porcentaje.
2. **Dado** que la batería llega al 15 %, **entonces** una emisión en curso termina y las nuevas se rechazan con un mensaje claro; al volver la corriente, todo se reanuda solo.

### HU-17 (P2): Ver las órdenes del día

Como Apoderada, quiero ver todas las órdenes de un día o de un período, con su total de toneladas, para saber qué salió y responder a la terminal.

1. **Cuando** abro Órdenes, **entonces** veo las de hoy con el total de toneladas.
2. **Cuando** filtro por chofer y por semana, **entonces** veo sus órdenes y su total, igual que en la base de datos.

### HU-18 (P2): Formularios que guían

Como Operador, quiero que cada campo me diga qué está mal y qué debo revisar mientras lo lleno, para no cometer errores.

1. **Cuando** escribo un carné de 10 dígitos y salgo del campo, **entonces** veo "El carné debe tener 11 dígitos (tiene 10)" y no puedo guardar.
2. **Cuando** registro una DM, **entonces** veo junto a la fecha el aviso legal del plazo.
3. **Cuando** escribo toneladas que dejarían menos de 1 t en la DM, **entonces** veo una advertencia que no me impide emitir.

---

## 5. Requisitos funcionales

### 5.1 Autenticación y sesiones (AUT)

- **RF-AUT-01.** El inicio de sesión pide usuario y contraseña. Un usuario desactivado no puede entrar.
- **RF-AUT-02.** La sesión dura 24 horas **absolutas** desde el inicio de sesión, sin importar la actividad. Si se marca "Mantener sesión", dura 30 días absolutos. Las mismas reglas aplican en escritorio y en Android.
- **RF-AUT-09.** Si la sesión vence mientras el dispositivo está sin conexión, la app permite consultar la copia local y los borradores locales durante 72 horas más desde el vencimiento. Pasado ese tiempo, o en cuanto hay conexión, exige iniciar sesión.
- **RF-AUT-10.** Cambiar el rol de un usuario cierra todas sus sesiones en todos los dispositivos.
- **RF-AUT-03.** Un usuario puede tener sesiones abiertas en varios dispositivos a la vez.
- **RF-AUT-04.** Al desactivar un usuario o cambiar su contraseña, se cierran todas sus sesiones en todos los dispositivos.
- **RF-AUT-05.** Tras 5 intentos fallidos seguidos, el usuario queda bloqueado 15 minutos. El bloqueo queda en la bitácora.
- **RF-AUT-06.** La contraseña tiene al menos 8 caracteres.
- **RF-AUT-07.** Todas las sesiones de un usuario se pueden cerrar desde su perfil.
- **RF-AUT-08.** La credencial de sesión se guarda en el almacenamiento seguro del dispositivo. Al cerrar sesión, o cuando el servidor revoca la sesión, la app borra la credencial y la copia local de datos. Los borradores locales se conservan cifrados y solo vuelven a ser visibles para su autor.

### 5.2 Recuperación de contraseña (REC)

- **RF-REC-01.** Al crear un usuario, el sistema genera 8 códigos de recuperación de un solo uso. Se muestran una única vez, en una pantalla que bloquea capturas, y el usuario confirma que los copió a mano.
- **RF-REC-02.** Para recuperar la contraseña se piden usuario, carné de identidad, teléfono y un código de recuperación no usado. Si todo coincide, el usuario define una contraseña nueva.
- **RF-REC-03.** Cada código se invalida al usarse. El usuario puede generar un juego nuevo desde su perfil, lo que invalida el anterior.
- **RF-REC-04.** Tras 3 intentos fallidos, la recuperación de ese usuario se bloquea 1 hora.
- **RF-REC-05.** Toda recuperación, exitosa o fallida, se registra en la bitácora y genera la alerta AL-11.
- **RF-REC-06.** Una Apoderada puede restablecer la contraseña de cualquier usuario, que deberá cambiarla en su próximo ingreso.

### 5.3 Usuarios (USR)

- **RF-USR-01.** Datos del usuario:
  - nombre y apellidos;
  - usuario;
  - carné de identidad (11 dígitos, único entre usuarios);
  - teléfono: 8 dígitos, con prefijo `+53` opcional (se guarda sin prefijo);
  - rol;
  - estado (activo o inactivo).

  Los usuarios no tienen firma propia: el documento siempre lleva la firma oficial (5.4).
- **RF-USR-02.** Solo una Apoderada crea, edita, activa o desactiva usuarios.
- **RF-USR-03.** Los usuarios no se borran, solo se desactivan.
- **RF-USR-04.** El sistema impide desactivar o cambiar de rol a la última Apoderada activa.
- **RF-USR-05.** El primer arranque del sistema exige crear la primera Apoderada. Solo puede hacerse **desde la propia PC servidor**, para que nadie en la red se adelante.

### 5.4 Empresa, firma oficial y cuño oficial (EMP)

- **RF-EMP-01.** Existe una única **firma oficial** y un único **cuño oficial** de la empresa. Solo las Apoderadas pueden cargarlos, verlos en tamaño completo y reemplazarlos.
- **RF-EMP-02.** La firma oficial incluye la imagen de la firma y los datos del representante del comprador interno que se imprimen junto a ella: nombre y apellidos, número de credencial y cargo.
- **RF-EMP-03.** Al oficializar o corregir una orden, sea quien sea el usuario autorizado, el sistema aplica automáticamente la firma oficial y el cuño oficial vigentes. Al **anular**, el PDF anulado reutiliza la firma y el cuño de la versión que se anula, así que anular no depende de que estén cargados. Ningún usuario que no sea Apoderada puede subirlos, descargarlos ni cambiarlos.
- **RF-EMP-04.** Si falta la firma oficial o el cuño oficial, no se puede oficializar ni corregir, y se emite la alerta AL-16. Anular sí se puede.
- **RF-EMP-05.** Cada cambio de firma o cuño queda en la bitácora. Los PDF ya emitidos conservan la firma y el cuño con los que se emitieron.
- **RF-EMP-06.** Datos fijos de la empresa: razón social y dirección, que aparecen en la cabecera.

### 5.5 Buques (BUQ)

- **RF-BUQ-01.** Datos del buque:
  - nombre;
  - número de viaje (asignado por el sistema, ver RF-BUQ-03);
  - manifiesto;
  - B/L;
  - puerto y terminal;
  - comprador interno;
  - fecha de arribo estimada (opcional);
  - fecha de arribo real (se registra al llegar);
  - total en toneladas;
  - estado (abierto o cerrado, ver RF-BUQ-08).
- **RF-BUQ-02.** Del nombre del buque se deriva el código de numeración: mayúsculas, sin espacios ni símbolos ("Eagle 1" → `EAGLE1`).
- **RF-BUQ-03.** El viaje (`V1`, `V2`…) lo asigna el sistema al registrar la fecha de arribo real, según el orden de los arribos con el mismo código de nombre y el mismo año de arribo real.
- **RF-BUQ-04.** Un buque con solo fecha estimada puede recibir asignaciones, pero no órdenes. Las órdenes requieren la fecha de arribo real, que además fija el año y el viaje de la numeración.
- **RF-BUQ-05.** El total del buque no puede bajar por debajo de lo ya asignado. Cada cambio pide motivo y queda en la bitácora.
- **RF-BUQ-06.** Para cada buque se muestran: total, asignado, libre para asignar (total − asignado), cargado y restante físico (total − cargado).
- **RF-BUQ-07.** La fecha de arribo real no se puede cambiar una vez que el buque tiene alguna orden emitida, porque fija el año y el viaje de números ya impresos. Antes de eso se puede corregir con motivo.
- **RF-BUQ-08. Cierre del buque.** Una Apoderada o un Operador cierra el buque cuando termina la extracción. Un buque cerrado no admite asignaciones ni órdenes nuevas, pero sí correcciones y anulaciones de sus órdenes. Para cerrarlo, **todo su sobrante debe tener destino registrado**, con motivo:
  - el sobrante es el restante físico: lo libre para asignar más lo asignado a DM y no cargado;
  - destinos posibles, que pueden combinarse hasta cubrir todo el sobrante:
    1. **Asignar a DM pendientes** por el flujo normal de asignación (5.7), antes de cerrar.
    2. **Transferir a otro buque abierto:** el total del buque destino aumenta en esas toneladas y ambos buques registran la transferencia con motivo.
    3. **Registrar como merma o pérdida:** con motivo obligatorio y **solo por una Apoderada**.
  - Las toneladas ya asignadas a una DM y no cargadas solo pueden destinarse después de reducir esa asignación (RF-ASG-03).
- **RF-BUQ-09.** Si después del cierre una anulación o corrección devuelve toneladas al buque, ese nuevo sobrante también debe recibir destino, y se emite la alerta AL-17 hasta que lo tenga.

### 5.6 DM (DM)

- **RF-DM-01.** Datos de la DM:
  - número: exactamente 5 dígitos, con ceros a la izquierda (por ejemplo, `00431`);
  - cliente;
  - marca;
  - fecha de la DM: es la **fecha de creación** de la DM en el sistema, la asigna el sistema automáticamente y no se puede cambiar (ver el aviso legal de RF-DM-13);
  - total en toneladas, que puede quedar vacío mientras está "pendiente de total";
  - producto (harina de trigo, fijo en el MVP).
- **RF-DM-02.** El número de DM es único para siempre: no puede repetirse nunca, ni en años distintos.
- **RF-DM-03.** Una DM puede crearse sin buque y recibir asignaciones de uno o varios buques más adelante.
- **RF-DM-04.** Toda modificación de una DM crea una nueva versión con motivo obligatorio. Solo se pueden modificar el **total** y la **marca**. El cliente y la fecha no cambian nunca: si están mal, se crea otra DM. Las órdenes ya emitidas quedan ligadas a la versión vigente cuando se emitieron.
- **RF-DM-05.** El total de una DM no puede quedar por debajo de lo ya cargado. El formulario muestra lo cargado como referencia, y si se intenta bajar más, explica por qué no se puede.
- **RF-DM-06.** Estados derivados de la DM:

| Estado | Condición |
|---|---|
| Cerrada | Lo cargado es igual al total (saldo exactamente 0,000 t) |
| Vencida | Llegó el día 31 del plazo (RF-PLZ-01) y no se reactivó |
| Pendiente de total | No tiene total |
| Activa | Tiene saldo asignado disponible (> 0,000 t) en al menos una asignación |
| Pendiente de asignación | Tiene total, pero ningún saldo asignado disponible |

  Los estados se evalúan **en el orden de la tabla** y la DM toma el primero que cumple. Por ejemplo, una DM vencida con lo cargado igual al total está Cerrada.

- **RF-DM-07.** Una DM pendiente de total, vencida o cerrada no admite órdenes nuevas.
- **RF-DM-08.** La DM se cierra sola solo cuando lo cargado es exactamente igual al total.
- **RF-DM-09.** Una DM cerrada se reabre automáticamente si una anulación o corrección le devuelve saldo.
- **RF-DM-10. DM pendiente.** Para las alertas AL-01 y AL-02, una DM es "pendiente" si no tiene total, o si tiene toneladas sin asignar a ningún buque (pendiente de asignar > 0,000 t), mientras no esté Cerrada ni Vencida. Puede estar Activa y pendiente a la vez.
- **RF-DM-11.** Una DM vencida no admite órdenes nuevas, pero sus órdenes ya emitidas se pueden corregir, sin aumentar sus toneladas, y anular.

- **RF-DM-12. Ediciones simultáneas.** Si dos usuarios editan a la vez el mismo registro (buque, DM, asignación, catálogo, usuario o configuración), el segundo en guardar recibe el aviso "Otro usuario modificó este registro mientras lo editaba", ve los cambios y decide de nuevo. Nunca se sobrescribe en silencio el cambio de otro.
- **RF-DM-13. Aviso legal del plazo.** Como el plazo se cuenta desde el registro en el sistema y no desde la emisión en la Aduana, el sistema lo advierte:
  - al **crear** una DM, el campo "Fecha de la DM" aparece rellenado con la fecha de hoy, sin poder editarse, y **junto a ese campo** se muestra el aviso como advertencia (nivel ámbar, RF-VAL-01), visible mientras se llena el formulario; no exige ninguna confirmación;
  - en la **ficha** de la DM, junto al plazo, de forma permanente y discreta.

  El texto por defecto es: *"El plazo que muestra el sistema cuenta desde el registro de esta DM en el sistema. Si la Aduana la emitió antes, el plazo legal real para extraer la mercancía puede vencer antes de lo indicado. Verifique la fecha de emisión en el documento de la Aduana."* Una Apoderada puede ajustar el texto en Configuración (RF-CFG-02), por ejemplo para citar la norma vigente cuando esté verificada (ACLARAR-23).
### 5.7 Asignaciones DM–buque (ASG)

- **RF-ASG-01.** Asignar es reservar toneladas de un buque para una DM. Se cumple que la suma de asignaciones de la DM es ≤ su total, y la suma de asignaciones del buque es ≤ su total. Una DM **sin total no se puede asignar** a ningún buque hasta que se registre su total. Tampoco se puede asignar a un buque cerrado ni a una DM vencida o cerrada.
- **RF-ASG-02.** Si la cantidad pedida supera lo libre del buque, el sistema muestra "La DM {n} supera la cantidad restante del buque {b} en {x} t" y pregunta si continuar:
  - **No:** no se crea ni modifica la asignación y el campo de buque queda vacío.
  - **Sí, con motivo:** se asigna solo lo libre del buque y el resto queda pendiente de asignación.
- **RF-ASG-03.** Una asignación no puede reducirse por debajo de lo cargado contra ella. Cada cambio pide motivo y queda versionado.
- **RF-ASG-04.** Saldo de la asignación = asignado − cargado contra ella.

### 5.8 Plazo de 30 días (PLZ)

- **RF-PLZ-01.** El plazo cuenta en días naturales, en hora de La Habana. **La fecha de creación de la DM es el día 1.** Tras una reactivación, la fecha de reactivación pasa a ser el día 1. Ejemplo:

| Fecha | Día del plazo | Qué ocurre |
|---|---|---|
| 01/09/2026 (creación) | 1 | Empieza el plazo |
| 25/09/2026 | 25 | Alerta AL-03 |
| 30/09/2026 | 30 | Último día para emitir órdenes |
| 01/10/2026 a las 00:00 | 31 | La DM vence (RF-PLZ-03) |
- **RF-PLZ-02.** Al empezar el día 25 se emite la alerta AL-03.
- **RF-PLZ-03.** Al empezar el día 31, el sistema desactiva la DM automáticamente (estado Vencida), en un plazo máximo de 10 minutos. El saldo de cada asignación vuelve como libre a su buque: la asignación se reduce a lo cargado. Se emite la alerta AL-04.
- **RF-PLZ-04.** Una Apoderada o un Operador puede reactivar una DM vencida con motivo. Eso crea una nueva versión de la DM, reinicia el plazo y deja lo restante pendiente de asignación, para asignarlo de nuevo al mismo buque o a otro.
- **RF-PLZ-05.** La ficha de la DM muestra los días transcurridos sobre 30, con color de advertencia a partir del día 25.

### 5.9 Catálogos (CAT)

- **RF-CAT-01. Cliente.** Datos: nombre, estado, y uno o más **destinatarios**, cada uno con nombre y dirección de destino. No hay identificador oficial en el MVP: el nombre es único después de normalizarlo (mayúsculas, sin acentos, sin espacios repetidos ni puntuación), así "Nuevos Tiempos S.R.L." y "NUEVOS TIEMPOS SRL" son el mismo cliente.
- **RF-CAT-02. Transportista.** Datos: nombre (el texto "Vehículo perteneciente a") y estado. Cada transportista tiene sus camiones y sus choferes.
- **RF-CAT-03. Camión.** Datos: chapa (obligatoria), chapa del tractivo (opcional), transportista, base del vehículo ("Basificado en", opcional, con "LA HABANA" como valor por defecto), remolques habituales (al menos uno) y estado. No existen camiones sin remolque.
- **RF-CAT-04. Remolque.** Datos, todos obligatorios: chapa, capacidad en toneladas, **transportista** al que pertenece, y estado. Los remolques habituales de un camión deben ser de su mismo transportista. Un camión lleva uno o más remolques, y su capacidad es la suma de las capacidades de los remolques que lleva.
- **RF-CAT-05. Chofer.** Datos, todos obligatorios: nombre y apellidos, **carné de identidad** (11 dígitos, único: es el **identificador del chofer**), número de **licencia de conducción** (11 dígitos, única), **transportista** al que pertenece, y estado. Un chofer puede manejar cualquier camión **de su transportista**.
- **RF-CAT-06.** En la sección "Choferes y camiones" se ven juntos los camiones, sus remolques, su capacidad y los choferes, y desde ahí se crean.
- **RF-CAT-07.** Los catálogos no se borran, solo se desactivan. Lo inactivo no aparece en las listas de selección, pero sigue apareciendo en el historial y en los PDF emitidos.
- **RF-CAT-08.** Al crear un registro, se avisa de posibles duplicados por nombre parecido o por carné o chapa repetidos. Un carné o una chapa repetidos se bloquean.
- **RF-CAT-09. Cambio de transportista de un chofer.** Una Apoderada o un Operador puede cambiar el transportista de un chofer, con motivo. El cambio queda en la bitácora, y las órdenes ya emitidas conservan los datos con los que se emitieron.
- **RF-CAT-10. Desactivar un transportista.** Sus camiones, remolques y choferes dejan de poder elegirse en órdenes nuevas, aunque sigan activos. Antes de confirmar, se avisa: "Este transportista tiene 4 camiones, 6 remolques y 7 choferes, y 2 borradores que los usan".
- **RF-CAT-11. Desactivar un cliente.** No se permite mientras tenga DM que no estén cerradas ni vencidas; el mensaje indica cuáles. Un destinatario sí se puede desactivar en cualquier momento: los borradores que lo usen se bloquearán al emitir.

### 5.10 Órdenes de carga (ORD)

**Estados y versiones**

- **RF-ORD-01.** Estados de la orden: Borrador local, Borrador compartido, Oficial, Reemplazada y Anulada.
- **RF-ORD-02.** Una orden oficial tiene una o más versiones. Solo la última versión no anulada es la vigente.

**Captura**

- **RF-ORD-03.** El usuario elige: DM, asignación (el buque, que se propone solo si hay una sola), destinatario del cliente, **transportista**, y luego, entre los de ese transportista, camión, chofer y uno o más remolques (se proponen los habituales del camión); toneladas, carta de porte, fecha de carga y, de forma opcional, LOT, hoja de ruta y contenedor.
- **RF-ORD-04.** El sistema completa solo, y no se pueden editar: cliente y marca (de la DM); buque, manifiesto, B/L, puerto y comprador interno (del buque); dirección (del destinatario); transportista, chapas y basificado (del camión y el remolque); carné y licencia (del chofer); representante, credencial y cargo (de la firma oficial).
- **RF-ORD-05.** Mientras se escribe, el formulario muestra el saldo de la asignación, las toneladas de la orden, lo que quedaría y la capacidad del camión.

**Borradores**

- **RF-ORD-06.** El borrador local se guarda solo en el dispositivo mientras se escribe, y también sin conexión. Solo lo ve su autor.
- **RF-ORD-07.** "Guardar borrador" convierte el borrador en compartido: queda en el servidor y es visible y editable por Apoderadas y Operadores.
- **RF-ORD-08.** Al recuperar la conexión, los borradores locales se suben al servidor como borradores **privados** de su autor.
- **RF-ORD-09.** Un borrador compartido abierto en edición queda bloqueado para los demás, con el aviso "En edición por {usuario}". El bloqueo se libera al salir o tras 10 minutos sin actividad, y una Apoderada puede liberarlo antes.
- **RF-ORD-10.** Los borradores no reservan saldo, no tienen número oficial y nunca llevan firma ni cuño.
- **RF-ORD-11.** Un borrador se puede descartar. Queda en la bitácora.

**Oficialización**

- **RF-ORD-12.** Oficializar equivale a emitir e imprimir: en una sola operación atómica se validan las reglas, se asigna el número, se crea la versión 1, se descuenta el saldo y se genera y archiva el PDF.
- **RF-ORD-23. Sin duplicados por reintentos.** Si la red falla después de pulsar Emitir (o Corregir, Anular, Asignar) y la app reintenta, o el usuario pulsa dos veces, el servidor reconoce la repetición y devuelve el mismo resultado: **nunca se crean dos órdenes** por un mismo intento.
- **RF-ORD-24. Vencimiento en el momento exacto.** La validación de "DM vencida" se calcula con la fecha y hora del servidor en el momento de emitir. No depende de que la tarea programada ya haya marcado la DM: a las 00:00 del día 31 ya no se puede emitir.
- **RF-ORD-13.** Validaciones al oficializar:

| Validación | Si falla |
|---|---|
| Campos obligatorios: DM, asignación, destinatario, toneladas > 0, camión, al menos un remolque, chofer y carta de porte | Bloquea |
| Firma oficial y cuño oficial cargados | Bloquea (AL-16) |
| DM ni pendiente de total, ni vencida, ni cerrada (en una corrección, la DM vencida sí se admite según RF-DM-11) | Bloquea |
| Buque abierto (en una corrección, también cerrado) | Bloquea |
| Toneladas ≤ saldo de la asignación | Bloquea |
| Buque con fecha de arribo | Bloquea |
| Fecha de carga ≥ fecha de emisión. En una corrección: ≥ fecha de emisión de la **versión 1** | Bloquea |
| Fecha de carga ≤ fecha de emisión + N días (N configurable, 7 por defecto, 5.18) | Bloquea |
| Chofer, camión y remolques activos | Bloquea |
| Chofer, camión y remolques del mismo transportista | Bloquea (`DRIVER_CARRIER_MISMATCH`, `TRAILER_CARRIER_MISMATCH`) |
| Toneladas ≤ suma de capacidades de los remolques | Bloquea hasta una decisión de excepción con motivo (AL-06) |
| Mismo camión sin **otra** orden oficial vigente con la misma fecha de carga (la orden que se corrige no cuenta) | Bloquea hasta una decisión de excepción con motivo (AL-07) |
| DM en el día 25 o después | Avisa sin bloquear |

- **RF-ORD-14.** Toda validación bloqueada deja rastro en la bitácora. Los sobregiros generan la alerta AL-05.

**Numeración**

- **RF-ORD-15.** Formato del número: `{CÓDIGO}-{AÑO DE ARRIBO}-V{VIAJE}-{ID de 4 dígitos}`.
- **RF-ORD-16.** El ID es correlativo por buque (viaje), empieza en 0001, se asigna al oficializar y nunca deja huecos ni se repite.

**Correcciones y anulaciones**

- **RF-ORD-17. Corregir.** Se abre un formulario con los datos de la versión vigente y se pide motivo. Al confirmar, en una sola operación atómica:
  - se crea la versión n+1, oficial y con el mismo número;
  - la versión n pasa a Reemplazada;
  - el saldo se ajusta por la diferencia;
  - se genera el nuevo PDF.

  La corrección aplica todas las validaciones de RF-ORD-13, considerando que se libera la cantidad de la versión anterior. Si la DM está vencida, las toneladas nuevas no pueden superar las de la versión vigente.

  Si la corrección **reduce** toneladas de una DM vencida, la diferencia vuelve como libre a su buque. Si el buque está cerrado, la diferencia queda como sobrante sin destino (RF-BUQ-09, AL-17). Lo mismo aplica a una anulación.
- **RF-ORD-18.** En una corrección no se pueden cambiar la DM ni el buque. Para eso se anula la orden y se crea otra.
- **RF-ORD-19. Anular.** Pide motivo. Crea la versión n+1 con estado Anulada, repone todo el saldo y archiva el PDF con la marca ANULADA. Una orden anulada no admite más versiones.
- **RF-ORD-20.** Cada versión guarda: autor, fecha y hora, dispositivo, motivo y los cambios respecto de la anterior.

**PDF y reimpresión**

- **RF-ORD-21.** El PDF de cada versión se guarda exactamente como se emitió. El usuario que emitió la versión puede descargar el **original sin marca** durante las 24 horas siguientes a la emisión, por si la primera descarga falló. Cualquier otra descarga, de otro usuario o pasado ese plazo, sale marcada "COPIA". Toda descarga queda en la bitácora, indicando si fue original o copia.
- **RF-ORD-22.** El PDF se descarga: en escritorio con "Guardar como"; en Android, a Descargas, con opción de compartir.

### 5.11 Documento PDF (PDF)

- **RF-PDF-01.** El documento reproduce el formato de la orden actual de Impocaribe, tal como está en el prototipo, con estos cambios: se elimina "Cantidad de bultos" y el peso se expresa en toneladas con 3 decimales. El tamaño de papel es **A4**. Los formatos respetan el documento actual:

| Dato | Formato en el PDF | Ejemplo |
|---|---|---|
| Fecha de emisión | `dd.mm.aaaa` | `29.08.2026` |
| Fecha de carga ("el día") | `dd/mm/aaaa` | `30/08/2026` |
| Peso bruto | Toneladas con punto decimal, 3 decimales y espacio como separador de miles | `17.280` · `1 125.000` |

En pantalla se mantiene la coma decimal (`17,280 t`, RNF-05).

| Dato del documento | Origen |
|---|---|
| Fecha de emisión | Fecha de oficialización de la versión |
| No. de orden | Numeración (RF-ORD-15) |
| Nombre del comprador interno | Buque |
| "Se autoriza cargar en" | Puerto y terminal del buque |
| "el día" | Fecha de carga |
| Tipo de producto | "Harina de trigo" |
| Siglas y número del contenedor | Orden (opcional) |
| Peso bruto | Toneladas de la orden |
| Nombre del buque, Mfto, B/L | Buque |
| DM No. | DM |
| "Con destino a" | Dirección del destinatario |
| Nombre del destinatario | Destinatario |
| Vehículo perteneciente a | Transportista del camión |
| Chapa, chapa tractivo | Camión |
| Remolque No. | Chapas de todos los remolques de la orden |
| LOT, hoja de ruta, carta de porte | Orden |
| Basificado en | Base del vehículo (camión) |
| Conducido por, carné, licencia | Chofer |
| Representante, credencial, cargo | Firma oficial vigente al emitir |
| Firma | Firma oficial vigente al emitir |
| Cuño | Cuño oficial vigente al emitir |
| Versión | "Versión n" cuando n > 1 |
| Marcas | ANULADA o COPIA, según el caso |

### 5.12 Tablero, consulta y búsqueda (TAB)

- **RF-TAB-01.** El tablero tiene un filtro de buque (todos o uno). Sin filtro, las cifras usan los totales de las DM; con un buque elegido, usan las **asignaciones a ese buque** (asignado, cargado y saldo de cada DM en ese buque). "Requieren atención" cuenta las DM con alguna alerta abierta de tipo AL-01, AL-03 o AL-04. Muestra:
  - contratado, extraído y pendiente en toneladas;
  - cantidad de órdenes oficiales, borradores y anuladas;
  - cantidad de DM que requieren atención;
  - una tabla por DM con número, cliente y marca, total, cargado, pendiente, % de avance y cantidad de órdenes;
  - las alertas activas del día.
- **RF-TAB-02.** La vista "Embarques (DM)" muestra, por cada DM: saldo, asignaciones por buque, progreso, plazo y sus órdenes con su estado.
- **RF-TAB-03.** "Buscar por DM" busca por número de DM, cliente, marca o número de orden y muestra la ficha completa, con botón "Nueva orden para esta DM". El número de orden se puede escribir completo (`EAGLE1-2026-V1-0042`) o solo su parte final (`42` o `0042`); si coincide en varios buques, se muestran todos.
- **RF-TAB-04.** La ficha muestra el avance de la DM por etapas:

| Etapa | Condición |
|---|---|
| Pendiente | Sin total, o sin ninguna asignación |
| Asignada | Con asignaciones y nada cargado |
| En extracción | Con algo cargado y sin cerrar |
| Entregada | Cerrada |

  Si la DM está Vencida, la etapa en la que estaba se marca además como "Vencida".
- **RF-TAB-05.** Una sección de buques muestra los datos de RF-BUQ-06 y las DM asignadas a cada uno.
- **RF-TAB-06.** La ficha de la DM se puede descargar en PDF como "seguimiento" (P3).
- **RF-TAB-07. Lista de órdenes.** Una sección muestra todas las órdenes (oficiales y anuladas, con su versión vigente), ordenadas de la más reciente a la más antigua, con filtros por fecha de carga, fecha de emisión, estado, buque, DM, cliente, transportista y chofer. Para el rango filtrado muestra la cantidad de órdenes y el total de toneladas. Es el sustituto del "Reporte por orden de carga" del Excel. Desde cada orden se abre su ficha y se descarga su PDF.

### 5.13 Alertas y errores dinámicos (ALR)

Esta sección reemplaza la vista "Errores detectados" del prototipo, que era una auditoría única del Excel, por un centro de alertas vivo.

- **RF-ALR-01.** Las alertas llegan en tiempo real a los usuarios conectados, con un contador visible. También llegan con la app cerrada: en Android por el servicio en primer plano y en Windows desde la bandeja del sistema.
- **RF-ALR-02.** Las notificaciones fuera de la app solo muestran el tipo y la referencia, por ejemplo "DM 00437 pendiente de total".
- **RF-ALR-03.** Hay dos tipos de alerta:
  - **De condición:** se resuelve sola cuando la condición desaparece, por ejemplo cuando se registra el total que faltaba.
  - **De evento:** ocurre una sola vez y se marca como atendida.

  Atender una alerta queda en la bitácora con el nombre de quien la atendió.
- **RF-ALR-04.** El centro de alertas permite filtrar por tipo, estado y DM o buque.
- **RF-ALR-05.** Catálogo de alertas (A = Apoderada, O = Operador, L = Solo lectura):

| ID | Alerta | Tipo | Ven | Atienden |
|---|---|---|---|---|
| AL-01 | DM pendiente según RF-DM-10 (sin total, o con toneladas sin asignar) | Condición | A, O, L | Se resuelve sola |
| AL-02 | DM nueva registrada mientras hay otras DM pendientes según RF-DM-10 (lista las pendientes) | Evento | A, O | A, O |
| AL-03 | DM llega al día 25 del plazo | Condición | A, O, L | Se resuelve sola |
| AL-04 | DM vencida y desactivada; restante devuelto al buque | Evento | A, O, L | A, O |
| AL-05 | Intento real de emitir, corregir o asignar bloqueado por sobregiro. No se dispara con la simulación mientras se escribe | Evento | A | A |
| AL-06 | Orden oficializada superando la capacidad del camión, con motivo | Evento | A | A |
| AL-07 | Camión con dos órdenes la misma fecha de carga, con motivo | Evento | A | A |
| AL-08 | Borrador compartido sin oficializar tras más de 24 h desde su **última edición** | Condición | Autor, A | Se resuelve sola |
| AL-09 | DM activa sin órdenes durante 5 días, contados desde su última orden emitida o, si no tiene órdenes, desde su primera asignación | Condición | A, O, L | Se resuelve sola |
| AL-10 | Asignación parcial por falta de saldo en el buque, con motivo | Evento | A, O | A, O |
| AL-11 | Recuperación de contraseña (exitosa o fallida) o restablecimiento de emergencia (RF-INS-11) | Evento | A | A |
| AL-12 | Respaldo automático fallido, más de 2 h sin respaldo durante la jornada, o más de 24 h sin copia a la USB | Condición | A | Se resuelve sola |
| AL-13 | Conexión perdida con el servidor | Solo local | Dispositivo | Se resuelve sola |
| AL-14 | Borradores locales pendientes de subir | Solo local | Dispositivo | Se resuelve sola |
| AL-15 | Hay una versión nueva de la app para instalar | Solo local | Dispositivo | Al instalar |
| AL-16 | Falta la firma oficial o el cuño oficial; no se puede oficializar | Condición | A, O | Se resuelve sola |
| AL-17 | Buque cerrado con sobrante sin destino (RF-BUQ-09) | Condición | A, O | Se resuelve sola |
| AL-18 | La hora de un dispositivo difiere más de 5 minutos de la del servidor (RF-CON-10) | Condición | A | Se resuelve sola |
| AL-19 | Restauración realizada con órdenes perdidas pendientes de recuperar (RF-RES-07) | Condición | A | Se resuelve sola |
| AL-20 | El servidor funciona con batería (o entró en modo protegido) | Condición | A, O, L | Se resuelve sola |
| AL-21 | Con montaje de hotspot, hay 8 o más dispositivos conectados: se acerca al límite del hotspot | Condición | A | Se resuelve sola |
| AL-22 | Solicitud de emparejamiento pendiente (solo en la pantalla de la PC servidor) | Solo local del servidor | Pantalla del servidor | Al confirmar o rechazar |
| AL-23 | La contraseña de respaldo lleva más de 90 días sin confirmarse | Condición | A | Se resuelve sola |

Las alertas **solo locales** no se guardan en el servidor ni en la bitácora.

### 5.14 Bitácora (BIT)

- **RF-BIT-01.** Se registran:
  - inicios y cierres de sesión, y los intentos fallidos;
  - creación y cambios de buques, DM, asignaciones y catálogos (antes y después);
  - borradores compartidos creados, editados y descartados;
  - oficializaciones, correcciones y anulaciones, con su motivo;
  - validaciones bloqueadas y decisiones de excepción;
  - reimpresiones;
  - cambios de usuarios, firma y cuño;
  - recuperaciones de contraseña;
  - respaldos y restauraciones;
  - alertas atendidas.
- **RF-BIT-02.** Cada registro guarda fecha y hora, usuario, dispositivo, acción, entidad afectada y detalle.
- **RF-BIT-03.** La bitácora no se puede editar ni borrar. Todos los roles la consultan con filtros por usuario, fechas, tipo de acción, DM u orden.
- **RF-BIT-04.** Cada orden y cada DM muestran su propio historial de cambios.

### 5.15 Respaldo y restauración (RES)

- **RF-RES-01.** Respaldos automáticos:
  - **cada hora durante la jornada** (horario configurable, de 7:00 a 19:00 por defecto), en la carpeta de datos del servidor; se conservan las últimas 48 horas;
  - **uno completo diario** a la hora configurada, copiado a la carpeta externa configurada (por ejemplo, una USB); se conservan los últimos 30.

  Los respaldos no deben degradar el rendimiento (RNF-14).
- **RF-RES-02.** Una Apoderada puede hacer un respaldo manual en cualquier momento.
- **RF-RES-03.** Una Apoderada puede restaurar un respaldo. El proceso es:
  1. el sistema pide confirmación escribiendo "RESTAURAR";
  2. hace un respaldo del estado actual;
  3. cierra todas las sesiones;
  4. restaura;
  5. registra la operación en la bitácora restaurada;
  6. ajusta la numeración de cada buque para continuar desde el mayor número emitido antes de restaurar (D12), tomado del respaldo previo a la restauración;
  7. si la base de datos dañada no permitió hacer el respaldo previo, pide a la Apoderada confirmar el último número impreso de cada buque abierto antes de reabrir el sistema.
- **RF-RES-04.** El respaldo incluye la firma oficial y el cuño oficial, y todo el archivo de respaldo va cifrado con una contraseña de respaldo que definen las Apoderadas. Restaurar exige esa contraseña. **Si se pierde, los respaldos no se pueden recuperar.** La guía indica guardarla impresa junto al código de instalación.
- **RF-RES-05.** Si no hay contraseña de respaldo definida, el respaldo automático no se ejecuta y se emite la alerta AL-12.
- **RF-RES-06.** Tras restaurar, el sistema muestra la lista de **órdenes perdidas**: las emitidas entre el momento del respaldo restaurado y la restauración, con todos sus datos, tomadas del respaldo previo.
- **RF-RES-07.** Una Apoderada puede **recuperar** cada orden perdida: el sistema la registra de nuevo con su número original, sus datos y su PDF original, aplicando las validaciones de saldo. Si alguna validación falla, se muestra el motivo y la orden queda en la lista. La alerta AL-19 sigue abierta mientras queden órdenes perdidas sin recuperar o sin descartar con motivo.

- **RF-RES-08. Confirmación periódica de la contraseña de respaldo.** Cada 90 días, al iniciar sesión, una Apoderada debe escribir la contraseña de respaldo para confirmar que alguien la recuerda. Puede posponerlo 3 veces como máximo, un día cada vez. Si nadie la confirma, se emite AL-23 hasta que se confirme o se cambie.
### 5.16 Conectividad (CON)

- **RF-CON-01.** Cada app lleva la interfaz incluida y abre aunque el servidor no esté disponible.
- **RF-CON-02.** Cada app guarda una copia local cifrada de los datos que su rol puede ver: todos los buques, DM, asignaciones y órdenes activos o con movimiento en los últimos 12 meses, los catálogos completos, las alertas abiertas y los borradores compartidos. La firma oficial y el cuño oficial nunca se copian.
- **RF-CON-03.** La copia local se actualiza sola, en menos de 5 segundos, cada vez que cambia algo en el servidor. Al reconectar, descarga solo lo que cambió mientras estuvo desconectada.
- **RF-CON-04.** Los saldos, estados y alertas que muestra la copia local vienen calculados por el servidor.
- **RF-CON-05.** Sin conexión, la app muestra de forma permanente "Sin conexión · datos al {fecha y hora}", permite consultar la copia local y trabajar con borradores locales.
- **RF-CON-06.** Sin conexión no se puede emitir, corregir, anular ni modificar buques, DM, asignaciones, catálogos o usuarios. Los botones correspondientes aparecen desactivados con el motivo.
- **RF-CON-07.** Lo anterior a 12 meses que no esté activo se consulta solo con conexión, directamente al servidor.
- **RF-CON-08.** Los PDF se descargan al abrirlos y quedan guardados en el dispositivo para verlos luego sin conexión.
- **RF-CON-09.** La copia local se borra y se reconstruye sola tras restaurar un respaldo en el servidor, tras actualizar la app si cambia la estructura de datos, y cuando lleva más de 30 días sin sincronizar.
- **RF-CON-10.** En cada conexión, la app compara la hora del dispositivo con la del servidor. Si difieren más de 5 minutos, muestra un aviso local y el servidor emite la alerta AL-18. Los plazos y fechas que deciden siempre usan la hora del servidor.

### 5.17 Actualizaciones de las apps (UPD)

- **RF-UPD-01.** El servidor publica el **instalador ligero de escritorio** y el **APK** con su número de versión, y declara la versión mínima compatible. El **instalador completo** no se publica en el servidor: se distribuye aparte, junto con el código de instalación.
- **RF-UPD-02.** La app consulta al iniciar sesión, y luego cada hora, si hay versión nueva.
- **RF-UPD-03.** Si hay una versión nueva compatible, la app avisa (AL-15) y permite actualizar en ese momento o más tarde.
- **RF-UPD-04.** Si la versión instalada es menor que la mínima compatible, la app no permite escrituras ni sincronización hasta actualizar. Sí deja ver los borradores locales.
- **RF-UPD-05.** La actualización se descarga del servidor local y se instala con la confirmación del usuario. En Android, el usuario debe permitir una vez "instalar apps de este origen".

### 5.18 Configuración del sistema (CFG)

- **RF-CFG-01.** Solo una Apoderada accede a la sección Configuración. Cada cambio queda en la bitácora con el valor anterior y el nuevo.
- **RF-CFG-02.** Parámetros configurables:

| Parámetro | Por defecto | Límites |
|---|---|---|
| Días máximos hacia el futuro para la fecha de carga | 7 | 0 a 30 |
| Horario de jornada para respaldos cada hora | 7:00 a 19:00 | Inicio anterior al fin |
| Hora del respaldo diario | 20:00 | — |
| Carpeta externa del respaldo diario | — | Debe existir y admitir escritura |
| Montaje de red declarado | El elegido al crear el servidor | Router o hotspot |
| Texto del aviso legal del plazo (RF-DM-13) | Texto por defecto de RF-DM-13 | Entre 50 y 600 caracteres |
| Razón social y dirección de la empresa | — | Obligatorias |

- **RF-CFG-03.** Los plazos legales (aviso al día 25 y vencimiento al día 31), los límites de seguridad y los umbrales de las alertas **no** son configurables en el MVP.
- **RF-CFG-04.** Una Apoderada puede cambiar el código de instalación. Se pide el código actual, y el cambio queda en la bitácora.

---

### 5.19 Interfaz de usuario (UI)

Esta sección fija las reglas comunes. El detalle de cada pantalla está en `ui-spec.md`, que forma parte de esta spec.

- **RF-UI-01. Interfaz completa.** Cada requisito funcional de esta spec que implique una acción o consulta del usuario tiene su pantalla o elemento de interfaz en `ui-spec.md`, en las tres clases de dispositivo.
- **RF-UI-02. Clases de dispositivo:**

| Clase | Cuándo | Enfoque |
|---|---|---|
| Teléfono | App Android con ancho mínimo de pantalla < 600 dp | Una mano, pulgar, una tarea por pantalla, navegación inferior, formularios por pasos, hojas inferiores |
| Tablet | App Android con ancho mínimo ≥ 600 dp, en vertical u horizontal | Riel de navegación lateral, lista y detalle lado a lado en horizontal, formularios en dos columnas |
| Escritorio | App Windows (ventana mínima de 1024 × 640) | Menú lateral fijo, tablas densas ordenables, varios paneles, atajos de teclado, estados al pasar el ratón |

  Las tres clases comparten lógica, datos, reglas y textos. Cambia la composición, la navegación y la forma de interactuar.
- **RF-UI-03. Identidad visual.** El sistema de diseño parte del prototipo aprobado (colores, tipografía, tarjetas, tablas, insignias y mensajes) y puede renovarse en experiencia de uso sin perder su identidad. Tiene tema claro y oscuro.
- **RF-UI-04. Estados obligatorios.** Toda pantalla define y muestra: cargando, vacío, sin conexión, error, sin permiso, bloqueado por otro usuario (cuando aplica) y actualización obligatoria (`ui-spec.md` §2).
- **RF-UI-05. Fluidez.** Toda pantalla usa los patrones de movimiento de `ui-spec.md` §3:
  - transiciones entre pantallas;
  - listas que animan altas, bajas y reordenamientos cuando llegan cambios;
  - saldos y barras que animan su cambio;
  - diálogos y hojas animados (en teléfono se cierran deslizando);
  - errores de validación que aparecen sin saltos;
  - respuesta inmediata al tocar;
  - **iconos animados** que comunican estado (alerta nueva, sincronizando, sin conexión, éxito).
- **RF-UI-06. Movimiento reducido.** Si el sistema operativo pide reducir el movimiento, o el usuario activa "Reducir animaciones" en su perfil (preferencia por dispositivo), las animaciones se sustituyen por cambios instantáneos o fundidos de 100 ms como máximo.
- **RF-UI-07. Retroalimentación.** Toda acción de escritura muestra su estado: en curso, éxito o error con el mensaje de negocio. Nada cambia en pantalla como si se hubiera guardado antes de que el servidor lo confirme.
- **RF-UI-08. Textos.** Toda la interfaz está en español, con los mensajes de error del catálogo de la spec, sin códigos técnicos visibles para el usuario.
- **RF-UI-09. Maquetas.** Antes de implementar cada pantalla, sus maquetas de teléfono, tablet y escritorio se aprueban por el responsable del proyecto.
- **RF-UI-10. Dispositivo de referencia.** El rendimiento se mide en un teléfono Android de **gama media-baja**, que es el mínimo para usar la app: unos 3 GB de RAM, procesador de gama de entrada de 8 núcleos y pantalla HD+ (720 × 1600). El responsable elige un modelo concreto con esas características para las pruebas. También se verifica en Android 7 con el WebView actualizado.
- **RF-UI-11. Navegador interno de Android.** Al iniciar, la app Android comprueba la versión del navegador interno del sistema (WebView). Si es menor que la mínima, muestra una pantalla que explica el problema y ofrece instalar la actualización incluida en el servidor local, sin internet.

### 5.20 Instaladores y servidor (INS)

- **RF-INS-01. Tres instaladores**, todos utilizables sin internet:

| Instalador | Para | Contenido |
|---|---|---|
| Completo de escritorio | La PC que será servidor | App de escritorio + componentes del servidor (base de datos, servicio, generador de PDF) |
| Ligero de escritorio | Las demás PCs | Solo la app de escritorio |
| Android | Teléfonos y tablets | La app Android. Se acompaña de los instaladores del WebView (RF-UI-11) |

- **RF-INS-02. Código de instalación.** Se genera uno por empresa al preparar el paquete de distribución y se entrega impreso aparte, nunca dentro del paquete. El instalador completo solo guarda su comprobación, no el código. Una vez creado el servidor, las acciones de mantenimiento (reparar, actualizar, trasladar, desinstalar) validan el código contra el que tiene el servidor, que una Apoderada puede haber cambiado (RF-CFG-04), y no contra el del instalador.
- **RF-INS-03. Crear servidor.** En la app de escritorio instalada con el instalador completo, la pantalla de conexión ofrece **"Crear servidor en este equipo"**. El proceso:
  1. busca en la red si ya existe un servidor; si lo encuentra, **no permite continuar** y lo explica;
  2. comprueba los requisitos de la PC (RNF-19);
  3. pide la confirmación de administrador de Windows y el código de instalación;
  4. pide elegir el montaje de red (router u hotspot);
  5. ejecuta todos los pasos mostrando el **progreso** paso a paso: base de datos, estructura, servicio, generador de PDF, identidad y certificado, firewall, energía, arranque y comprobación;
  6. si un paso falla, explica qué falló y ofrece **Reintentar** o **Deshacer**; nunca deja un servidor a medias;
  7. al terminar, muestra la guía del montaje elegido, el nombre y el QR del servidor, y continúa con la creación de la primera Apoderada (P-02).
- **RF-INS-04. Estado del servidor.** En la PC servidor, la app muestra el estado del servicio, la versión, el montaje de red, la batería, los dispositivos conectados y emparejados, las solicitudes de emparejamiento pendientes y el QR. Las acciones Reparar, Reiniciar servicio, Actualizar, Preparar traslado y Desinstalar exigen al Administrador de instalación.
- **RF-INS-05. Reparar.** Vuelve a verificar y rehacer los pasos de instalación sin tocar los datos.
- **RF-INS-06. Actualizar el servidor.** Con un instalador completo nuevo: respaldo automático previo, progreso visible, vuelta atrás automática si falla, y publicación del instalador ligero y del APK de la nueva versión.
- **RF-INS-07. Trasladar el servidor.**
  1. En la PC actual, "Preparar traslado" crea un respaldo de traslado (datos e identidad del servidor) y detiene el servidor.
  2. En la PC nueva, con el instalador completo, "Crear servidor desde un respaldo de traslado" restaura todo con la **misma identidad**, así que los dispositivos se reconectan sin volver a emparejarse.
  3. La PC anterior queda marcada como trasladada y no puede volver a arrancar como servidor (D14).
- **RF-INS-08. Desinstalar el servidor.** Exige respaldo previo, código de instalación y escribir "DESINSTALAR". Los datos se conservan en una carpeta aparte, salvo que se marque expresamente "Borrar también los datos".
- **RF-INS-09. Aviso al apagar.** Si se intenta apagar o reiniciar Windows en la PC servidor con la app de escritorio abierta, Windows muestra el aviso: "Esta PC es el servidor de Órdenes de Carga: hay X dispositivos conectados". El servidor arranca solo al encender la PC, aunque nadie inicie sesión.
- **RF-INS-10. Sesión de Windows en la PC servidor.** Para confirmar emparejamientos y mostrar el aviso al apagar, la app de escritorio debe estar abierta en la PC servidor. La app se configura para iniciarse con la sesión de Windows.
- **RF-INS-11. Restablecimiento de emergencia.** Desde la pantalla Estado del servidor, el Administrador de instalación (permiso de Windows y código de instalación) puede restablecer la contraseña de una Apoderada, que deberá cambiarla en su próximo ingreso. Se usa cuando ninguna Apoderada puede entrar ni recuperar su contraseña. Queda en la bitácora y emite AL-11.

### 5.21 Red, descubrimiento y emparejamiento (RED)

- **RF-RED-01. Montajes soportados.**
  - **Router wifi:** recomendado; la PC servidor se conecta por cable o wifi.
  - **Hotspot de un celular:** una PC de escritorio sin wifi necesita un adaptador wifi USB.
  - *Recomendaciones operativas, que el sistema no puede verificar y que van en la guía:* celular dedicado, junto al servidor, enchufado y sin datos móviles.
  - Por encima de 8 dispositivos conectados con hotspot se emite AL-21, y la guía indica que hace falta un router.
- **RF-RED-02. Descubrimiento automático.** Las apps encuentran el servidor sin escribir direcciones, probando en orden:
  1. la última dirección conocida;
  2. el anuncio del servidor en la red;
  3. un mensaje de difusión;
  4. la búsqueda en las direcciones de la red local;
  5. como último recurso, el QR del servidor o la dirección escrita a mano.

  Si la dirección del servidor cambia, las apps lo vuelven a encontrar solas.
- **RF-RED-03. Identidad del servidor.** Las apps reconocen al servidor por su identidad, no por su dirección. Un equipo con otra identidad nunca se acepta como servidor, aunque responda en la dirección esperada.
- **RF-RED-04. Emparejamiento.** Un dispositivo nuevo se empareja una sola vez, de una de dos formas:
  - **Código:** la app y la pantalla de la PC servidor muestran el mismo código de 6 dígitos; quien está ante el servidor lo compara y confirma.
  - **QR:** la app escanea el QR que muestra la pantalla del servidor.

  La app de escritorio **de la propia PC servidor** se empareja sola, sin código, porque se conecta desde la misma máquina.

  Todo lo que no sea descubrir el servidor o emparejarse (incluidos iniciar sesión, recuperar la contraseña y el primer arranque) exige un **dispositivo emparejado**.

  Después del emparejamiento se inicia sesión normalmente. Una solicitud no confirmada caduca a los 5 minutos.
- **RF-RED-05. Dispositivos emparejados.** El servidor guarda la lista de dispositivos emparejados (nombre, plataforma, fecha, última conexión). Una Apoderada puede revocar uno: sus sesiones se cierran y su copia local se borra (RF-AUT-08). Para volver a usarlo hay que emparejarlo de nuevo.
- **RF-RED-06. Diagnóstico de red.** Todas las apps tienen una pantalla de diagnóstico que muestra, en lenguaje claro:
  - si el servidor se encuentra y por qué método;
  - la dirección actual y el tiempo de respuesta;
  - si la red bloquea la comunicación entre equipos;
  - qué hacer en cada caso.

  En la PC servidor muestra además los dispositivos conectados y el montaje de red.
- **RF-RED-07. Firewall.** El servidor solo acepta conexiones de equipos de la misma red local, sea cual sea el tipo de red que Windows asigne.

### 5.22 Energía (ENE)

- **RF-ENE-01.** El servidor comprueba cada 30 segundos si la PC funciona con corriente o con batería (laptop, o UPS conectado por USB).
- **RF-ENE-02.** Con batería, emite AL-20 y todas las apps muestran el aviso "El servidor funciona con batería ({n} %)".
- **RF-ENE-03. Modo protegido.** Con la batería al 15 % o menos:
  - el servidor deja de aceptar escrituras nuevas (`SERVER_PROTECTED_MODE`);
  - termina las que estén en curso;
  - asegura en disco todos los datos;
  - las apps muestran "Servidor en modo protegido por batería baja: solo consulta".
- **RF-ENE-04.** Con la batería al 5 % o menos, el servidor se detiene de forma ordenada.
- **RF-ENE-05.** Al volver la corriente, el servidor sale solo del modo protegido; si se había detenido, arranca solo al encender la PC.

### 5.23 Validación de campos (VAL)

Las reglas de cada campo están en el **catálogo de campos** de `ui-spec.md` §6. Aquí se fijan las reglas comunes.

- **RF-VAL-01. Tres niveles de mensaje por campo:**

| Nivel | Significado | ¿Bloquea guardar? |
|---|---|---|
| **Error** (rojo) | El dato es incorrecto o falta | Sí |
| **Advertencia** (ámbar) | El dato es válido pero merece atención (por ejemplo, el aviso legal de RF-DM-13 o las advertencias de RF-VAL-08) | No |
| **Ayuda** (gris) | Explica qué se espera, con un ejemplo | No |

- **RF-VAL-02. Momento.**
  1. Mientras se escribe por primera vez en un campo, solo se ve la ayuda.
  2. Al salir del campo, aparece su error o advertencia.
  3. Desde ese momento, el campo se revalida mientras se escribe, y el error desaparece en cuanto se corrige.
  4. Al pulsar Guardar o Emitir se validan todos los campos, el foco va al primer campo con error y arriba aparece un resumen ("Hay 3 campos por corregir") con enlaces a cada uno.
- **RF-VAL-03. Mensajes concretos.** Cada error dice qué está mal y cómo se corrige, con el valor esperado: "El carné debe tener 11 dígitos (tiene 10)", nunca solo "Campo inválido".
- **RF-VAL-04. Mismas reglas que el servidor.** La interfaz aplica exactamente las reglas del servidor, y el servidor las vuelve a aplicar siempre. Si el servidor rechaza algo que la interfaz no detectó (por ejemplo, un dato que otro usuario acaba de cambiar), el error se muestra en el campo correspondiente.
- **RF-VAL-05. Sin conexión.** Las validaciones funcionan sin conexión, con la copia local.
- **RF-VAL-06. Comprobaciones contra datos existentes.** La duplicidad (número de DM, carné, licencia, chapa, nombre de cliente o transportista) se comprueba mientras se escribe contra la copia local, y el servidor la confirma al guardar.
- **RF-VAL-07. Ayudas de escritura:**
  - carné, licencia, número de DM y código de 6 dígitos solo admiten dígitos;
  - las chapas se pasan a mayúsculas automáticamente;
  - el teléfono acepta `+53` y lo quita al guardar;
  - las toneladas aceptan coma o punto y no admiten más de 3 decimales.
- **RF-VAL-08. Advertencias de negocio**, que no bloquean:

| ID | Advertencia | Dónde |
|---|---|---|
| ADV-01 | La DM está en el día 25 o más de su plazo | Al elegir la DM en una orden |
| ADV-02 | Tras la orden, quedarían menos de 1,000 t en la DM ("¿Cierra la DM con esta orden?") | Campo de toneladas |
| ADV-03 | La orden supera el 95 % de la capacidad de los remolques (sin pasarla) | Campo de toneladas |
| ADV-04 | La fecha de carga es distinta de hoy | Campo de fecha de carga |
| ADV-05 | Ya existe un cliente, chofer o transportista con un nombre parecido | Campo de nombre |
| ADV-06 | Tras la asignación quedaría menos del 5 % libre en el buque | Campo de toneladas de la asignación |
| ADV-07 | El chofer ya tiene más de 3 órdenes con esa fecha de carga | Campo de chofer |

  Los umbrales no son configurables en el MVP (RF-CFG-03).
- **RF-VAL-09. Marca de correcto.** Solo los campos de formato exigente (carné, licencia, chapa, número de DM, código de instalación y código de 6 dígitos) muestran una marca verde al ser válidos.
- **RF-VAL-10. Cambios sin guardar.** Al intentar salir de un formulario con cambios sin guardar, se pregunta "Tiene cambios sin guardar. ¿Salir de todos modos?". No aplica a Nueva orden ni a Corregir, que se autoguardan como borrador.
- **RF-VAL-11. Accesibilidad.** Los errores se asocian a su campo y se anuncian al lector de pantalla.

## 6. Reglas de cálculo

Todas las cantidades van en toneladas con 3 decimales y aritmética exacta.

```
cargado(asignación)  = Σ toneladas de la versión vigente de cada orden Oficial de esa asignación
saldo(asignación)    = asignado(asignación) − cargado(asignación)                     ≥ 0
asignado(DM)         = Σ asignado de sus asignaciones                                   ≤ total(DM)
cargado(DM)          = Σ cargado de sus asignaciones
saldo(DM)            = total(DM) − cargado(DM)
pendiente_asignar(DM)= total(DM) − asignado(DM)
asignado(buque)      = Σ asignado de sus asignaciones                                   ≤ total(buque)
libre(buque)         = total(buque) − asignado(buque)
cargado(buque)       = Σ cargado de sus asignaciones
restante(buque)      = total(buque) − cargado(buque)
avance(DM) %         = cargado(DM) / total(DM) × 100
```

Las órdenes con estado Reemplazada, Anulada o Borrador no suman.

## 7. Correspondencia con el prototipo

| Vista del prototipo | En el MVP |
|---|---|
| Tablero | RF-TAB-01, con filtro por buque y alertas reales |
| Embarques (DM) | RF-TAB-02, más la gestión de DM y asignaciones (5.6 y 5.7) |
| Buscar por DM | RF-TAB-03 a RF-TAB-06 |
| Nueva orden | 5.10, toneladas en lugar de bigbags |
| Editar orden | Borradores (RF-ORD-06 a 11) y corrección (RF-ORD-17) |
| Orden impresa | 5.11 |
| Anular y reiniciar | RF-ORD-19 e historial de versiones |
| Errores detectados | Centro de alertas (5.13) |
| Acceso y permisos | Inicio de sesión, usuarios y bitácora (5.1 a 5.3 y 5.14) |
| *(nuevas)* | Buques, Choferes y camiones, Clientes, Transportistas, Borradores, Usuarios, Empresa, Configuración, Respaldos, Bitácora, Perfil, Login y Recuperación, Crear servidor, Estado del servidor, Diagnóstico de red y Emparejamiento |

Cada pantalla, nueva o heredada del prototipo, tiene su especificación completa en `ui-spec.md`.

Del prototipo se eliminan:

- todo lo referido a bigbags y bultos;
- la alerta de "peso por bigbag";
- el botón "Exportar a Excel";
- la nota de demostración.

## 8. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | Funciona completo en la red wifi local, sin internet. |
| RNF-02 | Las apps son Windows 10/11 (escritorio) y Android 7 (API 24) o superior (teléfono y tablet), con una interfaz propia para cada clase de dispositivo (5.19). Todas las funciones, incluidas las alertas con la app cerrada, operan desde Android 7. |
| RNF-03 | Hasta 15 usuarios simultáneos con respuesta menor a 1 segundo en operaciones comunes y menor a 3 segundos al oficializar con PDF, medidos en una PC servidor de 8 GB. En una de 4 GB se admite hasta el doble, y hasta 6 segundos para la primera emisión tras un rato sin actividad. |
| RNF-04 | Una alerta, o un cambio de datos, llega en menos de 5 segundos a los dispositivos conectados. |
| RNF-05 | Interfaz, mensajes y PDF en español. Números con coma decimal (`17,280 t`). Fechas `dd/mm/aaaa`. Zona horaria `America/Havana`. |
| RNF-06 | Tema claro y oscuro, como en el prototipo. |
| RNF-07 | Ninguna operación puede producir saldo negativo, ni números repetidos o con huecos, ni siquiera bajo concurrencia. |
| RNF-08 | La comunicación va cifrada dentro de la red local. |
| RNF-09 | Las pantallas de códigos de recuperación y de firma bloquean capturas. |
| RNF-10 | El servidor arranca con Windows, sin que nadie inicie sesión, y se recupera solo tras un reinicio o un apagado brusco. |
| RNF-11 | Las apps se actualizan desde el servidor local sin internet (5.17). |
| RNF-12 | La copia local de un dispositivo ocupa menos de 200 MB con un año de operación, sin contar los PDF guardados. |
| RNF-13 | La app abre y muestra el tablero desde la copia local en menos de 2 segundos en escritorio y en menos de 3 segundos en el dispositivo de referencia (RF-UI-10). |
| RNF-14 | Durante un respaldo, las operaciones comunes siguen respondiendo dentro de los tiempos de RNF-03. |
| RNF-15 | En el dispositivo de referencia, las transiciones y animaciones se mantienen en al menos 50 cuadros por segundo de media, sin bloqueos de más de 100 ms durante una animación. En escritorio, 60 cuadros por segundo. |
| RNF-16 | Cada pantalla cumple contraste AA, objetivos táctiles de al menos 48 dp en teléfono y tablet, navegación completa por teclado en escritorio, y sigue siendo usable con el texto del sistema al 130 %. |
| RNF-17 | Una app encuentra al servidor en menos de 10 segundos al unirse a la red y tras un cambio de dirección del servidor. |
| RNF-18 | Crear el servidor desde la app tarda menos de 20 minutos en una PC que cumple los requisitos. |
| RNF-19 | Requisitos de la PC servidor: Windows 10 u 11 de 64 bits, **4 GB de RAM como mínimo** (funciona, aunque más lento; 8 GB recomendados), 20 GB libres en disco, red por cable o wifi (adaptador USB si no tiene). Recomendado: laptop, o PC de escritorio con UPS. |
| RNF-20 | La primera sincronización de un dispositivo con un año de datos termina en menos de 3 minutos en el dispositivo de referencia, mostrando el progreso. |
| RNF-21 | **Consumo contenido.** En la PC servidor, el conjunto del servidor (base de datos, servicio y generador de PDF) usa como máximo 1,2 GB de RAM en operación normal y 600 MB en reposo, y la app de escritorio como máximo 350 MB. En el dispositivo de referencia, la app Android usa como máximo 300 MB. |

## 9. Casos límite

1. Dos usuarios oficializan la última tonelada disponible al mismo tiempo: solo uno lo consigue (RNF-07).
2. Se corrige una orden aumentando las toneladas: se valida contra el saldo más lo que libera la versión anterior.
3. Una DM vence mientras alguien tiene un borrador abierto para ella: al oficializar se bloquea por DM vencida.
4. Se anula una orden de una DM vencida: el saldo vuelve a la asignación, que ya se había reducido a lo cargado. Esas toneladas pasan a libre del buque y a pendiente de asignar de la DM.
5. Se desactiva un chofer usado en un borrador: al oficializar se bloquea y hay que elegir otro.
6. Un borrador local se sube cuando la DM ya está cerrada: se sube igual, como privado, y la validación ocurre al oficializar.
7. Se restaura un respaldo con usuarios conectados: sus sesiones se cierran, su copia local se borra y se reconstruye al volver a entrar, y sus borradores locales se conservan en el dispositivo.
8. Cambio de año: la numeración no se reinicia, porque el año del número es el de arribo del buque.
9. El mismo buque llega dos veces en el año: los viajes V1 y V2 tienen secuencias independientes.
10. Una Apoderada cambia la firma o el cuño oficial: los PDF emitidos antes conservan los anteriores, incluidas sus copias.
11. Se intenta registrar una DM con un número que ya existió, aunque esté cerrada o vencida: se bloquea.
12. Un usuario ve un saldo en su copia local mientras otro emite contra él: si intenta emitir, el servidor decide con el saldo real y, si ya no alcanza, responde sobregiro con el saldo actualizado.
13. Un dispositivo vuelve tras semanas apagado: descarga los cambios pendientes o, si pasaron más de 30 días, reconstruye la copia completa.
14. Se corrige el 31/10 una orden con fecha de carga 30/10 emitida el 29/10: se permite, porque la fecha de carga es ≥ la emisión de la versión 1.
15. Se restaura el respaldo de las 10:00 a las 15:00 y entre medias se emitieron las órdenes 0041 a 0045: la siguiente orden nueva será la 0046, y las 0041 a 0045 aparecen como perdidas para recuperarlas con su número original.
16. Una DM creada el 01/09 sigue sin cerrar el 01/10: vence a las 00:00 y sus órdenes ya emitidas se pueden corregir sin aumentar toneladas, o anular.
17. Se anula una orden de un buque ya cerrado: el buque vuelve a tener sobrante y salta la alerta AL-17 hasta darle destino.
18. Se reinicia el hotspot y la PC servidor recibe otra dirección: las apps la encuentran solas en menos de 10 segundos y la reconocen por su identidad.
19. Alguien intenta crear un segundo servidor en otra PC con el instalador completo: la app encuentra el existente y no lo permite.
20. Hay un apagón y la PC servidor (laptop) sigue con batería: todos ven el aviso; al 15 % entra en modo protegido y una emisión en curso termina; las nuevas se rechazan con un mensaje claro.
21. Se traslada el servidor a otra PC: los teléfonos se reconectan solos sin emparejarse de nuevo, y la PC anterior no puede volver a arrancar como servidor.
22. Un equipo intruso en la red responde como si fuera el servidor: las apps lo rechazan porque su identidad no coincide.

## 10. Fuera de alcance

- Importación y exportación de Excel.
- Integración con báscula.
- Otros productos.
- iOS.
- Acceso fuera de la red local.
- Migración de los datos históricos del Excel.
- Reportes avanzados.

## 11. Criterios de éxito

1. Cero saldos negativos y cero números repetidos o perdidos, verificados con pruebas de concurrencia.
2. Una orden se emite tecleando solo toneladas, carta de porte, fecha de carga y los datos opcionales. El resto se elige o se completa solo.
3. Toda orden y DM tiene su historial completo de versiones con autor y motivo.
4. Las alertas AL-01 a AL-12 y AL-16 a AL-21 llegan a los roles indicados con la app abierta o cerrada; AL-22 aparece en la PC servidor.
5. Los datos reales del Excel de Impocaribe, reproducidos en el sistema como escenario de prueba, no generan ninguno de los errores detectados hoy: números repetidos o perdidos, saldos negativos o cancelaciones sin rastro.

---

## 12. Decisiones de aclaración

### Resueltos

| ID | Decisión |
|---|---|
| ACLARAR-1 y 6 | Una sola firma oficial y un solo cuño oficial, administrados solo por las Apoderadas y aplicados automáticamente al emitir. Sin ellos no se oficializa. |
| ACLARAR-2 | Los buques tienen fecha de arribo estimada y real. Las órdenes requieren la real. |
| ACLARAR-3 | El número de DM es único para siempre. |
| ACLARAR-4 | "Basificado en" es la base del vehículo: opcional, con "LA HABANA" por defecto. Hay que verificar su significado con quien llena hoy el documento. |
| ACLARAR-5 | El camión lleva uno o más remolques y su capacidad es la suma. |
| ACLARAR-7 | 5 días sin órdenes cuentan como "sin movimiento". |
| ACLARAR-8 | La firma y el cuño van en el respaldo, cifrado con contraseña. |
| ACLARAR-9 | El Operador sigue pudiendo oficializar, corregir y anular. El documento lleva siempre la firma y el cuño oficiales, y la bitácora registra quién emitió. |
| ACLARAR-10 | Los remolques se eligen en cada orden, y el sistema propone los habituales del camión. |
| ACLARAR-13 | El sistema arranca desde cero: no hay carga inicial ni continuidad con el Excel. |
| ACLARAR-14 | La fecha de la DM es su fecha de creación en el sistema y es el día 1 del plazo. Las órdenes de una DM vencida se pueden corregir (sin aumentar toneladas) y anular. |
| ACLARAR-15 | Una DM sin total no se asigna. "DM pendiente" incluye las que no tienen total y las que tienen toneladas sin asignar. |
| ACLARAR-16 | Sesión absoluta de 24 horas, consulta sin conexión durante 72 horas tras el vencimiento. Cambiar el rol cierra las sesiones. Solo lectura no ve borradores. |
| ACLARAR-11 | Destinos del sobrante: asignar a DM pendientes, transferir a otro buque abierto o registrar como merma (solo Apoderada). Se pueden combinar. |
| ACLARAR-12 | Licencia de 11 dígitos. Teléfono de 8 dígitos con `+53` opcional. |
| ACLARAR-18 | Tres instaladores; creación, reparación, actualización, traslado y desinstalación del servidor desde la app por el Administrador de instalación (permiso de Windows y código de instalación); un solo servidor. |
| ACLARAR-19 | Dos montajes de red (router recomendado, hotspot con celular dedicado), descubrimiento automático, identidad del servidor, emparejamiento por código o QR confirmado ante la pantalla del servidor, aviso a los 8 dispositivos, adaptador wifi USB como requisito, diagnóstico de red. |
| ACLARAR-20 | Apagones: aviso con batería, modo protegido al 15 %, parada al 5 %, reanudación automática; aviso al apagar Windows. |
| ACLARAR-17 | Interfaces propias de teléfono, tablet y escritorio; identidad del prototipo renovada; Motion e iconos animados; dispositivo de referencia de gama media-baja; WebView actualizado incluido en el paquete de instalación. |

### Resueltos en la auditoría QA

| ID | Decisión |
|---|---|
| ACLARAR-21 | Sin identificador de clientes en el MVP: nombre único normalizado y aviso de parecidos (RF-CAT-01, 08). |
| ACLARAR-22 | El PDF respeta los formatos del documento actual (RF-PDF-01). |
| ACLARAR-24 | La PC servidor tiene una sesión de Windows abierta durante la jornada, con bloqueo de pantalla; para emparejar se desbloquea (RF-INS-10). |
| ACLARAR-26 | El carné es el identificador del chofer; carné y licencia son obligatorios y únicos; cada chofer pertenece a un transportista y solo maneja camiones de ese transportista (RF-CAT-05, 09). |
| ACLARAR-27 | Validación de campos con tres niveles, momento definido, mismas reglas que el servidor, 7 advertencias de negocio, marca de correcto en campos exigentes, aviso de cambios sin guardar y catálogo de campos (5.23). Aviso legal junto al campo de fecha, sin confirmación (RF-DM-13). |
| ACLARAR-28 | Los remolques pertenecen a un transportista; la orden exige chofer, camión y remolques del mismo transportista (RF-CAT-04). |
| ACLARAR-29 | Sin reporte del día en PDF: no está en el prototipo. La lista de órdenes cubre la consulta (RF-TAB-07). |
| ACLARAR-30 | Restablecimiento de emergencia de la contraseña de una Apoderada por el Administrador de instalación (RF-INS-11). |
| ACLARAR-31 | 4 GB de RAM como mínimo, aunque más lento; 8 GB recomendados; consumo de recursos limitado y medido (RNF-19, RNF-21). |
| ACLARAR-25 | La contraseña de respaldo es irrecuperable; se guarda impresa y se confirma cada 90 días (RF-RES-04, 08, AL-23). |

### Por confirmar

| ID | Pregunta | Propuesta |
|---|---|---|
| ACLARAR-23 | **Verificación legal pendiente.** El plazo cuenta desde el registro en el sistema, con aviso legal (RF-DM-13). Falta verificar con la Aduana o con un especialista qué norma cubana fija el plazo de extracción, desde qué fecha cuenta y si son días naturales o hábiles, para ajustar el texto del aviso y, si hiciera falta, la regla del plazo | Mientras tanto, el aviso usa un texto genérico sin citar ninguna norma |
