// T038 · P-01 en tablet (ui-spec P-01 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { ConnectionStep } from './ConnectionSteps';
import type { ConnectionModel } from './useConnection';

export function ConnectionTablet({ model }: { model: ConnectionModel }) {
  return (
    <AuthFrame layout="card">
      <ConnectionStep model={model} />
    </AuthFrame>
  );
}
