import { chromium, type Browser } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { chromiumPath, PdfEngine } from './pdf-engine.ts';

// T078 · DT-06, RNF-21, plan §10.7, con chrome-headless-shell real.
const HTML = '<!doctype html><html><body><h1>"ORDEN DE CARGA"</h1></body></html>';
let engines: PdfEngine[] = [];

function counted(options: { idleMs?: number; timeoutMs?: number } = {}) {
  const launches: Browser[] = [];
  const engine = new PdfEngine({
    ...options,
    launch: async () => {
      const b = await chromium.launch({ executablePath: chromiumPath(), headless: true });
      launches.push(b);
      return b;
    },
  });
  engines.push(engine);
  return { engine, launches };
}

afterEach(async () => {
  await Promise.all(engines.map((e) => e.close()));
  engines = [];
});

describe('motor de PDF', () => {
  it('genera un PDF A4 (empieza por %PDF y es de una página)', async () => {
    const { engine } = counted();
    const pdf = await engine.render(HTML);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 595.91998 842.88]');
  }, 60_000);

  it('dos emisiones simultáneas se encolan sin abrir dos instancias', async () => {
    const { engine, launches } = counted();
    const [a, b] = await Promise.all([engine.render(HTML), engine.render(HTML)]);
    expect([a.subarray(0, 4).toString(), b.subarray(0, 4).toString()]).toEqual(['%PDF', '%PDF']);
    expect(launches).toHaveLength(1);
  }, 60_000);

  it('sin emisiones durante el tiempo de espera se cierra, y la siguiente lo vuelve a abrir', async () => {
    const { engine, launches } = counted({ idleMs: 300 });
    await engine.render(HTML);
    expect(engine.open).toBe(true);
    await new Promise((r) => setTimeout(r, 1_000));
    expect(engine.open).toBe(false);
    expect(launches[0]!.isConnected()).toBe(false);
    const pdf = await engine.render(HTML);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(launches).toHaveLength(2);
  }, 60_000);

  it('si el documento no termina a tiempo, falla con un error propio y el siguiente funciona', async () => {
    const { engine } = counted({ timeoutMs: 500 });
    const slow = '<!doctype html><script>while (true) {}</script>';
    await expect(engine.render(slow)).rejects.toThrow('No se pudo generar el PDF');
    expect(engine.open).toBe(false);
    const { engine: other } = counted();
    expect((await other.render(HTML)).subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});
