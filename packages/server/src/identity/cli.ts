// T033: crea la identidad del servidor de desarrollo. En producción la crea el ayudante de instalación (T126).
import { config } from '../config.ts';
import { createIdentity } from './identity.ts';
import { windowsMachineProtector } from './protector.ts';

const cfg = config();
if (cfg.env === 'production') {
  console.error('En producción la identidad la crea el ayudante de instalación.');
  process.exit(1);
}
const identity = await createIdentity(cfg.identityDir, {
  protector: windowsMachineProtector(),
  clock: { now: () => new Date() },
});
console.log(`Identidad ${identity.name} creada en ${cfg.identityDir} (CA ${identity.caFingerprint}).`);
