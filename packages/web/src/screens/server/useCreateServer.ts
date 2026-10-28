// T127 · P-28 Crear servidor (solo en la PC con el instalador completo): la lógica del asistente. RF-INS-02, 03,
// RNF-18, RNF-19 y F-16. Comprueba la PC y busca otro servidor en la red (paso 1), comprueba el código de instalación
// (paso 2), pide el montaje de red (paso 3) y lanza el ayudante con el permiso de Windows (paso 4), con Reintentar y
// Deshacer si un paso falla. Al terminar (paso 5): el nombre, el QR y el paso a la primera Apoderada (P-02).
import {
  applySetupMessage,
  canCreateServer,
  checkServerPc,
  emptySetupProgress,
  serverName,
  type PcFacts,
  type ServerCheck,
  type SetupMessage,
  type SetupProgress,
} from '@impocaribe/shared';
import { installationCodeSchema } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { postLocalQr } from '../../api/endpoints/pairing';
import { findServer, probeServer, SERVER_PORT } from '../../connection/discovery';
import { useAppSession } from '../../session/SessionProvider';
import { useValidatedForm } from '../../validation/useValidatedForm';

export type CreateStep = 'comprobacion' | 'permisos' | 'montaje' | 'creacion' | 'listo';
export const CREATE_STEPS: { id: CreateStep; label: string }[] = [
  { id: 'comprobacion', label: 'Comprobación' },
  { id: 'permisos', label: 'Permisos' },
  { id: 'montaje', label: 'Montaje de red' },
  { id: 'creacion', label: 'Creación' },
  { id: 'listo', label: 'Listo' },
];

export type NetworkSetup = 'router' | 'hotspot';

/** RF-INS-03.6: lo que falló, en lenguaje claro y con lo que se puede hacer (el detalle técnico va aparte). */
export const STEP_HELP: Record<string, string> = {
  permisos: 'El código de instalación no es el de esta empresa. Revíselo en la hoja impresa que acompaña al paquete.',
  copiar:
    'No se pudieron copiar los componentes del servidor. Compruebe que queda espacio en el disco C: y pulse Reintentar.',
  base: 'No se pudo crear la base de datos. Pulse Reintentar; si vuelve a fallar, Deshacer deja la PC como estaba.',
  'servicio-base':
    'Windows no dejó registrar la base de datos como servicio. Un antivirus puede estar impidiéndolo: permita a «Órdenes de Carga» y pulse Reintentar.',
  estructura: 'No se pudo preparar la estructura de los datos. Pulse Reintentar.',
  identidad: 'No se pudo crear la identidad del servidor. Pulse Reintentar.',
  servicio:
    'Windows no dejó registrar el servidor como servicio. Un antivirus puede estar impidiéndolo: permita a «Órdenes de Carga» y pulse Reintentar.',
  firewall:
    'No se pudo permitir la red local en el firewall de Windows. Otro programa de seguridad puede estar bloqueándolo. Permita a «Órdenes de Carga» en ese programa y pulse Reintentar.',
  energia: 'No se pudo ajustar la energía de Windows para que la PC no se suspenda. Pulse Reintentar.',
  montaje: 'No se pudo guardar el montaje de red. Pulse Reintentar.',
  arranque:
    'El servidor no arrancó o no respondió a la comprobación. Pulse Reintentar; si vuelve a fallar, Deshacer deja la PC como estaba.',
};

const codeSchema = z.object({ code: installationCodeSchema });
const CODE_INVALID = 'El código no es el de esta empresa. Revíselo en la hoja impresa que acompaña al paquete.';

export interface ReadyServer {
  name: string;
  address: string | null;
  port: number;
  /** El contenido del QR de emparejamiento (un solo uso, 5 min), o null si no se pudo pedir. */
  qr: string | null;
}

export function useCreateServer() {
  const { session } = useAppSession();
  const navigate = useNavigate();
  const platform = session.device;
  const setup = platform.serverSetup;
  const [step, setStep] = useState<CreateStep>('comprobacion');
  const [facts, setFacts] = useState<PcFacts | null>(null);
  const [checks, setChecks] = useState<ServerCheck[] | null>(null);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [network, setNetwork] = useState<NetworkSetup>('router');
  const [progress, setProgress] = useState<SetupProgress>(emptySetupProgress);
  const [running, setRunning] = useState<'crear' | 'deshacer' | null>(null);
  const [undone, setUndone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState<ReadyServer | null>(null);
  // El código vive solo en memoria mientras dura el asistente: se manda al ayudante por la tubería (DT-17).
  const code = useRef('');

  const receive = useCallback((m: SetupMessage) => setProgress((p) => applySetupMessage(p, m, Date.now())), []);

  const loadReady = useCallback(
    async (address: string | null) => {
      const found = await probeServer(platform.discovery, '127.0.0.1', SERVER_PORT, 5000);
      if (!found) return setReady({ name: 'Servidor', address, port: SERVER_PORT, qr: null });
      let qr: string | null = null;
      try {
        const t = await session.apiFor('127.0.0.1', SERVER_PORT, found).request(postLocalQr);
        if (address)
          qr = JSON.stringify({
            serverId: t.serverId,
            caFingerprint: t.caFingerprint,
            qrToken: t.qrToken,
            address,
            port: SERVER_PORT,
          });
      } catch {
        // Sin QR: los dispositivos lo encuentran solos o se emparejan con el código (P-01).
      }
      setReady({ name: serverName(found.serverId), address, port: SERVER_PORT, qr });
    },
    [platform, session],
  );

  const check = useCallback(async () => {
    if (!setup) return;
    setChecks(null);
    setNotice(null);
    const started = Date.now();
    try {
      // RF-INS-03.1: por los mismos métodos que P-01, además de la difusión que hace el ayudante.
      const [pc, found] = await Promise.all([setup.facts(), findServer(platform.discovery, null)]);
      const existingServer =
        pc.existingServer ?? (found ? { name: serverName(found.serverId), address: found.address } : null);
      const local = await probeServer(platform.discovery, '127.0.0.1', SERVER_PORT, 1500);
      const all = {
        ...pc,
        existingServer: existingServer ?? (local ? { name: serverName(local.serverId), address: 'esta PC' } : null),
      };
      setFacts(all);
      setChecks(checkServerPc(all));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
      setChecks([]);
    } finally {
      setSearchSeconds(Math.round((Date.now() - started) / 1000));
    }
  }, [setup, platform]);

  // Al abrir: si el ayudante está trabajando (o terminó mientras la ventana estaba cerrada), se retoma.
  useEffect(() => {
    if (!setup) {
      void navigate('/conexion', { replace: true });
      return;
    }
    setup.listen(receive);
    let alive = true;
    void setup.state().then((s) => {
      if (!alive) return;
      const replayed = s.messages.reduce((p, m) => applySetupMessage(p, m, Date.now()), emptySetupProgress());
      if (s.running || (s.operation === 'crear' && replayed.outcome && !replayed.outcome.ok)) {
        setProgress(replayed);
        setRunning(s.running ? (s.operation === 'deshacer' ? 'deshacer' : 'crear') : null);
        setStep('creacion');
      } else if (s.operation === 'crear' && replayed.outcome?.ok) {
        setStep('listo');
        void loadReady(null);
      } else void check();
    });
    return () => {
      alive = false;
    };
  }, [setup, navigate, receive, check, loadReady]);

  // El tiempo transcurrido de la creación, cada segundo mientras trabaja.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const form = useValidatedForm({
    schema: codeSchema,
    defaultValues: { code: '' },
    labels: { code: 'Código de instalación' },
    onSubmit: async ({ code: value }) => {
      if (!(await setup!.checkCode(value))) {
        form.form.setError('code', { type: 'server', message: CODE_INVALID });
        return;
      }
      code.current = value;
      setStep('montaje');
    },
  });

  const run = async (operation: 'crear' | 'deshacer') => {
    if (!setup) return;
    setNotice(null);
    setRunning(operation);
    if (operation === 'crear') {
      setStartedAt(Date.now());
      setUndone(false);
    }
    setStep('creacion');
    try {
      const outcome = await setup.run(operation, operation === 'crear' ? { network, code: code.current } : {});
      if (operation === 'deshacer') setUndone(outcome.ok);
      else if (outcome.ok) {
        setStep('listo');
        await loadReady(facts?.network?.address ?? null);
      }
    } catch (err) {
      // Sin el permiso de Windows no empezó nada: se vuelve a donde estaba.
      setNotice(err instanceof Error ? err.message : String(err));
      if (operation === 'crear' && progress.steps.length === 0) setStep('montaje');
    } finally {
      setRunning(null);
    }
  };

  const failed = progress.outcome && !progress.outcome.ok ? progress.outcome : null;
  const failedStep = failed ? progress.steps.find((s) => s.id === failed.step) : undefined;

  return {
    available: setup !== undefined,
    step,
    stepIndex: CREATE_STEPS.findIndex((s) => s.id === step),
    // Paso 1
    checks,
    searchSeconds,
    canContinue: checks !== null && checks.length > 0 && canCreateServer(checks),
    recheck: () => void check(),
    toPermissions: () => setStep('permisos'),
    // Paso 2
    code: form.field('code'),
    summary: form.summary,
    checkingCode: form.form.formState.isSubmitting,
    submitCode: form.submit,
    // Paso 3
    network,
    setNetwork,
    wifiPc: facts?.network?.kind === 'wifi',
    create: () => void run('crear'),
    // Paso 4
    progress,
    running,
    elapsedMs: startedAt ? (running ? now : (progress.steps.at(-1)?.endedAt ?? now)) - startedAt : 0,
    failed,
    failedTitle: failedStep?.title ?? null,
    failedHelp: failed ? (STEP_HELP[failed.step] ?? failed.error) : null,
    retry: () => void run('crear'),
    undo: () => void run('deshacer'),
    undone,
    // Paso 5
    ready,
    firstApoderada: () => void navigate('/conexion', { replace: true }),
    notice,
    back: (to: CreateStep) => setStep(to),
    cancel: () => void navigate('/conexion', { replace: true }),
  };
}

export type CreateServerModel = ReturnType<typeof useCreateServer>;
