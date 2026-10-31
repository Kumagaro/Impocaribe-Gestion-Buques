// T128 · P-29 Estado del servidor (solo en la PC servidor): la lógica. RF-INS-04, RF-RED-04, 05, RF-INS-11, RNF-21.
// Cualquiera ante la PC ve el estado y confirma o rechaza emparejamientos; revocar un dispositivo pide una Apoderada
// con sesión; el mantenimiento (reparar, reiniciar, restablecer la contraseña de una Apoderada) lo hace el ayudante con
// el permiso de Windows y el código de instalación que guarda el servidor.
import {
  applySetupMessage,
  emptySetupProgress,
  compareVersions,
  serverName,
  type SetupMessage,
  type SetupOutcome,
  type SetupProgress,
} from '@impocaribe/shared';
import {
  emergencyResetSchema,
  installationCodeSchema,
  prepareMoveSchema,
  uninstallSchema,
  type pendingPairingSchema,
  type ServerStatus,
} from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '../../api/client';
import { devicesApi, localApi } from '../../api/endpoints/local';
import { postLocalQr } from '../../api/endpoints/pairing';
import { useAppSession } from '../../session/SessionProvider';

import { useValidatedForm } from '../../validation/useValidatedForm';

export type PendingPairing = z.infer<typeof pendingPairingSchema>;
export type Maintenance = 'reparar' | 'reiniciar' | 'actualizar' | 'trasladar' | 'restablecer' | 'desinstalar';

/** Cada cuánto se pide el estado y las solicitudes (una solicitud vale 5 minutos). */
export const STATUS_EVERY_MS = 5000;
export const PAIRING_EVERY_MS = 2000;
/** El QR lleva un token de un solo uso que caduca a los 5 minutos: se renueva antes. */
export const QR_EVERY_MS = 4 * 60_000;
/** RF-RED-01: con el hotspot, a partir de estos dispositivos conectados la conexión se resiente (AL-21). */
export const HOTSPOT_LIMIT = 8;

export const MAINTENANCE_TITLE: Record<Maintenance, string> = {
  reparar: 'Reparar el servidor',
  reiniciar: 'Reiniciar el servicio',
  actualizar: 'Actualizar el servidor',
  trasladar: 'Preparar traslado',
  desinstalar: 'Desinstalar el servidor',
  restablecer: 'Restablecer la contraseña de una Apoderada',
};

const codeSchema = z.object({ code: installationCodeSchema });
const CODE_INVALID = 'El código de instalación no es correcto.';

export function useServerStatus() {
  const { session, state } = useAppSession();
  const setup = session.device.serverSetup;
  const isApoderada = state.session?.user.role === 'apoderada';
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPairing[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => session.now().getTime());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);
  const [apoderadas, setApoderadas] = useState<{ username: string; fullName: string }[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [progress, setProgress] = useState<SetupProgress>(emptySetupProgress);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<SetupOutcome | null>(null);
  const address = status?.network.address ?? null;
  const port = status?.network.port ?? null;
  const alive = useRef(true);
  // Se vuelve a marcar al montar: StrictMode (desarrollo) desmonta y monta otra vez, y sin esto se descartaría todo.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await session.api().request(localApi.status);
      if (!alive.current) return;
      setStatus(s);
      setError(null);
    } catch (err) {
      if (alive.current) setError(err instanceof ApiError ? err.message : 'El servidor no responde.');
    }
  }, [session]);

  const loadPending = useCallback(async () => {
    try {
      const list = await session.api().request(localApi.pairing);
      if (alive.current) setPending(list);
    } catch {
      // Sin respuesta, las solicitudes siguen como estaban; el estado ya dice que el servidor no responde.
    }
  }, [session]);

  useEffect(() => {
    void loadStatus();
    void loadPending();
    const timers = [
      setInterval(() => void loadStatus(), STATUS_EVERY_MS),
      setInterval(() => void loadPending(), PAIRING_EVERY_MS),
      setInterval(() => setNow(session.now().getTime()), 1000),
    ];
    return () => timers.forEach(clearInterval);
  }, [loadStatus, loadPending, session]);

  // El QR de emparejamiento, con la dirección actual del servidor; se renueva antes de que caduque su token.
  useEffect(() => {
    // Solo cuando cambian la dirección o el puerto: el estado se refresca cada 5 s y no debe gastar tokens.
    if (!address || port === null) return;
    const load = async () => {
      try {
        const t = await session.api().request(postLocalQr);
        if (alive.current)
          setQr(
            JSON.stringify({
              serverId: t.serverId,
              caFingerprint: t.caFingerprint,
              qrToken: t.qrToken,
              address,
              port,
            }),
          );
      } catch {
        if (alive.current) setQr(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), QR_EVERY_MS);
    return () => clearInterval(timer);
  }, [address, port, session]);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({
        tone: 'bad',
        text: err instanceof ApiError ? err.message : 'No se pudo hacer: el servidor no responde.',
      });
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const decide = (r: PendingPairing, accept: boolean) =>
    act(`${accept ? 'confirmar' : 'rechazar'}-${r.id}`, async () => {
      await session.api().request(accept ? localApi.confirm : localApi.reject, { params: { id: r.id } });
      setNotice({
        tone: 'info',
        text: accept ? `«${r.deviceName}» quedó emparejado.` : `Se rechazó «${r.deviceName}».`,
      });
      await Promise.all([loadPending(), loadStatus()]);
    });

  const revoke = (id: string, name: string) =>
    act(`revocar-${id}`, async () => {
      await session.api().request(devicesApi.revoke, { params: { id } });
      setNotice({ tone: 'info', text: `Se revocó «${name}»: tendrá que volver a emparejarse.` });
      await loadStatus();
    });

  // ---------- mantenimiento con el ayudante ----------

  useEffect(() => {
    setup?.listen((m: SetupMessage) => setProgress((p) => applySetupMessage(p, m, Date.now())));
  }, [setup]);

  const runHelper = async (
    operation: Maintenance,
    request: { code: string; username?: string; password?: string; dest?: string; confirm?: string; wipe?: boolean },
  ) => {
    if (!setup) return;
    setProgress(emptySetupProgress());
    setOutcome(null);
    setRunning(true);
    try {
      const result = await setup.run(operation, request);
      if (!alive.current) return;
      setOutcome(result);
      if (!result.ok && result.step === 'permisos') {
        const field =
          operation === 'restablecer'
            ? reset
            : operation === 'trasladar'
              ? moveForm
              : operation === 'desinstalar'
                ? uninstallForm
                : codeForm;
        field.form.setError('code', { type: 'server', message: CODE_INVALID });
      }
    } catch (err) {
      if (alive.current)
        setOutcome({ ok: false, step: 'inicio', error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (alive.current) setRunning(false);
      void loadStatus();
    }
  };

  const codeForm = useValidatedForm({
    schema: codeSchema,
    defaultValues: { code: '' },
    labels: { code: 'Código de instalación' },
    onSubmit: async ({ code }) => {
      if (maintenance === 'reparar' || maintenance === 'reiniciar' || maintenance === 'actualizar')
        await runHelper(maintenance, { code });
    },
  });

  const reset = useValidatedForm({
    schema: emergencyResetSchema,
    defaultValues: { username: '', password: '', confirm: '', code: '' },
    labels: {
      username: 'Apoderada',
      password: 'Contraseña temporal',
      confirm: 'Confirmar',
      code: 'Código de instalación',
    },
    onSubmit: async (values) => {
      await runHelper('restablecer', values);
    },
  });

  // T130 · RF-INS-07: preparar el traslado. Dónde guardar el archivo (una USB), la contraseña de respaldo con que se
  // cifra, la confirmación de que esta PC deja de ser el servidor y el código de instalación.
  const [moveFolder, setMoveFolder] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveDest, setMoveDest] = useState<string | null>(null);
  const moveForm = useValidatedForm({
    schema: prepareMoveSchema,
    defaultValues: { password: '', code: '' },
    labels: { password: 'Contraseña de respaldo', code: 'Código de instalación' },
    onSubmit: async ({ password, code }) => {
      if (!moveFolder) return setMoveError('Elija dónde guardar el archivo de traslado.');
      if (!understood) return setMoveError('Marque que entiende que esta PC dejará de ser el servidor.');
      setMoveError(null);
      const day = new Date(session.now()).toISOString().slice(0, 10);
      const dest = `${moveFolder.replace(/[\\/]+$/, '')}\\${serverName(status!.serverId)}-${day}.icmove`;
      setMoveDest(dest);
      await runHelper('trasladar', { code, password, dest });
    },
  });

  // T131 · RF-INS-08: desinstalar. La palabra DESINSTALAR, el código y si se borran también los datos.
  const [wipe, setWipe] = useState(false);
  const [uninstallDay, setUninstallDay] = useState<string | null>(null);
  const uninstallForm = useValidatedForm({
    schema: uninstallSchema,
    defaultValues: { word: '', code: '' },
    labels: { word: 'Escriba DESINSTALAR para confirmar', code: 'Código de instalación' },
    onSubmit: async ({ word, code }) => {
      setUninstallDay(new Date(session.now()).toISOString().slice(0, 10));
      await runHelper('desinstalar', { code, confirm: word, wipe });
    },
  });

  const open = (which: Maintenance) => {
    setMaintenance(which);
    setMoveFolder(null);
    setUnderstood(false);
    setWipe(false);
    uninstallForm.reset();
    setMoveError(null);
    moveForm.reset();
    setProgress(emptySetupProgress());
    setOutcome(null);
    codeForm.reset();
    reset.reset();
    if (which === 'restablecer')
      void session
        .api()
        .request(localApi.apoderadas)
        .then((list) => alive.current && setApoderadas(list))
        .catch(() => alive.current && setApoderadas([]));
  };

  const connected = status?.devices.filter((d) => d.connected).length ?? 0;
  return {
    status,
    error,
    name: status ? serverName(status.serverId) : null,
    now,
    connected,
    hotspotFull: status?.network.setup === 'hotspot' && connected >= HOTSPOT_LIMIT,
    pending,
    qr,
    busy,
    notice,
    confirm: (r: PendingPairing) => void decide(r, true),
    reject: (r: PendingPairing) => void decide(r, false),
    canRevoke: isApoderada,
    revoke: (id: string, name: string) => void revoke(id, name),
    canMaintain: setup !== undefined,
    /** T129 · RF-INS-06: la versión a la que se puede actualizar (la que trae el instalador de esta app), o null. */
    updateTo:
      setup?.bundleVersion && status && compareVersions(setup.bundleVersion, status.version) > 0
        ? setup.bundleVersion
        : null,
    maintenance,
    open,
    close: () => !running && setMaintenance(null),
    code: codeForm.field('code'),
    codeSummary: codeForm.summary,
    submitCode: codeForm.submit,
    apoderadas,
    resetFields: {
      username: reset.field('username'),
      password: reset.field('password'),
      confirm: reset.field('confirm'),
      code: reset.field('code'),
    },
    resetSummary: reset.summary,
    moveFolder,
    pickMoveFolder: async () => {
      const folder = await setup?.pickFolder();
      if (folder) {
        setMoveFolder(folder);
        setMoveError(null);
      }
    },
    understood,
    setUnderstood,
    moveError,
    moveDest,
    movePassword: moveForm.field('password'),
    moveCode: moveForm.field('code'),
    moveSummary: moveForm.summary,
    submitMove: moveForm.submit,
    wipe,
    setWipe,
    uninstallFolder: uninstallDay ? `C:\\ProgramData\\Impocaribe\\desinstalado-${uninstallDay}` : null,
    uninstallWord: uninstallForm.field('word'),
    uninstallCode: uninstallForm.field('code'),
    uninstallSummary: uninstallForm.summary,
    submitUninstall: uninstallForm.submit,
    submitReset: reset.submit,
    progress,
    running,
    outcome,
    refresh: () => void loadStatus(),
  };
}

export type ServerStatusModel = ReturnType<typeof useServerStatus>;
