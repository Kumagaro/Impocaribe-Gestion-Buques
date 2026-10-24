// T112 · P-24 Respaldos y restauración (plan §7.3). RF-RES-01 a 08, HU-12: el estado de los respaldos, la lista, la
// contraseña de respaldo, la restauración por pasos, la confirmación de la numeración y las órdenes perdidas. Todo se
// consulta al servidor (no se copia al dispositivo); solo Apoderadas.
import {
  BACKUP_PASSWORD_WARNING,
  RESTORE_WORD,
  setBackupPasswordSchema,
  type BackupDto,
  type LostOrderDto,
  type RestoreResult,
} from '@impocaribe/shared/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { backupPasswordApi, backupsApi, lostOrdersApi, restoresApi } from '../../api/endpoints/backups';
import { useAppSession } from '../../session/SessionProvider';
import { useServerNow, useSyncStatus } from '../../sync/SyncProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';
import { useCatalog } from '../catalogs/useCatalog';

export type RestoreStep = 'password' | 'confirm' | 'running' | 'done';
export interface RestoreFlow {
  backup: BackupDto;
  step: RestoreStep;
  password: string;
  word: string;
  error: string | null;
  result: RestoreResult | null;
}

const KEY = ['backups'] as const;

export function useBackups() {
  const base = useCatalog();
  const connected = useSyncStatus().online;
  const { session } = useAppSession();
  const now = useServerNow();
  const queryClient = useQueryClient();
  const api = () => base.api();
  const query = <T>(name: string, fn: () => Promise<T>) =>
    useQuery({ queryKey: [...KEY, name], enabled: connected, queryFn: fn });
  const status = query('password', () => api().request(backupPasswordApi.status));
  const list = query('list', () => api().request(backupsApi.list));
  const lost = query('lost', () => api().request(lostOrdersApi.list));
  const numbering = query('numbering', () => api().request(restoresApi.numbering));
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [flow, setFlow] = useState<RestoreFlow | null>(null);
  const [discarding, setDiscarding] = useState<LostOrderDto | null>(null);
  const [printed, setPrinted] = useState<Record<string, string>>({});
  const [numberingErrors, setNumberingErrors] = useState<Record<string, string>>({});

  const password = useValidatedForm({
    schema: setBackupPasswordSchema,
    defaultValues: { current: '', password: '', confirm: '' },
    labels: { current: 'Contraseña actual', password: 'Contraseña de respaldo', confirm: 'Confírmela' },
    warnings: (v) => (v.confirm ? { confirm: BACKUP_PASSWORD_WARNING } : {}),
    onSubmit: async (values) => {
      // Ya validadas: la confirmación es la misma contraseña.
      await api().request(backupPasswordApi.set, { body: { ...values, confirm: values.password } });
      setPasswordOpen(false);
      await refresh();
      base.setNotice({ tone: 'info', text: 'Se guardó la contraseña de respaldo. Guárdela impresa.' });
    },
  });

  const backups = list.data ?? [];
  const lastOk = (kind: BackupDto['kind']) => backups.find((b) => b.kind === kind && b.status === 'ok') ?? null;

  return {
    ...base,
    connected,
    now,
    loading: connected && (status.isPending || list.isPending || lost.isPending || numbering.isPending),
    failed: status.isError || list.isError,
    retry: () => void refresh(),
    status: status.data ?? null,
    backups,
    lastHourly: lastOk('hourly'),
    lastDaily: lastOk('daily'),
    lostPending: (lost.data ?? []).filter((l) => l.status === 'pending'),
    numbering: numbering.data?.required ? numbering.data.vessels : null,

    manual: () =>
      void base.act('manual', async () => {
        const b = await api().request(backupsApi.manual);
        await refresh();
        base.setNotice(
          b.status === 'ok'
            ? { tone: 'info', text: 'Se hizo el respaldo.' }
            : { tone: 'bad', text: `El respaldo falló: ${b.error ?? 'sin detalle'}` },
        );
      }),

    // Contraseña de respaldo (F-16).
    passwordOpen,
    openPassword: () => {
      password.reset({ current: '', password: '', confirm: '' });
      setPasswordOpen(true);
    },
    closePassword: () => setPasswordOpen(false),
    passwordFields: {
      current: password.field('current'),
      password: password.field('password'),
      confirm: password.field('confirm'),
    },
    passwordSummary: password.summary,
    passwordError: password.formError,
    submitPassword: password.submit,
    passwordSaving: password.form.formState.isSubmitting,

    // Restaurar por pasos (RF-RES-03).
    flow,
    startRestore: (backup: BackupDto) =>
      setFlow({ backup, step: 'password', password: '', word: '', error: null, result: null }),
    setFlowPassword: (password: string) => setFlow((f) => f && { ...f, password, error: null }),
    setFlowWord: (word: string) => setFlow((f) => f && { ...f, word, error: null }),
    toConfirm: () =>
      setFlow(
        (f) => f && (f.password ? { ...f, step: 'confirm' } : { ...f, error: 'Escriba la contraseña de respaldo.' }),
      ),
    back: () => setFlow((f) => f && { ...f, step: 'password' }),
    cancelRestore: () => setFlow(null),
    canRestore: flow?.word === RESTORE_WORD,
    // Tras restaurar, el servidor cerró todas las sesiones: se sale y la copia local se vuelve a descargar al entrar.
    signOut: () => void session.signOut(),
    restore: async () => {
      if (!flow) return;
      setFlow({ ...flow, step: 'running', error: null });
      try {
        const result = await api().request(restoresApi.restore, {
          body: { backupId: flow.backup.id, password: flow.password, confirm: flow.word },
        });
        setFlow({ ...flow, step: 'done', result });
      } catch (e) {
        const message = e instanceof ApiError ? e.message : 'No se pudo conectar con el servidor. Inténtelo de nuevo.';
        // Con la contraseña equivocada vuelve a pedirla; cualquier otro error, en la confirmación.
        const step = e instanceof ApiError && e.code === 'BACKUP_PASSWORD_INVALID' ? 'password' : 'confirm';
        setFlow({ ...flow, step, error: message });
      }
    },

    // Órdenes perdidas (RF-RES-07).
    recover: (l: LostOrderDto) =>
      void base.act(`recuperar-${l.id}`, async () => {
        try {
          await api().request(lostOrdersApi.recover, { params: { id: l.id } });
          base.setNotice({ tone: 'info', text: `Se recuperó la orden ${l.number} con su número original.` });
        } finally {
          await refresh();
        }
      }),
    discarding,
    askDiscard: (l: LostOrderDto) => setDiscarding(l),
    cancelDiscard: () => setDiscarding(null),
    discard: (reason: string) =>
      void base.act(`descartar-${discarding?.id}`, async () => {
        await api().request(lostOrdersApi.discard, { params: { id: discarding!.id }, body: { reason } });
        setDiscarding(null);
        await refresh();
        base.setNotice({ tone: 'info', text: `Se descartó la orden ${discarding!.number}.` });
      }),

    // Confirmación de la numeración (T108).
    printed,
    setPrinted: (vesselId: string, value: string) => setPrinted((p) => ({ ...p, [vesselId]: value })),
    numberingErrors,
    confirmNumbering: () =>
      void base.act('numeracion', async () => {
        const open = numbering.data?.vessels ?? [];
        // Vacío se leería como 0: se pide antes de enviar.
        const empty = open.filter((v) => !printed[v.id]);
        if (empty.length > 0) {
          setNumberingErrors(Object.fromEntries(empty.map((v) => [v.id, 'Escriba el último número impreso.'])));
          return;
        }
        const vessels = open.map((v) => ({ vesselId: v.id, lastPrinted: printed[v.id]! }));
        try {
          await api().request(restoresApi.confirmNumbering, { body: { vessels } as never });
          setNumberingErrors({});
          await refresh();
          base.setNotice({ tone: 'info', text: 'Numeración confirmada: ya se pueden emitir órdenes.' });
        } catch (e) {
          const fields = (e instanceof ApiError ? (e.details?.fields ?? {}) : {}) as Record<string, string>;
          // El servidor nombra el campo por su posición (vessels.0.lastPrinted) o por el buque (vessels.<id>).
          setNumberingErrors(
            Object.fromEntries(
              open.flatMap((v, i) => {
                const m = fields[`vessels.${i}.lastPrinted`] ?? fields[`vessels.${v.id}`];
                return m ? [[v.id, m]] : [];
              }),
            ),
          );
          throw e;
        }
      }),
  };
}

export type BackupsModel = ReturnType<typeof useBackups>;
