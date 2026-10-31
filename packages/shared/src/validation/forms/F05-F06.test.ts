import { describe, expect, it } from 'vitest';
import { jpeg, png } from '../../testing/images.ts';
import { companySchema, imageSchema, officialImageIssue, signatureSchema, stampSchema } from './F05.ts';
import {
  dailyBackupWarning,
  DEFAULT_LEGAL_NOTICE,
  installationCodeChangeSchema,
  installationCodeSchema,
  loadingDaysWarning,
  settingsSchema,
} from './F06.ts';

// T051 y T052 · ui-spec §6 F-05 (Empresa) y F-06 (Configuración), RF-EMP-02 y 06, RF-CFG-02 y 04. Las mismas reglas
// en la interfaz y en el servidor (DT-25).
const issues = (r: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => [i.path.join('.'), i.message]);

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

describe('F-05 Empresa', () => {
  it('razón social de 3 a 150 y dirección de 5 a 250 caracteres, sin los espacios de los extremos', () => {
    expect(companySchema.parse({ legalName: '  IMPOCARIBE S.A.  ', address: ' Calle 1, La Habana ' })).toEqual({
      legalName: 'IMPOCARIBE S.A.',
      address: 'Calle 1, La Habana',
    });
    expect(issues(companySchema.safeParse({ legalName: 'AB', address: 'a'.repeat(251) }))).toEqual([
      ['legalName', 'La razón social debe tener entre 3 y 150 caracteres (tiene 2).'],
      ['address', 'La dirección debe tener entre 5 y 250 caracteres (tiene 251).'],
    ]);
    expect(issues(companySchema.safeParse({ legalName: '  ', address: '' }))).toEqual([
      ['legalName', 'Escriba la razón social.'],
      ['address', 'Escriba la dirección.'],
    ]);
  });

  it('firma: representante, credencial (solo dígitos, 1 a 20) y cargo', () => {
    const ok = {
      image: b64(png(600, 200)),
      representativeName: 'Ilén Fernández',
      credentialNo: '00123',
      position: 'Directora',
    };
    expect(signatureSchema.parse(ok)).toMatchObject({ credentialNo: '00123' });
    expect(
      issues(signatureSchema.safeParse({ ...ok, representativeName: 'Il', credentialNo: '12A', position: 'X' })),
    ).toEqual([
      ['representativeName', 'El representante debe tener entre 3 y 100 caracteres (tiene 2).'],
      ['credentialNo', 'La credencial solo admite dígitos.'],
      ['position', 'El cargo debe tener entre 2 y 60 caracteres (tiene 1).'],
    ]);
    expect(issues(signatureSchema.safeParse({ ...ok, credentialNo: '1'.repeat(21) }))).toEqual([
      ['credentialNo', 'La credencial admite como máximo 20 dígitos (tiene 21).'],
    ]);
    expect(issues(signatureSchema.safeParse({ ...ok, credentialNo: '' }))).toEqual([
      ['credentialNo', 'Escriba el número de credencial.'],
    ]);
  });

  it('cuño: solo la imagen', () => {
    expect(stampSchema.parse({ image: b64(jpeg(400, 400)) })).toEqual({ image: b64(jpeg(400, 400)) });
  });

  it.each([
    ['PNG de 300 × 100', png(300, 100), null],
    ['JPG grande', jpeg(2000, 800), null],
    ['PNG de 299 × 100', png(299, 100), 'La imagen mide 299 × 100 px; debe medir al menos 300 × 100 px.'],
    ['JPG de 300 × 99', jpeg(300, 99), 'La imagen mide 300 × 99 px; debe medir al menos 300 × 100 px.'],
    ['GIF', Uint8Array.from([0x47, 0x49, 0x46, 0x38]), 'La imagen debe ser PNG o JPG.'],
  ])('%s', (_, bytes, message) => {
    expect(officialImageIssue(bytes)).toBe(message);
  });

  it('más de 2 MB: dice cuánto pesa', () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png(600, 200));
    expect(officialImageIssue(big)).toBe('La imagen pesa 2,0 MB; el máximo es 2 MB.');
    const ok = new Uint8Array(2 * 1024 * 1024);
    ok.set(png(600, 200));
    expect(officialImageIssue(ok)).toBeNull();
  });

  it('la imagen viaja en base64 y se valida al decodificarla', () => {
    expect(issues(imageSchema.safeParse(b64(png(600, 200))))).toEqual([]);
    expect(issues(imageSchema.safeParse(''))).toEqual([['', 'Elija la imagen.']]);
    expect(issues(imageSchema.safeParse('esto no es base64!'))).toEqual([['', 'La imagen debe ser PNG o JPG.']]);
    expect(issues(imageSchema.safeParse(b64(png(100, 100))))).toEqual([
      ['', 'La imagen mide 100 × 100 px; debe medir al menos 300 × 100 px.'],
    ]);
  });
});

describe('F-06 Configuración', () => {
  const valid = {
    maxLoadingDaysAhead: 7,
    workdayStart: '07:00',
    workdayEnd: '19:00',
    dailyBackupHour: '20:00',
    externalBackupDir: 'E:\\Respaldos',
    networkSetup: 'router',
    deadlineLegalNotice: DEFAULT_LEGAL_NOTICE,
  };

  it('los valores por defecto de RF-CFG-02 son válidos', () => {
    expect(settingsSchema.parse(valid)).toEqual(valid);
    expect(DEFAULT_LEGAL_NOTICE.length).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_LEGAL_NOTICE).toMatch(/^El plazo que muestra el sistema cuenta desde el registro de esta DM/);
  });

  it.each([
    [-1, 'Escriba un número entero de 0 a 30.'],
    [31, 'Escriba un número entero de 0 a 30.'],
    [2.5, 'Escriba un número entero de 0 a 30.'],
  ])('días máximos %s → %s', (days, message) => {
    expect(issues(settingsSchema.safeParse({ ...valid, maxLoadingDaysAhead: days }))).toEqual([
      ['maxLoadingDaysAhead', message],
    ]);
  });

  it('los días llegan como texto desde la interfaz y como número desde la API', () => {
    expect(settingsSchema.parse({ ...valid, maxLoadingDaysAhead: ' 3 ' }).maxLoadingDaysAhead).toBe(3);
    for (const days of ['', '2,5', 'siete', null])
      expect(issues(settingsSchema.safeParse({ ...valid, maxLoadingDaysAhead: days }))).toEqual([
        ['maxLoadingDaysAhead', 'Escriba un número entero de 0 a 30.'],
      ]);
  });

  it('con 0 días avisa, sin impedir guardar', () => {
    expect(issues(settingsSchema.safeParse({ ...valid, maxLoadingDaysAhead: 0 }))).toEqual([]);
    expect(loadingDaysWarning(0)).toBe('Solo se podrá emitir con fecha de carga de hoy');
    expect(loadingDaysWarning(1)).toBeNull();
  });

  it('horas hh:mm y jornada con el inicio antes del fin', () => {
    expect(issues(settingsSchema.safeParse({ ...valid, workdayStart: '7:00', dailyBackupHour: '24:00' }))).toEqual([
      ['workdayStart', 'Escriba la hora como hh:mm, por ejemplo 07:00.'],
      ['dailyBackupHour', 'Escriba la hora como hh:mm, por ejemplo 07:00.'],
    ]);
    expect(issues(settingsSchema.safeParse({ ...valid, workdayStart: '19:00', workdayEnd: '07:00' }))).toEqual([
      ['workdayEnd', 'El fin de la jornada debe ser posterior al inicio (07:00 a 19:00, por ejemplo).'],
    ]);
    expect(issues(settingsSchema.safeParse({ ...valid, workdayStart: '19:00', workdayEnd: '19:00' }))).toEqual([
      ['workdayEnd', 'El fin de la jornada debe ser posterior al inicio (07:00 a 19:00, por ejemplo).'],
    ]);
  });

  it('el respaldo diario dentro de la jornada avisa, sin impedir guardar', () => {
    expect(dailyBackupWarning('12:00', '07:00', '19:00')).toBe('Coincide con la jornada de trabajo');
    expect(dailyBackupWarning('07:00', '07:00', '19:00')).toBe('Coincide con la jornada de trabajo');
    expect(dailyBackupWarning('19:00', '07:00', '19:00')).toBeNull();
    expect(dailyBackupWarning('20:00', '07:00', '19:00')).toBeNull();
    // Con una hora a medio escribir o una jornada inválida, no hay aviso.
    expect(dailyBackupWarning('08:00', '', '19:00')).toBeNull();
    expect(dailyBackupWarning('1', '07:00', '19:00')).toBeNull();
    expect(dailyBackupWarning('12:00', '19:00', '07:00')).toBeNull();
  });

  it('carpeta externa, montaje y aviso legal', () => {
    expect(
      issues(
        settingsSchema.safeParse({
          ...valid,
          externalBackupDir: '  ',
          networkSetup: 'cable',
          deadlineLegalNotice: 'corto',
        }),
      ),
    ).toEqual([
      ['externalBackupDir', 'Escriba la carpeta externa del respaldo diario.'],
      ['networkSetup', 'Elija el montaje de red: router wifi o hotspot de un celular.'],
      ['deadlineLegalNotice', 'El aviso debe tener entre 50 y 600 caracteres (tiene 5).'],
    ]);
  });

  it('código de instalación XXXX-XXXX-XXXX: admite minúsculas y guiones opcionales', () => {
    expect(installationCodeSchema.parse('k7qm3xtpr2hw')).toBe('K7QM-3XTP-R2HW');
    expect(installationCodeSchema.parse(' K7QM-3XTP-R2HW ')).toBe('K7QM-3XTP-R2HW');
    expect(issues(installationCodeSchema.safeParse('K7QM-3XTP'))).toEqual([
      ['', 'El código tiene la forma XXXX-XXXX-XXXX, como K7QM-3XTP-R2HW.'],
    ]);
    // Sin 0, O, 1, I ni L: se confunden al copiarlo a mano.
    expect(installationCodeSchema.safeParse('K7QM-3XTP-R2H0').success).toBe(false);
  });

  it('cambio del código: actual escrito, nuevo válido y confirmación igual', () => {
    expect(
      installationCodeChangeSchema.parse({
        currentCode: 'abcd-efgh-jkmn',
        newCode: 'K7QM-3XTP-R2HW',
        confirm: 'k7qm3xtpr2hw',
      }),
    ).toEqual({ currentCode: 'ABCD-EFGH-JKMN', newCode: 'K7QM-3XTP-R2HW' });
    expect(
      issues(
        installationCodeChangeSchema.safeParse({
          currentCode: '',
          newCode: 'K7QM-3XTP-R2HW',
          confirm: 'K7QM-3XTP-R2HX',
        }),
      ),
    ).toEqual([
      ['currentCode', 'Escriba el código de instalación actual.'],
      ['confirm', 'Los códigos no coinciden.'],
    ]);
    // El nuevo con la forma mal: su error, y ninguno en la confirmación (aún no tiene con qué compararse).
    expect(
      issues(
        installationCodeChangeSchema.safeParse({ currentCode: 'ABCD-EFGH-JKMN', newCode: 'K7QM-3XTP', confirm: 'X' }),
      ),
    ).toEqual([['newCode', 'El código tiene la forma XXXX-XXXX-XXXX, como K7QM-3XTP-R2HW.']]);
  });
});
