// Plan §4.2: la identidad del servidor se guarda protegida con la protección de datos de Windows para la máquina
// (DPAPI, ámbito LocalMachine). Se llama a ProtectedData desde Windows PowerShell 5.1, que viene con Windows: sin
// dependencias nativas que compilar.
import { spawn } from 'node:child_process';
import type { SecretProtector } from './identity.ts';

const SCRIPT = (op: 'Protect' | 'Unprotect') =>
  'Add-Type -AssemblyName System.Security; ' +
  '$b = [Convert]::FromBase64String([Console]::In.ReadToEnd()); ' +
  `$o = [System.Security.Cryptography.ProtectedData]::${op}($b, $null, 'LocalMachine'); ` +
  '[Console]::Out.Write([Convert]::ToBase64String($o))';

function runDpapi(op: 'Protect' | 'Unprotect', data: Buffer): Promise<Buffer> {
  if (process.platform !== 'win32')
    return Promise.reject(
      new Error(
        'La protección de datos de Windows solo existe en Windows: el servidor de producción corre en Windows.',
      ),
    );
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT(op)], {
      windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.from(out.trim(), 'base64'));
      else reject(new Error(`La protección de datos de Windows falló (${op}): ${err.trim()}`));
    });
    child.stdin.end(data.toString('base64'));
  });
}

export function windowsMachineProtector(): SecretProtector {
  return {
    protect: (data) => runDpapi('Protect', data),
    unprotect: (data) => runDpapi('Unprotect', data),
  };
}
