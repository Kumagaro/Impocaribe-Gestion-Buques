// T073 · RF-ORD-13, 17, RF-DM-07, 11, D3, D4, D5, plan §5.1 y §5.3: las validaciones de emitir y corregir, como una
// función pura. El servidor la llama dentro de la transacción, con los datos bloqueados; la interfaz, con los de la
// copia local, para el panel de comprobaciones. Devuelve todos los problemas, en el orden de la tabla de RF-ORD-13.
import type { ErrorCode } from '../errors.ts';
import { addDays } from './deadline.ts';
import type { DeclarationStatus } from './balances.ts';
import { addTons, compareTons, formatTons, subTons, tonsToApi, type Tons } from './tons.ts';

export interface OrderCheckInput {
  /** En una corrección: las toneladas de la versión vigente y la fecha de emisión de la versión 1. */
  correction: { currentTons: Tons; firstIssueDate: string } | null;
  /** Fecha de esta emisión (La Habana, hora del servidor). */
  today: string;
  /** RF-CFG-02: días máximos hacia el futuro para la fecha de carga. */
  maxLoadingDaysAhead: number;
  /** Firma y cuño oficiales cargados (RF-EMP-04). */
  hasOfficialSeal: boolean;
  declaration: { number: string; status: DeclarationStatus };
  vessel: { name: string; status: 'open' | 'closed'; arrivalDate: string | null };
  /** Saldo de la asignación sin contar esta orden (en una corrección, sin la versión vigente). */
  allocationBalance: Tons;
  tons: Tons;
  loadingDate: string;
  recipient: { name: string; active: boolean };
  truck: { plate: string; active: boolean; carrierId: string };
  driver: { fullName: string; active: boolean; carrierId: string };
  trailers: { plate: string; active: boolean; carrierId: string; capacity: Tons }[];
  /** Otras órdenes oficiales vigentes del camión con la misma fecha de carga (la que se corrige no cuenta). */
  sameDayOrders: number;
  overrides: { capacity?: string | undefined; sameDay?: string | undefined };
}

export interface OrderProblem {
  code: ErrorCode;
  message: string;
  /** El campo del formulario donde se muestra. */
  field?: string;
  details?: Record<string, string | number>;
}

const t = formatTons;

export function checkOrder(i: OrderCheckInput): OrderProblem[] {
  const out: OrderProblem[] = [];
  const add = (p: OrderProblem) => out.push(p);
  const fix = i.correction !== null;

  if (!i.hasOfficialSeal)
    add({
      code: 'MISSING_OFFICIAL_SIGNATURE',
      message: 'Falta la firma o el cuño oficial: una Apoderada debe cargarlos en Empresa antes de emitir.',
    });

  // RF-DM-07 y 11: en una corrección, la DM vencida se admite (sin aumentar toneladas) y la cerrada también.
  const { number, status } = i.declaration;
  if (status === 'pending_total')
    add({
      code: 'DECLARATION_PENDING_TOTAL',
      message: `La DM ${number} no tiene total: no admite órdenes.`,
      field: 'declarationId',
    });
  if (status === 'expired' && !fix)
    add({
      code: 'DECLARATION_EXPIRED',
      message: `La DM ${number} está vencida: reactívela para emitir órdenes.`,
      field: 'declarationId',
    });
  if (status === 'closed' && !fix)
    add({
      code: 'DECLARATION_CLOSED',
      message: `La DM ${number} está cerrada: ya se cargó todo su total.`,
      field: 'declarationId',
    });
  if (status === 'expired' && fix && compareTons(i.tons, i.correction!.currentTons) > 0)
    add({
      code: 'EXPIRED_CANNOT_INCREASE',
      message: `La DM ${number} está vencida: la corrección no puede pasar de ${t(i.correction!.currentTons)}.`,
      field: 'tons',
      details: { maxTons: tonsToApi(i.correction!.currentTons) },
    });

  if (i.vessel.status === 'closed' && !fix)
    add({
      code: 'VESSEL_CLOSED',
      message: `El buque ${i.vessel.name} está cerrado: no admite órdenes nuevas.`,
      field: 'allocationId',
    });
  if (!i.vessel.arrivalDate)
    add({
      code: 'VESSEL_NOT_ARRIVED',
      message: `El buque ${i.vessel.name} no tiene fecha de arribo real: regístrela antes de emitir.`,
      field: 'allocationId',
    });

  // D1: la orden cabe en el saldo de la asignación (en una corrección, contando lo que libera la versión vigente).
  const available = fix ? addTons(i.allocationBalance, i.correction!.currentTons) : i.allocationBalance;
  if (compareTons(i.tons, available) > 0)
    add({
      code: 'OVERDRAFT_ALLOCATION',
      message: `Esta orden pasa el saldo por ${t(subTons(i.tons, available))}. Quedan ${t(available)} en la asignación.`,
      field: 'tons',
      details: { availableTons: tonsToApi(available), excessTons: tonsToApi(subTons(i.tons, available)) },
    });

  const from = fix ? i.correction!.firstIssueDate : i.today;
  const until = addDays(i.today, i.maxLoadingDaysAhead);
  if (i.loadingDate < from)
    add({
      code: 'LOADING_DATE_BEFORE_ISSUE',
      message: fix
        ? 'La fecha de carga no puede ser anterior a la emisión de la versión 1.'
        : 'La fecha de carga no puede ser anterior a hoy.',
      field: 'loadingDate',
    });
  if (i.loadingDate > until)
    add({
      code: 'LOADING_DATE_TOO_FAR',
      message: `La fecha de carga admite como máximo ${i.maxLoadingDaysAhead} días desde hoy.`,
      field: 'loadingDate',
      details: { maxDays: i.maxLoadingDaysAhead },
    });

  const inactive = (field: string, what: string) =>
    add({ code: 'INACTIVE_RESOURCE', message: `${what} está inactivo: elija otro.`, field });
  if (!i.recipient.active) inactive('recipientId', `El destinatario ${i.recipient.name}`);
  if (!i.truck.active) inactive('truckId', `El camión ${i.truck.plate}`);
  if (!i.driver.active) inactive('driverId', `El chofer ${i.driver.fullName}`);
  for (const r of i.trailers.filter((x) => !x.active)) inactive('trailerIds', `El remolque ${r.plate}`);

  // RF-CAT-04, 09: chofer, camión y remolques del mismo transportista.
  if (i.driver.carrierId !== i.truck.carrierId)
    add({
      code: 'DRIVER_CARRIER_MISMATCH',
      message: `El chofer ${i.driver.fullName} no es del transportista del camión ${i.truck.plate}.`,
      field: 'driverId',
    });
  for (const r of i.trailers.filter((x) => x.carrierId !== i.truck.carrierId))
    add({
      code: 'TRAILER_CARRIER_MISMATCH',
      message: `El remolque ${r.plate} no es del transportista del camión ${i.truck.plate}.`,
      field: 'trailerIds',
    });

  // D4 y D5: se saltan solo con una decisión de excepción con motivo.
  const capacity = addTons(...i.trailers.map((r) => r.capacity));
  if (compareTons(i.tons, capacity) > 0 && !i.overrides.capacity)
    add({
      code: 'CAPACITY_REQUIRES_OVERRIDE',
      message: `La orden pasa la capacidad de los remolques (${t(capacity)}) por ${t(subTons(i.tons, capacity))}.`,
      field: 'tons',
      details: { capacityTons: tonsToApi(capacity), excessTons: tonsToApi(subTons(i.tons, capacity)) },
    });
  if (i.sameDayOrders > 0 && !i.overrides.sameDay)
    add({
      code: 'SAME_DAY_REQUIRES_OVERRIDE',
      message: `El camión ${i.truck.plate} ya tiene ${i.sameDayOrders === 1 ? 'otra orden' : `${i.sameDayOrders} órdenes`} con esa fecha de carga.`,
      field: 'truckId',
      details: { orders: i.sameDayOrders },
    });
  return out;
}
