// T038 · P-03 en phone (ui-spec P-03 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { LoginForm } from './LoginForm';
import type { LoginModel } from './useLogin';

export function LoginPhone({ model }: { model: LoginModel }) {
  return (
    <AuthFrame layout="fullscreen">
      <LoginForm model={model} />
    </AuthFrame>
  );
}
