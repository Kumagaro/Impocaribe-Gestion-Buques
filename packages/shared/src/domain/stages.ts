// T100 y T103 · RF-TAB-04: el avance de una DM por etapas, para el tablero, la búsqueda y el seguimiento en PDF.
import { declarationBalances, declarationStatus, ZERO_TONS, type AllocationAmounts } from './balances.ts';
import { compareTons, type Tons } from './tons.ts';

export const STAGES = ['pending', 'assigned', 'extracting', 'delivered'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  extracting: 'En extracción',
  delivered: 'Entregada',
};

/** La etapa en la que está la DM y si además está Vencida (RF-TAB-04: se marca sobre la etapa en la que quedó). */
export function declarationStage(d: { total: Tons | null; allocations: AllocationAmounts[]; expired: boolean }): {
  stage: Stage;
  expired: boolean;
} {
  const status = declarationStatus(d);
  const { loaded } = declarationBalances(d.total, d.allocations);
  const stage: Stage =
    status === 'closed'
      ? 'delivered'
      : compareTons(loaded, ZERO_TONS) > 0
        ? 'extracting'
        : d.total === null || d.allocations.length === 0
          ? 'pending'
          : 'assigned';
  return { stage, expired: status === 'expired' };
}

/** «En extracción · Vencida». */
export function stageText(s: { stage: Stage; expired: boolean }): string {
  return s.expired ? `${STAGE_LABEL[s.stage]} · Vencida` : STAGE_LABEL[s.stage];
}
