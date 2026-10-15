import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NATIONAL_ID_DATE_WARNING } from '@impocaribe/shared';
import { userDtoSchema } from '@impocaribe/shared/validation';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen, TEST_PAIRING } from '../../../test/screen';
import { getSetupStatus, postLogin, postSetup } from '../../api/endpoints/auth';
import { SetupScreen } from './Setup.screen';

// T038 · P-02 Primer arranque (ui-spec), RF-USR-05, RF-REC-01, F-02: el hook real y las tres presentaciones.
// Muchos campos escritos tecla a tecla superan los 5 s por defecto en una máquina cargada.
vi.setConfig({ testTimeout: 20_000 });

const SERVER_PC = { ...TEST_PAIRING, isServerPc: true };
const USER = sampleOf(userDtoSchema, { username: 'ilen.fernandez', role: 'apoderada', nationalId: '84011905548', phone: '52345678' });
const CODES = ['K7QM-3XTP', 'R2HW-9CND', 'F4ZB-7MRK', 'T8JX-2QPV', 'W3NC-6HDF', 'P9KR-4TZM', 'H6VQ-8BXN', 'M2DT-5WJC'];
const LOGIN = { token: 'token-1', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };

async function open(options: Parameters<typeof renderScreen>[1] = {}) {
  const t = await renderScreen(<SetupScreen />, {
    path: '/setup',
    pairing: SERVER_PC,
    otherRoutes: ['/', '/login'],
    ...options,
    before: (server) => {
      server.respond(getSetupStatus, { configured: false });
      server.respond(postSetup, { user: USER, recoveryCodes: CODES });
      server.respond(postLogin, LOGIN);
      options.before?.(server);
    },
  });
  return t;
}

async function stepOne(nationalId = '84011905548') {
  // Con '' deja el carné como esté.
  await userEvent.type(await screen.findByLabelText('Nombre y apellidos'), 'Ilen Fernández Ruiz');
  await userEvent.type(screen.getByLabelText('Usuario'), 'ilen.fernandez');
  if (nationalId) await userEvent.type(screen.getByLabelText('Carné de identidad'), nationalId);
  await userEvent.type(screen.getByLabelText('Teléfono'), '52345678');
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}
async function stepTwo() {
  await userEvent.type(await screen.findByLabelText('Contraseña'), 'contraseña1');
  await userEvent.type(screen.getByLabelText('Confirmar'), 'contraseña1');
  await userEvent.click(screen.getByRole('button', { name: 'Crear Apoderada' }));
}

describe('P-02 en las tres clases', () => {
  it.each(['phone', 'tablet', 'desktop'] as const)('%s: crea la Apoderada, muestra los códigos y entra', async (device) => {
    const t = await open({ device });
    await stepOne();
    await stepTwo();
    const list = await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(list.textContent).toContain('K7QM-3XTP');
    expect(list.textContent).toContain('M2DT-5WJC');
    // El rol siempre es Apoderada; la confirmación viaja porque el contrato la valida.
    expect(t.server.calls.find((c) => c.path === '/setup')!.body).toEqual({
      fullName: 'Ilen Fernández Ruiz',
      username: 'ilen.fernandez',
      nationalId: '84011905548',
      phone: '52345678',
      password: 'contraseña1',
      confirm: 'contraseña1',
      role: 'apoderada',
    });
    await userEvent.click(screen.getByLabelText('Los copié a mano'));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar y entrar' }));
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/'));
    expect(t.server.calls.find((c) => c.path === '/auth/login')!.body).toMatchObject({
      username: 'ilen.fernandez',
      password: 'contraseña1',
      deviceId: SERVER_PC.deviceId,
    });
    expect(t.session.getState().status).toBe('signedIn');
  });

  it('TAB y ESC muestran los pasos a la izquierda con el actual marcado; TEL, "Paso n de 3"', async () => {
    await open({ device: 'desktop' });
    const steps = await screen.findByRole('list', { name: 'Pasos del primer arranque' });
    expect(steps.querySelector('[aria-current="step"]')!.textContent).toContain('Datos de la Apoderada');
    await open({ device: 'phone' });
    expect(await screen.findByText('Paso 1 de 3')).not.toBeNull();
  });
});

describe('RF-REC-01 y RNF-09: los códigos', () => {
  it('bloquea las capturas mientras se ven y exige "Los copié a mano"', async () => {
    const t = await open();
    await stepOne();
    await stepTwo();
    await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [true] });
    expect(screen.getByRole('button', { name: 'Terminar y entrar' }).hasAttribute('disabled')).toBe(true);
    await userEvent.click(screen.getByLabelText('Los copié a mano'));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar y entrar' }));
    await waitFor(() => expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [false] }));
  });
});

describe('F-02: validación por paso', () => {
  it('no pasa del paso 1 con errores; el carné sin fecha válida avisa pero no bloquea', async () => {
    await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(document.querySelectorAll('.ui-field[data-level="error"]').length).toBe(4);
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    await userEvent.type(screen.getByLabelText('Carné de identidad'), '84133105548');
    await userEvent.tab();
    expect(screen.getByText(NATIONAL_ID_DATE_WARNING)).not.toBeNull();
    await stepOne('');
    expect(await screen.findByLabelText('Contraseña')).not.toBeNull();
  });

  it('un usuario repetido vuelve al paso 1 con el error en su campo', async () => {
    await open({
      before: (s) =>
        s.respond(postSetup, {
          code: 'VALIDATION_ERROR',
          message: 'Hay 1 campo por corregir.',
          details: { fields: { username: 'Ya existe el usuario ilen.fernandez: elija otro nombre.' } },
        }),
    });
    await stepOne();
    await stepTwo();
    await screen.findByLabelText('Usuario');
    expect(document.getElementById(screen.getByLabelText('Usuario').id + '-msg')!.textContent).toBe('Ya existe el usuario ilen.fernandez: elija otro nombre.');
    expect(screen.getByLabelText('Usuario')).not.toBeNull();
  });
});

describe('RF-USR-05: solo en la PC servidor y sin Apoderada', () => {
  it('ya configurado, va al login', async () => {
    const t = await open({ before: (s) => s.respond(getSetupStatus, { configured: true }) });
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/login'));
  });

  it('en otro dispositivo, va al login (que explica que se crea desde la PC servidor)', async () => {
    const t = await open({ pairing: TEST_PAIRING });
    await waitFor(() => expect(t.router.state.location.pathname).toBe('/login'));
  });
});
