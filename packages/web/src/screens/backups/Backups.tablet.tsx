// T112 · P-24 en tablet (maqueta T111).
import { BackupsView } from './Backups.parts';
import type { BackupsModel } from './useBackups';

export function BackupsTablet({ model }: { model: BackupsModel }) {
  return <BackupsView model={model} device="tablet" />;
}
