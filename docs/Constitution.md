# Constitución del proyecto: Sistema de Órdenes de Carga IMPOCARIBE

| Campo | Valor |
|---|---|
| Versión | 1.0.0 |
| Fecha | 2026-10-12 |
| Estado | Ratificada · lista para implementación |
| Ámbito | Todo el código, specs, planes y tareas del repositorio |

Este documento fija los principios que no se negocian durante el desarrollo. Toda spec, plan, tarea o línea de código debe cumplirlos. Si algo los contradice, gana la constitución, y si la constitución está equivocada, se enmienda siguiendo la sección 10, nunca se ignora.

---

## 1. Propósito

IMPOCARIBE importa harina de trigo por buque y la extrae del puerto hacia sus clientes. Cada cliente tiene una o más Declaraciones de Mercancías (DM) con un total en toneladas, y cada camión que sale lleva una orden de carga que descuenta de su DM.

Hasta hoy esa gestión vive en hojas de Excel, donde los saldos se teclean, los números se repiten y las correcciones se pierden. Este sistema existe para **eliminar el error humano**: el sistema calcula, valida, numera y deja rastro, y las personas deciden.

## 2. Alcance del MVP

**Incluido:**

- Buques: total en toneladas, fecha de arribo y viajes.
- DM con versiones, con toneladas asignadas a uno o varios buques o pendientes de asignar.
- Órdenes de carga con este ciclo de vida: borrador local, borrador compartido, oficial, nueva versión y anulación con versión.
- Saldos calculados por DM y por buque.
- Catálogos: clientes con varios destinatarios, transportistas, camiones con remolque y capacidad, y choferes.
- Usuarios con los roles Apoderada, Operador y Solo lectura. Autenticación y recuperación de contraseña sin internet.
- Firma oficial y cuño oficial únicos de la empresa, administrados solo por las Apoderadas.
- PDF de la orden generado por el servidor y archivado.
- Bitácora de auditoría.
- Notificaciones y errores dinámicos, en tiempo real y con la app cerrada.
- Respaldo automático y manual, y restauración desde la app.
- App de escritorio (Windows 10/11) y app móvil/tablet (Android 7 o superior) con un único código de interfaz.
- **Interfaces completas, fluidas y propias de cada tipo de dispositivo** (teléfono, tablet y escritorio) para todas las secciones del sistema.
- **Tres instaladores** (completo de escritorio con servidor, ligero de escritorio y Android) y **creación del servidor desde la app de escritorio** por el Administrador de instalación, con su actualización, traslado y desinstalación.
- **Dos montajes de red** soportados (router wifi o hotspot de un celular), **descubrimiento automático** del servidor, **emparejamiento** de dispositivos y **diagnóstico de red**.
- **Funcionamiento ante apagones:** detección de batería y parada ordenada del servidor.

**Excluido del MVP:**

- Importación y exportación de Excel.
- Integración con báscula.
- Productos distintos de harina de trigo.
- iOS.
- Acceso desde fuera de la red local.

---

## 3. Principios

### Artículo I. El sistema calcula; las personas no teclean resultados

Todo valor que se pueda derivar se deriva y no se guarda como dato editable: saldos, cargado, restante, número de orden, versión, estado de plazo y alertas. Solo se capturan los hechos de origen, es decir, totales, toneladas de cada orden, fechas y datos de catálogo.

*Razón: los errores del Excel nacen de escribir a mano lo que debía calcularse.*

### Artículo II. El saldo es sagrado

1. Ninguna operación puede dejar un saldo negativo, ni de DM ni de buque.
2. La validación de saldo se hace **en el servidor, dentro de una transacción con bloqueo de filas**. Lo que valide la interfaz es solo una ayuda, nunca la garantía.
3. Dos usuarios que oficializan a la vez contra el mismo saldo nunca pueden sobregirarlo.
4. Solo las órdenes oficiales vigentes descuentan saldo. Los borradores no reservan nada.
5. Un reintento por fallo de red o un doble toque nunca produce dos operaciones: toda escritura es idempotente.
6. Nadie sobrescribe en silencio el cambio de otro usuario: las ediciones simultáneas se detectan y se resuelven con conocimiento.

### Artículo III. Lo oficial no se edita, se versiona

1. Una orden oficial nunca se modifica ni se borra. Toda corrección o anulación crea una **nueva versión con el mismo número y motivo obligatorio**.
2. Una DM con cambios crea una nueva versión con motivo obligatorio. Las órdenes emitidas quedan ligadas a la versión de DM vigente en el momento en que se emitieron.
3. El total de una DM nunca puede quedar por debajo de lo ya cargado.
4. Cada versión emitida conserva su PDF exacto. Reimprimir devuelve ese mismo PDF marcado como copia.

### Artículo IV. Trazabilidad total

1. Toda acción que cambie datos queda en la bitácora: quién, cuándo, desde qué dispositivo, qué cambió (antes y después) y por qué cuando hay motivo.
2. La bitácora es de **solo inserción**. Ningún rol puede editarla ni borrarla.
3. Nada de negocio se borra físicamente. Lo que deja de usarse se desactiva.

### Artículo V. Una sola unidad y aritmética exacta

1. La única unidad de peso es la **tonelada, con 3 decimales**, tanto en pantalla como en el PDF.
2. En la base de datos se usa `numeric(12,3)`. En TypeScript se usa aritmética decimal exacta. Está prohibido `float`/`number` para toneladas en cálculos de saldo.
3. No existen bigbags, sacos ni bultos en el modelo del MVP.

### Artículo VI. Numeración sin huecos ni duplicados

1. El número de orden lo asigna el servidor **al oficializar**, nunca al crear un borrador.
2. El formato es `NOMBREBUQUE-AÑO-VIAJE-ID`. El buque es el de la asignación de la que sale la carga. El año es el de llegada del buque, el nombre va en mayúsculas sin espacios ni símbolos y el ID tiene 4 dígitos (por ejemplo, `EAGLE1-2026-V1-0001`). El detalle del formato se fija en la spec.
3. La secuencia es correlativa por buque y viaje, sin huecos ni repeticiones, garantizada por la base de datos y no por la aplicación.
4. **Un número emitido nunca se reutiliza**, ni siquiera tras restaurar un respaldo. Tras una restauración, cada buque continúa desde el mayor número emitido antes de restaurar.

### Artículo VII. El servidor es la única fuente de verdad; el dispositivo guarda un espejo

1. Toda regla de negocio vive en el servidor. La interfaz no decide nada que el servidor no vuelva a validar.
2. Cada app guarda una **copia local cifrada** de los datos que su rol puede ver (todo lo activo y los últimos 12 meses). Esa copia es un espejo para mostrar: se actualiza sola con los cambios que publica el servidor, nunca se edita directamente y se puede borrar y reconstruir en cualquier momento.
3. Los valores derivados, como saldos y estados, llegan calculados por el servidor. El dispositivo no los recalcula para decidir.
4. Lo único que nace en el dispositivo son los **borradores locales**, privados de su autor, que se suben al recuperar la conexión.
5. Sin conexión, la app abre igual y permite consultar la copia local, con un aviso visible de "datos al {fecha y hora}", y trabajar con borradores locales. Toda escritura de negocio (emitir, corregir, anular, asignar, editar) requiere el servidor.
6. La firma oficial y el cuño oficial nunca se copian a los dispositivos.

### Artículo VIII. Red local, cero dependencias de internet

1. El sistema funciona completo dentro de una red local, con **un único servidor** (una PC con Windows) como nodo central. Se soportan dos montajes: un **router wifi** (recomendado, y obligatorio por encima del límite de equipos de un hotspot) o el **hotspot de un celular**.
2. Está prohibido depender en tiempo de ejecución de servicios externos: Firebase, servicios en la nube, CDN o APIs públicas. Las notificaciones con la app cerrada se resuelven con conexión directa al servidor local.
3. Todas las dependencias se instalan en el servidor y en las apps; nada se descarga mientras el sistema está en uso.
4. **Ninguna pieza depende de una dirección IP fija.** Las apps descubren el servidor automáticamente en la red y lo reconocen por su **identidad**, no por su dirección. Si la dirección cambia (por ejemplo, al reiniciar un hotspot), las apps lo vuelven a encontrar solas.
5. **Nunca hay dos servidores.** El sistema impide crear un servidor si ya existe uno en la red, y un servidor trasladado a otra PC queda inutilizado en la anterior.

### Artículo IX. Un solo código, dos aplicaciones

1. La interfaz se escribe una vez, en el paquete `web`, y es responsive para teléfono, tablet y escritorio.
2. **Cada app lleva la interfaz incluida.** No se carga desde el servidor, así que la app abre aunque el servidor no esté disponible.
3. Las apps de escritorio (Electron) y Android (Capacitor) son cascarones delgados. Solo contienen lo que el sistema operativo exige: instalación, almacenamiento local cifrado, notificaciones, servicio en segundo plano, guardado de archivos y bloqueo de capturas.
4. Toda función está disponible en ambas apps. Está prohibido duplicar **reglas, validaciones o lógica** por plataforma. La **presentación** sí es propia de cada tipo de dispositivo (Artículo XIV), siempre sobre la misma lógica compartida.
5. Las actualizaciones se distribuyen desde el servidor local. El servidor declara la versión mínima compatible, y una app más antigua avisa y pide actualizar antes de seguir.

### Artículo X. Seguro por defecto

1. Las contraseñas se guardan con argon2id y nunca se guardan ni se registran en texto plano.
2. Toda comunicación va por HTTPS, con una autoridad de certificación propia de cada instalación. El certificado identifica al servidor **por su identidad**, y cada dispositivo verifica esa identidad, aprendida al **emparejarse** (código de 6 dígitos o QR). Un equipo intruso no puede hacerse pasar por el servidor.
3. Las sesiones duran 24 horas absolutas desde el inicio de sesión. Con "mantener sesión" duran 30 días. Sin conexión, una sesión vencida permite consultar la copia local durante 72 horas más; después exige iniciar sesión. Desactivar un usuario o cambiar su rol cierra todas sus sesiones al instante.
4. La recuperación de contraseña es local: pide carnet, teléfono y un código de recuperación. Los códigos se muestran una sola vez, en una pantalla con capturas bloqueadas. Toda recuperación queda en la bitácora y alerta a las Apoderadas.
5. Los permisos se validan en el servidor en cada petición, según el rol.
6. Las notificaciones fuera de la app no muestran datos sensibles.
7. **Administrador de instalación.** Crear, reparar, actualizar, trasladar o desinstalar el servidor exige **permisos de administrador de Windows** en esa PC y el **código de instalación** de la empresa. No es un rol del sistema: no entra en la app ni administra datos de negocio.

### Artículo XI. Los errores se muestran, no se esconden

1. Una operación inválida se bloquea con un mensaje claro en español que dice qué pasó, por qué y qué opciones tiene el usuario.
2. Las situaciones de riesgo generan alertas dinámicas en tiempo real según el rol: DM pendientes, plazos, sobregiros, capacidad de camión, recuperaciones y respaldos.
3. Cuando una regla admite una decisión humana, como superar la capacidad del camión, repetir camión el mismo día o asignar una DM a un buque sin saldo suficiente, el sistema **detiene la operación, explica y exige una decisión explícita con motivo escrito**, que queda registrada con su autor.

### Artículo XII. Simplicidad primero

Se construye lo que pide la spec del MVP y nada más. No se añaden abstracciones, configuraciones ni funciones "por si acaso". Cada dependencia nueva debe justificarse en el plan.

**Recursos limitados.** El servidor debe funcionar en una PC de 4 GB de RAM y la app en un teléfono de gama media-baja. Toda decisión técnica considera su consumo de memoria, disco y batería, y los límites de consumo de la spec se miden y se cumplen.

### Artículo XIII. Las pruebas verifican, no dirigen

Las pruebas existen para **confirmar que el código cumple la spec**, no para que el código se escriba a su medida. Un código que hace pasar las pruebas sin cumplir la spec es un defecto, aunque todas las pruebas estén en verde.

1. **La spec manda.** El código implementa los requisitos de la spec. Las pruebas comprueban esos mismos requisitos desde fuera. Nunca se diseña el código mirando la prueba en lugar del requisito.
2. **Prueba primero.** Cada tarea empieza escribiendo las pruebas derivadas de la spec y comprobando que **fallan**. Solo después se implementa.
3. **Oráculo independiente.** Los valores esperados se calculan a mano a partir de la spec y sus ejemplos. Nunca se obtienen ejecutando el código que se prueba ni copiando su salida.
4. **Prácticas prohibidas:**
   - programar casos especiales para los datos de prueba;
   - debilitar una aserción (por ejemplo, cambiar una igualdad exacta por "no es nulo");
   - desactivar, saltar o filtrar pruebas (`skip`, `only`, `todo`);
   - simular el módulo que se está probando, o la base de datos en las pruebas de integración;
   - cambiar un valor esperado sin citar el cambio de spec que lo justifica;
   - capturar errores para que una prueba no falle.
5. **Cada regla, sus bordes.** Toda regla se prueba en su caso normal, en sus límites exactos (por ejemplo, saldo exactamente 0,000 t, día 25 y día 31) y en sus casos de rechazo.
6. **Propiedades.** Las reglas de saldo, numeración, plazo y sincronización se prueban también con datos generados al azar (miles de combinaciones), verificando que las invariantes de la sección 4 nunca se rompen.
7. **Mutación.** El dominio (`shared/domain`) y las transacciones críticas (emisión, corrección, anulación, asignación, vencimiento, numeración y sincronización) deben alcanzar al menos un **90 %** en pruebas de mutación: de cada 100 errores introducidos a propósito en el código, las pruebas detectan al menos 90.
8. **Escenarios reales.** Los datos reales del Excel de Impocaribe (12 DM y 92 órdenes) se usan como escenario de prueba, para demostrar que los errores de hoy (números repetidos, saltos, saldos negativos y cancelaciones sin rastro) no pueden ocurrir.
9. **La cobertura no es la meta.** Se exige un mínimo del 85 % de líneas en el servidor y en el dominio, pero una cobertura alta con aserciones débiles no cuenta como probado.
10. **Interfaces también.** Las pruebas de interfaz siguen las mismas reglas: verifican lo que la spec de interfaz exige que el usuario vea y pueda hacer, no detalles internos del componente.
11. **Cambiar una prueba es cambiar un contrato.** Modificar o borrar una prueba existente exige explicar en el commit qué requisito cambió o por qué la prueba estaba mal.

---

### Artículo XIV. Interfaces completas, fluidas y propias de cada dispositivo

El sistema existe para que las personas trabajen mejor. Una función sin una buena interfaz no está terminada.

1. **Toda función tiene interfaz.** Ninguna funcionalidad del servidor se considera terminada si no tiene su pantalla, con todos sus estados, en las tres clases de dispositivo.
2. **Tres clases de dispositivo, tres experiencias.** Teléfono, tablet y escritorio tienen cada uno su propia composición, navegación e interacciones, pensadas para su uso real: pulgar y pantalla pequeña en el patio, dos paneles en la tablet, tablas densas y teclado en la oficina. Las tres comparten la misma lógica, los mismos datos y las mismas reglas.
3. **Fluidez con propósito.** Las animaciones (Motion) comunican qué cambió, de dónde viene y qué está pasando. Nunca retrasan el trabajo ni ocultan información. Solo se animan propiedades de bajo costo, y ninguna transición dura más de 300 ms.
4. **Movimiento accesible.** Si el sistema operativo pide reducir el movimiento, o el usuario lo activa en su perfil, las animaciones se sustituyen por cambios instantáneos o fundidos breves.
5. **Rendimiento en el equipo más modesto.** La experiencia se mide en el dispositivo de referencia de gama media-baja definido en la spec, no solo en un ordenador potente.
6. **Identidad visual.** El prototipo aprobado es la base del sistema de diseño. Se puede renovar y mejorar en experiencia de uso, sin perder su identidad.
7. **Diseño aprobado antes de construir.** Toda pantalla nueva se implementa a partir de maquetas de teléfono, tablet y escritorio aprobadas por el responsable del proyecto.
8. **Conectada de verdad.** Toda pantalla tiene pruebas que demuestran que está bien relacionada con el servidor: contrato compartido, pruebas de componente con todos sus estados, al menos un recorrido de extremo a extremo contra el servidor y la base de datos reales, y regresión visual aprobada.
9. **Cada campo guía al usuario.** Todo campo valida en la interfaz con las mismas reglas que el servidor, en el momento oportuno y con mensajes concretos: errores que bloquean, advertencias que no bloquean (incluidas las legales y de negocio) y ayudas. La validación de la interfaz ayuda; la del servidor decide.

### Artículo XV. Preparado para apagones

Los cortes de electricidad son frecuentes. El sistema se diseña asumiendo que van a ocurrir.

1. Ningún apagón puede dejar una orden a medias: toda operación es atómica y la base de datos se recupera sola de un apagado brusco.
2. Si el servidor funciona con batería (laptop o UPS), avisa a todos los usuarios. Con poca batería deja de aceptar operaciones nuevas, termina las que están en curso y se detiene de forma ordenada. Al volver la corriente, se reanuda solo.
3. Mientras el servidor no está disponible, cada dispositivo sigue mostrando sus datos (copia local) y permite preparar borradores.
4. La recomendación de hardware es explícita: el servidor debe ser una laptop o una PC de escritorio con UPS.

## 4. Invariantes de dominio

Estas reglas deben cumplirse siempre y cada una debe tener al menos una prueba automática.

| # | Invariante |
|---|---|
| D1 | Saldo de DM = total de su versión vigente − Σ toneladas de las órdenes oficiales vigentes (la última versión no anulada) ligadas a ella. Nunca es menor que 0. |
| D2 | La suma de toneladas asignadas a DM en un buque nunca supera el total del buque, y la suma de las asignaciones de una DM nunca supera su total. Una DM puede recibir asignaciones de varios buques. Si pide más de lo que queda en el buque, solo se le asigna lo disponible, con confirmación explícita, o no se asigna, y el resto queda pendiente de asignar. |
| D3 | Una orden oficial siempre tiene DM, toneladas mayores que 0, chofer, camión y carta de porte. |
| D4 | Las toneladas de una orden no superan la capacidad del camión, que es la suma de las capacidades de sus remolques, salvo decisión explícita con motivo registrada. |
| D5 | Un mismo camión no tiene dos órdenes oficiales vigentes con la misma fecha de carga, salvo decisión explícita con motivo registrada. |
| D6 | Toda versión nueva de una orden o DM tiene motivo, autor y fecha. |
| D7 | El plazo cuenta desde la fecha de creación de la DM, que es el día 1. Se avisa el día 25 y la DM vence al empezar el día 31: queda desactivada y su restante asignado vuelve al buque. Sus órdenes ya emitidas pueden corregirse sin aumentar toneladas, y anularse. La reactivación (Apoderada u Operador) genera una nueva versión y reinicia el plazo desde la fecha de reactivación, que pasa a ser el día 1. |
| D8 | Una DM se cierra automáticamente solo cuando su saldo llega exactamente a 0,000 t. |
| D9 | Un borrador compartido solo lo edita una persona a la vez, mediante bloqueo de edición. Un borrador local solo lo ve quien lo creó. |
| D10 | La bitácora nunca pierde ni modifica un registro. |
| D11 | Una DM sin total no tiene asignaciones. |
| D12 | Un número de orden emitido nunca se vuelve a usar para otra orden, ni siquiera tras restaurar un respaldo. |
| D13 | Una DM tiene siempre el mismo cliente y la misma fecha de creación en todas sus versiones. |
| D14 | En cada momento existe como máximo un servidor activo con la identidad de la instalación. |
| D15 | Un mismo intento de emisión, corrección, anulación o asignación produce como máximo un efecto, aunque se envíe varias veces. |

---

## 5. Stack tecnológico

Este stack es fijo para el MVP. Cambiarlo requiere enmendar esta constitución.

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (modo `strict`) en todo el proyecto |
| Base de datos | PostgreSQL 16, como servicio de Windows |
| Backend | Node.js LTS + NestJS |
| Acceso a datos | Drizzle ORM, con migraciones versionadas en el repositorio |
| Validación compartida | Zod (paquete `shared`), con los mismos esquemas en servidor e interfaz |
| Interfaz | React + Vite, incluida en cada app |
| Animación | Motion para React (antes Framer Motion), con carga reducida de funciones |
| Iconos | Lucide, animados con Motion mediante un componente propio |
| Catálogo de componentes | Storybook |
| Instaladores | NSIS para escritorio (completo y ligero) y APK para Android. Ayudante de instalación con permisos elevados para crear y mantener el servidor |
| Descubrimiento | mDNS (DNS-SD), difusión UDP y búsqueda en la subred, con QR o dirección manual como último recurso |
| Copia local | SQLite cifrado (SQLCipher) mediante `@capacitor-community/sqlite`, la misma API en Android y Electron. Clave en Android Keystore o en el almacenamiento cifrado de Windows. |
| App de escritorio | Electron (Windows 10/11) |
| App Android | Capacitor (Android 7 o superior), con servicio en primer plano propio para alertas |
| Tiempo real | WebSocket |
| PDF | Plantilla HTML convertida a PDF con Chromium (Puppeteer), en el servidor |
| Contraseñas | argon2id |
| Respaldo | `pg_dump` / `pg_restore`, programado y manual |
| Pruebas | Vitest (unitarias e integración contra PostgreSQL real), fast-check (propiedades), Stryker (mutación), Testing Library (componentes), Playwright (extremo a extremo contra el servidor real y regresión visual de pantallas y PDF) |
| Repositorio | Monorepo pnpm: `server`, `web`, `desktop`, `android`, `shared`, `specs` |

## 6. Restricciones de arquitectura

1. **Despliegue:** una PC con Windows (laptop, o de escritorio con UPS) ejecuta PostgreSQL y el servidor como servicio, creados desde la app de escritorio instalada con el instalador completo. Arranca con Windows, sin depender de que alguien abra la app, y la misma PC puede usarse como puesto de trabajo.
2. **Interfaz y datos locales:** la interfaz va incluida en cada app. Los datos se replican del servidor a cada dispositivo mediante un registro de cambios numerado y en orden. El servidor publica los instaladores del `.exe` y del APK y declara la versión mínima compatible.
3. **Tiempo de referencia:** la zona horaria es `America/Havana`. Las fechas y plazos que deciden se calculan en el servidor.
4. **Android:** una única app para Android 7 (API 24) o superior. Los requisitos propios de versiones nuevas (permiso de notificaciones en Android 13 y tipo de servicio en Android 14) se declaran sin excluir a las anteriores. El navegador interno del teléfono (WebView) debe tener la versión mínima que fija el plan; el paquete de instalación incluye su actualización para instalarla sin internet.
5. **API:** HTTP/JSON versionada con un contrato documentado en la spec. Los errores de negocio tienen un código estable y un mensaje en español.
6. **Concurrencia:** oficializar, versionar, asignar una DM a un buque y numerar se ejecutan en transacciones con el aislamiento y los bloqueos necesarios para cumplir los artículos II y VI.

## 7. Calidad y pruebas

1. Cada regla de negocio y cada invariante de la sección 4 tiene pruebas automáticas que cumplen el Artículo XIII.
2. Son obligatorias las **pruebas de concurrencia** para el sobregiro (D1, D2) y la numeración (artículo VI). Se lanzan oficializaciones simultáneas y se verifica que nunca hay saldo negativo, huecos ni duplicados.
3. Las pruebas de integración corren contra PostgreSQL real, nunca contra simulaciones de la base de datos.
4. No se acepta código con errores de tipos, de linter o con pruebas fallando.
5. Toda tarea cita los requisitos de la spec que cumple, y toda prueba cita el requisito o invariante que verifica.
6. Umbrales obligatorios: 90 % en pruebas de mutación sobre el dominio y las transacciones críticas, y 85 % de cobertura de líneas en el servidor y en el dominio. Un umbral no cumplido impide cerrar la tarea.

## 8. Convenciones

1. **Idioma:** las specs, planes, tareas, la interfaz, los mensajes de error y los PDF van en español. El código, los identificadores y los nombres de tablas y columnas van en inglés, con la correspondencia definida en el glosario de la spec.
2. **Formato numérico en pantalla:** coma decimal y espacio como separador de miles (`17,280 t`).
3. **Documentos:** se escriben en markdown dentro de `specs/`.
4. **Commits:** cada commit referencia la tarea que implementa.

## 9. Proceso SDD

El desarrollo sigue estrictamente esta secuencia, y no se escribe código sin una tarea aprobada:

```
Constitution.md  →  spec.md + ui-spec.md  →  plan.md  →  tasks.md  →  implementación
```

| Documento | Contenido | Aprueba |
|---|---|---|
| `Constitution.md` | Principios no negociables (este documento) | Responsable del proyecto |
| `specs/<funcionalidad>/spec.md` | **Qué** y **por qué**: historias de usuario, requisitos funcionales numerados, reglas, casos límite y criterios de aceptación. No habla de tecnología. | Responsable del proyecto |
| `specs/<funcionalidad>/ui-spec.md` | Parte de la spec: qué ve y qué puede hacer el usuario en cada pantalla y dispositivo, estados, movimiento y catálogo de campos | Responsable del proyecto |
| `specs/<funcionalidad>/plan.md` | **Cómo**: modelo de datos, contrato de API, decisiones técnicas y verificación contra esta constitución | Responsable del proyecto |
| `specs/<funcionalidad>/tasks.md` | Tareas pequeñas, ordenadas e independientes, cada una con requisitos cubiertos y criterio de terminado | Responsable del proyecto |

**Reglas del proceso:**

1. Una duda de negocio no se resuelve suponiendo. Se marca como `[ACLARAR]` en la spec y se pregunta.
2. Cada plan incluye una sección "Verificación constitucional" que confirma el cumplimiento de cada artículo o justifica la excepción.
3. Si durante la implementación se descubre que la spec está mal, se corrige primero la spec y después el código.

**Definición de terminado de una tarea:**

- Las pruebas se escribieron antes que el código, a partir de la spec, y fallaron antes de implementar.
- Los valores esperados vienen de la spec, no de ejecutar el código.
- El código está implementado según la spec, sin casos especiales para las pruebas.
- Las pruebas pasan, incluidas las de concurrencia y de propiedades cuando aplican.
- Se cumplen los umbrales de mutación y de cobertura (sección 7).
- La bitácora registra las acciones nuevas.
- Los mensajes de error están en español.
- Si la tarea toca la interfaz: maqueta aprobada, presentación en teléfono, tablet y escritorio, todos los estados de la spec de interfaz, pruebas de componente, recorrido de extremo a extremo contra el servidor real, referencias visuales aprobadas y verificación en escritorio y en Android.

## 10. Gobernanza

1. Esta constitución prevalece sobre cualquier spec, plan, tarea o costumbre.
2. Una enmienda requiere un motivo escrito, la aprobación del responsable del proyecto y un aumento de versión:
   - **mayor:** cuando cambia o elimina un principio;
   - **menor:** cuando agrega un principio o una sección;
   - **parche:** cuando solo aclara la redacción.
3. Tras una enmienda se revisan las specs, planes y tareas afectados.

### Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 2026-10-12 | Versión ratificada para la implementación. Consolida todas las revisiones de borrador hechas durante la especificación del MVP |
