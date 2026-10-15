// T041 · Guardas de rol en la interfaz (spec §2, EST-05) con los tres roles en las tres clases, contra el servidor
// real: lo que el rol no puede hacer no aparece y, si se llega por enlace, se explica y se ofrece volver.
import { fillLogin, pairApp, readState } from './support/access';
import { expect, test } from './support/fixtures';

const ROLES = ['apoderada', 'operador', 'lectura'] as const;

for (const role of ROLES) {
  test(`${role}: Usuarios solo para la Apoderada, también por enlace`, async ({ openApp, page, device }) => {
    const state = readState();
    const who = role === 'apoderada' ? state.apoderada : state.users[role][device];
    await openApp('/');
    await pairApp(page, device);
    await fillLogin(page, who.username, who.password);
    await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();

    // En el menú: escritorio y tablet lo muestran siempre; el teléfono, en "Más".
    if (device === 'phone') await page.getByRole('button', { name: 'Más' }).click();
    const link = page
      .getByRole('button', { name: 'Usuarios', exact: true })
      .or(page.getByRole('link', { name: 'Usuarios' }));
    if (role === 'apoderada') await expect(link.first()).toBeVisible();
    else await expect(link).toHaveCount(0);
    if (device === 'phone') await page.keyboard.press('Escape');

    await page.evaluate(() => (location.hash = '#/usuarios'));
    if (role === 'apoderada') {
      await expect(page.getByRole('button', { name: 'Nuevo usuario' })).toBeVisible();
    } else {
      await expect(page.getByText('No tiene permiso para ver esta pantalla')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Nuevo usuario' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Volver al tablero' }).click();
      await expect(page.getByRole('heading', { name: 'Tablero' }).first()).toBeVisible();
    }
  });
}
