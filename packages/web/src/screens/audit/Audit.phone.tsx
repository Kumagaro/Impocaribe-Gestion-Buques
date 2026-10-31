// T104 · P-25 en phone (ui-spec P-25 y maqueta T099).
import { AuditView } from './Audit.parts';
import type { AuditModel } from './useAudit';

export function AuditPhone({ model }: { model: AuditModel }) {
  return <AuditView model={model} device="phone" />;
}
