// T077 · RF-PDF-01: el documento A4 de la orden, con el formato de la orden actual de Impocaribe (prototipo,
// docs/referencia), sin «Cantidad de bultos» y con el peso en toneladas con 3 decimales. Se arma solo con el
// documento congelado de la versión (snapshot) y las imágenes de la firma y el cuño aplicados.
import { parseTons, pdfIssueDate, pdfLoadingDate, pdfTons } from '@impocaribe/shared';
import type { OrderSnapshot } from '@impocaribe/shared/validation';

export interface DocumentImages {
  signature: { mime: string; base64: string };
  stamp: { mime: string; base64: string };
}

export type DocumentMark = 'ANULADA' | 'COPIA' | null;

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ln = (value: string | null | undefined, min = 70) =>
  `<span class="ln" style="min-width:${min}px">${esc(value)}</span>`;

export function orderDocumentHtml(s: OrderSnapshot, images: DocumentImages, mark: DocumentMark): string {
  const img = (i: { mime: string; base64: string }, alt: string) =>
    `<img src="data:${esc(i.mime)};base64,${i.base64.replace(/[^A-Za-z0-9+/=]/g, '')}" alt="${alt}">`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(s.number)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; line-height: 1.55; }
  .paper { position: relative; border: 1px solid #000; padding: 26px 30px; }
  h1 { text-align: center; font-size: 14px; margin: 0 0 16px; font-weight: 700; }
  .ln { border-bottom: 1px solid #000; display: inline-block; min-width: 120px; padding: 0 4px; }
  .row { display: flex; gap: 18px; margin-bottom: 9px; flex-wrap: wrap; }
  .push { margin-left: auto; }
  table { width: 100%; font-size: 12px; border-collapse: collapse; margin: 8px 0 4px; }
  th { font-weight: 400; text-decoration: underline; text-align: left; padding: 3px 4px; }
  td { border-bottom: 1px solid #000; padding: 5px 4px; }
  .r { text-align: right; }
  .rule { border-top: 1px solid #000; margin: 9px 0; }
  .small { font-size: 11px; font-weight: 700; margin-top: 9px; }
  .sig { display: flex; align-items: flex-end; gap: 14px; margin-top: 8px; }
  .sig img { max-height: 60px; max-width: 160px; object-fit: contain; }
  .version { position: absolute; top: 10px; right: 14px; font-size: 10px; }
  .mark { position: absolute; top: 120px; left: 50%; transform: translateX(-50%) rotate(-11deg); color: #AE241C;
    border: 3px solid #AE241C; padding: 3px 14px; font-weight: 700; letter-spacing: .1em; font-size: 22px; }
</style></head>
<body><div class="paper">
  ${s.versionNo > 1 ? `<div class="version">Versión ${s.versionNo}</div>` : ''}
  ${mark ? `<div class="mark">${mark}</div>` : ''}
  <h1>"ORDEN DE CARGA"</h1>
  <div class="row"><span>Fecha de Emisión: ${ln(pdfIssueDate(s.issueDate))}</span>
    <span class="push">No. de Orden: ${ln(s.number, 160)}</span></div>
  <div class="row"><span>Nombre del Comprador Interno ${ln(s.internalBuyer, 290)}</span></div>
  <div style="margin:12px 0 4px">Se autoriza cargar en ${esc(s.port)},<br>
    el día ${ln(pdfLoadingDate(s.loadingDate), 78)}, las mercancías que a continuación se relacionan :</div>
  <table>
    <thead><tr><th>Tipo de Producto</th><th>Siglas y Número del Contenedor</th><th class="r">Peso Bruto (t)</th></tr></thead>
    <tbody><tr><td>${esc(s.product)}</td><td>${esc(s.container)}</td><td class="r">${pdfTons(parseTons(s.tons))}</td></tr></tbody>
  </table>
  <div class="rule"></div>
  <div class="row small"><span>Nombre del Buque: ${esc(s.vesselName)}</span><span>Mfto No. ${esc(s.manifest)}</span>
    <span>B/L ${esc(s.bl)}</span><span>DM No. ${esc(s.declarationNumber)}</span></div>
  <div style="margin:10px 0 4px">CON DESTINO A: ${esc(s.recipientAddress)}</div>
  <div class="rule"></div>
  <div>Nombre del Destinatario : ${esc(s.recipientName)}</div>
  <div class="rule"></div>
  <div style="margin-top:10px">Vehículo Perteneciente a: ${esc(s.carrierName)}</div>
  <div class="small">Chapa No ${esc(s.truckPlate)}&nbsp;&nbsp; LOT No. ${ln(s.lotNo)} Hoja Ruta No. ${ln(s.routeSheetNo, 60)}
    Carta Porte No ${esc(s.waybillNo)}</div>
  <div class="small">Chapa Tractivo No. ${ln(s.tractorPlate, 90)} ${s.trailerPlates
    .map((p) => `Remolque No ${esc(p)}`)
    .join('&nbsp;&nbsp; ')}</div>
  <div class="small">Basificado en : ${esc(s.baseLocation)}</div>
  <div class="small">Conducido por : ${esc(s.driverName)}</div>
  <div class="small">Carné de Identidad : ${esc(s.driverNationalId)} &nbsp;&nbsp;&nbsp; Licencia de Conducción No. ${esc(s.driverLicenseNo)}</div>
  <div class="rule"></div>
  <div class="small">Nombre y Apellidos del representante del Comprador Interno ${esc(s.representativeName)}</div>
  <div class="small">No. Credencial ${esc(s.credentialNo)} &nbsp;&nbsp;&nbsp;&nbsp; Cargo ${esc(s.position)}</div>
  <div class="sig"><span class="small">Firma y Cuño Oficial:</span>${img(images.signature, 'Firma')}${img(images.stamp, 'Cuño')}</div>
</div></body></html>`;
}
