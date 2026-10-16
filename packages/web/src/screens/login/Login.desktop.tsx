// T038 · P-03 en desktop (ui-spec P-03 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { LoginForm } from './LoginForm';
import type { LoginModel } from './useLogin';

export function LoginDesktop({ model }: { model: LoginModel }) {
  return (
    <AuthFrame layout="card">
      <LoginForm model={model} />
    </AuthFrame>
  );
}
