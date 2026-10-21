// T060 · spec §6, RF-DM-06, 10, RF-BUQ-06, 08, plan §4.3: los saldos derivados y el estado de la DM, con aritmética
// exacta (Const. art. I y V). El servidor los calcula con las mismas reglas en SQL (vistas) y una prueba los compara.
import { addTons, compareTons, parseTons, subTons, type Tons } from './tons.ts';

export const ZERO_TONS = parseTons('0');

export interface AllocationAmounts {
  allocated: Tons;
  /** Σ de la versión vigente de cada orden oficial de la asignación (§6). */
  loaded: Tons;
}

/** RF-ASG-04. */
export const allocationBalance = (a: AllocationAmounts): Tons => subTons(a.allocated, a.loaded);

export function declarationBalances(total: Tons | null, allocations: AllocationAmounts[]) {
  const allocated = addTons(...allocations.map((a) => a.allocated));
  const loaded = addTons(...allocations.map((a) => a.loaded));
  return {
    allocated,
    loaded,
    /** total − cargado; sin total, no hay saldo. */
    balance: total ? subTons(total, loaded) : null,
    /** total − asignado. */
    pendingAllocation: total ? subTons(total, allocated) : null,
    /** cargado / total × 100, con un decimal y coma ("37,5"). */
    progress: (total && !total.isZero() ? loaded.div(total).times(100) : ZERO_TONS).toFixed(1).replace('.', ','),
  };
}

export interface VesselAmounts {
  total: Tons;
  allocations: AllocationAmounts[];
  /** Toneladas transferidas a otro buque o registradas como merma (RF-BUQ-08): ya no están disponibles aquí. */
  disposedOut: Tons;
  /** Toneladas del sobrante cubiertas con una asignación de destino (RF-BUQ-08, «Asignar a DM pendientes»). */
  allocatedAsDisposition: Tons;
}

export function vesselBalances(v: VesselAmounts) {
  const allocated = addTons(...v.allocations.map((a) => a.allocated));
  const loaded = addTons(...v.allocations.map((a) => a.loaded));
  const surplus = subTons(subTons(v.total, loaded), v.disposedOut);
  return {
    allocated,
    loaded,
    /** Lo que aún se puede asignar: total − asignado − lo que salió del buque. */
    free: subTons(subTons(v.total, allocated), v.disposedOut),
    /** Restante físico: total − cargado. */
    remaining: subTons(v.total, loaded),
    /** RF-BUQ-08: lo libre más lo asignado y no cargado, menos lo que ya salió del buque. */
    surplus,
    /** Lo que todavía necesita destino para poder cerrar. */
    unresolved: subTons(surplus, v.allocatedAsDisposition),
  };
}

export type DeclarationStatus = 'closed' | 'expired' | 'pending_total' | 'active' | 'pending_allocation';

export const DECLARATION_STATUS_LABEL: Record<DeclarationStatus, string> = {
  closed: 'Cerrada',
  expired: 'Vencida',
  pending_total: 'Pendiente de total',
  active: 'Activa',
  pending_allocation: 'Pendiente de asignación',
};

/** RF-DM-06: en el orden de la tabla, la primera condición que se cumple. */
export function declarationStatus(d: {
  total: Tons | null;
  allocations: AllocationAmounts[];
  expired: boolean;
}): DeclarationStatus {
  const { loaded } = declarationBalances(d.total, d.allocations);
  if (d.total && compareTons(loaded, d.total) === 0) return 'closed';
  if (d.expired) return 'expired';
  if (!d.total) return 'pending_total';
  if (d.allocations.some((a) => compareTons(allocationBalance(a), ZERO_TONS) > 0)) return 'active';
  return 'pending_allocation';
}

/** RF-DM-10: «pendiente» para AL-01 y AL-02: sin total o con toneladas sin asignar, si no está Cerrada ni Vencida. */
export function isPendingDeclaration(d: { total: Tons | null; allocations: AllocationAmounts[]; expired: boolean }) {
  const status = declarationStatus(d);
  // Una DM cerrada nunca tiene toneladas sin asignar: basta con excluir la vencida.
  if (status === 'expired') return false;
  const { pendingAllocation } = declarationBalances(d.total, d.allocations);
  return pendingAllocation === null || compareTons(pendingAllocation, ZERO_TONS) > 0;
}
