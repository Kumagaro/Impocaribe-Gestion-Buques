# Revisión en dispositivos reales (T123)

Qué se revisa, en qué equipos y qué mirar con atención. La revisión la hace el responsable; lo que encuentre se corrige
antes de cerrar F10.

## 1. Equipos

| Equipo | Para qué |
|---|---|
| El **dispositivo de referencia** (RF-UI-10): Android de gama media-baja, unos 3 GB de RAM, 8 núcleos de entrada, pantalla 720 × 1600 | Uso diario y rendimiento |
| Una **tablet**, en vertical y en horizontal | La clase TAB |
| **Windows 10** y **Windows 11** | La app de escritorio |
| Un **Android 7** con Chrome 119 instalado (el WebView) | El mínimo admitido |

Todos en el mismo wifi que la PC donde corre el servidor de prueba.

## 2. Lo que preparo yo antes

- El servidor de prueba en la PC, con HTTPS y su identidad, y la regla del firewall para la red local.
- Datos de prueba realistas: buques, DM, clientes, choferes y camiones, y algunas órdenes.
- Los instaladores: la app de escritorio (ligero) y el APK, más Chrome 119 para el Android 7.
- Un usuario de cada rol (Apoderada, Operador, Solo lectura) con sus contraseñas, en una hoja aparte.

## 3. Recorrido

En cada equipo, todas las pantallas del menú, con un usuario de cada rol. En cada una:

- se lee bien, sin textos cortados ni que se salgan de la pantalla;
- los botones se tocan con el dedo sin errores (tamaño y separación);
- lo que se espera ver está donde se espera, y los mensajes se entienden;
- en tablet, girar la pantalla no rompe nada;
- el tema oscuro se lee igual de bien que el claro (Perfil → Tema).

## 4. Puntos a mirar con atención

Salieron en las pruebas automáticas y solo se pueden juzgar en un teléfono de verdad.

1. **Nueva orden en teléfono, último paso.** «Siguiente» (paso 3) y «Emitir» (paso 4) quedan en el mismo sitio. Toque
   «Siguiente» dos veces rápido: si la orden se emite sin que haya visto la revisión, hay que cambiarlo.
2. **Primera sincronización** (RNF-20: menos de 3 minutos con un año de datos). Al iniciar sesión por primera vez en el
   dispositivo de referencia, mida cuánto tarda hasta ver el tablero con datos y si se ve el progreso.
3. **Apertura** (RNF-13: menos de 3 s en el dispositivo de referencia). Con la app ya sincronizada, ciérrela y ábrala:
   ¿cuánto tarda en mostrar el tablero?
4. **Animaciones** (RNF-15). Cambiar de pantalla, abrir hojas y listas largas: ¿se ven fluidas o a tirones?
5. **Alertas con la app cerrada.** Quite la app de las recientes y genere una alerta desde la PC: ¿llega la
   notificación? Repítalo con la pantalla apagada un rato. Tras reiniciar el teléfono, ¿aparece solo el aviso
   «Impocaribe conectado»?
6. **Permisos al entrar.** Android pide notificaciones (Android 13 o superior) y luego «dejar en segundo plano»
   (batería). ¿Se entiende para qué es cada uno?
7. **QR.** En P-01, «Escanear QR del servidor» con el QR que muestra la PC: ¿lo lee rápido y con poca luz?
8. **PDF.** Descargar una orden: ¿aparece «Guardado en Descargas», se abre al tocarla y «Compartir» funciona (por
   ejemplo, a WhatsApp)?
9. **Sin conexión.** Apague el wifi: ¿se ve la banda «Sin conexión» y siguen las consultas?
10. **Android 7.** Con el Chrome antiguo de fábrica, la app debe abrir P-27 (actualizar el componente); con Chrome 119,
    la app normal.

## 5. Cómo anotar lo que encuentre

Para cada problema: el equipo, la pantalla, qué hizo, qué esperaba y qué pasó. Una foto con otro teléfono sirve.
