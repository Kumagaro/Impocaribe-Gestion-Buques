// T038 · P-02 en desktop: asistente con los pasos a la izquierda (ui-spec P-02 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { SetupStep, SetupSteps } from './SetupForm';
import type { SetupModel } from './useSetup';

export function SetupDesktop({ model }: { model: SetupModel }) {
  return (
    <AuthFrame layout="card" wide>
      <div className="auth-wizard">
        <SetupSteps model={model} />
        <div className="auth-wizard__main">
          <SetupStep model={model} />
        </div>
      </div>
    </AuthFrame>
  );
}
