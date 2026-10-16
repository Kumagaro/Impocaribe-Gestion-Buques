// T026 · La comparación visual no tolera diferencias: un solo píxel distinto de la referencia hace fallar la captura.
// Al regenerar referencias, esta prueba se excluye (pnpm e2e:update) para no aprobar el píxel cambiado.
import { expect, test } from '@playwright/test';

const page40 = (withDot: boolean) =>
  `<body style="margin:0;background:#ffffff">${
    withDot ? '<div style="position:absolute;left:20px;top:20px;width:1px;height:1px;background:#000000"></div>' : ''
  }</body>`;

test('un cambio de un píxel en una referencia visual se detecta', async ({ page }) => {
  await page.setViewportSize({ width: 40, height: 40 });
  await page.setContent(page40(false));
  await expect(page).toHaveScreenshot('guarda-un-pixel.png');
  await page.setContent(page40(true));
  await expect(expect(page).toHaveScreenshot('guarda-un-pixel.png', { timeout: 1_000 })).rejects.toThrow(
    /1 pixels \(ratio 0\.01 of all image pixels\) are different/,
  );
});
