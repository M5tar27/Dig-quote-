import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuoteDetailActions } from "@/components/quote-detail-actions";
import { ManualEstimateForm } from "@/components/manual-estimate-form";
import { QuoteLineItems } from "@/components/quote-line-items";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DEFAULT_RATES, type AiDataJson, type Quote, type QuoteStatus } from "@/lib/types";
import { AlertTriangle } from "lucide-react";

const STATUS_VARIANT: Record<QuoteStatus, "secondary" | "default" | "success" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  won: "success",
  lost: "destructive",
};

export default async function QuoteDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { company } = await getCompanyContext();
  if (!company) return null;

  const { data: quote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single<Quote>();

  if (!quote) notFound();

  const ai = quote.ai_data_json as AiDataJson | null;
  const rates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{quote.client_name}</h1>
            <Badge variant={STATUS_VARIANT[quote.status]}>{quote.status}</Badge>
          </div>
          <p className="text-muted-foreground">{quote.address}</p>
          <p className="text-sm text-muted-foreground">
            {quote.job_type} · Created {formatDate(quote.created_at)}
          </p>
        </div>
        <p className="text-3xl font-extrabold text-primary">{formatCurrency(quote.total || 0)}</p>
      </div>

      <QuoteDetailActions
        quoteId={quote.id}
        status={quote.status}
        publicToken={quote.public_token}
        hasClientEmail={!!quote.client_email}
      />

      {ai?.manual_mode && (
        <ManualEstimateForm quoteId={quote.id} rates={rates} />
      )}

      {ai && !ai.manual_mode && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">AI Confidence</CardTitle>
            <Badge variant={ai.ai_confidence_1to10 >= 8 ? "success" : "secondary"}>
              {ai.ai_confidence_1to10}/10
            </Badge>
          </CardHeader>
          {ai.ai_notes && (
            <CardContent className="pt-0 text-sm text-muted-foreground">{ai.ai_notes}</CardContent>
          )}
        </Card>
      )}

      {quote.photos_urls?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site Photos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 pt-0 sm:grid-cols-4">
            {quote.photos_urls.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`Site photo ${i + 1}`} className="aspect-square rounded-lg object-cover" />
            ))}
          </CardContent>
        </Card>
      )}

      {ai && ai.line_items.length > 0 && (
        <QuoteLineItems quoteId={quote.id} ai={ai} rates={rates} />
      )}

      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Estimates are AI-generated for convenience only. Contractor must verify all
          measurements and site conditions. DigQuote is not liable for errors.
        </p>
      </div>
    </div>
  );
}
