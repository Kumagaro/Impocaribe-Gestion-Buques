// T054 · P-23 Configuración: la lógica (plan §7.3). Solo la Apoderada. RF-CFG-01 a 04, RF-DM-13 y F-06. La
// configuración no se replica: se consulta y se cambia en línea. La carpeta externa solo la puede comprobar el servidor.
import {
  dailyBackupWarning,
  DEFAULT_LEGAL_NOTICE,
  editSettingsSchema,
  installationCodeChangeSchema,
  loadingDaysWarning,
  type NetworkSetup,
  type SettingsDto,
} from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getSettings, patchSettings, postInstallationCode } from '../../api/endpoints/company';
import { useAppSession } from '../../session/SessionProvider';
import { OFFLINE_REASON } from '../../sync/SyncGate';
import { useOnline } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; settings: SettingsDto };
export type SettingsPanel = 'notice' | 'code' | null;

export const NETWORK_OPTIONS: { value: NetworkSetup; label: string; short: string }[] = [
  { value: 'router', label: 'Router wifi (recomendado)', short: 'Router wifi' },
  { value: 'hotspot', label: 'Hotspot de un celular', short: 'Hotspot' },
];
export const NOTICE_MAX = 600;
export const NOTICE_MIN = 50;

const LOAD_ERROR = 'No se pudo cargar la configuración: solo se consulta con conexión al servidor.';

export function useSettings() {
  const { session } = useAppSession();
  const online = useOnline();
  const [data, setData] = useState<LoadState>({ status: 'loading' });
  const [panel, setPanel] = useState<SettingsPanel>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);

  // Rellena el formulario con lo que llegó del servidor; se asigna más abajo, cuando el formulario existe.
  const fill = useRef<(settings: SettingsDto) => void>(() => undefined);

  const load = useCallback(async () => {
    try {
      const settings = await session.api().request(getSettings);
      // Antes de mostrarlos: el formulario nunca se pinta vacío con los datos ya cargados.
      fill.current(settings);
      setData({ status: 'ready', settings });
    } catch {
      setData({ status: 'error', message: LOAD_ERROR });
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = useValidatedForm({
    schema: editSettingsSchema,
    defaultValues: {
      maxLoadingDaysAhead: '',
      workdayStart: '',
      workdayEnd: '',
      dailyBackupHour: '',
      externalBackupDir: '',
      networkSetup: 'router',
      deadlineLegalNotice: '',
      expectedVersion: 0,
    },
    labels: {
      maxLoadingDaysAhead: 'Días máximos hacia el futuro para la fecha de carga',
      workdayStart: 'Jornada: inicio',
      workdayEnd: 'Jornada: fin',
      dailyBackupHour: 'Hora del respaldo diario',
      externalBackupDir: 'Carpeta externa del respaldo diario',
      networkSetup: 'Montaje de red',
      deadlineLegalNotice: 'Texto que se muestra junto al plazo de cada DM',
      expectedVersion: 'Versión',
    },
    // F-06: avisos que no impiden guardar.
    warnings: (v) => {
      const days = loadingDaysWarning(Number(v.maxLoadingDaysAhead === '' ? NaN : v.maxLoadingDaysAhead));
      const backup = dailyBackupWarning(String(v.dailyBackupHour), String(v.workdayStart), String(v.workdayEnd));
      return { ...(days ? { maxLoadingDaysAhead: days } : {}), ...(backup ? { dailyBackupHour: backup } : {}) };
    },
    onSubmit: async (values) => {
      let settings: SettingsDto;
      try {
        settings = await session.api().request(patchSettings, { body: values });
      } catch (err) {
        // DT-23: otra Apoderada guardó antes. Lo escrito se conserva sobre la versión actual, para revisarlo y guardar.
        if (err instanceof ApiError && err.code === 'STALE_RECORD') {
          const fresh = await session.api().request(getSettings);
          form.form.setValue('expectedVersion', fresh.rowVersion);
        }
        throw err;
      }
      setNotice({ tone: 'info', text: 'Se guardaron los cambios de la configuración.' });
      setPanel(null);
      fill.current(settings);
      setData({ status: 'ready', settings });
    },
  });

  fill.current = (v) =>
    form.form.reset({
      maxLoadingDaysAhead: String(v.maxLoadingDaysAhead),
      workdayStart: v.workdayStart,
      workdayEnd: v.workdayEnd,
      dailyBackupHour: v.dailyBackupHour,
      externalBackupDir: v.externalBackupDir ?? '',
      networkSetup: v.networkSetup,
      deadlineLegalNotice: v.deadlineLegalNotice,
      expectedVersion: v.rowVersion,
    });

  const code = useValidatedForm({
    schema: installationCodeChangeSchema,
    defaultValues: { currentCode: '', newCode: '', confirm: '' },
    labels: { currentCode: 'Código actual', newCode: 'Código nuevo', confirm: 'Confirmar el código nuevo' },
    onSubmit: async (values) => {
      // El contrato valida con el mismo esquema, que exige la confirmación: ya se comprobó que coincide.
      await session.api().request(postInstallationCode, { body: { ...values, confirm: values.newCode } });
      code.form.reset();
      setPanel(null);
      setNotice({
        tone: 'info',
        text: 'Se cambió el código de instalación. Guarde el nuevo impreso; el anterior ya no sirve.',
      });
    },
  });

  const setValue = form.form.setValue as (name: string, value: string, o: object) => void;
  const noticeText = String(form.form.watch('deadlineLegalNotice') ?? '');

  return {
    data,
    reload: () => {
      setData({ status: 'loading' });
      void load();
    },
    notice,
    /** RF-CON-06 y EST-03: sin conexión, las escrituras se desactivan con el motivo. */
    offlineReason: online ? undefined : OFFLINE_REASON,
    panel,
    open: (p: SettingsPanel) => {
      setNotice(null);
      // El código de instalación nunca queda escrito de una vez para otra.
      if (p === 'code') code.reset();
      setPanel(p);
    },
    close: () => setPanel(null),
    /** TEL: la hoja del aviso no se cierra con un texto que no se podría guardar. */
    closeNotice: async () => {
      if (await form.form.trigger('deadlineLegalNotice')) setPanel(null);
    },

    fields: {
      maxLoadingDaysAhead: form.field('maxLoadingDaysAhead'),
      workdayStart: form.field('workdayStart'),
      workdayEnd: form.field('workdayEnd'),
      dailyBackupHour: form.field('dailyBackupHour'),
      externalBackupDir: form.field('externalBackupDir'),
      networkSetup: form.field('networkSetup'),
      deadlineLegalNotice: form.field('deadlineLegalNotice'),
    },
    network: String(form.form.watch('networkSetup')) as NetworkSetup,
    setNetwork: (v: NetworkSetup) => setValue('networkSetup', v, { shouldDirty: true }),
    noticeText,
    resetNotice: () =>
      setValue('deadlineLegalNotice', DEFAULT_LEGAL_NOTICE, { shouldDirty: true, shouldValidate: true }),
    summary: form.summary,
    formError: form.formError,
    dirty: form.dirty,
    saving: form.form.formState.isSubmitting,
    /** Si el error está en el aviso, que en TEL vive en una hoja, se abre la hoja: el campo queda a la vista. */
    submit: async (e?: React.BaseSyntheticEvent) => {
      await form.submit(e);
      if (form.form.getFieldState('deadlineLegalNotice').invalid) setPanel('notice');
    },
    noticeError: form.field('deadlineLegalNotice').state.error,

    codeFields: {
      currentCode: code.field('currentCode'),
      newCode: code.field('newCode'),
      confirm: code.field('confirm'),
    },
    codeSummary: code.summary,
    codeError: code.formError,
    changingCode: code.form.formState.isSubmitting,
    submitCode: code.submit,
  };
}

export type SettingsModel = ReturnType<typeof useSettings>;
