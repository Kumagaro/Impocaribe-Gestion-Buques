import { describe, expect, it } from 'vitest';
import { FIREWALL_RULES, firewallAdd, layout, paths, postgresqlConf, serviceXml, SERVICES } from './layout.ts';

// T126 · plan §10.3, §10.7 y RF-RED-07: lo que escribe el ayudante en la PC servidor.
const l = layout({ ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData' });

describe('dónde queda cada cosa', () => {
  it('el programa en Program Files y los datos aparte, en ProgramData (reparar y actualizar no tocan los datos)', () => {
    expect(paths(l)).toMatchObject({
      node: 'C:\\Program Files\\Impocaribe\\Server\\node\\node.exe',
      pgdata: 'C:\\ProgramData\\Impocaribe\\pgdata',
      identityDir: 'C:\\ProgramData\\Impocaribe\\identity',
    });
  });
});

describe('PostgreSQL (plan §10.7)', () => {
  it('con el presupuesto de memoria de una PC de 4 GB y solo en la propia PC', () => {
    const conf = postgresqlConf();
    for (const line of [
      'shared_buffers = 128MB',
      'work_mem = 4MB',
      'maintenance_work_mem = 64MB',
      'max_connections = 20',
      'effective_cache_size = 512MB',
      "listen_addresses = 'localhost'",
    ])
      expect(conf.split('\n')).toContain(line);
  });
});

describe('servicio del servidor (WinSW)', () => {
  const service = serviceXml(l, 'postgres://impocaribe:a&b<c>@localhost:5433/impocaribe');

  it('arranca solo, después de la base, se reinicia si falla y con el límite de memoria de Node', () => {
    expect(service).toContain('<startmode>Automatic</startmode>');
    expect(service).toContain(`<depend>${SERVICES.database}</depend>`);
    expect(service).toContain('<onfailure action="restart" delay="10 sec"/>');
    expect(service).toContain('--max-old-space-size=256');
  });

  it('lleva el entorno que lee el servidor, con la contraseña escapada para XML', () => {
    expect(service).toContain(
      '<env name="DATABASE_URL" value="postgres://impocaribe:a&amp;b&lt;c&gt;@localhost:5433/impocaribe"/>',
    );
    expect(service).toContain('<env name="NODE_ENV" value="production"/>');
    expect(service).toContain(`<env name="IMPOCARIBE_PG_SERVICE" value="${SERVICES.database}"/>`);
  });
});

describe('firewall (RF-RED-07)', () => {
  it('servidor, descubrimiento y mDNS, solo desde la red local y en cualquier perfil de red', () => {
    expect(FIREWALL_RULES.map((r) => `${r.protocol} ${r.port}`)).toEqual(['TCP 8443', 'UDP 47800', 'UDP 5353']);
    for (const rule of FIREWALL_RULES) {
      const args = firewallAdd(rule);
      expect(args).toContain('remoteip=localsubnet');
      expect(args).toContain('profile=any');
      expect(args).toContain('dir=in');
    }
  });
});
