import { pairingCode } from '@impocaribe/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import {
  getDiscovery,
  getPairingRequest,
  postPairingQr,
  postPairingRequest,
  postPairSelf,
} from '../../api/endpoints/pairing';
import type { DeviceInfo } from '../../platform/platform';
import { createSimulatedNetwork } from '../../platform/test-discovery';
import { ConnectionScreen } from './Connection.screen';

// T038 · P-01 Conexión y emparejamiento (ui-spec), RF-CON-01, RF-RED-02 a 04, F-01: el hook real, las tres
// presentaciones y la red simulada (test-discovery).
vi.setConfig({ testTimeout: 30_000 });

const SERVER = {
  address: 'servidor.test',
  port: 443,
  serverId: TEST_PAIRING.serverId,
  caFingerprint: 'AA:BB:CC:DD:EE:FF:00:11',
  version: '1.0.0',
};
const ANDROID: DeviceInfo = {
  platform: 'android',
  appVersion: '1.0.0',
  smallestWidthDp: 360,
  name: 'Teléfono de patio',
};
const REQUEST = {
  requestId: '0199f0a1-0000-7000-8000-000000000001',
  serverNonce: 'nonce-del-servidor',
  expiresAt: '2026-10-14T16:45:00.000Z',
};

const open = (options: Parameters<typeof renderScreen>[1] = {}) =>
  renderScreen(<ConnectionScreen />, {
    path: '/conexion',
    pairing: null,
    deviceInfo: ANDROID,
    discovery: createSimulatedNetwork({ servers: [SERVER] }),
    otherRoutes: ['/login'],
    ...options,
  });

describe('P-01 en las tres clases', () => {
  it.each([
    ['phone', 'fullscreen'],
    ['tablet', 'card'],
    ['desktop', 'card'],
  ] as const)(
    '%s: encuentra el servidor sin escribir nada, se empareja por código y va al login',
    async (device, layout) => {
      const t = await open({
        device,
        before: (s) => {
          s.respond(postPairingRequest, REQUEST);
          s.respond(getPairingRequest, { status: 'confirmed', deviceId: 'dev-1', deviceSecret: 'secreto-1' });
        },
      });
      expect(screen.getByRole('main').getAttribute('data-layout')).toBe(layout);
      expect(await screen.findByRole('heading', { name: 'Servidor encontrado' })).not.toBeNull();
      expect(screen.getByText('IMPOCARIBE-7F3C')).not.toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Emparejar con código' }));
      expect(await screen.findByRole('heading', { name: 'Emparejado con IMPOCARIBE-7F3C' })).not.toBeNull();
      expect(t.server.calls.find((c) => c.path === '/pairing/requests')!.body).toMatchObject({
        deviceName: 'Teléfono de patio',
        platform: 'android',
      });
      expect(t.session.getState().pairing).toEqual({
        serverId: SERVER.serverId,
        caFingerprint: SERVER.caFingerprint,
        lastAddress: { address: 'servidor.test', port: 443 },
        serverName: 'IMPOCARIBE-7F3C',
        deviceName: 'Teléfono de patio',
        isServerPc: false,
        deviceId: 'dev-1',
        deviceSecret: 'secreto-1',
      });
      await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
      expect(t.router.state.location.pathname).toBe('/login');
    },
  );
});

describe('RF-RED-04: el código', () => {
  it('muestra el código que sale de la huella que ve, de su nonce y del del servidor, con la cuenta atrás', async () => {
    const t = await open({
      before: (s) => {
        s.respond(postPairingRequest, REQUEST);
        s.respond(getPairingRequest, { status: 'pending' });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Emparejar con código' }));
    await screen.findByRole('heading', { name: 'Confirme este código en la pantalla del servidor' });
    const clientNonce = (t.server.calls.find((c) => c.path === '/pairing/requests')!.body as { clientNonce: string })
      .clientNonce;
    const code = await pairingCode(SERVER.caFingerprint, clientNonce, REQUEST.serverNonce);
    expect(screen.getByText(`${code.slice(0, 3)} ${code.slice(3)}`)).not.toBeNull();
    // FIXED_TIME es 16:40 y la solicitud caduca a las 16:45.
    expect(screen.getByText('El código caduca en 5:00')).not.toBeNull();
    expect(screen.getByText('Identidad aabbccdd… · servidor.test')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Servidor encontrado' })).not.toBeNull();
  });

  it('si se rechaza en el servidor, lo dice y deja volver a intentarlo', async () => {
    await open({
      before: (s) => {
        s.respond(postPairingRequest, REQUEST);
        s.respond(getPairingRequest, {
          code: 'PAIRING_REJECTED',
          message: 'El emparejamiento se rechazó en la pantalla del servidor.',
        });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Emparejar con código' }));
    expect((await screen.findByRole('alert')).textContent).toContain('se rechazó');
    expect(screen.getByRole('button', { name: 'Emparejar con código' })).not.toBeNull();
  });
});

describe('RF-RED-04: QR (TEL y TAB)', () => {
  const qr = {
    serverId: SERVER.serverId,
    caFingerprint: SERVER.caFingerprint,
    qrToken: 'token-qr',
    address: 'servidor.test',
    port: 443,
  };

  it('empareja sin código con el QR del servidor', async () => {
    const t = await open({
      device: 'phone',
      scanQr: async () => JSON.stringify(qr),
      before: (s) => {
        s.respond(getDiscovery, {
          serverId: SERVER.serverId,
          name: 'IMPOCARIBE-7F3C',
          version: '1.0.0',
          caFingerprint: SERVER.caFingerprint,
        });
        s.respond(postPairingQr, { deviceId: 'dev-qr', deviceSecret: 'secreto-qr' });
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Escanear QR del servidor' }));
    expect(await screen.findByRole('heading', { name: 'Emparejado con IMPOCARIBE-7F3C' })).not.toBeNull();
    expect(t.session.getState().pairing).toMatchObject({ deviceId: 'dev-qr', isServerPc: false });
  });

  it('un QR que no es del servidor se rechaza; en escritorio no se ofrece la cámara', async () => {
    const tablet = await open({ device: 'tablet', scanQr: async () => 'https://ejemplo.com' });
    await userEvent.click(await screen.findByRole('button', { name: 'Escanear QR del servidor' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ese QR no es el de un servidor de Órdenes de Carga.');
    tablet.view.unmount();
    await open({ device: 'desktop', scanQr: async () => 'x' });
    await screen.findByRole('heading', { name: 'Servidor encontrado' });
    expect(screen.queryByRole('button', { name: 'Escanear QR del servidor' })).toBeNull();
  });
});

describe('P-01: en la PC servidor', () => {
  it('se empareja sola por la interfaz local y lo recuerda como PC servidor', async () => {
    const t = await open({
      deviceInfo: { platform: 'windows', appVersion: '1.0.0', smallestWidthDp: 768, name: 'PC-SERVIDOR' },
      discovery: createSimulatedNetwork({ servers: [{ ...SERVER, address: '127.0.0.1', port: 8443 }] }),
      before: (s) => s.respond(postPairSelf, { deviceId: 'dev-local', deviceSecret: 'secreto-local' }),
    });
    expect(await screen.findByRole('heading', { name: 'Emparejado con IMPOCARIBE-7F3C' })).not.toBeNull();
    expect(t.server.calls.find((c) => c.path === '/local/pair-self')!.body).toEqual({
      deviceName: 'PC-SERVIDOR',
      platform: 'windows',
    });
    expect(t.session.getState().pairing).toMatchObject({
      isServerPc: true,
      lastAddress: { address: '127.0.0.1', port: 8443 },
    });
  });
});

describe('RF-RED-02 y F-01: sin servidor en la red', () => {
  it('prueba los métodos en orden, explica qué revisar y deja escribir la dirección', async () => {
    const net = createSimulatedNetwork({
      multicastBlocked: true,
      broadcastBlocked: true,
      servers: [{ ...SERVER, address: 'pc-servidor', port: 8443 }],
    });
    await open({ discovery: net });
    const methods = await screen.findByRole('list', { name: 'Métodos de búsqueda' });
    await waitFor(() =>
      expect(methods.querySelector('[aria-current="step"]')!.textContent).toBe('Anuncio del servidor en la red'),
    );
    expect(
      await screen.findByRole('heading', { name: 'No se encontró el servidor' }, { timeout: 15_000 }),
    ).not.toBeNull();
    expect(net.probed).toContain('192.168.1.254');

    await userEvent.click(screen.getByRole('button', { name: 'Opciones avanzadas' }));
    await userEvent.type(screen.getByLabelText('Dirección'), '192.168.1.300');
    await userEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(screen.getByText(/Escriba una dirección IPv4/)).not.toBeNull();
    await userEvent.clear(screen.getByLabelText('Dirección'));
    await userEvent.type(screen.getByLabelText('Dirección'), 'PC-SERVIDOR');
    await userEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(await screen.findByRole('heading', { name: 'Servidor encontrado' })).not.toBeNull();
    expect(screen.getByText('Encontrado por la dirección escrita · pc-servidor')).not.toBeNull();
  });
});
