import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import { createSimulatedNetwork } from '../../platform/test-discovery';
import { DiagnosticsScreen } from './Diagnostics.screen';
import { relativeTime } from './useDiagnostics';

// T048 · P-30 Diagnóstico de red (ui-spec), RF-RED-06: semáforo con un mensaje claro, el detalle y qué hacer, en las
// tres clases. Sin servidor, la búsqueda prueba todos los métodos (unos 9 s).
vi.setConfig({ testTimeout: 30_000 });

const SERVER = {
  address: 'servidor.test',
  port: 443,
  serverId: TEST_PAIRING.serverId,
  caFingerprint: TEST_PAIRING.caFingerprint,
  version: '1.0.0',
};

const open = (network: ReturnType<typeof createSimulatedNetwork>, options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<DiagnosticsScreen />, { path: '/diagnostico', discovery: network, ...options });

/** El valor de una fila del detalle ("Red wifi" → "IMPOCARIBE-WIFI"). */
const detail = (label: string) => {
  const term = within(screen.getByRole('list', { name: 'Detalle de la conexión' })).getByText(label);
  return term.nextElementSibling!.textContent;
};

describe('relativeTime', () => {
  const now = new Date('2026-10-14T16:40:00.000Z');
  it.each([
    ['2026-10-14T16:39:56.000Z', 'hace 4 segundos'],
    ['2026-10-14T16:39:59.000Z', 'hace 1 segundo'],
    ['2026-10-14T16:34:00.000Z', 'hace 6 minutos'],
    ['2026-10-14T16:39:00.000Z', 'hace 1 minuto'],
    ['2026-10-14T14:41:00.000Z', 'hace 119 minutos'],
    ['2026-10-14T14:40:00.000Z', 'el 14/10/2026 10:40'],
  ])('%s → %s', (iso, text) => {
    expect(relativeTime(iso, now)).toBe(text);
  });
});

describe('P-30 en las tres clases', () => {
  it.each([
    ['phone', 'stack'],
    ['tablet', 'columns'],
    ['desktop', 'columns'],
  ] as const)('%s: todo bien, con el detalle de la conexión', async (device, layout) => {
    await open(createSimulatedNetwork({ servers: [SERVER] }), { device });
    const light = await screen.findByRole('status', { name: 'Todo bien' });
    expect(light.textContent).toContain('El servidor responde y su identidad está verificada.');
    expect(document.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe(layout);
    expect(detail('Red wifi')).toBe('IMPOCARIBE-WIFI');
    expect(detail('Método')).toBe('Última dirección conocida');
    expect(detail('Dirección')).toBe('servidor.test:443');
    expect(detail('Tiempo de respuesta')).toMatch(/^\d+ ms$/);
    expect(detail('Identidad')).toBe('IMPOCARIBE-7F3C · Verificada');
    expect(detail('Última sincronización')).toBe('—');
    expect(screen.queryByRole('list', { name: 'Qué hacer' })).toBeNull();
  });
});

describe('RF-RED-06: por qué no se encuentra el servidor', () => {
  it('servidor apagado: "El servidor no responde" y los pasos a seguir', async () => {
    await open(createSimulatedNetwork({ servers: [] }));
    const light = await screen.findByRole('status', { name: 'El servidor no responde' }, { timeout: 15_000 });
    expect(light.textContent).toContain('No hay respuesta desde que se abrió la app.');
    expect(
      within(screen.getByRole('list', { name: 'Qué hacer' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Compruebe que la PC servidor está encendida y no está en suspensión.',
      'Compruebe que este dispositivo está en la misma red wifi que la PC servidor.',
      'Si nada cambia, avise a la Apoderada.',
    ]);
    expect(detail('Dirección')).toBe('servidor.test:443');
    expect(detail('Tiempo de respuesta')).toBe('Sin respuesta');
  });

  it('red que aísla a los equipos: lo detecta y explica qué cambiar en el router', async () => {
    await open(createSimulatedNetwork({ servers: [SERVER], isolated: true }));
    const light = await screen.findByRole(
      'status',
      { name: 'La red bloquea la comunicación entre equipos' },
      { timeout: 15_000 },
    );
    expect(light.textContent).toContain('Este dispositivo llega al router, pero no a los demás equipos de la red.');
    expect(within(screen.getByRole('list', { name: 'Qué hacer' })).getAllByRole('listitem')[0]!.textContent).toBe(
      'En el router o en el celular que hace de hotspot, desactive el «aislamiento de clientes» (AP isolation).',
    );
  });

  it('sin red: lo dice', async () => {
    await open(createSimulatedNetwork({ servers: [SERVER], connected: false }));
    expect(
      await screen.findByRole(
        'status',
        { name: 'Este dispositivo no está conectado a ninguna red' },
        { timeout: 15_000 },
      ),
    ).not.toBeNull();
    expect(detail('Red wifi')).toBe('Sin red');
  });

  it('con sesión, la última respuesta es la de la última sincronización', async () => {
    await open(createSimulatedNetwork({ servers: [] }), {
      session: { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: {} as never },
      online: false,
      local: [],
    });
    const light = await screen.findByRole('status', { name: 'El servidor no responde' }, { timeout: 15_000 });
    // La copia del helper se sincronizó a FIXED_TIME, la misma hora del reloj de la prueba.
    expect(light.textContent).toContain('Última respuesta hace 0 segundos.');
    expect(detail('Última sincronización')).toBe('hace 0 segundos');
  });
});

describe('volver a probar', () => {
  it('mientras prueba, lo indica; al terminar se puede repetir', async () => {
    const network = createSimulatedNetwork({ servers: [SERVER] });
    await open(network);
    expect(screen.getByRole('status', { name: 'Comprobando la conexión…' })).not.toBeNull();
    await screen.findByRole('status', { name: 'Todo bien' });
    const probes = network.probed.length;
    await userEvent.click(screen.getByRole('button', { name: 'Volver a probar' }));
    await waitFor(() => expect(network.probed.length).toBeGreaterThan(probes));
    expect(await screen.findByRole('status', { name: 'Todo bien' })).not.toBeNull();
  });

  it('sin emparejar, busca cualquier servidor y lo dice', async () => {
    await open(createSimulatedNetwork({ servers: [SERVER] }), { pairing: null });
    await screen.findByRole('status', { name: 'Todo bien' });
    expect(detail('Identidad')).toBe('IMPOCARIBE-7F3C · Sin emparejar');
    expect(detail('Método')).toBe('Anuncio del servidor en la red');
  });
});
