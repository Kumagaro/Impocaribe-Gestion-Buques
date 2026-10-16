# Órdenes de Carga · IMPOCARIBE

Sistema para gestionar la extracción de harina de trigo desde el puerto: buques, Declaraciones de Mercancías (DM) y órdenes de carga, con saldos calculados, numeración sin huecos y bitácora. Funciona en una red local, sin internet, con un servidor en una PC con Windows y apps de escritorio (Windows) y Android.

## Documentos

| Documento | Contenido |
|---|---|
| [Constitución](docs/Constitution.md) | Principios no negociables |
| [Spec](specs/MVP/spec.md) y [spec de interfaz](specs/MVP/ui-spec.md) | Qué hace el sistema y qué ve el usuario |
| [Plan](specs/MVP/plan.md) | Cómo se construye |
| [Tareas](specs/MVP/tasks.md) | Orden de trabajo |
| [Desarrollo](docs/desarrollo.md) | Entorno, comandos y flujo de trabajo |
| [Prototipo aprobado](docs/referencia/Ordenes-de-Carga-IMPOCARIBE.html) | Referencia visual (solo lectura) |

## Arrancar

1. Prepare el equipo según [docs/desarrollo.md](docs/desarrollo.md) y compruébelo con `pnpm run doctor`.
2. `pnpm install`
3. Copie `.env.example` como `.env` y ajústelo.
