import { describe, expect, it } from 'vitest';
import { declarationStage, stageText } from './stages.ts';
import { parseTons } from './tons.ts';

// T100 y T103 · RF-TAB-04.
const t = parseTons;
const alloc = (allocated: string, loaded: string) => ({ allocated: t(allocated), loaded: t(loaded) });

describe('etapas de la DM (RF-TAB-04)', () => {
  it.each([
    ['sin total', null, [], false, 'pending', false, 'Pendiente'],
    ['sin total, aunque tenga asignación', null, [alloc('10', '0')], false, 'pending', false, 'Pendiente'],
    ['con total y sin asignaciones', '100', [], false, 'pending', false, 'Pendiente'],
    ['asignada y nada cargado', '100', [alloc('60', '0')], false, 'assigned', false, 'Asignada'],
    ['con algo cargado', '100', [alloc('60', '0,001')], false, 'extracting', false, 'En extracción'],
    ['cerrada', '100', [alloc('60', '60'), alloc('40', '40')], false, 'delivered', false, 'Entregada'],
    ['vencida sin cargar', '100', [alloc('0', '0')], true, 'assigned', true, 'Asignada · Vencida'],
    ['vencida con algo cargado', '100', [alloc('30', '30')], true, 'extracting', true, 'En extracción · Vencida'],
    ['cerrada aunque haya pasado el plazo', '100', [alloc('100', '100')], true, 'delivered', false, 'Entregada'],
    ['vencida sin asignaciones', '100', [], true, 'pending', true, 'Pendiente · Vencida'],
  ] as const)('%s', (_name, total, allocations, expired, stage, isExpired, text) => {
    const s = declarationStage({ total: total === null ? null : t(total), allocations: [...allocations], expired });
    expect(s).toEqual({ stage, expired: isExpired });
    expect(stageText(s)).toBe(text);
  });
});
