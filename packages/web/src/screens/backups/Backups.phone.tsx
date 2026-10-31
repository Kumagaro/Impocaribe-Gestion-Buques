// T112 · P-24 en phone (maqueta T111).
import { BackupsView } from './Backups.parts';
import type { BackupsModel } from './useBackups';

export function BackupsPhone({ model }: { model: BackupsModel }) {
  return <BackupsView model={model} device="phone" />;
}
