// T141 · RNF-16 y Const. art. XIV: la revisión automática de accesibilidad de todas las pantallas (cada historia de
// Storybook) en las tres clases de dispositivo. Por historia:
//   - axe-core con las reglas WCAG 2 A y AA (contraste AA, nombres de los controles, etiquetas, ARIA);
//   - en teléfono y tablet, que cada control que se toca mida al menos 48 px (dp) de alto y de ancho;
//   - con el texto al 130 %, que nada obligue a desplazarse a lo ancho.
// La revisión manual (teclado en escritorio y lector de pantalla) va aparte, en la lista de T141.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WIDTH = { phone: 375, tablet: 1024, desktop: 1280 } as const;
const MIN_TARGET = 48;

interface IndexEntry {
  id: string;
  type: 'story' | 'docs';
}

for (const [device, width] of Object.entries(WIDTH)) {
  test(`accesibilidad de las historias en ${device}`, async ({ page, request }) => {
    // Unas 140 historias con axe en cada una: en el equipo de desarrollo pasa de 30 minutos por clase.
    test.setTimeout(120 * 60_000);
    const index = (await (await request.get('/index.json')).json()) as { entries: Record<string, IndexEntry> };
    const stories = Object.values(index.entries).filter((e) => e.type === 'story');
    expect(stories.length).toBeGreaterThan(0);
    await page.setViewportSize({ width, height: 800 });
    for (const story of stories) {
      await test.step(story.id, async () => {
        const globals = `theme:light;deviceClass:${device};reduceMotion:on`;
        await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=${globals}`);
        await page.locator('#storybook-root > *').first().waitFor();

        const axe = await new AxeBuilder({ page })
          .include('#storybook-root')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect
          .soft(
            axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
            `WCAG en ${story.id}`,
          )
          .toEqual([]);

        if (device !== 'desktop') {
          // Los controles que se tocan; un enlace dentro de un párrafo no es un objetivo propio.
          const small = await page.evaluate((min) => {
            const selector =
              'button, a.auth-link, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"]';
            return [...document.querySelectorAll<HTMLElement>(`#storybook-root ${selector}`)]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                // Oculto a la vista (un campo de archivo que abre un botón visible): no se toca.
                if (r.width <= 1 || r.height <= 1) return false;
                // Un control dentro de una etiqueta táctil (casillas, interruptores): cuenta la etiqueta.
                const box = (el.closest('label, .ui-switch') ?? el).getBoundingClientRect();
                return box.height < min || box.width < min;
              })
              .map((el) => {
                const r = (el.closest('label, .ui-switch') ?? el).getBoundingClientRect();
                const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
                return `${el.tagName.toLowerCase()} «${name}» ${Math.round(r.width)}×${Math.round(r.height)}`;
              });
          }, MIN_TARGET);
          expect.soft(small, `objetivos de menos de ${MIN_TARGET} px en ${story.id}`).toEqual([]);
        }

        // RNF-16: el texto del sistema al 130 % no rompe la pantalla (nada se sale a lo ancho).
        await page.addStyleTag({ content: 'html { font-size: 130% !important; }' });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect.soft(overflow, `desplazamiento horizontal con el texto al 130 % en ${story.id}`).toBeLessThanOrEqual(0);
      });
    }
  });
}
