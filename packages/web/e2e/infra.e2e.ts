// T026 · Comprueba la infraestructura de extremo a extremo en cada clase: la app abre con su clase, el servidor real
// responde y la base se consulta directamente. Los recorridos de cada pantalla (ui-spec §4) se añaden con sus tareas.
import { expect, test } from './support/fixtures';

test('la app abre con la clase de dispositivo del proyecto', async ({ openApp, device }) => {
  const page = await openApp('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Órdenes de Carga');
  await expect(page.locator('html')).toHaveAttribute('data-device-class', device);
});

test('el servidor real responde con su contrato', async ({ request, serverUrl }) => {
  const res = await request.get(`${serverUrl}/health`);
  expect([res.status(), (await res.json()).status]).toEqual([200, 'ok']);
});

test('la base de extremo a extremo está migrada y se consulta directamente', async ({ sql }) => {
  const rows = await sql<{ last_seq: string }>('SELECT last_seq::text FROM sync_state');
  expect(rows).toEqual([{ last_seq: '0' }]);
});

test('dos usuarios abren la app a la vez, cada uno en su contexto', async ({ openApp, page, otherUser }) => {
  await openApp('/', page);
  await openApp('/', otherUser);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Órdenes de Carga');
  await expect(otherUser.getByRole('heading', { level: 1 })).toHaveText('Órdenes de Carga');
  expect(page.context()).not.toBe(otherUser.context());
});
