import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../../test/render';
import {
  DataTable,
  NavBar,
  NavRail,
  Sidebar,
  SplitView,
  Stepper,
  Tabs,
  VIRTUALIZE_ABOVE,
  type Column,
} from './structure';

// T023 · plan §7.2 y ui-spec §1.1: pestañas, pasos, vista dividida, tabla y navegación por clase.

describe('Tabs', () => {
  function Probe() {
    const [tab, setTab] = useState('ordenes');
    return (
      <Tabs
        label="Detalle del buque"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'ordenes', label: 'Órdenes', content: 'Lista de órdenes' },
          { id: 'dms', label: 'DM', content: 'Lista de DM' },
          { id: 'bitacora', label: 'Bitácora', content: 'Registro' },
        ]}
      />
    );
  }

  it('las flechas recorren las pestañas en círculo y Home y End van a los extremos', async () => {
    renderUi(<Probe />);
    screen.getByRole('tab', { name: 'Órdenes' }).focus();
    const selected = () => screen.getByRole('tab', { selected: true }).textContent;
    await userEvent.keyboard('{ArrowRight}');
    expect([selected(), document.activeElement?.textContent]).toEqual(['DM', 'DM']);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(selected()).toBe('Bitácora');
    await userEvent.keyboard('{Home}');
    expect(selected()).toBe('Órdenes');
    await userEvent.keyboard('{End}');
    expect(selected()).toBe('Bitácora');
  });

  it('solo la pestaña activa entra en el orden de Tab y su panel queda asociado', () => {
    renderUi(<Probe />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const panel = screen.getByRole('tabpanel', { name: 'Órdenes' });
    expect(panel.textContent).toBe('Lista de órdenes');
  });
});

describe('Stepper (MOV-10)', () => {
  it('marca el paso actual y los terminados', () => {
    renderUi(<Stepper steps={['Cliente', 'Chofer', 'Carga', 'Revisión']} current={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('data-state'))).toEqual(['done', 'done', 'now', 'todo']);
    expect(items[2]?.getAttribute('aria-current')).toBe('step');
  });
});

describe('SplitView', () => {
  it('muestra la lista y el detalle como regiones con nombre', () => {
    renderUi(<SplitView listLabel="DM del buque" list="lista" detailLabel="DM 00431" detail="detalle" />);
    expect([
      screen.getByRole('region', { name: 'DM del buque' }).textContent,
      screen.getByRole('region', { name: 'DM 00431' }).textContent,
    ]).toEqual(['lista', 'detalle']);
  });
});

interface Row {
  id: string;
  dm: string;
  tons: number;
}
const COLUMNS: Column<Row>[] = [
  { key: 'dm', header: 'DM', sortable: true, cell: (r) => r.dm, sortValue: (r) => r.dm },
  {
    key: 'tons',
    header: 'Toneladas',
    align: 'end',
    sortable: true,
    cell: (r) => String(r.tons),
    sortValue: (r) => r.tons,
  },
];
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, dm: `DM ${String(i).padStart(5, '0')}`, tons: (i * 7) % 13 }));
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1] as HTMLElement).queryAllByRole('row');

describe('DataTable', () => {
  it('ordena al pulsar la cabecera, primero ascendente y luego descendente, y lo anuncia con aria-sort', async () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(4)} />);
    const header = screen.getByRole('columnheader', { name: /Toneladas/ });
    expect(header.getAttribute('aria-sort')).toBe('none');
    await userEvent.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(bodyRows().map((r) => r.lastElementChild?.textContent)).toEqual(['0', '1', '7', '8']);
    await userEvent.click(within(header).getByRole('button'));
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(bodyRows().map((r) => r.lastElementChild?.textContent)).toEqual(['8', '7', '1', '0']);
  });

  it(`con ${VIRTUALIZE_ABOVE} filas o menos las pinta todas y anima las altas (MOV-02)`, () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(VIRTUALIZE_ABOVE)} />);
    const table = screen.getByRole('table');
    expect([table.getAttribute('data-virtual'), bodyRows().length]).toEqual(['false', VIRTUALIZE_ABOVE]);
    expect(bodyRows()[0]?.getAttribute('data-motion')).toBe('enter');
  });

  it(`por encima de ${VIRTUALIZE_ABOVE} filas virtualiza y no anima reordenamientos`, async () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(1000)} viewportHeight={480} />);
    const table = screen.getByRole('table');
    expect([table.getAttribute('data-virtual'), table.getAttribute('aria-rowcount')]).toEqual(['true', '1001']);
    expect(bodyRows().length).toBeLessThan(40);
    expect(bodyRows().every((r) => r.getAttribute('data-motion') === null)).toBe(true);
    await userEvent.click(within(screen.getByRole('columnheader', { name: /Toneladas/ })).getByRole('button'));
    expect(bodyRows().every((r) => r.getAttribute('data-motion') === null)).toBe(true);
  });

  it('al desplazarse pinta las filas de esa altura', () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(1000)} viewportHeight={480} />);
    const scroller = screen.getByRole('table').parentElement as HTMLElement;
    scroller.scrollTop = 500 * 36;
    fireEvent.scroll(scroller);
    const first = bodyRows()[0];
    expect(Number(first?.getAttribute('aria-rowindex'))).toBeGreaterThan(480);
    expect(screen.getByText('DM 00500')).not.toBeNull();
  });

  it('con movimiento reducido las altas no se animan', () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(3)} />, { reduceMotion: true });
    expect(bodyRows()[0]?.getAttribute('data-motion')).toBe('static');
  });

  it('una fila con acción se abre con Enter', async () => {
    const onRowClick = vi.fn();
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={rows(2)} onRowClick={onRowClick} />);
    bodyRows()[1]?.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('sin filas muestra el estado vacío', () => {
    renderUi(<DataTable caption="DM" columns={COLUMNS} rows={[]} empty="No hay DM en este buque." />);
    expect(screen.getByText('No hay DM en este buque.')).not.toBeNull();
  });
});

const NAV = [
  { id: 'inicio', label: 'Inicio', icon: <svg /> },
  { id: 'buques', label: 'Buques', icon: <svg /> },
  { id: 'alertas', label: 'Alertas', icon: <svg />, badge: 3 },
];

describe('Navegación', () => {
  it.each([
    ['NavBar', NavBar, 'phone'],
    ['NavRail', NavRail, 'tablet'],
    ['Sidebar', Sidebar, 'desktop'],
  ] as const)('%s marca la pantalla actual y navega al pulsar', async (_name, Nav, device) => {
    const onNavigate = vi.fn();
    renderUi(<Nav items={NAV} current="buques" onNavigate={onNavigate} />, { device });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('button', { name: 'Buques' }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(within(nav).getByRole('button', { name: /Alertas/ }));
    expect(onNavigate).toHaveBeenCalledWith('alertas');
  });

  it('el contador de alertas forma parte del nombre del botón', () => {
    renderUi(<NavBar items={NAV} current="inicio" onNavigate={() => undefined} />, { device: 'phone' });
    expect(screen.getByRole('button', { name: 'Alertas, 3 abiertas' })).not.toBeNull();
  });

  it('la barra inferior tiene objetivos táctiles', () => {
    renderUi(<NavBar items={NAV} current="inicio" onNavigate={() => undefined} />, { device: 'phone' });
    expect(screen.getByRole('button', { name: 'Inicio' }).getAttribute('data-touch')).toBe('true');
  });

  it('la acción principal solo aparece si se pasa (Solo lectura no la recibe)', () => {
    const { unmount } = renderUi(<NavBar items={NAV} current="inicio" onNavigate={() => undefined} />, {
      device: 'phone',
    });
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).toBeNull();
    unmount();
    renderUi(
      <NavBar
        items={NAV}
        current="inicio"
        onNavigate={() => undefined}
        primary={{ label: 'Nueva orden', icon: <svg />, onClick: () => undefined }}
      />,
      { device: 'phone' },
    );
    expect(screen.getByRole('button', { name: 'Nueva orden' })).not.toBeNull();
  });

  it('el menú lateral muestra el atajo de cada entrada', () => {
    renderUi(
      <Sidebar
        items={[{ id: 'buques', label: 'Buques', icon: <svg />, shortcut: 'Ctrl+2' }]}
        current="buques"
        onNavigate={() => undefined}
      />,
    );
    const button = screen.getByRole('button', { name: /Buques/ });
    expect([button.getAttribute('aria-keyshortcuts'), within(button).getByText('Ctrl+2').tagName]).toEqual([
      'Control+2',
      'KBD',
    ]);
  });
});
