// T103 · RF-TAB-06: el seguimiento de una DM en PDF (la ficha de P-12): etapa, saldos, plazo, asignaciones por buque y
// órdenes con su estado. Se arma con los mismos DTO que la copia local y se convierte con el motor de las órdenes.
import {
  DEADLINE_DAYS,
  STAGES,
  STAGE_LABEL,
  deadlineAt,
  declarationStage,
  formatTons,
  havanaDateTime,
  parseTons,
  pdfLoadingDate,
  stageText,
  type Clock,
} from '@impocaribe/shared';
import type { DeclarationDto, OrderDto } from '@impocaribe/shared/validation';

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const t = (s: string | null) => (s === null ? '—' : formatTons(parseTons(s)));

export interface TrackingData {
  declaration: DeclarationDto;
  clientName: string;
  vesselNames: Record<string, string>;
  orders: OrderDto[];
}

export function trackingHtml(d: TrackingData, clock: Clock): string {
  const dm = d.declaration;
  const now = clock.now();
  const deadline = deadlineAt(dm.deadlineStartDate, now);
  const expired = dm.expiredAt !== null || deadline.expired;
  const stage = declarationStage({
    total: dm.totalTons === null ? null : parseTons(dm.totalTons),
    allocations: dm.allocations.map((a) => ({
      allocated: parseTons(a.allocatedTons),
      loaded: parseTons(a.loadedTons),
    })),
    expired,
  });
  const reached = STAGES.indexOf(stage.stage);
  const orders = [...d.orders].sort((a, b) => b.current.loadingDate.localeCompare(a.current.loadingDate));
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Seguimiento DM ${esc(dm.number)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #14202b; font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; line-height: 1.45; }
  h1 { font-size: 17px; margin: 0; }
  h2 { font-size: 12.5px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #4a5c6b; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1a3e96;
    padding-bottom: 6px; }
  .muted { color: #5e7081; }
  .stages { display: flex; gap: 6px; margin: 10px 0; }
  .stages span { flex: 1; text-align: center; padding: 5px; border: 1px solid #d3dde5; border-radius: 4px; }
  .stages .done { background: #e2f2e9; border-color: #1b7a4b; }
  .stages .now { background: #e4eaf7; border-color: #1a3e96; font-weight: 700; }
  .expired { color: #ae241c; font-weight: 700; }
  dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; margin: 0; }
  dt { color: #5e7081; font-size: 10px; text-transform: uppercase; }
  dd { margin: 0 0 6px; font-weight: 700; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #5e7081; border-bottom: 1px solid #14202b;
    padding: 4px; }
  td { padding: 4px; border-bottom: 1px solid #e6ecf1; }
  .r { text-align: right; }
  .void td { color: #5e7081; text-decoration: line-through; }
</style></head>
<body>
  <div class="head">
    <h1>Seguimiento de la DM ${esc(dm.number)}</h1>
    <span class="muted">Generado el ${esc(havanaDateTime(now))}</span>
  </div>
  <p>${esc(d.clientName)} · Marca ${esc(dm.brand)} · registrada el ${esc(pdfLoadingDate(dm.declarationDate))}</p>
  <div class="stages">${STAGES.map(
    (s, i) => `<span class="${i < reached ? 'done' : i === reached ? 'now' : ''}">${esc(STAGE_LABEL[s])}</span>`,
  ).join('')}</div>
  <p>Etapa: <b>${esc(stageText(stage))}</b>${
    stage.expired
      ? ' · <span class="expired">Vencida</span>'
      : stage.stage === 'delivered'
        ? ''
        : ` · día ${Math.max(deadline.day, 1)} de ${DEADLINE_DAYS}`
  }</p>
  <dl>
    <dt>Total</dt><dt>Cargado</dt><dt>Saldo</dt><dt>Sin asignar</dt>
    <dd>${t(dm.totalTons)}</dd><dd>${t(dm.loadedTons)}</dd><dd>${t(dm.balanceTons)}</dd>
    <dd>${t(dm.pendingAllocationTons)}</dd>
  </dl>
  <h2>Asignaciones por buque</h2>
  ${
    dm.allocations.length === 0
      ? '<p class="muted">Sin asignaciones.</p>'
      : `<table><thead><tr><th>Buque</th><th class="r">Asignado</th><th class="r">Cargado</th><th class="r">Saldo</th></tr></thead><tbody>${dm.allocations
          .map(
            (a) =>
              `<tr><td>${esc(d.vesselNames[a.vesselId])}</td><td class="r">${t(a.allocatedTons)}</td><td class="r">${t(a.loadedTons)}</td><td class="r">${t(a.balanceTons)}</td></tr>`,
          )
          .join('')}</tbody></table>`
  }
  <h2>Órdenes (${orders.length})</h2>
  ${
    orders.length === 0
      ? '<p class="muted">Sin órdenes.</p>'
      : `<table><thead><tr><th>Número</th><th>Versión</th><th>Estado</th><th>Carga</th><th>Camión</th><th>Chofer</th><th class="r">Toneladas</th></tr></thead><tbody>${orders
          .map(
            (o) =>
              `<tr class="${o.status === 'voided' ? 'void' : ''}"><td>${esc(o.number)}</td><td>${o.current.versionNo}</td><td>${o.status === 'voided' ? 'Anulada' : 'Oficial'}</td><td>${esc(pdfLoadingDate(o.current.loadingDate))}</td><td>${esc(o.current.snapshot.truckPlate)}</td><td>${esc(o.current.snapshot.driverName)}</td><td class="r">${t(o.current.tons)}</td></tr>`,
          )
          .join('')}</tbody></table>`
  }
</body></html>`;
}
