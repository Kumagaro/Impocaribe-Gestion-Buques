// T078 · DT-06, RNF-21, plan §10.7: una sola instancia de Chromium (chrome-headless-shell, el de menor consumo) y una
// sola página a la vez (cola). Se abre con la primera emisión y se cierra tras 10 minutos sin emisiones; cada
// documento tiene 10 segundos para generarse.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';

export const CHROMIUM_VERSION = '155.0.8059.39';

/** El ejecutable: IMPOCARIBE_CHROMIUM (el del paquete del servidor) o, en desarrollo, el de la caché de Puppeteer. */
export function chromiumPath(): string {
  const path =
    process.env.IMPOCARIBE_CHROMIUM ??
    join(
      homedir(),
      '.cache/puppeteer/chrome-headless-shell',
      `win64-${CHROMIUM_VERSION}`,
      'chrome-headless-shell-win64/chrome-headless-shell.exe',
    );
  if (!existsSync(path))
    throw new Error(
      `No está chrome-headless-shell en ${path}. Instálelo con "npx @puppeteer/browsers@3.2.5 install ` +
        `chrome-headless-shell@${CHROMIUM_VERSION} --path ~/.cache/puppeteer" o indique su ruta en IMPOCARIBE_CHROMIUM.`,
    );
  return path;
}

/** Opciones de bajo consumo (plan §10.7): sin GPU, sin extensiones y con un solo proceso de renderizado. */
const LOW_MEMORY_ARGS = [
  '--disable-gpu',
  '--disable-extensions',
  '--disable-dev-shm-usage',
  '--renderer-process-limit=1',
  '--disk-cache-size=1',
  '--no-first-run',
];

export interface PdfEngineOptions {
  /** Abre el navegador; inyectable en las pruebas. */
  launch?: () => Promise<Browser>;
  idleMs?: number;
  timeoutMs?: number;
}

export class PdfRenderError extends Error {}

export class PdfEngine {
  private browser: Promise<Browser> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idle: NodeJS.Timeout | undefined;
  private readonly launch: () => Promise<Browser>;
  private readonly idleMs: number;
  private readonly timeoutMs: number;

  constructor(options: PdfEngineOptions = {}) {
    this.launch =
      options.launch ??
      (() => chromium.launch({ executablePath: chromiumPath(), headless: true, args: LOW_MEMORY_ARGS }));
    this.idleMs = options.idleMs ?? 10 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** ¿Está Chromium abierto ahora? */
  get open(): boolean {
    return this.browser !== null;
  }

  /** Genera el PDF A4 de un documento HTML, en cola: nunca dos páginas a la vez. */
  render(html: string): Promise<Buffer> {
    const job = this.queue.then(() => this.renderNow(html));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async renderNow(html: string): Promise<Buffer> {
    clearTimeout(this.idle);
    try {
      this.browser ??= this.launch();
      const browser = await this.browser;
      const page = await browser.newPage();
      try {
        page.setDefaultTimeout(this.timeoutMs);
        await page.setContent(html, { waitUntil: 'load' });
        return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
      } finally {
        await page.close().catch(() => undefined);
      }
    } catch (err) {
      // Un navegador que falló no se reutiliza: la siguiente emisión abre otro.
      await this.close();
      throw new PdfRenderError(`No se pudo generar el PDF: ${String(err)}`);
    } finally {
      if (this.browser) {
        this.idle = setTimeout(() => void this.close(), this.idleMs);
        this.idle.unref();
      }
    }
  }

  /** Cierra Chromium (al pasar el tiempo sin emisiones o al apagar el servidor). */
  async close(): Promise<void> {
    clearTimeout(this.idle);
    const b = this.browser;
    this.browser = null;
    if (b) await (await b.catch(() => null))?.close().catch(() => undefined);
  }
}
