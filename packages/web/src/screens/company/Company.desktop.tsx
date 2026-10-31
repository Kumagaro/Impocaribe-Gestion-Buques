// T054 · P-22 en desktop: datos, firma, cuño e historial; la vista previa del documento a la derecha (maqueta T053).
import {
  CompanyDialogs,
  CompanyForm,
  CompanyNotices,
  DocPreview,
  HistoryCard,
  Region,
  SecureNote,
  SignatureCard,
  StampCard,
} from './CompanyParts';
import type { CompanyModel } from './useCompany';

type Ready = Extract<CompanyModel['data'], { status: 'ready' }>;

export function CompanyDesktop({ model, data }: { model: CompanyModel; data: Ready }) {
  return (
    <div className="company company--aside">
      <div className="company-main">
        <SecureNote />
        <CompanyNotices model={model} />
        <Region id="empresa-datos" title="Datos de la empresa">
          <CompanyForm model={model} />
        </Region>
        <div className="company-two">
          <SignatureCard model={model} data={data} />
          <StampCard model={model} data={data} />
        </div>
        <HistoryCard model={model} />
      </div>
      <aside className="company-side">
        <DocPreview data={data} />
      </aside>
      <CompanyDialogs model={model} data={data} />
    </div>
  );
}
