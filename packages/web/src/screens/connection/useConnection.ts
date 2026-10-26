// T038 · P-01 Conexión y emparejamiento: la lógica (plan §7.3). RF-CON-01, RF-RED-02 a 04, F-01. Busca el servidor
// sin escribir nada (DT-20), lo empareja por código o por QR (DT-24) y guarda lo aprendido. En la PC servidor se
// empareja sola por la interfaz local.
import { serverName } from '@impocaribe/shared';
import { manualConnectionSchema } from '@impocaribe/shared/validation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { getDiscovery, postPairSelf } from '../../api/endpoints/pairing';
import { DISCOVERY_TIMEOUTS, findServer, probeServer, SERVER_PORT, type FoundServer } from '../../connection/discovery';
import { pairWithQr, parseQrPayload, startCodePairing, waitForConfirmation } from '../../connection/pairing';
import type { DiscoveryMethod } from '../../platform/platform';
import { useAppSession } from '../../session/SessionProvider';
import { useDeviceClass } from '../../ui/device';
import { useValidatedForm } from '../../validation/useValidatedForm';

export type ConnectionPhase =
  | { kind: 'searching'; method: DiscoveryMethod | null }
  | { kind: 'notFound' }
  | { kind: 'found'; server: FoundServer }
  | { kind: 'code'; server: FoundServer; code: string; expiresAt: string }
  | { kind: 'done'; name: string };

/** Los métodos en el orden en que se prueban (DT-20); "la última dirección" solo si ya estuvo emparejado. */
export const DISCOVERY_STEPS: { method: DiscoveryMethod; label: string }[] = [
  { method: 'dnssd', label: 'Anuncio del servidor en la red' },
  { method: 'broadcast', label: 'Mensaje de difusión' },
  { method: 'subnet', label: 'Direcciones de la red local' },
];

const NOT_A_SERVER = 'En esa dirección no responde un servidor de Órdenes de Carga.';
const NOT_OUR_QR = 'Ese QR no es el de un servidor de Órdenes de Carga.';

/** "7f3a2c19…": la identidad abreviada que se compara con la de la pantalla del servidor. */
export const shortIdentity = (fingerprint: string) => `${fingerprint.replaceAll(':', '').slice(0, 8).toLowerCase()}…`;

export function useConnection() {
  const { session } = useAppSession();
  const navigate = useNavigate();
  const device = useDeviceClass();
  const platform = session.device;
  const info = session.deviceInfo();
  const [phase, setPhase] = useState<ConnectionPhase>({ kind: 'searching', method: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => session.now().getTime());
  const abort = useRef<AbortController | null>(null);
  // Cada búsqueda tiene su número: una vieja (o de una pantalla ya cerrada) no empareja ni cambia la pantalla.
  const searchRun = useRef(0);
  const deviceName = info.name ?? (info.platform === 'android' ? 'Dispositivo Android' : 'PC con Windows');
  const description = { deviceName, platform: info.platform };

  const paired = useCallback(
    async (server: FoundServer, ids: { deviceId: string; deviceSecret: string }, isServerPc: boolean) => {
      const name = serverName(server.serverId);
      await session.paired({
        serverId: server.serverId,
        caFingerprint: server.caFingerprint,
        lastAddress: { address: server.address, port: server.port },
        serverName: name,
        deviceName,
        isServerPc,
        ...ids,
      });
      setPhase({ kind: 'done', name });
    },
    [session, deviceName],
  );

  const search = useCallback(async () => {
    abort.current?.abort();
    const run = ++searchRun.current;
    const current = () => run === searchRun.current;
    setNotice(null);
    setPhase({ kind: 'searching', method: null });
    // En Windows, primero la propia PC: si el servidor está en este equipo, se empareja solo (P-01).
    if (info.platform === 'windows') {
      const local = await probeServer(platform.discovery, '127.0.0.1', SERVER_PORT, DISCOVERY_TIMEOUTS.last);
      if (!current()) return;
      if (local) {
        try {
          const ids = await session
            .apiFor(local.address, local.port, local)
            .request(postPairSelf, { body: description });
          if (!current()) return;
          await paired({ ...local, method: 'last' }, ids, true);
          return;
        } catch {
          // No es la PC servidor (o no responde): se busca en la red como cualquier otro dispositivo.
        }
      }
    }
    const found = await findServer(
      platform.discovery,
      null,
      (method) => current() && setPhase({ kind: 'searching', method }),
    );
    if (!current()) return;
    setPhase(found ? { kind: 'found', server: found } : { kind: 'notFound' });
    // description y paired cambian con cada render: la búsqueda solo se relanza a mano o si cambia la plataforma.
  }, [platform, session]);

  useEffect(() => {
    void search();
    return () => {
      searchRun.current++;
      abort.current?.abort();
    };
  }, [search]);

  // La cuenta atrás de los 5 minutos del código.
  useEffect(() => {
    if (phase.kind !== 'code') return;
    const timer = setInterval(() => setNow(session.now().getTime()), 1000);
    return () => clearInterval(timer);
  }, [phase.kind, session]);

  const pairWithCode = async () => {
    if (phase.kind !== 'found') return;
    const { server } = phase;
    const api = session.apiFor(server.address, server.port, server);
    setNotice(null);
    setBusy(true);
    try {
      const request = await startCodePairing(api, server, description);
      setNow(session.now().getTime());
      setPhase({ kind: 'code', server, code: request.code, expiresAt: request.expiresAt });
      const controller = new AbortController();
      abort.current = controller;
      const ids = await waitForConfirmation(api, request.requestId, request.clientNonce, controller.signal);
      await paired(server, ids, false);
    } catch (err) {
      if (abort.current?.signal.aborted) return;
      setNotice(err instanceof ApiError ? err.message : 'Se perdió la conexión con el servidor. Inténtelo de nuevo.');
      setPhase({ kind: 'found', server });
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (phase.kind !== 'code') return;
    abort.current?.abort();
    setPhase({ kind: 'found', server: phase.server });
  };

  const scan = async () => {
    const text = await platform.scanQr?.();
    if (!text) return;
    const qr = parseQrPayload(text);
    if (!qr) {
      setNotice(NOT_OUR_QR);
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      // Se comprueba que quien responde en la dirección del QR es el servidor que el QR dice ser.
      const api = session.apiFor(qr.address, qr.port, qr);
      const info = await api.request(getDiscovery);
      if (info.serverId !== qr.serverId) throw new ApiError(0, 'NOT_FOUND', NOT_OUR_QR);
      const server: FoundServer = { ...qr, version: info.version, method: 'qr' };
      await paired(server, await pairWithQr(api, qr, description), false);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor del QR.');
    } finally {
      setBusy(false);
    }
  };

  const manual = useValidatedForm({
    schema: manualConnectionSchema,
    defaultValues: { address: '' },
    labels: { address: 'Dirección' },
    onSubmit: async ({ address }) => {
      setNotice(null);
      const found = await probeServer(platform.discovery, address.address, address.port, DISCOVERY_TIMEOUTS.last * 2);
      if (found) setPhase({ kind: 'found', server: { ...found, method: 'manual' } });
      else setNotice(NOT_A_SERVER);
    },
  });

  const remaining = phase.kind === 'code' ? Math.max(0, Date.parse(phase.expiresAt) - now) : 0;
  return {
    phase,
    notice,
    busy,
    /** "4:38" */
    countdown: `${Math.floor(remaining / 60_000)}:${String(Math.floor((remaining % 60_000) / 1000)).padStart(2, '0')}`,
    canScan: platform.scanQr !== undefined && device !== 'desktop',
    advanced,
    toggleAdvanced: () => setAdvanced((v) => !v),
    address: manual.field('address'),
    submitAddress: manual.submit,
    probing: manual.form.formState.isSubmitting,
    search: () => void search(),
    pairWithCode: () => void pairWithCode(),
    cancel,
    scan: () => void scan(),
    goLogin: () => void navigate('/login', { replace: true }),
    /** RF-RED-06: si no lo encuentra, el diagnóstico explica por qué. */
    openDiagnostics: () => void navigate('/diagnostico'),
  };
}

export type ConnectionModel = ReturnType<typeof useConnection>;
