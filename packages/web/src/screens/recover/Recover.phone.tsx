// T038 · P-04 en phone (ui-spec P-04 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { RecoverForm } from './RecoverForm';
import type { RecoverModel } from './useRecover';

export function RecoverPhone({ model }: { model: RecoverModel }) {
  return (
    <AuthFrame layout="fullscreen">
      <RecoverForm model={model} />
    </AuthFrame>
  );
}
