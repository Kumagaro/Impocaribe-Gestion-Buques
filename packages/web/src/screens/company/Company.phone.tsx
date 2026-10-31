// T054 · P-22 en phone: tarjetas apiladas; los datos de la empresa se editan en una hoja (maqueta T053).
import {
  CompanyDialogs,
  CompanyNotices,
  CompanySummary,
  DocPreview,
  HistoryCard,
  SecureNote,
  SignatureCard,
  StampCard,
} from './CompanyParts';
import type { CompanyModel } from './useCompany';

type Ready = Extract<CompanyModel['data'], { status: 'ready' }>;

export function CompanyPhone({ model, data }: { model: CompanyModel; data: Ready }) {
  return (
    <div className="company">
      <CompanyNotices model={model} />
      <CompanySummary model={model} data={data} />
      <SignatureCard model={model} data={data} />
      <StampCard model={model} data={data} />
      <DocPreview data={data} />
      <HistoryCard model={model} />
      <SecureNote />
      <CompanyDialogs model={model} data={data} />
    </div>
  );
}
