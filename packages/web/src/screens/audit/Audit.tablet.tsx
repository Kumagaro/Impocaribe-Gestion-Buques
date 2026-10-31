// T104 · P-25 en tablet (ui-spec P-25 y maqueta T099).
import { AuditView } from './Audit.parts';
import type { AuditModel } from './useAudit';

export function AuditTablet({ model }: { model: AuditModel }) {
  return <AuditView model={model} device="tablet" />;
}
