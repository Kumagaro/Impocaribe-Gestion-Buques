// T104 · P-25 en desktop (ui-spec P-25 y maqueta T099).
import { AuditView } from './Audit.parts';
import type { AuditModel } from './useAudit';

export function AuditDesktop({ model }: { model: AuditModel }) {
  return <AuditView model={model} device="desktop" />;
}
