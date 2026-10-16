// T038 · P-01 en phone (ui-spec P-01 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { ConnectionStep } from './ConnectionSteps';
import type { ConnectionModel } from './useConnection';

export function ConnectionPhone({ model }: { model: ConnectionModel }) {
  return (
    <AuthFrame layout="fullscreen">
      <ConnectionStep model={model} />
    </AuthFrame>
  );
}
