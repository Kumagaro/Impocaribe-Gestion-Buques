// T026 · Pruebas de componente (plan §11.2): respuestas del servidor generadas desde los esquemas Zod compartidos.
// Solo responde a llamadas del registro de web (el mismo que comprueba la prueba de contrato) y valida la entrada como
// lo hace el servidor (ZodValidationPipe), así una pantalla no puede apoyarse en algo que el servidor no aceptaría.
import { errorStatus, type ErrorCode } from '@impocaribe/shared';
import { z, type ZodType } from 'zod';
import { apiRegistry, type Endpoint } from '../src/api/client';
import type { HttpTransport } from '../src/platform/platform';

type Json = Record<string, unknown>;
type JsonSchema = Json & { $defs?: Record<string, Json> };

export const FIXED_TIME = '2026-10-14T16:40:00.000Z';

function generate(node: Json, root: JsonSchema, where: string): unknown {
  if (typeof node.$ref === 'string') {
    const target = root.$defs?.[node.$ref.replace('#/$defs/', '')];
    if (!target) throw new Error(`${where}: referencia ${node.$ref} sin definir`);
    return generate(target, root, where);
  }
  if ('const' in node) return node.const;
  if (Array.isArray(node.enum)) return node.enum[0];
  const options = (node.anyOf ?? node.oneOf) as Json[] | undefined;
  if (options) return generate(options.find((o) => o.type !== 'null') ?? options[0] ?? {}, root, where);
  if (Array.isArray(node.allOf)) return Object.assign({}, ...node.allOf.map((n) => generate(n as Json, root, where)));
  // Un tipo que admite null ("nullable") se genera con su tipo no nulo.
  if (Array.isArray(node.type))
    return generate({ ...node, type: node.type.find((t) => t !== 'null') ?? 'null' }, root, where);
  switch (node.type) {
    case 'object': {
      const props = (node.properties ?? {}) as Record<string, Json>;
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, generate(v, root, `${where}.${k}`)]));
    }
    case 'array': {
      const n = typeof node.minItems === 'number' ? node.minItems : 1;
      return Array.from({ length: n }, (_, i) => generate((node.items ?? {}) as Json, root, `${where}[${i}]`));
    }
    case 'string': {
      if (node.format === 'date-time') return FIXED_TIME;
      if (node.format === 'date') return FIXED_TIME.slice(0, 10);
      if (node.format === 'uuid') return '0192f0c4-7d2a-7c3e-8a51-3f2b9c1d4e5f';
      if (node.pattern)
        throw new Error(`${where}: el patrón ${String(node.pattern)} no se genera solo; páselo en overrides`);
      const min = typeof node.minLength === 'number' ? node.minLength : 1;
      const max = typeof node.maxLength === 'number' ? node.maxLength : Infinity;
      return 'texto de prueba'.padEnd(min, 'x').slice(0, Math.max(min, Math.min(max, 15)));
    }
    case 'integer':
    case 'number': {
      if (typeof node.minimum === 'number') return node.minimum;
      if (typeof node.exclusiveMinimum === 'number') return node.exclusiveMinimum + 1;
      return 1;
    }
    case 'boolean':
      return false;
    case 'null':
      return null;
    default:
      throw new Error(`${where}: no se puede generar ${JSON.stringify(node)}; páselo en overrides`);
  }
}

function merge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isObj(base) || !isObj(over)) return over;
  return Object.fromEntries(
    [...new Set([...Object.keys(base), ...Object.keys(over)])].map((k) => [k, merge(base[k], over[k])]),
  );
}

type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Un valor válido para el esquema, con lo que se indique en `overrides`. Siempre pasa por `schema.parse`. */
export function sampleOf<S extends ZodType>(schema: S, overrides?: DeepPartial<z.output<S>>): z.output<S> {
  const json = z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as JsonSchema;
  const generated = mergeOrGenerate(json, overrides);
  const parsed = schema.safeParse(generated);
  if (!parsed.success) throw new Error(`La respuesta generada no cumple su esquema: ${parsed.error.message}`);
  return parsed.data;
}

// Con overrides, los campos que se dan no se generan (así un patrón que no se sabe generar puede venir dado).
function mergeOrGenerate(
  node: Json,
  over: unknown,
  root: JsonSchema = node as JsonSchema,
  where = 'respuesta',
): unknown {
  if (over === undefined) return generate(node, root, where);
  if (node.type !== 'object' || typeof over !== 'object' || over === null || Array.isArray(over)) return over;
  const props = (node.properties ?? {}) as Record<string, Json>;
  const given = over as Json;
  const out = Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, mergeOrGenerate(v, given[k], root, `${where}.${k}`)]),
  );
  return merge(out, given);
}

export interface ReplyError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
type Reply = unknown | ReplyError | ((call: FakeCall) => unknown);

export interface FakeCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

const isReplyError = (r: unknown): r is ReplyError =>
  typeof r === 'object' && r !== null && 'code' in r && 'message' in r && typeof (r as ReplyError).code === 'string';
const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Servidor falso para pruebas de componente: `transport` va en createTestPlatform({ http }) o en createApiClient. */
export function createFakeServer({ baseUrl = 'https://servidor.test/api/v1' } = {}) {
  const replies = new Map<Endpoint, Reply>();
  const calls: FakeCall[] = [];
  const unhandled: string[] = [];
  const pattern = (e: Endpoint) => new RegExp(`^${e.path.replace(/:\w+/g, '[^/]+')}$`);

  const transport: HttpTransport = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.slice(new URL(baseUrl).pathname.length) || '/';
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: FakeCall = {
      method,
      path,
      query: u.searchParams,
      headers: { ...(init.headers as Record<string, string>) },
      body,
    };
    calls.push(call);
    const endpoint = [...replies.keys()].find((e) => e.method === method && pattern(e).test(path));
    if (!endpoint) {
      unhandled.push(`${method} ${path}`);
      return json(404, { code: 'NOT_FOUND', message: `Sin respuesta preparada para ${method} ${path}` });
    }
    if (endpoint.input) {
      const parsed = endpoint.input.safeParse(body);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) fields[issue.path.join('.')] ??= issue.message;
        const n = Object.keys(fields).length;
        return json(422, {
          code: 'VALIDATION_ERROR',
          message: `Hay ${n} ${n === 1 ? 'campo' : 'campos'} por corregir.`,
          details: { fields },
        });
      }
    }
    const reply = replies.get(endpoint);
    // Una respuesta puede ser una promesa: así una prueba retiene la llamada en curso (MOV-07).
    const value: unknown = await (typeof reply === 'function' ? (reply as (c: FakeCall) => unknown)(call) : reply);
    if (isReplyError(value)) return json(errorStatus(value.code), value);
    return json(value === undefined ? 204 : 200, value);
  };

  return {
    baseUrl,
    transport,
    calls,
    /** Llamadas que la pantalla hizo sin respuesta preparada: una prueba sana termina con la lista vacía. */
    unhandled,
    /** Prepara la respuesta de una llamada del registro; sin `reply`, una generada desde su esquema de salida. */
    respond<E extends Endpoint>(endpoint: E, reply?: Reply) {
      if (!apiRegistry.includes(endpoint)) {
        throw new Error(`${endpoint.method} ${endpoint.path} no está en el registro de llamadas (defineEndpoint)`);
      }
      replies.set(endpoint, reply !== undefined ? reply : endpoint.output ? sampleOf(endpoint.output) : undefined);
    },
  };
}
