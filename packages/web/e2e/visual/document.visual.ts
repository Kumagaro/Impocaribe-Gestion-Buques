// T090 · RF-PDF-01: comparación visual del documento de la orden. Se dibuja la misma plantilla que convierte el
// servidor en PDF (server/src/orders/pdf-template.ts), en A4 y con Chrome for Testing fijo, y se compara píxel a píxel
// con las referencias que aprueba el responsable. Los datos son ficticios.
import { expect, test } from '@playwright/test';
import type { OrderSnapshot } from '../../../shared/src/validation/orders.ts';
import { orderDocumentHtml, type DocumentMark } from '../../../server/src/orders/pdf-template.ts';

const svg = (s: string) => ({ mime: 'image/svg+xml', base64: Buffer.from(s).toString('base64') });
const IMAGES = {
  signature: svg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" width="300" height="100"><path d="M14 70c22-40 38-52 44-38 6 15-14 40-6 42 10 2 26-48 38-44 10 4-8 38 4 38 12 0 20-28 30-26 8 2 2 22 10 22 14 0 26-34 40-30 10 3-2 24 8 24 18 0 34-24 52-22 14 2 22 10 50 6" fill="none" stroke="#1b2a6b" stroke-width="3.2" stroke-linecap="round"/></svg>',
  ),
  stamp: svg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="54" fill="none" stroke="#5a2a8a" stroke-width="4"/><circle cx="60" cy="60" r="40" fill="none" stroke="#5a2a8a" stroke-width="2"/></svg>',
  ),
};

const SNAPSHOT: OrderSnapshot = {
  number: 'EAGLE1-2026-V1-0042',
  issueDate: '2026-08-29',
  versionNo: 1,
  internalBuyer: 'IMPOCARIBE S.A.',
  port: 'Mariel, terminal 2',
  loadingDate: '2026-08-30',
  product: 'Harina de trigo',
  container: null,
  tons: '1125.000',
  vesselName: 'Eagle 1',
  manifest: '0080/2026',
  bl: 'BL-2026-0412',
  declarationNumber: '00431',
  clientName: 'Nuevos Tiempos S.R.L.',
  brand: 'Dosel',
  recipientName: 'Almacén Central',
  recipientAddress: 'Calle 100 y Boyeros, La Habana',
  carrierName: 'Transportes Escambray',
  truckPlate: 'W011612',
  tractorPlate: null,
  trailerPlates: ['W006877', 'W006878'],
  lotNo: null,
  routeSheetNo: 'HR-12',
  waybillNo: '22352',
  baseLocation: 'LA HABANA',
  driverName: 'Juan Carlos Miranda',
  driverNationalId: '84011905548',
  driverLicenseNo: '12345678901',
  representativeName: 'Ilén Fernández Rojas',
  credentialNo: '00123',
  position: 'Directora',
};

const CASES: [string, OrderSnapshot, DocumentMark[]][] = [
  ['original', SNAPSHOT, []],
  ['version-2', { ...SNAPSHOT, versionNo: 2, tons: '17.280' }, []],
  ['anulada', { ...SNAPSHOT, versionNo: 2 }, ['ANULADA']],
  ['copia', SNAPSHOT, ['COPIA']],
];

for (const [name, snapshot, marks] of CASES)
  test(`documento de la orden: ${name}`, async ({ page }) => {
    // A4 a 96 ppp (210 × 297 mm).
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.setContent(orderDocumentHtml(snapshot, IMAGES, marks), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await expect(page).toHaveScreenshot(`documento-orden--${name}.png`, { fullPage: true });
  });
