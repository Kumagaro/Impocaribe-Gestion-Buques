// HU-07: las alertas llegan en tiempo real (con la app cerrada, en android.e2e.ts).
// T096 · P-17 contra el servidor real (ui-spec P-17, aceptación): una alerta que genera otra persona aparece en la
// lista y en el contador del Operador en menos de 5 s, y el Operador no ve AL-05 (reservada a las Apoderadas). Las tres
// clases corren a la vez, cada una con su buque, su DM y su camión.
import { ApiError } from '../src/api/client';
import { declarationsApi } from '../src/api/endpoints/vessels';
import { ordersApi } from '../src/api/endpoints/orders';
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';
import { havanaToday, prepare } from './support/orders';

const DATA = {
  phone: {
    code: 'ALT',
    dm: '81041',
    pending: '81051',
    plate: 'P811',
    nationalId: '84011905511',
    license: '80000000011',
  },
  tablet: {
    code: 'ALB',
    dm: '81042',
    pending: '81052',
    plate: 'P812',
    nationalId: '84011905512',
    license: '80000000012',
  },
  desktop: {
    code: 'ALE',
    dm: '81043',
    pending: '81053',
    plate: 'P813',
    nationalId: '84011905513',
    license: '80000000013',
  },
} as const;

test('P-17: alerta de otra persona en menos de 5 s; el Operador no ve AL-05', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const state = readState();
  const k = DATA[device];
  const w = await prepare(k);

  await openApp('/');
  await pairApp(page, device);
  const operador = state.users.operador[device];
  await fillLogin(page, operador.username, operador.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/alertas'));
  await expect(page.getByRole('heading', { name: 'Alertas' }).first()).toBeVisible();

  const counter = page.getByRole('button', { name: /^Alertas(, \d+ abiertas)?$/ }).first();
  const count = async () => parseInt((await counter.getAttribute('aria-label'))?.match(/\d+/)?.[0] ?? '0', 10);
  const before = await count();

  // Otra persona (la Apoderada) registra una DM sin total y luego otra: AL-02 (la ven A y O), en menos de 5 s.
  await w.api.request(declarationsApi.create, {
    body: { number: k.pending, clientId: w.client.id, brand: 'Dosel', totalTons: null },
  });
  const second = String(parseInt(k.pending, 10) + 10);
  await w.api.request(declarationsApi.create, {
    body: { number: second, clientId: w.client.id, brand: 'Dosel', totalTons: '50' },
  });
  const created = Date.now();
  const title = new RegExp(`^DM ${second} registrada con \\d+ pendientes?$`);
  await expect(page.getByRole('listitem', { name: title })).toBeVisible({ timeout: 5000 });
  expect(Date.now() - created).toBeLessThan(5000);
  await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(before);

  // Un sobregiro real (la Apoderada intenta emitir 101 t con 100 de saldo): AL-05 existe, pero el Operador no la ve.
  const error = await w.api
    .request(ordersApi.issue, {
      body: {
        declarationId: w.dm.id,
        allocationId: w.dm.allocations[0]!.id,
        recipientId: w.client.recipients[0]!.id,
        truckId: w.truck.id,
        trailerIds: w.trailers.map((t) => t.id),
        driverId: w.driver.id,
        tons: '101',
        waybillNo: '22352',
        loadingDate: havanaToday(),
        lotNo: null,
        routeSheetNo: null,
        container: null,
      },
    })
    .catch((e: unknown) => e);
  expect(error instanceof ApiError && error.code).toBe('OVERDRAFT_ALLOCATION');
  const overdraft = `Sobregiro bloqueado en la DM ${k.dm}`;
  await expect.poll(async () => (await sql('SELECT 1 FROM alerts WHERE title = $1', [overdraft])).length).toBe(1);
  // Lo que sí ve llega en el mismo plazo; si AL-05 le llegara, ya estaría.
  await page.waitForTimeout(3000);
  await expect(page.getByRole('listitem', { name: overdraft })).toHaveCount(0);
});
