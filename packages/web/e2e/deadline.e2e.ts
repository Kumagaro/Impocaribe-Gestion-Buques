// T138 · HU-09 contra el servidor real: el día 30 todavía se emite, el 31 la emisión se rechaza por DM vencida y la
// lista de DM (P-09) la muestra vencida. El plazo se adelanta en la base (deadline_start_date) antes de entrar, así la
// primera sincronización del dispositivo ya lo trae. AL-03 y la liberación del restante las hacen tareas del servidor
// cada 10 minutos: las cubren sus pruebas de integración.
import { ApiError } from '../src/api/client';
import { ordersApi } from '../src/api/endpoints/orders';
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';
import { havanaToday, prepare } from './support/orders';

const DATA = {
  phone: { code: 'PLT', dm: '83051', plate: 'P831', nationalId: '84011905531', license: '80000000031' },
  tablet: { code: 'PLB', dm: '83052', plate: 'P832', nationalId: '84011905532', license: '80000000032' },
  desktop: { code: 'PLE', dm: '83053', plate: 'P833', nationalId: '84011905533', license: '80000000033' },
} as const;

/** La fecha de La Habana de hace `days` días. */
function daysAgo(days: number): string {
  const d = new Date(`${havanaToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

test('HU-09: el día 30 se emite, el 31 se rechaza por DM vencida y la lista la muestra vencida', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  const k = DATA[device];
  const w = await prepare(k);
  const issue = (tons: string) =>
    w.api.request(ordersApi.issue, {
      body: {
        declarationId: w.dm.id,
        allocationId: w.dm.allocations[0]!.id,
        recipientId: w.client.recipients[0]!.id,
        truckId: w.truck.id,
        trailerIds: w.trailers.map((t) => t.id),
        driverId: w.driver.id,
        tons,
        waybillNo: '22352',
        loadingDate: havanaToday(),
        lotNo: null,
        routeSheetNo: null,
        container: null,
      },
    });
  const startedOn = (date: string) =>
    sql('UPDATE customs_declarations SET deadline_start_date = $1 WHERE id = $2', [date, w.dm.id]);

  // Día 30: todavía se puede emitir.
  await startedOn(daysAgo(29));
  await issue('10');

  // Día 31: se rechaza por DM vencida y no nace ninguna orden más.
  await startedOn(daysAgo(30));
  const refused = await issue('5').then(
    () => null,
    (err: unknown) => err,
  );
  expect(refused).toBeInstanceOf(ApiError);
  expect((refused as ApiError).code).toBe('DECLARATION_EXPIRED');
  expect(
    await sql<{ n: number }>('SELECT count(*)::int AS n FROM load_orders WHERE declaration_id = $1', [w.dm.id]),
  ).toEqual([{ n: 1 }]);

  // P-09: la DM aparece vencida.
  const operador = readState().users.operador[device];
  await openApp('/');
  await pairApp(page, device);
  await fillLogin(page, operador.username, operador.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate(() => (location.hash = '#/dm'));
  // Tabla en TAB y ESC, tarjetas en TEL.
  const item = page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: k.dm });
  await expect(item.first()).toContainText('Vencido');
});
