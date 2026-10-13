## Tarea

`TNNN`: <!-- título de la tarea en specs/MVP/tasks.md -->

**Cubre:** <!-- RF, RNF, HU, D, DT… -->

## Qué cambia

<!-- Resumen breve. Si se cambió una prueba existente: qué requisito cambió o por qué la prueba estaba mal (Const. art. XIII.11). -->

## Definición de terminado (Constitución §9 y tasks.md)

- [ ] Las pruebas se escribieron antes que el código, a partir de la spec, y se vieron fallar.
- [ ] Los valores esperados vienen de la spec, no de ejecutar el código.
- [ ] Sin casos especiales para datos de prueba, aserciones débiles, `skip`/`only`/`todo` ni errores tragados.
- [ ] `pnpm verify` en verde, con mutación ≥ 90 % en módulos críticos y cobertura ≥ 85 %.
- [ ] La bitácora y la sincronización registran las acciones nuevas.
- [ ] Mensajes de error en español.
- [ ] Si toca la interfaz: paquete de pantalla (PP) completo, 10 puntos.
- [ ] Si la tarea reveló un error en la spec o el plan, el documento se corrigió primero.
