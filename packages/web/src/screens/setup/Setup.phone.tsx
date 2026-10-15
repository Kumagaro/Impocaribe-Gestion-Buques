// T038 · P-02 en phone: un paso por pantalla (ui-spec P-02 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { SetupStep } from './SetupForm';
import { SETUP_STEPS, type SetupModel } from './useSetup';

export function SetupPhone({ model }: { model: SetupModel }) {
  return (
    <AuthFrame layout="fullscreen">
      <p className="auth-caption">
        Paso {model.stepIndex + 1} de {SETUP_STEPS.length}
      </p>
      <SetupStep model={model} />
    </AuthFrame>
  );
}
