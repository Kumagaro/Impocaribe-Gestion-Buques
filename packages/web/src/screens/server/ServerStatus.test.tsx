import type { SetupMessage, SetupOperation, SetupOutcome, SetupRequest } from '@impocaribe/shared';
import { userDtoSchema, type ServerStatus } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import { devicesApi, localApi } from '../../api/endpoints/local';
import { postLocalQr } from '../../api/endpoints/pairing';
import type { ServerSetup } from '../../platform/platform';
import type { StoredSession } from '../../session/app-session';
import { PairingAttention } from './PairingAttention';
import { ServerStatusScreen } from './ServerStatus.screen';

// T128 · P-29 Estado del servidor (ui-spec P-29, maqueta T124), RF-INS-04, RF-RED-04, 05, RF-INS-11, RNF-21 y AL-22:
// el hook real con el servidor falso y el ayudante simulado (el real pide el permiso de Windows; T135).
vi.setConfig({ testTimeout: 40_000 });

const SERVER_PC = { ...TEST_PAIRING, isServerPc: true };
const MB = 2 ** 20;
const STATUS: ServerStatus = {
  serverId: '7f3c2a10-1b2c-4d5e-8f90-abcdef123456',
  version: '1.4.0',
  startedAt: '2026-10-11T12:40:00.000Z',
  power: { onBattery: true, percent: 62, protected: false },
  network: { setup: 'hotspot', address: '192.168.43.20', port: 8443 },
  devices: Array.from({ length: 9 }, (_, i) => ({
    id: `dev-${i}`,
    name: i === 0 ? 'PC SERVIDOR' : `Teléfono ${i}`,
    platform: i === 0 ? ('windows' as const) : ('android' as const),
    pairedAt: '2026-10-14T15:00:00.000Z',
    pairedMethod: i === 0 ? ('local' as const) : ('code' as const),
    lastSeenAt: '2026-10-14T16:00:00.000Z',
    connected: i < 8,
  })),
  memory: { budgetBytes: 1.2 * 1024 * MB, serviceBytes: 184 * MB, databaseBytes: 268 * MB, pdfBytes: null },
};
const REQUEST = {
  id: '0199f0a1-0000-7000-8000-000000000001',
  deviceName: 'Teléfono de patio',
  platform: 'android' as const,
  code: '781975',
  expiresAt: '2026-10-14T16:44:12.000Z',
};
const APODERADA: StoredSession = {
  token: 't',
  expiresAt: '2026-10-15T16:40:00.000Z',
  user: sampleOf(userDtoSchema, {
    fullName: 'Ilén Fernández',
    role: 'apoderada',
    nationalId: '85020306548',
    phone: '52345678',
    mustChangePassword: false,
  }),
};

function fakeSetup(outcome: SetupOutcome, bundleVersion: string | null = '1.4.0') {
  let listener: (m: SetupMessage) => void = () => undefined;
  const runs: { operation: SetupOperation; request: SetupRequest }[] = [];
  const setup: ServerSetup = {
    bundleVersion,
    readMove: vi.fn(),
    pickFile: vi.fn(),
    pickFolder: async () => 'E:\\',
    facts: vi.fn(),
    checkCode: vi.fn(),
    state: async () => ({ running: false, operation: null, messages: [] }),
    listen: (l) => (listener = l),
    run: async (operation, request) => {
      runs.push({ operation, request });
      listener({ type: 'plan', steps: [{ id: 'restablecer', title: 'Restablecer la contraseña' }] });
      listener({ type: 'step', id: 'restablecer', status: 'done' });
      return outcome;
    },
  };
  return { setup, runs };
}

async function open(options: Parameters<typeof renderScreen>[1] = {}) {
  return renderScreen(<ServerStatusScreen />, {
    path: '/servidor',
    pairing: SERVER_PC,
    ...options,
    before: (s) => {
      s.respond(localApi.status, STATUS);
      s.respond(localApi.pairing, [REQUEST]);
      s.respond(localApi.confirm, { deviceId: 'dev-nuevo' });
      s.respond(localApi.reject, { rejected: true });
      s.respond(localApi.apoderadas, [{ username: 'ilen.fernandez', fullName: 'Ilén Fernández' }]);
      s.respond(postLocalQr, {
        qrToken: 'token-qr',
        serverId: STATUS.serverId,
        caFingerprint: 'AB:CD',
        expiresAt: '2026-10-14T16:45:00.000Z',
      });
      s.respond(devicesApi.revoke);
      options.before?.(s);
    },
  });
}

describe('P-29 Estado del servidor', () => {
  it('servicio, energía, red, memoria, aviso de hotspot, solicitudes, dispositivos y QR', async () => {
    await open();
    const service = await screen.findByRole('region', { name: 'Servicio' });
    expect(service.textContent).toBe('ServicioEn marchaVersión 1.4.0 · encendido hace 3 d 4 h');
    expect(screen.getByRole('region', { name: 'Energía' }).textContent).toContain('Con batería · 62 %');
    expect(screen.getByRole('region', { name: 'Red' }).textContent).toContain(
      'Hotspot de un celular192.168.43.20 · puerto 8443 · 8 conectados',
    );
    expect(screen.getByRole('region', { name: 'Memoria' }).textContent).toContain(
      '452 MB de 1,2 GBBase de datos 268 MB · servicio 184 MB · PDF cerrado',
    );
    expect(screen.getByText(/8 dispositivos conectados al hotspot\. Es el límite recomendado/)).not.toBeNull();
    expect(screen.getByLabelText('Código 7 8 1 9 7 5').textContent).toBe('781 975');
    expect(screen.getByText('8 conectados ahora · 9 emparejados')).not.toBeNull();
    expect(await screen.findByRole('img', { name: 'QR para emparejar con IMPOCARIBE-7F3C' })).not.toBeNull();
    // Sin sesión de Apoderada no se revoca.
    expect(screen.queryByRole('button', { name: 'Revocar' })).toBeNull();
  });

  it('confirmar una solicitud la empareja; rechazar la descarta', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText('«Teléfono de patio» quedó emparejado.')).not.toBeNull();
    expect(t.server.calls.some((c) => c.method === 'POST' && c.path === `/local/pairing/${REQUEST.id}/confirm`)).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(await screen.findByText('Se rechazó «Teléfono de patio».')).not.toBeNull();
  });

  it('una Apoderada con sesión revoca un dispositivo (no la propia PC servidor)', async () => {
    const t = await open({ session: APODERADA });
    const rows = await screen.findAllByRole('button', { name: 'Revocar' });
    expect(rows).toHaveLength(8);
    const phone = screen.getByRole('row', { name: /Teléfono 3/ });
    await userEvent.click(within(phone).getByRole('button', { name: 'Revocar' }));
    expect(await screen.findByText('Se revocó «Teléfono 3»: tendrá que volver a emparejarse.')).not.toBeNull();
    expect(t.server.calls.some((c) => c.method === 'POST' && c.path === '/devices/dev-3/revoke')).toBe(true);
  });

  it('restablecimiento de emergencia: la Apoderada de la lista, contraseña confirmada y código, por el ayudante', async () => {
    const { setup, runs } = fakeSetup({ ok: true });
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Restablecer la contraseña de una Apoderada' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restablecer la contraseña de una Apoderada' });
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: 'Ilén Fernández (ilen.fernandez)' })).not.toBeNull(),
    );
    await userEvent.selectOptions(within(dialog).getByLabelText('Apoderada'), 'ilen.fernandez');
    await userEvent.type(within(dialog).getByLabelText('Contraseña temporal'), 'temporal-2026');
    await userEvent.type(within(dialog).getByLabelText('Confirmar'), 'temporal-2026');
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'k7qm3xtpr2hw');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restablecer' }));
    expect(
      await within(dialog).findByText(
        'Contraseña restablecida: deberá cambiarla al entrar. Se cerraron sus sesiones y las Apoderadas recibieron el aviso.',
      ),
    ).not.toBeNull();
    expect(runs).toEqual([
      {
        operation: 'restablecer',
        request: { username: 'ilen.fernandez', password: 'temporal-2026', code: 'K7QM-3XTP-R2HW' },
      },
    ]);
  });

  it('reparar con un código que no es el del servidor lo dice', async () => {
    const { setup, runs } = fakeSetup({ ok: false, step: 'permisos', error: 'INSTALL_CODE_INVALID' });
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Reparar el servidor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reparar el servidor' });
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HX');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reparar el servidor' }));
    expect(
      await within(dialog).findByText('El código de instalación no es correcto. Revíselo en la hoja impresa.'),
    ).not.toBeNull();
    expect(runs).toEqual([{ operation: 'reparar', request: { code: 'K7QM-3XTP-R2HX' } }]);
  });

  // T129 · RF-INS-06: actualizar con el instalador completo nuevo, con la vuelta atrás si falla.
  it('sin un instalador más nuevo, actualizar está desactivado y dice por qué', async () => {
    await open({ serverSetup: fakeSetup({ ok: true }, '1.4.0').setup });
    const button = await screen.findByRole('button', { name: 'Actualizar el servidor' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText('Para actualizar, instale en esta PC el instalador completo de la versión nueva.'),
    ).not.toBeNull();
  });

  it('con el instalador de la 1.5.0 actualiza con el código del servidor', async () => {
    const { setup, runs } = fakeSetup({ ok: true }, '1.5.0');
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar el servidor a la 1.5.0' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actualizar el servidor' });
    expect(within(dialog).getByText(/Pasa el servidor de la 1\.4\.0 a la 1\.5\.0/)).not.toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actualizar el servidor' }));
    expect(
      await within(dialog).findByText(
        'El servidor quedó actualizado y en marcha. Las apps de los dispositivos se avisan de la versión nueva.',
      ),
    ).not.toBeNull();
    expect(runs).toEqual([{ operation: 'actualizar', request: { code: 'K7QM-3XTP-R2HW' } }]);
  });

  it('si la actualización falla y vuelve atrás, lo dice: no se perdió nada', async () => {
    const { setup } = fakeSetup(
      { ok: false, step: 'estructura', error: 'migración 0017 falló', rolledBack: true },
      '1.5.0',
    );
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Actualizar el servidor a la 1.5.0' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actualizar el servidor' });
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Actualizar el servidor' }));
    expect(
      await within(dialog).findByText(
        'La actualización no se completó. El servidor volvió a la versión anterior con sus datos intactos: no se perdió nada y los dispositivos siguen conectados.',
      ),
    ).not.toBeNull();
  });

  // T130 · RF-INS-07: preparar el traslado (archivo en una USB, contraseña de respaldo, confirmación y código).
  it('preparar el traslado: dónde, la contraseña, la confirmación y el código; el archivo lleva el nombre del servidor', async () => {
    const { setup, runs } = fakeSetup({ ok: true });
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar traslado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preparar traslado' });
    expect(within(dialog).getByText('Esta PC no podrá volver a ser el servidor.')).not.toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Contraseña de respaldo'), 'respaldo de prueba 2026');
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preparar traslado' }));
    expect(await within(dialog).findByText('Elija dónde guardar el archivo de traslado.')).not.toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elegir la carpeta' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preparar traslado' }));
    expect(
      await within(dialog).findByText('Marque que entiende que esta PC dejará de ser el servidor.'),
    ).not.toBeNull();
    expect(runs).toEqual([]);
    await userEvent.click(within(dialog).getByLabelText('Entiendo que esta PC dejará de ser el servidor'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preparar traslado' }));
    expect(
      await within(dialog).findByText(
        /Archivo de traslado creado: E:\\IMPOCARIBE-7F3C-2026-10-14\.icmove\. Este servidor quedó detenido\./,
      ),
    ).not.toBeNull();
    expect(runs).toEqual([
      {
        operation: 'trasladar',
        request: {
          code: 'K7QM-3XTP-R2HW',
          password: 'respaldo de prueba 2026',
          dest: 'E:\\IMPOCARIBE-7F3C-2026-10-14.icmove',
        },
      },
    ]);
  });

  it('con otra contraseña de respaldo lo dice en palabras', async () => {
    const { setup } = fakeSetup({
      ok: false,
      step: 'archivo',
      error: 'node.exe terminó con 3: BACKUP_PASSWORD_INVALID: La contraseña de respaldo no es correcta.',
    });
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Preparar traslado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preparar traslado' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Elegir la carpeta' }));
    await userEvent.type(within(dialog).getByLabelText('Contraseña de respaldo'), 'otra');
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(within(dialog).getByLabelText('Entiendo que esta PC dejará de ser el servidor'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Preparar traslado' }));
    expect(await within(dialog).findByText('La contraseña de respaldo no es correcta.')).not.toBeNull();
  });

  // T131 · RF-INS-08: desinstalar. Sin escribir DESINSTALAR no procede; con «Borrar también los datos», lo dice.
  it('desinstalar: sin la palabra no procede; con ella y el código, por el ayudante', async () => {
    const { setup, runs } = fakeSetup({ ok: true });
    await open({ serverSetup: setup });
    await userEvent.click(await screen.findByRole('button', { name: 'Desinstalar el servidor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desinstalar el servidor' });
    expect(within(dialog).getByText('Los dispositivos no podrán conectarse.')).not.toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Escriba DESINSTALAR para confirmar'), 'desinstalar');
    await userEvent.type(within(dialog).getByLabelText('Código de instalación'), 'K7QM-3XTP-R2HW');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desinstalar' }));
    expect(
      (await within(dialog).findAllByText('Escriba exactamente DESINSTALAR, en mayúsculas.')).length,
    ).toBeGreaterThan(0);
    expect(runs).toEqual([]);

    await userEvent.clear(within(dialog).getByLabelText('Escriba DESINSTALAR para confirmar'));
    await userEvent.type(within(dialog).getByLabelText('Escriba DESINSTALAR para confirmar'), 'DESINSTALAR');
    await userEvent.click(within(dialog).getByLabelText('Borrar también los datos'));
    expect(within(dialog).getByText(/Se borran los datos; solo se conserva el respaldo final/)).not.toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Desinstalar' }));
    expect(
      await within(dialog).findByText(
        /^El servidor se desinstaló\. Se borraron los datos; el respaldo final quedó en C:.ProgramData.Impocaribe.desinstalado-2026-10-14\./,
      ),
    ).not.toBeNull();
    expect(runs).toEqual([
      { operation: 'desinstalar', request: { code: 'K7QM-3XTP-R2HW', confirm: 'DESINSTALAR', wipe: true } },
    ]);
  });

  it('sin el instalador completo no hay mantenimiento', async () => {
    await open();
    expect(
      await screen.findByText('El mantenimiento se hace desde la app que puso el instalador completo.'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Reparar el servidor' })).toBeNull();
  });
});

describe('AL-22: solicitud nueva en cualquier pantalla de la PC servidor', () => {
  it('trae la ventana al frente una vez y se confirma desde el aviso', async () => {
    const attention = vi.fn(async () => undefined);
    const t = await renderScreen(<PairingAttention />, {
      path: '/ordenes',
      pairing: SERVER_PC,
      attention,
      before: (s) => {
        s.respond(localApi.pairing, [REQUEST]);
        s.respond(localApi.confirm, { deviceId: 'dev-nuevo' });
      },
    });
    const toast = await screen.findByRole('alertdialog', { name: 'Solicitud de emparejamiento' }, { timeout: 5000 });
    expect(within(toast).getByLabelText('Código 7 8 1 9 7 5').textContent).toBe('781 975');
    await userEvent.click(within(toast).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(attention).toHaveBeenCalledTimes(1);
    expect(t.server.calls.some((c) => c.path === `/local/pairing/${REQUEST.id}/confirm`)).toBe(true);
  });

  it('fuera de la PC servidor no pregunta nada', async () => {
    const t = await renderScreen(<PairingAttention />, { path: '/ordenes', pairing: TEST_PAIRING });
    await new Promise((r) => setTimeout(r, 300));
    expect(t.server.calls).toEqual([]);
  });
});
