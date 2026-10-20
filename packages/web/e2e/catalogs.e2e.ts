// T058 y T059 · P-18 a P-20 contra el servidor real, con el efecto en la base y la bitácora. Las tres clases corren a la
// vez sobre la misma base, así que cada una usa sus propios nombres y chapas: la PC da de alta un transportista con un
// camión de dos remolques y un chofer, y comprueba que la chapa repetida se bloquea; la tablet, un cliente con dos
// destinatarios y uno desactivado; el teléfono, un transportista y el nombre repetido.
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';

async function signIn(page: Parameters<typeof pairApp>[0], device: 'phone' | 'tablet' | 'desktop', path: string) {
  const { apoderada } = readState();
  await pairApp(page, device);
  await fillLogin(page, apoderada.username, apoderada.password);
  await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
  await page.evaluate((p) => (location.hash = p), `#${path}`);
}

test('P-18 a P-20: altas, repetidos bloqueados y destinatarios desactivados', async ({
  openApp,
  page,
  device,
  sql,
}) => {
  await openApp('/');

  if (device === 'desktop') {
    // P-20: el transportista.
    await signIn(page, device, '/catalogos/transportistas');
    await page.getByRole('button', { name: 'Nuevo transportista' }).click();
    await page.getByLabel('Nombre').fill('Transportes Escambray E2E');
    await page.getByRole('button', { name: 'Crear transportista' }).click();
    await expect(page.getByText('Se creó el transportista Transportes Escambray E2E.')).toBeVisible();
    const [carrier] = await sql<{ id: string }>("SELECT id FROM carriers WHERE name = 'Transportes Escambray E2E'");

    // P-18: dos remolques, el camión con los dos y un chofer.
    await page.evaluate(() => (location.hash = '#/catalogos/choferes-camiones'));
    const side = page.getByRole('complementary');
    await page.getByRole('tab', { name: /^Remolques/ }).click();
    for (const [plate, tons] of [
      ['P071111', '30'],
      ['P072222', '32,5'],
    ] as const) {
      await page.getByRole('button', { name: 'Nuevo remolque' }).click();
      await side.getByLabel('Transportista').selectOption(carrier!.id);
      await side.getByLabel('Chapa', { exact: true }).fill(plate);
      await side.getByLabel('Capacidad (t)').fill(tons);
      await side.getByRole('button', { name: 'Crear remolque' }).click();
      await expect(page.getByText(`Se creó el remolque ${plate}.`)).toBeVisible();
    }
    await page.getByRole('tab', { name: /^Camiones/ }).click();
    await page.getByRole('button', { name: 'Nuevo camión' }).click();
    await side.getByLabel('Transportista').selectOption(carrier!.id);
    await side.getByLabel('Chapa', { exact: true }).fill('W071612');
    await side.getByRole('button', { name: 'P071111 · 30,000 t' }).click();
    await side.getByRole('button', { name: 'P072222 · 32,500 t' }).click();
    await expect(side.getByText('Capacidad total: 62,500 t')).toBeVisible();
    await side.getByRole('button', { name: 'Crear camión' }).click();
    await expect(page.getByText('Se creó el camión W071612.')).toBeVisible();
    expect(
      await sql(
        `SELECT t.plate, count(d.trailer_id)::int AS trailers FROM trucks t
           JOIN truck_default_trailers d ON d.truck_id = t.id WHERE t.plate = 'W071612' GROUP BY t.plate`,
      ),
    ).toEqual([{ plate: 'W071612', trailers: 2 }]);

    // RF-CAT-08: la misma chapa no se deja crear (la copia local ya la tiene).
    await page.getByRole('button', { name: 'Nuevo camión' }).click();
    await side.getByLabel('Chapa', { exact: true }).fill('w071612');
    await expect(side.getByText('Ya existe un camión con la chapa W071612.').first()).toBeVisible();
    await expect(side.getByRole('button', { name: 'Crear camión' })).toBeDisabled();
    await side.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('tab', { name: /^Choferes/ }).click();
    await page.getByRole('button', { name: 'Nuevo chofer' }).click();
    await side.getByLabel('Nombre y apellidos').fill('Juan Carlos Miranda');
    await side.getByLabel('Carné de identidad').fill('84011905548');
    await side.getByLabel('Licencia de conducción').fill('55500000001');
    await side.getByLabel('Transportista').selectOption(carrier!.id);
    await side.getByRole('button', { name: 'Crear chofer' }).click();
    await expect(page.getByText('Se creó el chofer Juan Carlos Miranda.')).toBeVisible();
    expect(await sql("SELECT carrier_id FROM drivers WHERE national_id = '84011905548'")).toEqual([
      { carrier_id: carrier!.id },
    ]);
    return;
  }

  if (device === 'tablet') {
    // P-19: un cliente con dos destinatarios; luego se desactiva uno.
    await signIn(page, device, '/catalogos/clientes');
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Empresa Mayorista Pinar E2E');
    await page.getByLabel('Nombre del destinatario').fill('Almacén Pinar');
    await page.getByLabel('Dirección').fill('Carretera Central km 2, Pinar del Río');
    await page.getByRole('button', { name: 'Añadir destinatario' }).click();
    await page.getByLabel('Nombre del destinatario').nth(1).fill('Tienda Viñales');
    await page.getByLabel('Dirección').nth(1).fill('Calle Salvador Cisneros, Viñales');
    await page.getByRole('button', { name: 'Crear cliente' }).click();
    await expect(page.getByText('Se creó el cliente Empresa Mayorista Pinar E2E.')).toBeVisible();

    await page.getByRole('list', { name: 'Clientes' }).getByText('Empresa Mayorista Pinar E2E').click();
    await page.getByRole('button', { name: 'Desactivar el destinatario 2' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Se guardaron los cambios de Empresa Mayorista Pinar E2E.')).toBeVisible();
    expect(
      await sql(
        `SELECT r.name, r.active FROM recipients r JOIN clients c ON c.id = r.client_id
          WHERE c.name = 'Empresa Mayorista Pinar E2E' ORDER BY r.position`,
      ),
    ).toEqual([
      { name: 'Almacén Pinar', active: true },
      { name: 'Tienda Viñales', active: false },
    ]);
    return;
  }

  // TEL · P-20: el alta y el mismo nombre escrito de otra forma.
  await signIn(page, device, '/catalogos/transportistas');
  await page.getByRole('button', { name: 'Nuevo transportista' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nuevo transportista' });
  await sheet.getByLabel('Nombre').fill('Transportes Arimao E2E');
  await sheet.getByRole('button', { name: 'Crear transportista' }).click();
  await expect(page.getByText('Se creó el transportista Transportes Arimao E2E.')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo transportista' }).click();
  await sheet.getByLabel('Nombre').fill('TRANSPORTES ARIMAO  E2E.');
  await expect(sheet.getByRole('button', { name: 'Crear transportista' })).toBeDisabled();
  expect(await sql("SELECT count(*)::int AS n FROM carriers WHERE name ILIKE 'transportes arimao%'")).toEqual([
    { n: 1 },
  ]);
});
