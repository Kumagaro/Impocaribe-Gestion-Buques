// T048 · Aceptación de P-30 (ui-spec) en las tres clases, sin emparejar y sin sesión: el servidor "apagado" es el origen
// que deja de contestar a /api; el aislamiento de equipos lo simula el estado de red del navegador (browser-platform).
import { SIMULATED_LAN_KEY } from '../src/platform/platform';
import { expect, test } from './support/fixtures';

test.beforeEach(async ({ page }) => {
  // Solo el servidor: /src/api/… son módulos de la propia app que sirve vite.
  await page.route('**/api/v1/**', (route) => route.abort('connectionrefused'));
});

test('P-30: con el servidor apagado, "El servidor no responde" y los pasos a seguir', async ({ openApp, page }) => {
  await openApp('/diagnostico');
  await expect(page.getByRole('status', { name: 'El servidor no responde' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Qué hacer' }).getByRole('listitem').first()).toHaveText(
    'Compruebe que la PC servidor está encendida y no está en suspensión.',
  );
  await expect(page.getByRole('button', { name: 'Volver a probar' })).toBeEnabled();
});

test('P-30: con el aislamiento de equipos simulado, lo detecta y lo explica', async ({ openApp, page }) => {
  await page.addInitScript(({ key, lan }) => sessionStorage.setItem(key, lan), {
    key: SIMULATED_LAN_KEY,
    lan: JSON.stringify({ wifi: 'HOTSPOT-PATIO', gatewayReachable: true, peersVisible: false }),
  });
  await openApp('/diagnostico');
  await expect(page.getByRole('status', { name: 'La red bloquea la comunicación entre equipos' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText('Este dispositivo llega al router, pero no a los demás equipos de la red.'),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Qué hacer' }).getByRole('listitem').first()).toHaveText(
    'En el router o en el celular que hace de hotspot, desactive el «aislamiento de clientes» (AP isolation).',
  );
  await expect(page.getByRole('list', { name: 'Detalle de la conexión' })).toContainText('HOTSPOT-PATIO');
});
