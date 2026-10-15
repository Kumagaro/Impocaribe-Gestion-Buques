// T038 · P-03 en tablet (ui-spec P-03 y maqueta T037).
import { AuthFrame } from '../auth/AuthParts';
import { LoginForm } from './LoginForm';
import type { LoginModel } from './useLogin';

export function LoginTablet({ model }: { model: LoginModel }) {
  return (
    <AuthFrame layout="card">
      <LoginForm model={model} />
    </AuthFrame>
  );
}
