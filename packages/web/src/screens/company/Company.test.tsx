import { jpeg, png } from '@impocaribe/shared/testing';
import { userDtoSchema, type SignatureResponse, type StampResponse } from '@impocaribe/shared/validation';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sampleOf } from '../../../test/fake-server';
import { renderScreen } from '../../../test/screen';
import { getCompany, getSignature, getStamp, patchCompany, putSignature, putStamp } from '../../api/endpoints/company';
import type { StoredSession } from '../../session/app-session';
import { OFFLINE_REASON } from '../../sync/SyncGate';
import { CompanyScreen } from './Company.screen';

// T054 · P-22 Empresa (ui-spec y maqueta T053), RF-EMP-01 a 06, RNF-09, F-05: el hook real y las tres presentaciones.
vi.setConfig({ testTimeout: 20_000 });

const USER = sampleOf(userDtoSchema, {
  fullName: 'Ilén Fernández Rojas',
  role: 'apoderada',
  nationalId: '84011905548',
  phone: '52345678',
  mustChangePassword: false,
});
const SIGNED_IN: StoredSession = { token: 't', expiresAt: '2026-10-15T16:40:00.000Z', user: USER };
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const COMPANY = { legalName: 'IMPOCARIBE S.A.', address: 'Calle 23 No. 456, Vedado, La Habana', rowVersion: 3 };
const SIG = {
  id: '0199f0a1-0000-7000-8000-0000000000a2',
  createdAt: '2026-10-14T13:12:00.000Z',
  createdBy: 'Ilén Fernández Rojas',
  representativeName: 'Ilén Fernández Rojas',
  credentialNo: '00123',
  position: 'Directora',
};
const OLD_SIG = {
  ...SIG,
  id: '0199f0a1-0000-7000-8000-0000000000a1',
  createdAt: '2026-10-02T19:31:00.000Z',
  representativeName: 'Mario Delgado Pérez',
  position: 'Director adjunto',
};
const SIGNATURE: SignatureResponse = {
  current: { ...SIG, mime: 'image/png', image: b64(png(600, 200)) },
  history: [SIG, OLD_SIG],
};
const STAMP_ITEM = {
  id: '0199f0a1-0000-7000-8000-0000000000b1',
  createdAt: '2026-10-02T19:40:00.000Z',
  createdBy: 'Ilén Fernández Rojas',
};
const STAMP: StampResponse = {
  current: { ...STAMP_ITEM, mime: 'image/png', image: b64(png(400, 400)) },
  history: [STAMP_ITEM],
};
const NO_STAMP: StampResponse = { current: null, history: [] };

const open = (options: Parameters<typeof renderScreen>[1] & { stamp?: StampResponse } = {}) =>
  renderScreen(<CompanyScreen />, {
    path: '/empresa',
    session: SIGNED_IN,
    ...options,
    before: (s) => {
      s.respond(getCompany, COMPANY);
      s.respond(getSignature, SIGNATURE);
      s.respond(getStamp, options.stamp ?? STAMP);
      options.before?.(s);
    },
  });

const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

describe('P-22 en las tres clases', () => {
  it.each(['desktop', 'tablet'] as const)('%s: datos, firma, cuño, historial y vista previa', async (device) => {
    await open({ device });
    expect(((await screen.findByLabelText('Razón social')) as HTMLInputElement).value).toBe('IMPOCARIBE S.A.');
    expect((screen.getByLabelText('Dirección') as HTMLInputElement).value).toBe(COMPANY.address);
    const firma = screen.getByRole('region', { name: 'Firma oficial' });
    expect(within(firma).getByText('Cargada')).not.toBeNull();
    expect(within(firma).getByText('Credencial 00123 · Directora')).not.toBeNull();
    expect(within(screen.getByRole('region', { name: 'Cuño oficial' })).getByText('Cargado')).not.toBeNull();
    // RF-EMP-05: cada versión, con quién y cuándo; la primera, "cargada".
    expect(
      within(screen.getByRole('list', { name: 'Historial de cambios' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Firma reemplazada · Ilén Fernández Rojas, Directora14/10/2026 09:12 · Ilén Fernández Rojas',
      'Cuño cargado02/10/2026 15:40 · Ilén Fernández Rojas',
      'Firma cargada · Mario Delgado Pérez, Director adjunto02/10/2026 15:31 · Ilén Fernández Rojas',
    ]);
    const preview = screen.getByRole('region', { name: 'Vista previa en el documento' });
    expect(within(preview).getByText('IMPOCARIBE S.A.')).not.toBeNull();
    expect(within(preview).getByRole('img', { name: 'Firma oficial' }).getAttribute('src')).toBe(
      `data:image/png;base64,${SIGNATURE.current!.image}`,
    );
    expect(within(preview).getByRole('img', { name: 'Cuño oficial' })).not.toBeNull();
  });

  it('phone: tarjetas; los datos de la empresa se editan en una hoja', async () => {
    await open({ device: 'phone' });
    const data = await screen.findByRole('region', { name: 'Datos de la empresa' });
    expect(within(data).getByText(COMPANY.address)).not.toBeNull();
    expect(screen.queryByLabelText('Razón social')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Editar los datos de la empresa' }));
    expect(((await screen.findByLabelText('Razón social')) as HTMLInputElement).value).toBe('IMPOCARIBE S.A.');
  });

  it('RNF-09: las capturas quedan bloqueadas en la pantalla y se liberan al salir', async () => {
    const t = await open();
    await screen.findByLabelText('Razón social');
    expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [true] });
    t.view.unmount();
    expect(t.platform.calls).toContainEqual({ method: 'secureScreen', args: [false] });
  });
});

describe('RF-EMP-04: sin cuño (o sin firma) lo dice', () => {
  it('aviso, insignia "Falta" y botón para cargarlo', async () => {
    await open({ stamp: NO_STAMP });
    expect(
      await screen.findByText(
        'Falta el cuño oficial. Sin él no se puede oficializar ni corregir órdenes; anular sí se puede.',
      ),
    ).not.toBeNull();
    const cuno = screen.getByRole('region', { name: 'Cuño oficial' });
    expect(within(cuno).getByText('Falta')).not.toBeNull();
    expect(within(cuno).getByRole('button', { name: 'Cargar el cuño' })).not.toBeNull();
  });
});

describe('RF-EMP-06: datos de la empresa', () => {
  it('guarda con la versión que vio y avisa', async () => {
    const t = await open({
      before: (s) => s.respond(patchCompany, { ...COMPANY, legalName: 'IMPOCARIBE S.A. (Casa Matriz)', rowVersion: 4 }),
    });
    const name = await screen.findByLabelText('Razón social');
    await userEvent.clear(name);
    await userEvent.type(name, 'IMPOCARIBE S.A. (Casa Matriz)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Se guardaron los datos de la empresa.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      legalName: 'IMPOCARIBE S.A. (Casa Matriz)',
      address: COMPANY.address,
      expectedVersion: 3,
    });
  });

  it('valida con F-05 antes de enviar', async () => {
    const t = await open();
    const name = await screen.findByLabelText('Razón social');
    await userEvent.clear(name);
    await userEvent.type(name, 'AB');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      (await screen.findAllByText('La razón social debe tener entre 3 y 150 caracteres (tiene 2).')).length,
    ).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
});

describe('RF-EMP-01, 02 y 05: reemplazar la firma', () => {
  it('elige la imagen, la comprueba, y guarda la imagen con los datos del representante', async () => {
    const t = await open({
      before: (s) => s.respond(putSignature, { ...SIG, id: '0199f0a1-0000-7000-8000-0000000000a3' }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Reemplazar firma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reemplazar la firma oficial' });
    // Los datos del representante vigente vienen escritos; se cambian si cambia la persona.
    expect((within(dialog).getByLabelText('Representante') as HTMLInputElement).value).toBe('Ilén Fernández Rojas');
    const image = jpeg(640, 220);
    await userEvent.upload(
      within(dialog).getByLabelText('Imagen de la firma'),
      file(image, 'firma-nueva.jpg', 'image/jpeg'),
    );
    // Un JPG no tiene transparencia: aviso que no impide guardar.
    expect(await within(dialog).findByText('Se recomienda fondo transparente')).not.toBeNull();
    expect(within(dialog).getByText(/firma-nueva\.jpg · 640 × 220 px/)).not.toBeNull();
    await userEvent.clear(within(dialog).getByLabelText('Representante'));
    await userEvent.type(within(dialog).getByLabelText('Representante'), 'Mario Delgado Pérez');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la firma' }));
    expect(await screen.findByText('Se guardó la firma oficial. Las órdenes nuevas la usarán.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      image: b64(image),
      representativeName: 'Mario Delgado Pérez',
      credentialNo: '00123',
      position: 'Directora',
    });
  });

  it('una imagen que no sirve se marca y no se envía', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Reemplazar firma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reemplazar la firma oficial' });
    await userEvent.upload(
      within(dialog).getByLabelText('Imagen de la firma'),
      file(png(200, 80), 'pequena.png', 'image/png'),
    );
    expect(
      await within(dialog).findByText('La imagen mide 200 × 80 px; debe medir al menos 300 × 100 px.'),
    ).not.toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la firma' }));
    expect(t.server.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('sin elegir una imagen nueva no se puede guardar', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Reemplazar firma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reemplazar la firma oficial' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la firma' }));
    expect((await within(dialog).findAllByText('Elija la imagen.')).length).toBeGreaterThan(0);
    expect(t.server.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});

describe('RF-EMP-01: cargar el cuño', () => {
  it('sin cuño, lo carga', async () => {
    const t = await open({ stamp: NO_STAMP, before: (s) => s.respond(putStamp, STAMP_ITEM) });
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar el cuño' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cargar el cuño oficial' });
    await userEvent.upload(
      within(dialog).getByLabelText('Imagen del cuño'),
      file(png(400, 400), 'cuno.png', 'image/png'),
    );
    await waitFor(() => expect(within(dialog).getByText(/cuno\.png · 400 × 400 px/)).not.toBeNull());
    expect(within(dialog).queryByText('Se recomienda fondo transparente')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar el cuño' }));
    expect(await screen.findByText('Se guardó el cuño oficial. Las órdenes nuevas lo usarán.')).not.toBeNull();
    expect(t.server.calls.find((c) => c.method === 'PUT')!.body).toEqual({ image: b64(png(400, 400)) });
  });
});

describe('sin conexión', () => {
  it('no se puede consultar: lo explica y deja reintentar', async () => {
    await renderScreen(<CompanyScreen />, { path: '/empresa', session: SIGNED_IN });
    expect(
      await screen.findByText(
        'No se pudo cargar la empresa: la firma y el cuño solo se consultan con conexión al servidor.',
      ),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).not.toBeNull();
  });

  it('con los datos ya cargados, las escrituras se desactivan con su motivo', async () => {
    await open({ online: false, local: [] });
    const save = await screen.findByRole('button', { name: 'Guardar' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(OFFLINE_REASON).length).toBeGreaterThan(0);
  });
});

describe('correcciones de la revisión (T054)', () => {
  it('guardar la firma no borra los datos de la empresa a medio escribir', async () => {
    await open({ before: (s) => s.respond(putSignature, { ...SIG, id: '0199f0a1-0000-7000-8000-0000000000a4' }) });
    const name = await screen.findByLabelText('Razón social');
    await userEvent.clear(name);
    await userEvent.type(name, 'IMPOCARIBE S.A. (sin guardar)');
    await userEvent.click(screen.getByRole('button', { name: 'Reemplazar firma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reemplazar la firma oficial' });
    await userEvent.upload(
      within(dialog).getByLabelText('Imagen de la firma'),
      file(png(600, 200), 'f.png', 'image/png'),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la firma' }));
    await screen.findByText('Se guardó la firma oficial. Las órdenes nuevas la usarán.');
    expect((screen.getByLabelText('Razón social') as HTMLInputElement).value).toBe('IMPOCARIBE S.A. (sin guardar)');
  });

  it('tras un conflicto de edición, lo escrito se conserva y el siguiente intento va sobre la versión actual', async () => {
    let patches = 0;
    let version = 3;
    const t = await open({
      before: (s) => {
        s.respond(getCompany, () => ({ ...COMPANY, rowVersion: version }));
        s.respond(patchCompany, () => {
          patches++;
          if (patches > 1) return { ...COMPANY, legalName: 'IMPOCARIBE S.A. (nuevo)', rowVersion: 5 };
          version = 4;
          return {
            code: 'STALE_RECORD',
            message:
              'Otro usuario modificó este registro. Revise sus cambios sobre la versión actual y vuelva a guardar.',
            details: { currentVersion: 4 },
          };
        });
      },
    });
    const name = await screen.findByLabelText('Razón social');
    await userEvent.clear(name);
    await userEvent.type(name, 'IMPOCARIBE S.A. (nuevo)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Otro usuario modificó este registro/)).not.toBeNull();
    expect((screen.getByLabelText('Razón social') as HTMLInputElement).value).toBe('IMPOCARIBE S.A. (nuevo)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Se guardaron los datos de la empresa.')).not.toBeNull();
    const versions = t.server.calls
      .filter((c) => c.method === 'PATCH')
      .map((c) => (c.body as { expectedVersion: number }).expectedVersion);
    expect(versions).toEqual([3, 4]);
  });

  it('phone: al volver a abrir la hoja, lo guardado y no lo que se canceló', async () => {
    await open({ device: 'phone' });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar los datos de la empresa' }));
    const name = await screen.findByLabelText('Razón social');
    await userEvent.clear(name);
    await userEvent.type(name, 'Descartado');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByLabelText('Razón social')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Editar los datos de la empresa' }));
    expect(((await screen.findByLabelText('Razón social')) as HTMLInputElement).value).toBe('IMPOCARIBE S.A.');
  });

  it('una imagen de más de 2 MB se rechaza por su peso, sin enviarla', async () => {
    const t = await open();
    await userEvent.click(await screen.findByRole('button', { name: 'Reemplazar firma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reemplazar la firma oficial' });
    const big = new Uint8Array(3 * 1024 * 1024);
    big.set(png(600, 200));
    await userEvent.upload(within(dialog).getByLabelText('Imagen de la firma'), file(big, 'enorme.png', 'image/png'));
    expect(await within(dialog).findByText('La imagen pesa 3,0 MB; el máximo es 2 MB.')).not.toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la firma' }));
    expect(t.server.calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('sin conexión, también la firma y el cuño se desactivan', async () => {
    await open({ online: false, local: [] });
    for (const name of ['Guardar', 'Reemplazar firma', 'Reemplazar cuño'])
      expect(((await screen.findByRole('button', { name })) as HTMLButtonElement).disabled).toBe(true);
  });
});
