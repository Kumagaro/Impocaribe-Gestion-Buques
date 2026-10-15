// T020 · Cliente de la API del servidor (plan §6): cabeceras de sesión, versión, hora e idempotencia; errores del §6.1;
// y el registro de llamadas que la prueba de contrato (T026) compara con las rutas del servidor.
import { signRequest, type ErrorCode, type Role } from '@impocaribe/shared';
import type { z, ZodType } from 'zod';
import type { HttpTransport } from '../platform/platform';

/** Transporte HTTP: en las apps, `platform.http`, que verifica la identidad del servidor (T021, DT-19). */
export type Transport = HttpTransport;

export type ClientErrorCode = ErrorCode | 'OFFLINE';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Endpoint<In extends ZodType = ZodType, Out extends ZodType = ZodType> {
  method: Method;
  /** Ruta bajo /api/v1, con parámetros `:nombre`. */
  path: string;
  input?: In;
  output?: Out;
  /** Códigos de negocio que la pantalla sabe tratar; deben coincidir con los que declara la ruta. */
  errors?: readonly ErrorCode[];
  /** Roles que pueden llamarla, o 'public'; deben coincidir con los de la ruta. */
  roles?: readonly Role[] | 'public';
}

/** Todas las llamadas que usa la interfaz: la prueba de contrato las compara con el servidor (plan §7.6). */
export const apiRegistry: Endpoint[] = [];

export function defineEndpoint<In extends ZodType = ZodType, Out extends ZodType = ZodType>(
  endpoint: Endpoint<In, Out>,
): Endpoint<In, Out> {
  if (apiRegistry.some((e) => e.method === endpoint.method && e.path === endpoint.path)) {
    throw new Error(`El endpoint ${endpoint.method} ${endpoint.path} ya está declarado: use la declaración existente.`);
  }
  apiRegistry.push(endpoint as Endpoint);
  return endpoint;
}

export interface ApiClientOptions {
  baseUrl: string;
  appVersion: string;
  getToken(): Promise<string | null>;
  /** El dispositivo emparejado y su secreto (DT-24); null mientras no está emparejado. */
  getDevice?(): Promise<{ id: string; secret: string } | null>;
  now(): Date;
  transport: Transport;
  onSessionExpired?(): void;
  onUpgradeRequired?(details: Record<string, unknown> | undefined): void;
  onResyncRequired?(): void;
}

export interface RequestOptions<In> {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: In;
  /** Clave del intento del usuario: el reintento del mismo intento la reutiliza (DT-22). */
  idempotencyKey?: string;
}

type Output<E> = E extends Endpoint<ZodType, infer Out> ? z.infer<Out> : never;
// Lo que viaja es lo que el servidor valida con el esquema: su entrada (con la confirmación, sin valores por defecto).
type Input<E> = E extends Endpoint<infer In, ZodType> ? z.input<In> : never;

const WRITES = new Set<Method>(['POST', 'PATCH', 'PUT', 'DELETE']);
const OFFLINE_MESSAGE = 'No hay conexión con el servidor. Inténtelo cuando vuelva la conexión.';
const UNEXPECTED_MESSAGE = 'El servidor respondió con un error inesperado. Inténtelo de nuevo.';
const BAD_SHAPE_MESSAGE =
  'La respuesta del servidor no tiene el formato esperado. Actualice la app o avise al responsable.';

export function createApiClient(options: ApiClientOptions) {
  // DT-24: el servidor rechaza una firma repetida; la hora de cada petición es estrictamente creciente.
  let lastTime = 0;
  const nextTime = () => (lastTime = Math.max(options.now().getTime(), lastTime + 1));

  function url(endpoint: Endpoint, req: RequestOptions<unknown>): string {
    const path = endpoint.path.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(req.params?.[name] ?? ''));
    const query = req.query ? `?${new URLSearchParams(req.query).toString()}` : '';
    return `${options.baseUrl}${path}${query}`;
  }

  async function headers(
    endpoint: Endpoint,
    req: RequestOptions<unknown>,
    target: string,
    body: string,
  ): Promise<Record<string, string>> {
    const time = String(nextTime());
    const h: Record<string, string> = {
      'X-App-Version': options.appVersion,
      'X-Device-Time': time,
    };
    const device = await options.getDevice?.();
    if (device) {
      const u = new URL(target);
      h['X-Device-Id'] = device.id;
      h['X-Device-Signature'] = await signRequest(
        { method: endpoint.method, path: u.pathname + u.search, time, body },
        device.secret,
      );
    }
    const token = await options.getToken();
    if (token) h.Authorization = `Bearer ${token}`;
    if (req.body !== undefined) h['Content-Type'] = 'application/json';
    if (WRITES.has(endpoint.method)) h['Idempotency-Key'] = req.idempotencyKey ?? crypto.randomUUID();
    return h;
  }

  async function fail(res: Response): Promise<never> {
    const body = (await res.json().catch(() => null)) as {
      code?: ClientErrorCode;
      message?: string;
      details?: Record<string, unknown>;
    } | null;
    if (!body?.code || !body.message) throw new ApiError(res.status, 'INTERNAL_ERROR', UNEXPECTED_MESSAGE);
    if (body.code === 'SESSION_EXPIRED') options.onSessionExpired?.();
    if (body.code === 'UPGRADE_REQUIRED') options.onUpgradeRequired?.(body.details);
    if (body.code === 'RESYNC_REQUIRED') options.onResyncRequired?.();
    throw new ApiError(res.status, body.code, body.message, body.details);
  }

  return {
    async request<E extends Endpoint>(endpoint: E, req: RequestOptions<Input<E>> = {}): Promise<Output<E>> {
      let res: Response;
      // El cuerpo se serializa una sola vez: la firma (DT-24) cubre exactamente lo que se envía.
      const target = url(endpoint, req);
      const body = req.body !== undefined ? JSON.stringify(req.body) : '';
      const sent = await headers(endpoint, req, target, body);
      try {
        res = await options.transport(target, {
          method: endpoint.method,
          headers: sent,
          ...(req.body !== undefined ? { body } : {}),
        });
      } catch {
        throw new ApiError(0, 'OFFLINE', OFFLINE_MESSAGE);
      }
      if (!res.ok) return fail(res);
      const data: unknown = res.status === 204 ? undefined : await res.json();
      if (!endpoint.output) return data as Output<E>;
      const parsed = endpoint.output.safeParse(data);
      if (!parsed.success) throw new ApiError(500, 'INTERNAL_ERROR', BAD_SHAPE_MESSAGE);
      return parsed.data as Output<E>;
    },
  };
}
