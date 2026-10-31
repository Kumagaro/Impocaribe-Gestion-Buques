// T112 · P-24 en desktop (maqueta T111).
import { BackupsView } from './Backups.parts';
import type { BackupsModel } from './useBackups';

export function BackupsDesktop({ model }: { model: BackupsModel }) {
  return <BackupsView model={model} device="desktop" />;
}
