// T038 · P-04 en desktop (ui-spec P-04 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { RecoverForm } from './RecoverForm';
import type { RecoverModel } from './useRecover';

export function RecoverDesktop({ model }: { model: RecoverModel }) {
  return (
    <AuthFrame layout="card">
      <RecoverForm model={model} />
    </AuthFrame>
  );
}
