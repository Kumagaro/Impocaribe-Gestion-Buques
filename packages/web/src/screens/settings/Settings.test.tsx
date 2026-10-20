import { DEFAULT_LEGAL_NOTICE, userDtoSchema, type SettingsDto } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { getSettings, patchSettings, postInstallationCode } from '../../api/endpoints/company';
import type { StoredSession } from '../../session/app-session';
import { SettingsScreen } from './Settings.screen';

// T054 · P-23 Configuración (ui-spec y maqueta T053), RF-CFG-01 a 04, RF-DM-13, F-06: el hook real y las tres
// presentaciones.
vi.setConfig({ testTimeout: 30_000 });

const USER = sampleOf(userDtoSchema, {
  fullName: 'Ilén Fernández Rojas',
  role: 'apoderada',
  nationalId: '84011905548',
  phone: '52345678',
  mustChangePassword: false,
});
const SIGNED_IN: StoredSession = { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };
const SETTINGS: SettingsDto = {
  maxLoadingDaysAhead: 7,
  workdayStart: '07:00',
  workdayEnd: '19:00',
  dailyBackupHour: '20:00',
  externalBackupDir: 'E:\\Respaldos',
  networkSetup: 'router',
  deadlineLegalNotice: DEFAULT_LEGAL_NOTICE,
  rowVersion: 5,
};

const open = (options: Parameters<typeof renderScreen>[1] & { settings?: SettingsDto } = {}) =>
  renderScreen(<SettingsScreen />, {
    path: '/configuracion',
    session: SIGNED_IN,
    ...options,
    before: (s) => {
      s.respond(getSettings, options.settings ?? SETTINGS);
      options.before?.(s);
    },
  });

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const retype = async (label: string, text: string) => {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
  await userEvent.tab();
};

describe('P-23 en las tres clases', () => {
  it.each(['desktop', 'tablet', 'phone'] as const)(
    '%s: cada parámetro con su valor, por defecto y límites',
    async (device) => {
      await open({ device });
      await screen.findByLabelText('Días máximos hacia el futuro para la fecha de carga');
      expect(value('Días máximos hacia el futuro para la fecha de carga')).toBe('7');
      expect(screen.getByText('Por defecto 7 · de 0 a 30')).not.toBeNull();
      expect(value('Jornada: inicio')).toBe('07:00');
      expect(value('Jornada: fin')).toBe('19:00');
      expect(value('Hora del respaldo diario')).toBe('20:00');
      expect(value('Carpeta externa del respaldo diario')).toBe('E:\\Respaldos');
      expect(screen.getByRole('radio', { name: 'Router wifi (recomendado)' }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).not.toBeNull();
    },
  );

  it('una carpeta aún no elegida aparece vacía', async () => {
    await open({ settings: { ...SETTINGS, externalBackupDir: null } });
    await screen.findByLabelText('Carpeta externa del respaldo diario');
    expect(value('Carpeta externa del respaldo diario')).toBe('');
  });
});

describe('F-06: avisos que no impiden guardar', () => {
  it('con 0 días y con el respaldo diario dentro de la jornada', async () => {
    await open();
    await screen.findByLabelText('Jornada: inicio');
    await retype('Días máximos hacia el futuro para la fecha de carga', '0');
    expect(await screen.findByText('Solo se podrá emitir con fecha de carga de hoy')).not.toBeNull();
    await retype('Hora del respaldo diario', '12:00');
    expect(await screen.findByText('Coincide con la jornada de trabajo')).not.toBeNull();
  });
});

describe('RF-CFG-02: guardar', () => {
  it('envía los valores con la versión que vio (los días, como número) y avisa', async () => {
    const t = await open({
      before: (s) =>
        s.respond(patchSettings, { ...SETTINGS, maxLoadingDaysAhead: 3, networkSetup: 'hotspot', rowVersion: 6 }),
    });
    await screen.findByLabelText('Jornada: inicio');
    await retype('Días máximos hacia el futuro para la fecha de carga', '3');
    await userEvent.click(screen.getByRole('radio', { name: 'Hotspot de un celular' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Se guardaron los cambios de la configuración.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      ...SETTINGS,
      rowVersion: undefined,
      maxLoadingDaysAhead: 3,
      networkSetup: 'hotspot',
      expectedVersion: 5,
    });
  });

  it('la carpeta la comprueba el servidor: su error vuelve al campo (RF-VAL-04)', async () => {
    const message = 'La carpeta no existe en la PC servidor. Conecte la memoria USB o elija otra.';
    await open({
      before: (s) =>
        s.respond(patchSettings, {
          code: 'VALIDATION_ERROR',
          message: 'Hay 1 campo por corregir.',
          details: { fields: { externalBackupDir: message } },
        }),
    });
    await screen.findByLabelText('Jornada: inicio');
    await retype('Carpeta externa del respaldo diario', 'F:\\USB');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
  });

  it('valida la jornada con F-06 antes de enviar', async () => {
    const t = await open();
    await screen.findByLabelText('Jornada: inicio');
    await retype('Jornada: fin', '06:00');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      (await screen.findAllByText('El fin de la jornada debe ser posterior al inicio (07:00 a 19:00, por ejemplo).'))
        .length,
    ).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('si otra Apoderada guardó antes, lo explica', async () => {
    await open({
      before: (s) =>
        s.respond(patchSettings, {
          code: 'STALE_RECORD',
          message:
            'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
          details: { currentVersion: 6 },
        }),
    });
    await screen.findByLabelText('Jornada: inicio');
    await retype('Días máximos hacia el futuro para la fecha de carga', '4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/Otro usuario modificó este registro/)).not.toBeNull();
  });
});

describe('RF-DM-13: aviso legal del plazo', () => {
  it('con contador, vista previa y vuelta al texto por defecto', async () => {
    await open({
      settings: { ...SETTINGS, deadlineLegalNotice: 'Texto ajustado por la Apoderada para citar la norma vigente.' },
    });
    const text = await screen.findByLabelText('Texto que se muestra junto al plazo de cada DM');
    expect(screen.getByText('60 de 600 · mínimo 50')).not.toBeNull();
    const preview = screen.getByRole('region', { name: 'Vista previa del aviso' });
    expect(preview.textContent).toContain('Texto ajustado por la Apoderada para citar la norma vigente.');
    await userEvent.click(screen.getByRole('button', { name: 'Volver al texto por defecto' }));
    expect((text as HTMLTextAreaElement).value).toBe(DEFAULT_LEGAL_NOTICE);
    expect(preview.textContent).toContain(DEFAULT_LEGAL_NOTICE);
    expect(screen.getByText(`${DEFAULT_LEGAL_NOTICE.length} de 600 · mínimo 50`)).not.toBeNull();
  });
});

describe('RF-CFG-04: código de instalación', () => {
  const fill = async (dialog: HTMLElement, current: string, next: string, confirm: string) => {
    await userEvent.type(within(dialog).getByLabelText('Código actual'), current);
    await userEvent.type(within(dialog).getByLabelText('Código nuevo'), next);
    await userEvent.type(within(dialog).getByLabelText('Confirmar el código nuevo'), confirm);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cambiar el código' }));
  };

  it('pide el actual, el nuevo y su confirmación; lo cambia y avisa', async () => {
    const t = await open({ before: (s) => s.respond(postInstallationCode) });
    const section = await screen.findByRole('region', { name: 'Código de instalación' });
    await fill(section, 'abcd-efgh-jkmn', 'k7qm3xtpr2hw', 'K7QM-3XTP-R2HW');
    expect(
      await screen.findByText('Se cambió el código de instalación. Guarde el nuevo impreso; el anterior ya no sirve.'),
    ).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'POST')!.body).toEqual({
      currentCode: 'ABCD-EFGH-JKMN',
      newCode: 'K7QM-3XTP-R2HW',
      confirm: 'K7QM-3XTP-R2HW',
    });
  });

  it('con el actual incorrecto muestra el motivo del servidor', async () => {
    await open({
      before: (s) =>
        s.respond(postInstallationCode, {
          code: 'INSTALL_CODE_INVALID',
          message: 'El código de instalación actual no es correcto.',
        }),
    });
    const section = await screen.findByRole('region', { name: 'Código de instalación' });
    await fill(section, 'ABCD-EFGH-JKMP', 'K7QM-3XTP-R2HW', 'K7QM-3XTP-R2HW');
    expect(await screen.findByText('El código de instalación actual no es correcto.')).not.toBeNull();
  });

  it('si la confirmación no coincide no se envía', async () => {
    const t = await open();
    const section = await screen.findByRole('region', { name: 'Código de instalación' });
    await fill(section, 'ABCD-EFGH-JKMN', 'K7QM-3XTP-R2HW', 'K7QM-3XTP-R2HV');
    expect((await within(section).findAllByText('Los códigos no coinciden.')).length).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('phone: el cambio se abre en una hoja', async () => {
    await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar el código de instalación' }));
    expect(await screen.findByRole('dialog', { name: 'Código de instalación' })).not.toBeNull();
  });
});

it('sin conexión no se puede consultar: lo explica', async () => {
  await renderScreen(<SettingsScreen />, { path: '/configuracion', session: SIGNED_IN });
  await waitFor(() =>
    expect(
      screen.getByText('No se pudo cargar la configuración: solo se consulta con conexión al servidor.'),
    ).not.toBeNull(),
  );
});

describe('correcciones de la revisión (T054)', () => {
  it('tras un conflicto de edición, el siguiente intento va sobre la versión actual sin perder lo escrito', async () => {
    let patches = 0;
    let version = 5;
    const t = await open({
      before: (s) => {
        s.respond(getSettings, () => ({ ...SETTINGS, rowVersion: version }));
        s.respond(patchSettings, () => {
          patches++;
          if (patches > 1) return { ...SETTINGS, maxLoadingDaysAhead: 4, rowVersion: 7 };
          version = 6;
          return {
            code: 'STALE_RECORD',
            message:
              'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
            details: { currentVersion: 6 },
          };
        });
      },
    });
    await screen.findByLabelText('Jornada: inicio');
    await retype('Días máximos hacia el futuro para la fecha de carga', '4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/Otro usuario modificó este registro/)).not.toBeNull();
    expect(value('Días máximos hacia el futuro para la fecha de carga')).toBe('4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Se guardaron los cambios de la configuración.')).not.toBeNull();
    const versions = t.server.calls
      .filter((c) => c.method === 'PATCH')
      .map((c) => (c.body as { expectedVersion: number }).expectedVersion);
    expect(versions).toEqual([5, 6]);
  });

  it('el aviso editado se guarda; con menos de 50 caracteres no se envía', async () => {
    const t = await open({ before: (s) => s.respond(patchSettings, SETTINGS) });
    const text = await screen.findByLabelText('Texto que se muestra junto al plazo de cada DM');
    await userEvent.clear(text);
    await userEvent.type(text, 'a'.repeat(49));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      (await screen.findAllByText('El aviso debe tener entre 50 y 600 caracteres (tiene 49).')).length,
    ).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(text, 'b');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Se guardaron los cambios de la configuración.');
    const body = t.server.calls.find((c) => c.method === 'PATCH')!.body as { deadlineLegalNotice: string };
    expect(body.deadlineLegalNotice).toBe('a'.repeat(49) + 'b');
  });

  it('phone: la hoja del aviso no se cierra con un texto inválido, y al guardar con él se abre', async () => {
    const t = await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar el aviso' }));
    const sheet = await screen.findByRole('dialog', { name: 'Aviso legal del plazo' });
    const label = 'Texto que se muestra junto al plazo de cada DM';
    await userEvent.clear(within(sheet).getByLabelText(label));
    await userEvent.type(within(sheet).getByLabelText(label), 'corto');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Listo' }));
    const tooShort = 'El aviso debe tener entre 50 y 600 caracteres (tiene 5).';
    expect((await within(sheet).findAllByText(tooShort)).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: 'Aviso legal del plazo' })).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // En la tarjeta se ve el motivo; al guardar, la hoja se abre con el campo a la vista.
    expect(screen.getAllByText(tooShort).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('dialog', { name: 'Aviso legal del plazo' })).not.toBeNull();
    expect(t.server.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('phone: el código escrito no queda en la hoja al volver a abrirla', async () => {
    await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar el código de instalación' }));
    let sheet = await screen.findByRole('dialog', { name: 'Código de instalación' });
    await userEvent.type(within(sheet).getByLabelText('Código actual'), 'ABCD-EFGH-JKMN');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar el código de instalación' }));
    sheet = await screen.findByRole('dialog', { name: 'Código de instalación' });
    expect((within(sheet).getByLabelText('Código actual') as HTMLInputElement).value).toBe('');
  });

  it('sin conexión, guardar y cambiar el código se desactivan con su motivo', async () => {
    await open({ online: false, local: [] });
    for (const name of ['Guardar cambios', 'Cambiar el código'])
      expect(((await screen.findByRole('button', { name })) as HTMLButtonElement).disabled).toBe(true);
  });
});
