import type { Role } from '@impocaribe/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderUi } from '../../test/render';
import type { DeviceClass } from '../ui/device';
import { AppShell, type ShellStatus } from './AppShell.screen';

// T025 · ui-spec §1.1 y §1.2: estructura de pantalla de cada clase, con sus elementos globales y los atajos de escritorio.

const ONLINE: ShellStatus = {
  online: true,
  asOf: '14/10/2026 16:40',
  pendingDrafts: 0,
  syncing: false,
  power: null,
  alerts: 0,
};
const USER = { name: 'Ilén Fernández' };

function renderShell({
  device = 'desktop',
  role = 'operador',
  status = ONLINE,
  isServerPc = false,
  path = '/',
}: { device?: DeviceClass; role?: Role; status?: ShellStatus; isServerPc?: boolean; path?: string } = {}) {
  const page = (title: string) => ({ handle: { title }, element: <p>Pantalla {title}</p> });
  const router = createMemoryRouter(
    [
      {
        element: <AppShell user={{ ...USER, role }} status={status} isServerPc={isServerPc} />,
        children: [
          { path: '/', ...page('Tablero') },
          { path: '/dm', ...page('DM') },
          { path: '/buques', ...page('Buques') },
          { path: '/ordenes', ...page('Órdenes') },
          { path: '/ordenes/nueva', ...page('Nueva orden') },
          { path: '/buscar', ...page('Buscar') },
          { path: '/diagnostico', ...page('Diagnóstico de red') },
          { path: '*', ...page('Otra') },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  renderUi(<RouterProvider router={router} />, { device });
  return router;
}

const nav = () => screen.getByRole('navigation', { name: 'Principal' });

describe('Navegación por clase (ui-spec §1.1)', () => {
  it('teléfono: barra inferior con Tablero, DM, Nueva orden, Alertas y Más', () => {
    renderShell({ device: 'phone' });
    expect(
      within(nav())
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent),
    ).toEqual(['Tablero', 'DM', 'Nueva orden', 'Alertas', 'Más']);
  });

  it('teléfono: "Más" abre una hoja con el resto de secciones, empezando por Órdenes, y navega', async () => {
    const router = renderShell({ device: 'phone' });
    await userEvent.click(within(nav()).getByRole('button', { name: 'Más' }));
    const sheet = screen.getByRole('dialog', { name: 'Más' });
    const entries = within(sheet)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(entries[0]).toBe('Órdenes');
    expect(entries).not.toContain('Tablero');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Órdenes' }));
    expect([router.state.location.pathname, screen.queryByRole('dialog')]).toEqual(['/ordenes', null]);
  });

  it('tablet: riel con todas las secciones del rol', () => {
    renderShell({ device: 'tablet', role: 'lectura' });
    const labels = within(nav())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(['Tablero', 'Buques', 'DM', 'Órdenes', 'Alertas', 'Bitácora', 'Diagnóstico de red']),
    );
    expect(labels).not.toContain('Usuarios');
  });

  it('escritorio: menú lateral por grupos; Administración completa solo para la Apoderada', () => {
    renderShell({ role: 'apoderada' });
    const groups = [...nav().querySelectorAll('.ui-sidebar__group')].map((g) => g.textContent);
    expect(groups).toEqual(['Operación', 'Catálogos', 'Administración', 'Sistema']);
    expect(within(nav()).getByRole('button', { name: /Usuarios/ })).not.toBeNull();
  });

  it('Estado del servidor solo aparece en la PC servidor', () => {
    renderShell({ isServerPc: false });
    expect(within(nav()).queryByRole('button', { name: /Estado del servidor/ })).toBeNull();
  });

  it('en la PC servidor, el menú incluye Estado del servidor', () => {
    renderShell({ isServerPc: true });
    expect(within(nav()).getByRole('button', { name: /Estado del servidor/ })).not.toBeNull();
  });

  it('marca la sección actual, también en sus subrutas', () => {
    renderShell({ path: '/ordenes/123' });
    expect(
      within(nav())
        .getByRole('button', { name: /^Órdenes/ })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('la cabecera lleva el título de la pantalla', () => {
    renderShell({ path: '/dm' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('DM');
  });
});

describe('Solo lectura no ve "Nueva orden" (ui-spec §1.1, EST-05)', () => {
  it.each(['phone', 'tablet', 'desktop'] as const)('en %s', (device) => {
    renderShell({ device, role: 'lectura' });
    expect(screen.queryByRole('button', { name: /Nueva orden/ })).toBeNull();
  });

  it.each(['phone', 'tablet', 'desktop'] as const)('el Operador sí la ve en %s', (device) => {
    renderShell({ device, role: 'operador' });
    expect(screen.getByRole('button', { name: /Nueva orden/ })).not.toBeNull();
  });
});

describe('Atajos de escritorio (ui-spec §1.1)', () => {
  it.each([
    ['g', 't', '/'],
    ['g', 'd', '/dm'],
    ['g', 'b', '/buques'],
  ])('%s y luego %s van a %s', async (a, b, to) => {
    const router = renderShell({ path: '/ordenes' });
    await userEvent.keyboard(`${a}${b}`);
    expect(router.state.location.pathname).toBe(to);
  });

  it('N abre Nueva orden y / va a Buscar', async () => {
    const router = renderShell();
    await userEvent.keyboard('n');
    expect(router.state.location.pathname).toBe('/ordenes/nueva');
    await userEvent.keyboard('/');
    expect(router.state.location.pathname).toBe('/buscar');
  });

  it('no actúan mientras se escribe en un campo', async () => {
    const router = renderShell({ path: '/buscar' });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await userEvent.keyboard('n');
    expect(router.state.location.pathname).toBe('/buscar');
    input.remove();
  });

  it('Solo lectura no abre Nueva orden con N', async () => {
    const router = renderShell({ role: 'lectura' });
    await userEvent.keyboard('n');
    expect(router.state.location.pathname).toBe('/');
  });

  it('en teléfono no hay atajos', async () => {
    const router = renderShell({ device: 'phone' });
    await userEvent.keyboard('gd');
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('Elementos globales (ui-spec §1.2)', () => {
  it('sin conexión, la banda dice desde cuándo son los datos y los borradores por subir', () => {
    renderShell({ status: { ...ONLINE, online: false, pendingDrafts: 2 } });
    expect(screen.getByText('Sin conexión · datos al 14/10/2026 16:40 · 2 borradores por subir')).not.toBeNull();
  });

  it.each([
    [{ battery: 38, protected: false }, 'El servidor funciona con batería (38 %)'],
    [{ battery: 9, protected: true }, 'Servidor en modo protegido por batería baja: solo consulta'],
  ])('aviso de energía del servidor', (power, text) => {
    renderShell({ status: { ...ONLINE, power } });
    expect(screen.getByRole('status', { name: text })).not.toBeNull();
  });

  it.each(['tablet', 'desktop'] as const)('en %s la cabecera cuenta las alertas abiertas', (device) => {
    renderShell({ device, status: { ...ONLINE, alerts: 3 } });
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Alertas, 3 abiertas' })).not.toBeNull();
  });

  it('el indicador de sincronización lleva al Diagnóstico de red', async () => {
    const router = renderShell({ status: { ...ONLINE, syncing: true } });
    await userEvent.click(screen.getByRole('button', { name: 'Sincronizando' }));
    expect(router.state.location.pathname).toBe('/diagnostico');
  });

  it('al día, el indicador lo dice', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Datos al día' })).not.toBeNull();
  });

  it('en escritorio, la cabecera muestra el usuario con su rol y el cambio de tema', async () => {
    renderShell({ role: 'apoderada' });
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Ilén Fernández · Apoderada')).not.toBeNull();
    await userEvent.click(within(banner).getByRole('button', { name: 'Tema: del sistema' }));
    expect([
      document.documentElement.getAttribute('data-theme'),
      within(banner).getByRole('button', { name: 'Tema: claro' }).tagName,
    ]).toEqual(['light', 'BUTTON']);
  });
});
