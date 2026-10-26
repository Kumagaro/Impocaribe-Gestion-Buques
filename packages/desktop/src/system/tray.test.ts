import { describe, expect, it, vi } from 'vitest';
import { hideOnClose, HIDDEN_ARG, loginItem, saveFilters, startsHidden, trayMenu } from './tray.ts';

// T116 · RF-ALR-01, RF-ORD-22 y plan §10.1: la bandeja, iniciar con Windows y «Guardar como».
describe('bandeja', () => {
  it('el menú abre, cambia «Iniciar con Windows» y sale', () => {
    const actions = { open: vi.fn(), setStartWithWindows: vi.fn(), quit: vi.fn() };
    const menu = trayMenu(true, actions);
    expect(menu.map((i) => ('label' in i ? i.label : '—'))).toEqual([
      'Abrir Órdenes de Carga',
      '—',
      'Iniciar con Windows',
      '—',
      'Salir',
    ]);
    const start = menu[2] as { checked: boolean; click: (i: { checked: boolean }) => void };
    expect(start.checked).toBe(true);
    start.click({ checked: false });
    expect(actions.setStartWithWindows).toHaveBeenCalledWith(false);
    (menu[0] as { click: () => void }).click();
    (menu[4] as { click: () => void }).click();
    expect(actions.open).toHaveBeenCalledOnce();
    expect(actions.quit).toHaveBeenCalledOnce();
  });

  it('cerrar la ventana la oculta salvo al salir de verdad', () => {
    expect(hideOnClose(false)).toBe(true);
    expect(hideOnClose(true)).toBe(false);
  });

  it('iniciar con Windows la abre en la bandeja', () => {
    expect(loginItem(true)).toEqual({ openAtLogin: true, args: [HIDDEN_ARG] });
    expect(loginItem(false)).toEqual({ openAtLogin: false, args: [HIDDEN_ARG] });
    expect(startsHidden(['electron.exe', '.', HIDDEN_ARG])).toBe(true);
    expect(startsHidden(['electron.exe', '.'])).toBe(false);
  });
});

describe('«Guardar como» (RF-ORD-22)', () => {
  it.each([
    ['EAGLE1-2026-V1-0042.pdf', [{ name: 'Documento PDF', extensions: ['pdf'] }]],
    ['seguimiento-00431.PDF', [{ name: 'Documento PDF', extensions: ['pdf'] }]],
    ['datos.csv', [{ name: 'Archivo .csv', extensions: ['csv'] }]],
    ['sin-extension', []],
  ])('%s', (name, filters) => {
    expect(saveFilters(name)).toEqual(filters);
  });
});
