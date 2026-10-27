// T126: los pasos del ayudante sobre Windows de verdad (Sys de steps.ts). Se prueba en las máquinas virtuales de T135:
// aquí no hay lógica de decisión, solo cómo se ejecuta cada cosa.
import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import type { Sys } from './steps.ts';

const exec = promisify(execFile);

function run(file: string, args: string[], options: { env?: Record<string, string>; input?: string } = {}) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(file, args, { env: { ...process.env, ...options.env }, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${file.split('\\').pop()} terminó con ${String(code)}: ${out.trim()}`)),
    );
    child.stdin.end(options.input ?? '');
  });
}

export const windowsSys: Sys = {
  run,
  async succeeds(file, args) {
    try {
      await exec(file, args, { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  },
  async exists(path) {
    return stat(path).then(
      () => true,
      () => false,
    );
  },
  async copy(from, to) {
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, force: true });
  },
  async remove(path) {
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  },
  readFile: (path) => readFile(path, 'utf8'),
  async writeFile(path, text) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  },
  async lockDown(path) {
    // Solo el sistema (los servicios) y los administradores; sin herencia de los permisos de ProgramData.
    await run('icacls', [path, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F']);
  },
  ok(url, ca) {
    return new Promise((resolve) => {
      // La cadena se verifica con la CA del servidor recién creado; el nombre del certificado es <id>.impocaribe y aquí
      // se entra por localhost, así que solo se omite esa comparación.
      const req = request(url, { ca, checkServerIdentity: () => undefined, timeout: 5000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => req.destroy());
      req.end();
    });
  },
  secret: () => randomBytes(24).toString('base64url'),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};
