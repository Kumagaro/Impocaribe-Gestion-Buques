// T086 y T088 · RF-PDF-01: el documento A4 en pantalla, con los mismos formatos que el PDF (`pdfFormat`). En P-15 se
// arma con el documento congelado de la versión; en la vista previa de P-13, con lo que se lleva escrito.
import { parseTons, pdfIssueDate, pdfLoadingDate, pdfTons } from '@impocaribe/shared';
import type { OrderSnapshot } from '@impocaribe/shared/validation';

export type PreviewData = Omit<OrderSnapshot, 'number' | 'issueDate'> & { number: string | null; issueDate: string };

const safe = (fn: () => string, fallback = '') => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function DocumentPreview({ s, marks = [] }: { s: PreviewData; marks?: string[] }) {
  return (
    <article className="order-paper" aria-label={`Documento de la orden ${s.number ?? 'por emitir'}`}>
      {s.versionNo > 1 && <span className="order-paper__version">{`Versión ${s.versionNo}`}</span>}
      {marks.map((m, i) => (
        <span key={m} className="order-paper__mark" style={{ top: 110 + i * 60 }}>
          {m}
        </span>
      ))}
      <h3>"ORDEN DE CARGA"</h3>
      <p className="order-paper__row">
        <span>
          Fecha de Emisión: <u>{safe(() => pdfIssueDate(s.issueDate))}</u>
        </span>
        <span>
          No. de Orden: <u>{s.number ?? 'se asigna al emitir'}</u>
        </span>
      </p>
      <p>
        Nombre del Comprador Interno <u>{s.internalBuyer}</u>
      </p>
      <p>
        Se autoriza cargar en {s.port}, el día <u>{safe(() => pdfLoadingDate(s.loadingDate))}</u>, las mercancías que a
        continuación se relacionan :
      </p>
      <p className="order-paper__line">
        <span>{s.product}</span>
        <span>{s.container ?? ''}</span>
        <span>{safe(() => pdfTons(parseTons(s.tons)), s.tons)}</span>
      </p>
      <hr />
      <p className="order-paper__b">
        Nombre del Buque: {s.vesselName} · Mfto No. {s.manifest} · B/L {s.bl} · DM No. {s.declarationNumber}
      </p>
      <p>CON DESTINO A: {s.recipientAddress}</p>
      <hr />
      <p>Nombre del Destinatario : {s.recipientName}</p>
      <hr />
      <p>Vehículo Perteneciente a: {s.carrierName}</p>
      <p className="order-paper__b">
        Chapa No {s.truckPlate} · LOT No. {s.lotNo ?? ''} · Hoja Ruta No. {s.routeSheetNo ?? ''} · Carta Porte No{' '}
        {s.waybillNo}
      </p>
      <p className="order-paper__b">
        Chapa Tractivo No. {s.tractorPlate ?? ''} · {s.trailerPlates.map((p) => `Remolque No ${p}`).join(' · ')}
      </p>
      <p className="order-paper__b">Basificado en : {s.baseLocation}</p>
      <p className="order-paper__b">
        Conducido por : {s.driverName} · Carné de Identidad : {s.driverNationalId} · Licencia de Conducción No.{' '}
        {s.driverLicenseNo}
      </p>
      <hr />
      <p className="order-paper__b">
        Representante: {s.representativeName} · Credencial {s.credentialNo} · Cargo {s.position}
      </p>
      <p className="order-paper__b">Firma y Cuño Oficial: (los oficiales vigentes al emitir)</p>
    </article>
  );
}
