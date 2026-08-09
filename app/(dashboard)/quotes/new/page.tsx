import { getCompanyContext } from "@/lib/data";
import { QuoteWizard } from "@/components/quote-wizard";
import { DEFAULT_RATES } from "@/lib/types";

export default async function NewQuotePage() {
  const { company } = await getCompanyContext();
  if (!company) return null;

  const rates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };

  return (
    <div className="mx-auto max-w-xl">
      <QuoteWizard companyId={company.id} rates={rates} />
    </div>
  );
}
