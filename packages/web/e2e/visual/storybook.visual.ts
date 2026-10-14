// T026 · Referencias visuales (plan §11.2): cada historia de Storybook en tema claro y oscuro y en las tres clases de
// dispositivo, con movimiento reducido para que la captura sea estable. Una referencia nueva la aprueba el responsable.
import { expect, test } from '@playwright/test';

const WIDTH = { phone: 375, tablet: 1024, desktop: 1280 } as const;
const THEMES = ['light', 'dark'] as const;

interface IndexEntry {
  id: string;
  type: 'story' | 'docs';
}

// Una prueba por clase y tema, para repartirlas entre los workers.
for (const [device, width] of Object.entries(WIDTH)) {
  for (const theme of THEMES) {
    test(`historias en ${device}, tema ${theme}`, async ({ page, request }) => {
      test.setTimeout(10 * 60_000);
      const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
      const stories = Object.values(index.entries).filter((e) => e.type === 'story');
      expect(stories.length).toBeGreaterThan(0);
      await page.setViewportSize({ width, height: 800 });
      for (const story of stories) {
        await test.step(story.id, async () => {
          const globals = `theme:${theme};deviceClass:${device};reduceMotion:on`;
          await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=${globals}`);
          await page.locator('#storybook-root > *').first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          await expect.soft(page).toHaveScreenshot(`${story.id}--${device}--${theme}.png`, { fullPage: true });
        });
      }
    });
  }
}
