# Spec 001, parte 2: Especificación de interfaz

| Campo | Valor |
|---|---|
| Versión | 1.6.0 (borrador) |
| Fecha | 2026-10-12 |
| Spec | `spec.md` 1.9.0 (secciones 5.19 a 5.23) |
| Constitución | 1.9.0 (Artículos VIII, XII, XIV y XV) |
| Estado | En revisión |

Este documento dice **qué ve y qué puede hacer** el usuario en cada pantalla, en teléfono, tablet y escritorio. No dice cómo se programa: eso va en el plan. Las maquetas que se aprueban en las tareas deben cumplir lo que dice aquí.

**Abreviaturas:**
- **TEL** = teléfono · **TAB** = tablet · **ESC** = escritorio.
- **A** = Apoderada · **O** = Operador · **L** = Solo lectura.

---

## 1. Estructura común

### 1.1 Navegación por clase de dispositivo

| Elemento | TEL | TAB | ESC |
|---|---|---|---|
| Navegación principal | Barra inferior: Tablero, DM, **Nueva orden** (botón central destacado, oculto para L), Alertas y Más. "Más" abre una hoja con el resto de secciones, empezando por Órdenes | Riel lateral con iconos y etiquetas. Todas las secciones visibles | Menú lateral fijo, como el prototipo, con grupos: Operación, Catálogos, Administración y **Sistema** (Diagnóstico de red para todos; Estado del servidor solo en la PC servidor) |
| Cabecera | Título, indicador de conexión, botón de búsqueda | Título, indicador de conexión, búsqueda, contador de alertas | Título y subtítulo como el prototipo, búsqueda global, contador de alertas, usuario y rol, cambio de tema |
| Detalle de un elemento | Pantalla nueva que entra deslizando desde la derecha | En horizontal: panel derecho junto a la lista. En vertical: pantalla nueva | Panel derecho junto a la lista, o pantalla completa si el contenido es amplio |
| Formularios largos | Por pasos, con barra de progreso y botón fijo abajo | Dos columnas en horizontal, una en vertical | Dos o tres columnas, con el resumen o el saldo fijo a la derecha |
| Diálogos | Hoja inferior que se cierra deslizando hacia abajo | Ventana centrada | Ventana centrada; `Esc` la cierra |
| Acciones de una fila | Deslizar la tarjeta o tocar el menú "⋯" | Menú "⋯" | Botones visibles al pasar el ratón y menú "⋯" |
| Atajos | — | — | `N` nueva orden · `/` buscar · `G` y luego `T`/`D`/`B` para ir a Tablero, DM o Buques · `Ctrl+S` guardar borrador · `Esc` cerrar |

### 1.2 Elementos globales

- **Banda de conexión.** Siempre visible si no hay conexión: "Sin conexión · datos al {fecha y hora}". Si hay borradores por subir, lo indica. Con conexión no ocupa espacio.
- **Indicador de sincronización.** Icono animado mientras llegan cambios; marca de "al día" al terminar. Al tocarlo se abre el Diagnóstico de red (P-30).
- **Aviso de energía del servidor.** Banda ámbar "El servidor funciona con batería ({n} %)" y, en modo protegido, banda roja "Servidor en modo protegido por batería baja: solo consulta", con las escrituras desactivadas (AL-20).
- **Contador de alertas.** Insignia con el número de alertas abiertas visibles para el rol. Al llegar una nueva, el icono de campana se anima.
- **Notificaciones breves.** Mensajes de confirmación y error que aparecen abajo en TEL y abajo a la derecha en TAB y ESC. Desaparecen en 4 segundos, salvo los errores, que esperan a que el usuario los cierre.
- **Confirmación de la contraseña de respaldo** (RF-RES-08): cada 90 días, tras el login de una Apoderada, un diálogo pide escribirla. Ofrece "Recordármelo mañana" hasta 3 veces.
- **Conflicto de edición** (RF-DM-12): si otro usuario guardó antes, un diálogo muestra "Otro usuario modificó este registro", con los valores suyos y los propios, y permite rehacer los cambios sobre la versión actual.
- **Diálogos estándar:**
  - **Motivo:** campo obligatorio de al menos 10 caracteres, con contador.
  - **Excepción:** explica la regla que se está saltando, con los números concretos, y exige el motivo.
  - **Confirmación destructiva:** exige escribir una palabra (por ejemplo, "RESTAURAR").

---

## 2. Estados obligatorios de toda pantalla

| ID | Estado | Qué ve el usuario |
|---|---|---|
| EST-01 | Cargando | Esqueleto con la forma del contenido, nunca una pantalla en blanco. Con la copia local suele durar menos de 300 ms |
| EST-02 | Vacío | Ilustración o icono, un texto que explica por qué está vacío y la acción para empezar, si el rol la permite |
| EST-03 | Sin conexión | Datos de la copia local con la banda de conexión; las acciones de escritura aparecen desactivadas con el texto "Requiere conexión con el servidor" |
| EST-04 | Error | Mensaje de negocio en español con la acción posible (reintentar o corregir). Los campos culpables se marcan |
| EST-05 | Sin permiso | Las acciones no permitidas no aparecen. Si se llega por enlace a una pantalla prohibida, se explica y se ofrece volver |
| EST-06 | Bloqueado por otro usuario | "En edición por {nombre} desde {hora}", sin poder editar. La A ve "Liberar" |
| EST-07 | Actualización obligatoria | Pantalla completa que explica que hay que actualizar, con el botón para hacerlo. Solo deja ver los borradores locales |

---

### 2.1 Presentación de la validación de campos (RF-VAL)

- **Debajo de cada campo** hay una sola línea de mensaje, que muestra, por prioridad: el error, si lo hay; si no, la advertencia; si no, la ayuda.
- **Error:** borde rojo, icono de alerta, texto rojo, MOV-11.
- **Advertencia:** borde ámbar, icono de aviso y texto ámbar. Las advertencias largas (como el aviso legal) se muestran en un recuadro ámbar bajo el campo, con un enlace "Ver más".
- **Ayuda:** texto gris, siempre visible mientras no haya error ni advertencia.
- **Correcto:** marca verde a la derecha del campo, solo en los campos de formato exigente (MOV-12).
- **Resumen al guardar:** recuadro rojo arriba del formulario con la lista de campos por corregir, cada uno con enlace al campo (MOV-13). En teléfono, si el error está en otro paso del formulario, el enlace lleva a ese paso.
- **Comprobación de duplicados:** mientras se comprueba, un indicador pequeño en el campo; el resultado aparece como error ("Ya existe la DM 00431") o como advertencia ("Hay un chofer parecido: Juan Carlos Miranda González").
- **Cambios sin guardar:** diálogo de confirmación al salir (RF-VAL-10).

## 3. Movimiento

Todas las duraciones son máximas. Con movimiento reducido (RF-UI-06) se aplica la columna correspondiente.

| ID | Patrón | Comportamiento | Reducido |
|---|---|---|---|
| MOV-01 | Cambio de pantalla | TEL: entra deslizando desde la derecha y vuelve hacia la derecha (250 ms). TAB: el panel de detalle se funde con un leve desplazamiento (220 ms). ESC: fundido (180 ms) | Instantáneo |
| MOV-02 | Lista viva | Las filas o tarjetas nuevas entran con fundido y desplazamiento corto; las que salen se pliegan; las que cambian de orden se mueven a su nuevo sitio (250 ms). Una fila modificada por otro usuario se resalta 1,5 s | Sin desplazamiento; resaltado de 1,5 s sin animar |
| MOV-03 | Número vivo | Saldos y totales cambian contando desde el valor anterior (400 ms). Las barras de avance crecen con efecto de resorte | Cambio instantáneo |
| MOV-04 | Diálogo y hoja | TEL: la hoja sube desde abajo y se cierra deslizando. TAB y ESC: aparece con escala de 96 % a 100 % y fundido (200 ms) | Fundido de 100 ms |
| MOV-05 | Validación | El mensaje de error se despliega bajo el campo sin empujar bruscamente el resto (150 ms). El campo marca su borde | Instantáneo |
| MOV-06 | Toque | Botones y tarjetas se reducen ligeramente al pulsar (97 %) y vuelven al soltar | Sin escala; cambio de color |
| MOV-07 | Acción en curso | El botón muestra un indicador de progreso y se desactiva. En éxito, el icono se transforma en una marca de verificación (300 ms) | Cambio de texto sin animar |
| MOV-08 | Iconos animados | Campana que se agita al llegar una alerta; flechas que giran mientras se sincroniza; nube que late cuando no hay conexión; candado que se cierra al quedar bloqueado; marca de verificación que se dibuja al terminar | Iconos estáticos |
| MOV-09 | Esqueleto | Brillo suave que recorre el esqueleto | Esqueleto sin brillo |
| MOV-10 | Paso de formulario (TEL) | El paso siguiente entra desde la derecha y la barra de progreso avanza | Instantáneo |
| MOV-11 | Campo con error | Al aparecer el error, el campo hace un temblor horizontal corto (3 oscilaciones, 200 ms) y su borde pasa a rojo | Solo el cambio de color |
| MOV-12 | Campo correcto | En los campos de formato exigente, la marca verde se dibuja al validarse (200 ms) | Marca estática |
| MOV-13 | Resumen de errores | El resumen "Hay N campos por corregir" baja desde arriba del formulario y la página se desplaza suavemente al primer error | Aparece sin desplazamiento animado |

**Reglas comunes:**
- Solo se animan posición, escala y opacidad.
- Ninguna animación bloquea la interacción: el usuario puede tocar o escribir durante una transición.
- Las tablas de más de 100 filas visibles no animan reordenamientos.

---

## 4. Pantallas

Cada pantalla indica su ruta, quién la usa, los requisitos que cubre, el contenido, las acciones, lo propio de cada clase de dispositivo y sus criterios de aceptación. Los estados de §2 y el movimiento de §3 se aplican siempre; aquí solo se mencionan las particularidades.

### P-01. Conexión y emparejamiento (`/conexion`)

- **Roles:** cualquiera, antes de iniciar sesión.
- **Cubre:** RF-CON-01, RF-RED-02 a 04, RF-INS-03.
- **Contenido:**
  - búsqueda automática del servidor, con animación y el método que se está probando;
  - servidor encontrado: nombre e identidad abreviada;
  - emparejamiento: código de 6 dígitos grande, con el texto "Confirme este código en la pantalla del servidor", y cuenta atrás de 5 minutos;
  - alternativas: "Escanear QR del servidor" (cámara, TEL y TAB) y "Escribir dirección" (oculto tras "Opciones avanzadas");
  - si no se encuentra: guía breve y botón para abrir el Diagnóstico de red (P-30).
- **Solo en ESC con instalador completo:** botón **"Crear servidor en este equipo"**, que abre P-28. Si ya hay un servidor en la red, el botón se desactiva con la explicación.
- **En la PC servidor:** la app se empareja sola y pasa directamente al login (o a P-02 si no hay Apoderada).
- **Primera sincronización:** después del primer login, una pantalla de progreso muestra la descarga inicial de datos (RNF-20).
- **TEL:** pantalla completa con un paso por vez: Buscando → Encontrado → Código → Listo.
- **TAB:** igual que TEL, en una tarjeta centrada.
- **ESC:** ventana compacta.
- **Movimiento:** icono de búsqueda animado (MOV-08); el código entra con MOV-04; marca de verificación al confirmar (MOV-07).
- **Aceptación (E2E contra el servidor real):**
  - el dispositivo encuentra al servidor sin escribir nada y se empareja por código, confirmado desde la pantalla del servidor;
  - con QR, se empareja sin código;
  - un servidor falso con otra identidad se rechaza;
  - tras cambiar la dirección del servidor, el dispositivo ya emparejado lo vuelve a encontrar en menos de 10 segundos.

### P-02. Primer arranque (`/setup`)

- **Roles:** cualquiera, solo si no hay ninguna Apoderada y **solo en la PC servidor** (RF-USR-05). En los demás dispositivos, mientras no exista la primera Apoderada, el login muestra "El sistema aún no está configurado: créelo desde la PC servidor".
- **Cubre:** RF-USR-05, RF-REC-01.
- **Contenido:** pasos: datos de la primera Apoderada, contraseña y códigos de recuperación.
- **Particularidades:** los códigos se muestran en una pantalla con capturas bloqueadas y la casilla "Los copié a mano" es obligatoria para continuar.
- **TEL:** un paso por pantalla. **TAB / ESC:** asistente en una ventana con los pasos a la izquierda.
- **Aceptación:** E2E: crea la Apoderada en el servidor real y entra.

### P-03. Iniciar sesión (`/login`)

- **Cubre:** RF-AUT-01, 02, 05.
- **Contenido:** usuario, contraseña con botón para mostrarla, "Mantener sesión (30 días)" y enlace a recuperar.
- **Particularidades:** tras 5 fallos, explica cuánto falta para desbloquear.
- **TEL:** pantalla completa con el logotipo arriba. **TAB / ESC:** tarjeta centrada con la identidad del prototipo.
- **Aceptación:** E2E: entra, ve el tablero según su rol; el bloqueo se muestra con el tiempo restante.

### P-04. Recuperar contraseña (`/recuperar`)

- **Cubre:** RF-REC-02 a 04.
- **Contenido:** usuario, carné, teléfono, código y nueva contraseña.
- **Particularidades:** el error nunca dice cuál dato falló.
- **Aceptación:** E2E con un código válido y con uno ya usado.

### P-05. Perfil (`/perfil`)

- **Roles:** A, O, L.
- **Cubre:** RF-AUT-07, RF-REC-03, RF-UI-06.
- **Contenido:**
  - datos del usuario;
  - sesiones abiertas con su dispositivo y fecha, y botón para cerrarlas;
  - cambio de contraseña;
  - regenerar códigos (con capturas bloqueadas);
  - tema claro, oscuro o del sistema;
  - **Reducir animaciones** (preferencia de este dispositivo).
- **TEL:** lista de secciones que abren pantallas. **TAB / ESC:** secciones a la izquierda y contenido a la derecha.
- **Aceptación:** E2E: cerrar otra sesión desde aquí la invalida en el servidor; activar "Reducir animaciones" elimina los desplazamientos en toda la app.

### P-06. Tablero (`/`)

- **Roles:** A, O, L.
- **Cubre:** RF-TAB-01, HU-03.
- **Contenido:**
  - filtro de buque (todos o uno);
  - indicadores: contratado, extraído, pendiente, órdenes (oficiales, borradores para A y O, anuladas) y "requieren atención";
  - avance por DM;
  - alertas de hoy.
- **Acciones:** tocar una DM abre su ficha; tocar una alerta abre su origen; Nueva orden (A y O).
- **TEL:** indicadores en carrusel horizontal de tarjetas; avance por DM como tarjetas con barra; alertas plegables.
- **TAB:** indicadores en cuadrícula de 3; en horizontal, lista de DM a la izquierda y la ficha seleccionada a la derecha.
- **ESC:** como el prototipo: fila de indicadores, tabla ordenable por cualquier columna y panel de alertas.
- **Movimiento:** MOV-03 en indicadores y barras cuando cambian los saldos por la emisión de otro usuario; MOV-02 en la lista.
- **Aceptación:** E2E con dos usuarios: el usuario 2 emite una orden contra el servidor real y el tablero del usuario 1 actualiza el saldo animado en menos de 5 segundos.

### P-07. Buques (`/buques`) y P-08. Ficha de buque (`/buques/:id`)

- **Roles:** A, O, L (solo lectura sin acciones).
- **Cubre:** RF-BUQ-01 a 09, RF-TAB-05.
- **Contenido de la lista:** nombre y viaje, estado (abierto o cerrado), fecha de arribo (estimada o real), total, asignado, libre, cargado y restante.
- **Contenido de la ficha:**
  - datos del buque;
  - DM asignadas con sus saldos;
  - sobrante y destinos registrados;
  - historial.
- **Acciones:**
  - alta y edición (el total pide motivo);
  - registrar el arribo real;
  - asignar DM;
  - registrar destino del sobrante: asignar a DM, transferir a otro buque o registrar merma (solo A);
  - cerrar el buque.
- **Particularidades:**
  - la fecha de arribo real aparece bloqueada con candado y una explicación si hay órdenes;
  - "Cerrar" está desactivado mientras haya sobrante sin destino, mostrando cuánto falta;
  - un buque cerrado con sobrante nuevo muestra un aviso destacado (AL-17).
- **TEL:** tarjetas por buque; la ficha usa pestañas (Resumen, DM, Sobrante, Historial). Cerrar es un flujo por pasos: revisar sobrante → asignar destinos → confirmar.
- **TAB:** lista y ficha lado a lado en horizontal.
- **ESC:** tabla con columnas de saldo y ficha en panel derecho. Cerrar en un diálogo con el desglose del sobrante y los destinos editables en línea.
- **Aceptación:** E2E contra el servidor real: alta, arribo, asignación y cierre con los tres tipos de destino; un O no ve "merma".

### P-09. DM (`/dm`), P-10. Ficha de DM (`/dm/:id`) y P-11. Alta y edición de DM

- **Roles:** A, O, L.
- **Cubre:** RF-DM-01 a 11, RF-ASG-01 a 04, RF-PLZ-04, 05, RF-TAB-02, 04, HU-04, HU-09.
- **Lista:**
  - filtros por estado (con contadores), buque y cliente, y búsqueda;
  - cada DM muestra: número, cliente y marca, estado con insignia, avance, saldo y plazo `n/30`.
- **Ficha:**
  - saldos (total, asignado, cargado, saldo y pendiente de asignar);
  - asignaciones por buque;
  - plazo con barra que cambia de color desde el día 25, con un icono de información que despliega el aviso legal (RF-DM-13);
  - etapas: Pendiente → Asignada → En extracción → Entregada, o Vencida;
  - órdenes con su estado;
  - versiones e historial.
- **Acciones:**
  - nueva DM: número de 5 dígitos, cliente, marca y total opcional (la fecha la pone el sistema). El campo "Fecha de la DM" aparece rellenado con la fecha de hoy, sin poder editarse, y junto a él el **aviso legal del plazo** como advertencia ámbar (RF-DM-13), sin confirmación;
  - editar total o marca, con motivo (cliente y fecha aparecen fijos, con candado);
  - asignar a un buque;
  - reactivar si está vencida;
  - "Nueva orden para esta DM".
- **Asignación:** si la cantidad supera lo libre del buque, el diálogo de excepción muestra: "La DM 00431 supera la cantidad restante del buque EAGLE1 en 30,000 t". Ofrece **No** (el buque queda vacío) o **Sí, asignar 50,000 t** con motivo.
- **TEL:** lista de tarjetas; ficha con pestañas; alta en dos pasos (Datos → Asignación opcional).
- **TAB:** en horizontal, lista y ficha lado a lado; alta en ventana de dos columnas.
- **ESC:** tabla ordenable y ficha en panel o página como "Seguimiento por DM" del prototipo; alta en ventana con la asignación al lado.
- **Aceptación:**
  - E2E de HU-04 completa contra el servidor real;
  - una DM sin total muestra "Asignar" desactivado con el motivo;
  - el número de 4 dígitos se rechaza en el campo antes de enviar;
  - la vista de una DM vencida muestra "Reactivar" y deja corregir o anular sus órdenes.

### P-12. Buscar (`/buscar`)

- **Roles:** A, O, L.
- **Cubre:** RF-TAB-03, RF-CON-07, HU-10.
- **Contenido:** campo de búsqueda por DM, cliente, marca o número de orden (completo o solo la parte final, por ejemplo `42`); sugerencias; resultados agrupados por tipo; "Buscar en el archivo" (con conexión) para lo anterior a 12 meses.
- **TEL:** la búsqueda se abre a pantalla completa desde la cabecera. **TAB / ESC:** búsqueda en la cabecera con resultados desplegados; `/` en ESC.
- **Aceptación:** E2E: encontrar por número de orden y abrir la orden; una DM de hace 14 meses solo aparece con "Buscar en el archivo".

### P-13. Nueva orden (`/ordenes/nueva`)

- **Roles:** A, O.
- **Cubre:** RF-ORD-03 a 05, 12, 13, 22, HU-01.
- **Contenido:**
  - DM y buque (asignación);
  - destinatario;
  - transportista, y luego camión, chofer (carné y licencia automáticos) y remolques **de ese transportista** (se proponen los habituales del camión);
  - toneladas;
  - carta de porte, fecha de carga, LOT, hoja de ruta y contenedor;
  - datos automáticos con la marca "Lo trae el sistema", como en el prototipo.
- **Panel de saldo:**
  - saldo de la asignación;
  - esta orden;
  - quedaría;
  - capacidad de los remolques;
  - lista de comprobaciones en verde, ámbar o rojo, que se actualizan al escribir (MOV-03 y MOV-05).
- **Acciones:** Guardar borrador, Revisar y emitir (vista previa del documento A4), Emitir. Las excepciones abren el diálogo de excepción con los números concretos.
- **Particularidades:**
  - sin conexión, se puede llenar y guarda como borrador local, pero "Emitir" está desactivado con el motivo;
  - tras emitir: animación de éxito (MOV-07), número asignado, descarga del original y opción "Otra orden para esta DM".
- **TEL:** cuatro pasos: DM y destino → Camión y chofer → Carga → Revisión. El saldo siempre visible en una franja superior plegable. Botón principal fijo abajo.
- **TAB:** en horizontal, formulario en dos columnas y panel de saldo a la derecha; en vertical, una columna con el saldo arriba.
- **ESC:** formulario completo en una vista como el prototipo, panel de saldo y comprobaciones fijo a la derecha, vista previa en ventana; `Ctrl+S` guarda el borrador.
- **Aceptación (E2E contra el servidor real):**
  - sobregiro bloqueado con el mensaje exacto;
  - excepción de capacidad con motivo;
  - camión repetido con motivo;
  - fecha de carga fuera de rango;
  - emisión exitosa: la orden existe en la base de datos con su número, su PDF, su bitácora, y aparece en la copia local de otro usuario.

### P-14. Borradores (`/borradores`)

- **Roles:** A, O.
- **Cubre:** RF-ORD-06 a 11.
- **Contenido:** dos grupos: **Míos** (locales sin subir, con un icono de "solo en este dispositivo", y privados) y **Compartidos** (con autor, última edición y bloqueo).
- **Acciones:** abrir, compartir, descartar con confirmación; A puede liberar un bloqueo.
- **TEL:** pestañas Míos y Compartidos, tarjetas que se deslizan para descartar.
- **TAB / ESC:** lista y vista previa del borrador lado a lado.
- **Aceptación:** E2E: dos usuarios abren el mismo borrador compartido y el segundo ve EST-06; un borrador creado sin conexión aparece en el servidor como privado tras reconectar.

### P-15. Orden (`/ordenes/:id`)

- **Roles:** A, O, L.
- **Cubre:** RF-ORD-17 a 21, RF-CON-08, HU-02, RF-BIT-04.
- **Contenido:** documento A4 de la versión vigente; línea de tiempo de versiones (como "Anular y reiniciar" del prototipo) con autor, fecha, motivo y cambios; estado; datos de la DM y del buque.
- **Acciones:** descargar el PDF (original o copia, según RF-ORD-21, indicado en el botón); Corregir y Anular (A y O).
- **Particularidades:** el PDF ya descargado se puede abrir sin conexión; una orden anulada muestra la marca y no ofrece acciones.
- **TEL:** documento con zoom por gestos; versiones en una hoja inferior.
- **TAB:** documento a la izquierda y versiones a la derecha en horizontal.
- **ESC:** documento centrado con las versiones en panel lateral y acciones en la barra superior.
- **Aceptación:** E2E: la descarga original y luego la copia, con la marca verificada en el archivo recibido.

### P-16. Corregir y Anular (`/ordenes/:id/corregir` y diálogo de anulación)

- **Roles:** A, O.
- **Cubre:** RF-ORD-17 a 19, RF-DM-11.
- **Corregir:** el mismo formulario de P-13 con la DM y el buque fijos con candado, los cambios resaltados frente a la versión vigente, el motivo obligatorio y el saldo recalculado. En una DM vencida, el campo de toneladas indica el máximo permitido.
- **Anular:** diálogo con el resumen de la orden, la consecuencia ("se repondrán 17,280 t al saldo de la DM 00431") y el motivo.
- **TEL / TAB / ESC:** igual que P-13 y diálogos estándar.
- **Aceptación:** E2E: la corrección crea la versión 2 en el servidor y el saldo cambia por la diferencia; la anulación repone el saldo y marca el PDF.

### P-17. Alertas (`/alertas`)

- **Roles:** A, O, L (cada uno ve las suyas).
- **Cubre:** RF-ALR-01 a 05, HU-07.
- **Contenido:** alertas abiertas y atendidas, con filtros por tipo, estado, DM o buque; cada alerta con su icono, explicación, referencia y antigüedad.
- **Acciones:** abrir el origen; Atender (según la tabla AL).
- **TEL:** lista con filtros en una hoja.
- **TAB:** lista y detalle de la alerta lado a lado.
- **ESC:** página completa, y además un panel lateral desplegable desde el contador en cualquier pantalla.
- **Movimiento:** MOV-02 al llegar o resolverse una alerta; MOV-08 en la campana.
- **Aceptación:** E2E: una alerta generada en el servidor real aparece en la lista y en el contador del otro usuario en menos de 5 segundos; un O no ve AL-05.

### P-18. Choferes y camiones (`/catalogos/choferes-camiones`)

- **Roles:** A, O, L.
- **Cubre:** RF-CAT-03 a 08, HU-08.
- **Contenido:** tres listas relacionadas y filtrables por transportista: camiones (con transportista, remolques habituales y capacidad total), remolques (chapa y capacidad) y choferes (carné, licencia y transportista). Los remolques también muestran su transportista.
- **Acciones:** alta, edición, activar y desactivar. Mientras se escribe, un aviso de posible duplicado muestra el registro parecido y permite abrirlo.
- **Particularidades:** desactivar un transportista avisa cuántos camiones, choferes y borradores afecta (RF-CAT-10); un camión no se puede guardar sin al menos un remolque; un chofer no se puede guardar sin carné, licencia y transportista; el chofer se busca por su carné, que es su identificador; cambiar el transportista de un chofer pide motivo (RF-CAT-09).
- **TEL:** pestañas Camiones, Remolques y Choferes; alta por pasos.
- **TAB:** pestañas, con lista y detalle lado a lado.
- **ESC:** tres columnas o pestañas con tablas, con el detalle en panel lateral.
- **Aceptación:** E2E: alta de un camión con dos remolques y un chofer en el servidor real; un duplicado de chapa se bloquea.

### P-19. Clientes (`/catalogos/clientes`) y P-20. Transportistas (`/catalogos/transportistas`)

- **Roles:** A, O, L.
- **Cubre:** RF-CAT-01, 02, 07, 08.
- **Contenido:** clientes con sus destinatarios (nombre y dirección); transportistas con sus camiones. Desactivar un cliente con DM abiertas se impide, indicando cuáles (RF-CAT-11). Al escribir el nombre de un cliente, se avisa si ya existe uno igual al normalizarlo (que bloquea) o uno parecido (que solo advierte).
- **Acciones:** alta, edición, activar y desactivar.
- **TEL / TAB / ESC:** mismo patrón de lista y detalle de P-18.
- **Aceptación:** E2E: cliente con dos destinatarios, uno desactivado, que ya no aparece en Nueva orden.

### P-21. Usuarios (`/usuarios`)

- **Roles:** A.
- **Cubre:** RF-USR-01 a 05, RF-REC-06, RF-AUT-04, 10, HU-11.
- **Contenido:** lista con rol, estado y último acceso.
- **Acciones:** alta (muestra los códigos del nuevo usuario con capturas bloqueadas), edición, cambio de rol (avisa que cierra sus sesiones), activar y desactivar, restablecer contraseña.
- **Aceptación:** E2E: cambiar el rol cierra la sesión del usuario afectado en su dispositivo.

### P-22. Empresa (`/empresa`)

- **Roles:** A.
- **Cubre:** RF-EMP-01 a 06.
- **Contenido:** razón social y dirección; firma oficial (imagen, representante, credencial y cargo); cuño oficial; historial de cambios.
- **Particularidades:** capturas bloqueadas; vista previa de cómo quedan en el documento.
- **Aceptación:** E2E: reemplazar la firma y verificar que la siguiente orden emitida la usa y la anterior conserva la vieja.

### P-23. Configuración (`/configuracion`)

- **Roles:** A.
- **Cubre:** RF-CFG-01 a 03.
- **Contenido:** parámetros de RF-CFG-02 con su valor por defecto, límites y explicación, incluido el texto del aviso legal del plazo con su vista previa; y el cambio del código de instalación (RF-CFG-04).
- **Aceptación:** E2E: cambiar los días máximos de la fecha de carga a 3 y verificar que Nueva orden rechaza el día 4.

### P-24. Respaldos y restauración (`/respaldos`)

- **Roles:** A.
- **Cubre:** RF-RES-01 a 07, HU-12.
- **Contenido:** estado del último respaldo por hora y diario; lista de respaldos; contraseña de respaldo, con la fecha de su última confirmación; restaurar; confirmación de numeración (si aplica); órdenes perdidas con Recuperar y Descartar.
- **Particularidades:** la restauración es un flujo por pasos: elegir respaldo → contraseña → escribir "RESTAURAR" → progreso → resultado con las órdenes perdidas.
- **Aceptación:** E2E del caso límite 15 contra el servidor real.

### P-25. Bitácora (`/bitacora`)

- **Roles:** A, O, L.
- **Cubre:** RF-BIT-03, HU-13.
- **Contenido:** registros con fecha, usuario, acción, entidad y detalle (antes y después); filtros. Requiere conexión.
- **TEL:** lista de tarjetas con filtros en una hoja. **TAB / ESC:** tabla con filtros visibles y detalle desplegable.
- **Aceptación:** E2E: filtrar por orden y ver su emisión y corrección.

### P-26. Versiones de la app (`/versiones`) y actualización

- **Roles:** A (publicar); todos (actualizar).
- **Cubre:** RF-UPD-01 a 05.
- **Contenido:** versiones publicadas por plataforma, cuál es la mínima y sus notas. El aviso de versión nueva (AL-15) y la pantalla obligatoria (EST-07) aparecen en todos los dispositivos.

### P-27. WebView desactualizado (solo Android)

- **Cubre:** RF-UI-11.
- **Contenido:** explicación sencilla, versión encontrada y mínima, y botón para descargar la actualización del servidor local.

---

### P-32. Órdenes (`/ordenes`)

- **Roles:** A, O, L.
- **Cubre:** RF-TAB-07.
- **Contenido:** lista de órdenes (número, versión, estado, fecha de carga, DM, cliente, transportista, chofer, camión y toneladas), con filtros y, arriba, la cantidad de órdenes y el total de toneladas del rango filtrado. Filtro rápido "Hoy" activado por defecto.
- **Acciones:** abrir la orden (P-15) y descargar su PDF.
- **TEL:** tarjetas por orden agrupadas por fecha de carga, con los filtros en una hoja.
- **TAB:** en horizontal, la lista a la izquierda y la orden seleccionada a la derecha.
- **ESC:** tabla densa, ordenable por cualquier columna, con los filtros visibles arriba y la orden en un panel lateral.
- **Movimiento:** MOV-02 cuando otro usuario emite, corrige o anula; MOV-03 en los totales.
- **Aceptación:** E2E con dos usuarios: el usuario 2 emite una orden y aparece en la lista "Hoy" del usuario 1, con el total de toneladas actualizado; el filtro por chofer coincide con una consulta directa a la base de datos.

### P-28. Crear servidor (asistente, solo ESC con instalador completo)

- **Quién:** Administrador de instalación.
- **Cubre:** RF-INS-02, 03, RNF-18, RNF-19.
- **Pasos del asistente:**
  1. **Comprobación:** busca un servidor existente en la red (si lo hay, se detiene aquí) y verifica los requisitos de la PC, cada uno con su marca verde o roja y su explicación. Con 4 GB de RAM la marca es ámbar: "Funcionará, aunque más lento; se recomiendan 8 GB".
  2. **Permisos:** confirmación de administrador de Windows y código de instalación.
  3. **Montaje de red:** elegir router u hotspot, con una ilustración de cada uno y sus requisitos (celular dedicado, adaptador USB si hace falta).
  4. **Creación:** lista de pasos con su estado (pendiente, en curso, hecho, fallido), barra de progreso general, tiempo transcurrido y el detalle técnico desplegable.
  5. **Error:** si un paso falla, se muestra qué falló en lenguaje claro, con **Reintentar** y **Deshacer**.
  6. **Listo:** nombre del servidor, QR, guía del montaje elegido y botón "Crear la primera Apoderada" (P-02).
- **Variante:** "Crear servidor desde un respaldo de traslado" (RF-INS-07), que en el paso 4 pide el archivo de traslado y su contraseña.
- **Movimiento:** cada paso cambia de estado con MOV-07; la barra general con MOV-03.
- **Aceptación:**
  - en una PC Windows limpia sin internet, crea el servidor y la primera Apoderada;
  - con un fallo inyectado en cada paso, Deshacer deja la PC como estaba;
  - con un servidor ya presente en la red, no permite continuar.

### P-29. Estado del servidor (solo ESC, en la PC servidor)

- **Quién ve:** cualquier persona ante la PC servidor.
- **Quién actúa:** el Administrador de instalación (Reparar, Reiniciar, Actualizar, Preparar traslado, Desinstalar). Cualquiera presente puede confirmar emparejamientos, y una Apoderada con sesión puede revocar dispositivos.
- **Cubre:** RF-INS-04 a 09, RF-RED-04, 05, RF-ENE-01 a 05.
- **Contenido:**
  - estado del servicio, versión y tiempo encendido;
  - energía: corriente o batería, porcentaje, modo protegido;
  - montaje de red y dirección actual;
  - QR para emparejar;
  - **solicitudes de emparejamiento** pendientes, con el código, el nombre y la plataforma del dispositivo, y los botones Confirmar y Rechazar;
  - dispositivos emparejados y conectados ahora, con aviso a los 8 en hotspot;
  - acciones de mantenimiento, incluido el **restablecimiento de emergencia** de la contraseña de una Apoderada (RF-INS-11).
- **Particularidades:**
  - una solicitud de emparejamiento nueva lleva la ventana al frente con un aviso (AL-22);
  - Actualizar, Traslado y Desinstalar son asistentes con progreso, como P-28;
  - Desinstalar exige escribir "DESINSTALAR".
- **Aceptación:**
  - confirmar un código empareja el dispositivo en el servidor real;
  - rechazarlo lo impide;
  - la actualización con un fallo inyectado vuelve a la versión anterior;
  - el traslado completo deja la PC anterior inutilizada como servidor.

### P-30. Diagnóstico de red (`/diagnostico`, todas las apps)

- **Roles:** cualquiera, incluso sin sesión.
- **Cubre:** RF-RED-06.
- **Contenido:**
  - semáforo general con un mensaje claro ("Todo bien", "El servidor no responde", "La red bloquea la comunicación entre equipos", etc.);
  - detalle: red wifi actual, método por el que se encontró el servidor, dirección, tiempo de respuesta, identidad verificada y última sincronización;
  - qué hacer, paso a paso;
  - botón "Volver a probar".
- **En la PC servidor:** además, dispositivos conectados y montaje de red.
- **TEL:** tarjetas apiladas. **TAB / ESC:** semáforo arriba y detalle en dos columnas.
- **Aceptación:**
  - con el servidor apagado, muestra "El servidor no responde" y los pasos a seguir;
  - con el aislamiento de equipos simulado, lo detecta y lo explica.

### P-31. Aviso de apagado (diálogo de Windows, solo en la PC servidor)

- **Cubre:** RF-INS-09.
- **Contenido:** al intentar apagar o reiniciar Windows con la app abierta, Windows muestra el motivo: "Esta PC es el servidor de Órdenes de Carga: hay X dispositivos conectados".
- **Aceptación:** verificación manual en Windows 10 y 11.

**Nota sobre las clases de dispositivo:** P-28, P-29 y P-31 existen solo en escritorio, porque el servidor solo puede ser una PC con Windows. Es la única excepción al requisito de tres clases (Constitución, Artículo XIV.1).

## 5. Criterios de aceptación comunes a todas las pantallas

1. La maqueta de TEL, TAB y ESC está aprobada (RF-UI-09).
2. Los siete estados de §2 se ven como se especifica, comprobados con pruebas de componente.
2b. Cada campo cumple su fila del catálogo de §6: cada error, advertencia y ayuda, en el momento de RF-VAL-02, comprobados con pruebas de componente.
3. El movimiento de §3 está presente y desaparece con movimiento reducido, comprobado con pruebas de componente.
4. Al menos un recorrido de extremo a extremo contra el servidor y la base de datos reales verifica que los datos mostrados coinciden con la base y que las acciones producen el efecto esperado en el servidor, en la bitácora y en la copia local de otro usuario.
5. Las referencias visuales en tema claro y oscuro, en TEL, TAB y ESC, están aprobadas.
6. Se cumplen RNF-15 y RNF-16.

---

## 6. Catálogo de campos

Reglas de cada campo de cada formulario (RF-VAL). **Obl.** = obligatorio. Toda regla tiene su prueba, y las reglas son las mismas en la interfaz y en el servidor. Las toneladas siempre admiten coma o punto y como máximo 3 decimales, y deben ser mayores que 0 y menores o iguales que 999 999,999.

### F-01. Conexión manual (P-01, "Escribir dirección")

| Campo | Obl. | Reglas (error si no se cumplen) | Advertencias | Ayuda |
|---|---|---|---|---|
| Dirección | Sí | IPv4 válida o nombre de equipo; puerto opcional (1 a 65535) | — | "Por ejemplo 192.168.1.10 o 192.168.1.10:8443" |

### F-02. Usuario: primer arranque y alta o edición (P-02, P-21)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Nombre y apellidos | Sí | 3 a 100 caracteres; letras, espacios, guiones y apóstrofos | — | — |
| Usuario | Sí | 3 a 30 caracteres; minúsculas, dígitos, punto y guion bajo; único | — | "Con este nombre entrará al sistema" |
| Carné de identidad | Sí | 11 dígitos; único entre usuarios ✓ | Si los 6 primeros dígitos no forman una fecha válida (AAMMDD): "Revise el carné: no empieza por una fecha de nacimiento válida" | "11 dígitos" |
| Teléfono | Sí | 8 dígitos, con `+53` opcional | — | "8 dígitos, por ejemplo 52345678" |
| Rol | Sí (en P-02 fijo: Apoderada) | Uno de los tres roles | Al cambiar el rol de un usuario existente: "Se cerrarán sus sesiones" | — |
| Contraseña / Confirmar | Sí en alta | Al menos 8 caracteres; ambas iguales | — | "Mínimo 8 caracteres" |

### F-03. Iniciar sesión (P-03)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Usuario | Sí | No vacío | — | — |
| Contraseña | Sí | No vacía | Tras 3 fallos: "Le quedan 2 intentos antes del bloqueo de 15 minutos" | — |

### F-04. Recuperar contraseña (P-04) y cambio de contraseña (P-05)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Usuario | Sí | No vacío | — | — |
| Carné | Sí | 11 dígitos ✓ | — | — |
| Teléfono | Sí | 8 dígitos, `+53` opcional | — | — |
| Código de recuperación | Sí | 8 caracteres en el formato `XXXX-XXXX` (letras y dígitos sin caracteres confusibles) ✓ | — | "Uno de los códigos que copió a mano" |
| Contraseña actual (P-05) | Sí | No vacía | — | — |
| Nueva contraseña / Confirmar | Sí | Al menos 8 caracteres; distinta de la actual; ambas iguales | — | — |

### F-05. Empresa (P-22)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Razón social | Sí | 3 a 150 caracteres | — | — |
| Dirección | Sí | 5 a 250 caracteres | — | — |
| Imagen de la firma / del cuño | Sí | PNG o JPG; como máximo 2 MB; al menos 300 × 100 px | Fondo no transparente: "Se recomienda fondo transparente" | — |
| Representante | Sí | 3 a 100 caracteres | — | "Nombre que se imprime junto a la firma" |
| No. de credencial | Sí | Solo dígitos, 1 a 20 | — | — |
| Cargo | Sí | 2 a 60 caracteres | — | — |

### F-06. Configuración (P-23)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Días máximos de la fecha de carga | Sí | Entero de 0 a 30 | Con 0: "Solo se podrá emitir con fecha de carga de hoy" | — |
| Jornada de respaldos (inicio y fin) | Sí | `hh:mm`; inicio anterior al fin | — | — |
| Hora del respaldo diario | Sí | `hh:mm` | Dentro de la jornada: "Coincide con la jornada de trabajo" | — |
| Carpeta externa | Sí | Existe y admite escritura (lo comprueba el servidor) | — | — |
| Montaje de red | Sí | Router o hotspot | — | — |
| Texto del aviso legal | Sí | 50 a 600 caracteres | — | Vista previa del aviso |
| Código de instalación: actual, nuevo y confirmación | Sí al cambiar | Actual correcto; nuevo con el formato `XXXX-XXXX-XXXX` ✓; ambos iguales | — | — |

### F-07. Buque (P-07, P-08)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Nombre | Sí | 2 a 60 caracteres; letras, dígitos, espacios y guiones | — | Muestra el código derivado: "Código: EAGLE1" |
| Manifiesto | Sí | 1 a 20 caracteres | — | "Por ejemplo 0080/2026" |
| B/L | Sí | 1 a 30 caracteres | — | — |
| Puerto y terminal | Sí | 3 a 100 caracteres | — | — |
| Comprador interno | Sí | 3 a 150 caracteres (por defecto, la razón social) | — | — |
| Fecha de arribo estimada | No | Fecha válida | En el pasado: "La fecha estimada ya pasó; ¿registrar el arribo real?" | — |
| Fecha de arribo real | No | No futura; no editable si hay órdenes (RF-BUQ-07) | — | "Fija el año y el viaje de la numeración" |
| Total (t) | Sí | Toneladas; en edición, ≥ lo asignado | — | — |
| Motivo (al editar el total o la fecha real) | Sí | 10 a 500 caracteres | — | — |

### F-08. DM: alta y edición (P-11)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Número de DM | Sí | 5 dígitos; único para siempre (comprobado mientras se escribe) ✓ | — | "5 dígitos, por ejemplo 00431" |
| Cliente | Sí | Cliente activo de la lista; fijo después de crear la DM | — | — |
| Marca | Sí | 2 a 60 caracteres | — | — |
| Total (t) | No | Toneladas; en edición, ≥ cargado y ≥ asignado | Vacío: "La DM quedará pendiente de total: no se podrá asignar ni emitir órdenes" | — |
| Fecha de la DM | — (automática) | Solo lectura: fecha de hoy | **Aviso legal del plazo** (RF-DM-13), siempre visible | — |
| Motivo (edición) | Sí | 10 a 500 caracteres | — | — |

### F-09. Asignación de una DM a un buque (P-08, P-10)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Buque | Sí | Buque abierto | — | Muestra lo libre del buque |
| Toneladas | Sí | Toneladas; ≤ pendiente de asignar de la DM. Si supera lo libre del buque, se abre el diálogo de excepción (RF-ASG-02) | ADV-06 | "Pendiente de asignar: 80,000 t" |

### F-10. Destino del sobrante (P-08, cierre de buque)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Tipo de destino | Sí | Asignar a DM, transferir a otro buque o merma (merma solo A) | — | — |
| Toneladas | Sí | Toneladas; ≤ sobrante sin destino | — | "Sobrante sin destino: 12,500 t" |
| Buque destino (transferir) | Sí si transfiere | Buque abierto, distinto del de origen | — | — |
| DM (asignar) | Sí si asigna | DM con pendiente de asignar, no vencida ni cerrada | — | — |
| Motivo | Sí | 10 a 500 caracteres | — | — |

### F-11. Cliente y destinatarios (P-19)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Nombre | Sí | 3 a 150 caracteres; único al normalizar | ADV-05 | — |
| Destinatarios | Sí, al menos uno | — | — | — |
| Destinatario: nombre | Sí | 3 a 150 caracteres | — | "Se imprime como «Nombre del destinatario»" |
| Destinatario: dirección | Sí | 5 a 250 caracteres | — | "Se imprime como «Con destino a»" |

### F-12. Transportista (P-20)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Nombre | Sí | 3 a 150 caracteres; único al normalizar | ADV-05 | "Se imprime como «Vehículo perteneciente a»" |

### F-13. Camión, remolque y chofer (P-18)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Camión: transportista | Sí | Transportista activo | — | — |
| Camión: chapa | Sí | 5 a 10 letras y dígitos; mayúsculas automáticas; única ✓ | — | "Por ejemplo W011612" |
| Camión: chapa del tractivo | No | Mismo formato | — | — |
| Camión: base del vehículo | No | Hasta 60 caracteres (por defecto LA HABANA) | — | — |
| Camión: remolques habituales | Sí, al menos uno | Remolques activos del mismo transportista | — | Muestra la capacidad total |
| Remolque: transportista | Sí | Transportista activo | — | — |
| Remolque: chapa | Sí | 5 a 10 letras y dígitos; única ✓ | — | — |
| Remolque: capacidad (t) | Sí | Toneladas; ≤ 100,000 | — | — |
| Chofer: nombre y apellidos | Sí | 3 a 100 caracteres | ADV-05 | — |
| Chofer: carné de identidad | Sí | 11 dígitos; único (identificador del chofer) ✓ | Si los 6 primeros dígitos no forman una fecha válida (AAMMDD) | "11 dígitos" |
| Chofer: licencia de conducción | Sí | 11 dígitos; única ✓ | — | "11 dígitos" |
| Chofer: transportista | Sí | Transportista activo | — | — |
| Motivo (cambio de transportista) | Sí | 10 a 500 caracteres | — | — |

### F-14. Nueva orden y Corregir (P-13, P-16)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| DM | Sí | DM activa (en corrección: fija) | ADV-01 | Muestra el saldo |
| Buque (asignación) | Sí | Asignación con saldo (en corrección: fija) | — | — |
| Destinatario | Sí | Destinatario activo del cliente de la DM | — | — |
| Transportista | Sí | Transportista activo | — | "Filtra los camiones y choferes" |
| Camión | Sí | Camión activo del transportista | Camión con otra orden esa fecha de carga: abre el diálogo de excepción (RF-ORD-13) | — |
| Remolques | Sí, al menos uno | Remolques activos del transportista | — | Muestra la capacidad total |
| Chofer | Sí | Chofer activo del transportista | ADV-07 | Muestra carné y licencia |
| Toneladas | Sí | Toneladas; ≤ saldo de la asignación (en corrección, más las de la versión vigente; con DM vencida, ≤ las de la versión vigente). Si supera la capacidad, se abre el diálogo de excepción | ADV-02, ADV-03 | "Saldo: 120,450 t · Capacidad: 34,000 t" |
| Carta de porte | Sí | 1 a 20 letras y dígitos | — | — |
| Fecha de carga | Sí | ≥ fecha de emisión (en corrección, de la versión 1); ≤ emisión + N días | ADV-04 | — |
| LOT · Hoja de ruta | No | Hasta 20 caracteres | — | — |
| Contenedor | No | Hasta 15 caracteres | Si no tiene la forma de 4 letras y 7 dígitos: "No parece un número de contenedor estándar" | "Vacío si es carga suelta" |
| Motivo (corrección) | Sí | 10 a 500 caracteres | — | — |

### F-15. Diálogos de motivo, excepción y confirmación

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Motivo | Sí | 10 a 500 caracteres | — | Contador de caracteres |
| Palabra de confirmación | Sí | Exactamente "RESTAURAR" o "DESINSTALAR" (mayúsculas) | — | — |

### F-16. Respaldos, restauración e instalación (P-24, P-28, P-29)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Contraseña de respaldo / Confirmar | Sí | Al menos 12 caracteres; ambas iguales | "Si la pierde, los respaldos no se podrán recuperar. Guárdela impresa" | — |
| Contraseña al restaurar o confirmar | Sí | No vacía; correcta (lo comprueba el servidor) | — | — |
| Código de instalación | Sí | Formato `XXXX-XXXX-XXXX` ✓; correcto | — | "El código impreso que se entregó aparte" |
| Montaje de red | Sí | Router o hotspot | Hotspot con PC sin wifi: "Necesitará un adaptador wifi USB" | — |
| Último número impreso por buque (modo de confirmación) | Sí | Entero ≥ al último número restaurado | — | — |
| Restablecimiento de emergencia: Apoderada | Sí | Apoderada activa de la lista | "Se registrará en la bitácora y se avisará a todas las Apoderadas" | — |
| Restablecimiento de emergencia: contraseña temporal / Confirmar | Sí | Al menos 8 caracteres; ambas iguales | — | "Deberá cambiarla en su próximo ingreso" |

### F-17. Filtros (Bitácora, Alertas, DM)

| Campo | Obl. | Reglas | Advertencias | Ayuda |
|---|---|---|---|---|
| Fecha desde / hasta | No | "Desde" ≤ "hasta" | — | — |

✓ = muestra marca de correcto (RF-VAL-09).
