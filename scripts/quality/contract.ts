// T026 · Prueba de contrato (plan §7.6 y §11.2): compara el registro de llamadas de web con las rutas del servidor.
// La tabla de rutas se lee de los metadatos de Nest sin arrancar la app: módulos, controladores y @Contract.
import 'reflect-metadata';
import { z, type ZodType } from 'zod';

const CONTRACT = 'impocaribe:contract';
// Mismas claves que @nestjs/common/constants (PATH_METADATA, METHOD_METADATA, MODULE_METADATA).
const PATH = 'path';
const METHOD = 'method';
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];

type Roles = readonly string[] | 'public';

export interface ContractSide {
  method: string;
  path: string;
  input?: ZodType | undefined;
  output?: ZodType | undefined;
  errors?: readonly string[] | undefined;
  roles?: Roles | undefined;
}

export interface ServerRoute extends ContractSide {
  /** false si la ruta no declara @Contract. */
  declared: boolean;
}

type Ctor = abstract new (...args: never[]) => unknown;
type ModuleRef = Ctor | { module: Ctor; controllers?: Ctor[]; imports?: ModuleRef[] };

const joinPath = (...parts: (string | string[] | undefined)[]) =>
  '/' +
  parts
    .flat()
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/** Rutas de un módulo de Nest y de los que importa, relativas al prefijo global (/api/v1). */
export function routeTable(root: ModuleRef): ServerRoute[] {
  const seen = new Set<Ctor>();
  const routes: ServerRoute[] = [];
  const visit = (ref: ModuleRef) => {
    const mod = typeof ref === 'function' ? ref : ref.module;
    if (seen.has(mod)) return;
    seen.add(mod);
    const extra = typeof ref === 'function' ? {} : ref;
    const imports: ModuleRef[] = [...(Reflect.getMetadata('imports', mod) ?? []), ...(extra.imports ?? [])];
    const controllers: Ctor[] = [...(Reflect.getMetadata('controllers', mod) ?? []), ...(extra.controllers ?? [])];
    for (const ctrl of controllers) {
      const base = Reflect.getMetadata(PATH, ctrl) as string | string[] | undefined;
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const method = Reflect.getMetadata(METHOD, handler) as number | undefined;
        if (method === undefined) continue;
        const contract = Reflect.getMetadata(CONTRACT, handler) as Omit<ContractSide, 'method' | 'path'> | undefined;
        routes.push({
          method: METHODS[method] ?? String(method),
          path: joinPath(base, Reflect.getMetadata(PATH, handler) as string | string[] | undefined),
          declared: contract !== undefined,
          ...contract,
        });
      }
    }
    imports.forEach(visit);
  };
  visit(root);
  return routes;
}

const shape = (schema: ZodType | undefined, io: 'input' | 'output') =>
  schema === undefined ? 'ninguno' : JSON.stringify(z.toJSONSchema(schema, { io, unrepresentable: 'any' }));
const sameSet = (a: readonly string[] | 'public' | undefined, b: readonly string[] | 'public' | undefined) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
// Los nombres de los parámetros pueden variar; su posición no.
const routeKey = (r: ContractSide) => `${r.method} ${r.path.replace(/:\w+/g, ':')}`;

/** Problemas del contrato, en español; una lista vacía significa que web y servidor coinciden. */
export function checkContract(web: readonly ContractSide[], server: readonly ServerRoute[]): string[] {
  const problems: string[] = [];
  for (const call of web) {
    const name = `${call.method} ${call.path}`;
    const route = server.find((r) => routeKey(r) === routeKey(call));
    if (!route) {
      problems.push(`${name}: no existe en el servidor`);
      continue;
    }
    if (!route.declared) {
      problems.push(`${name}: la ruta del servidor no declara su contrato (@Contract)`);
      continue;
    }
    if (shape(call.input, 'input') !== shape(route.input, 'input'))
      problems.push(`${name}: el esquema de entrada no coincide`);
    if (shape(call.output, 'output') !== shape(route.output, 'output'))
      problems.push(`${name}: el esquema de salida no coincide`);
    if (!sameSet(call.errors ?? [], route.errors ?? [])) problems.push(`${name}: los códigos de error no coinciden`);
    if (call.roles !== undefined && !sameSet(call.roles, route.roles)) problems.push(`${name}: los roles no coinciden`);
  }
  return problems;
}
