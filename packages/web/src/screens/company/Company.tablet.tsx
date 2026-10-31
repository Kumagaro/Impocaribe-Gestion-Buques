// T054 · P-22 en tablet: lo mismo que en escritorio, con la vista previa debajo (maqueta T053).
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

export function CompanyTablet({ model, data }: { model: CompanyModel; data: Ready }) {
  return (
    <div className="company">
      <SecureNote />
      <CompanyNotices model={model} />
      <Region id="empresa-datos" title="Datos de la empresa">
        <CompanyForm model={model} />
      </Region>
      <div className="company-two">
        <SignatureCard model={model} data={data} />
        <StampCard model={model} data={data} />
      </div>
      <DocPreview data={data} />
      <HistoryCard model={model} />
      <CompanyDialogs model={model} data={data} />
    </div>
  );
}
