import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuoteDetailActions } from "@/components/quote-detail-actions";
import { VoiceBidButton } from "@/components/voice-bid-button";
import { ManualEstimateForm } from "@/components/manual-estimate-form";
import { QuoteLineItems } from "@/components/quote-line-items";
import { JobMaterialsChecklist } from "@/components/job-materials-checklist";
import { FreeBidReveal } from "@/components/free-bid-reveal";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DEFAULT_RATES, type AiDataJson, type JobMaterial, type Quote, type QuoteStatus } from "@/lib/types";
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

  // Materials only matter once a job is actually won — no point tracking
  // ordering/delivery/install status on a quote that might never happen.
  let materials: JobMaterial[] = [];
  if (quote.status === "won") {
    const { data } = await supabase
      .from("job_materials")
      .select("*")
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: true });
    materials = (data as JobMaterial[]) || [];
  }

  // Voice Memo feature (Pro): this job's Form Vault — crew notes recorded by voice,
  // kept append-only for liability protection (see supabase/schema.sql).
  let crewNotes: { id: string; transcript: string | null; audio_url: string; created_at: string }[] = [];
  let changeOrders: {
    id: string;
    description: string;
    price: number | null;
    public_token: string;
    signed_at: string | null;
    created_at: string;
  }[] = [];
  if (company.plan === "pro") {
    const [{ data: notes }, { data: orders }] = await Promise.all([
      supabase
        .from("crew_notes")
        .select("id, transcript, audio_url, created_at")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("change_orders")
        .select("id, description, price, public_token, signed_at, created_at")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false }),
    ]);
    crewNotes = notes || [];
    changeOrders = orders || [];
  }

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
        <p className="text-3xl font-extrabold text-primary">
          {quote.is_free_bid && quote.free_reveal_at && new Date(quote.free_reveal_at) > new Date()
            ? "—"
            : formatCurrency(quote.total || 0)}
        </p>
      </div>

      {quote.is_free_bid && (
        <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 text-center text-sm font-medium text-primary">
          DRAFT — free bid, watermarked. Upgrade to send this to your customer.
        </div>
      )}

      <QuoteDetailActions
        quoteId={quote.id}
        status={quote.status}
        publicToken={quote.public_token}
        hasClientEmail={!!quote.client_email}
        isFreeBid={quote.is_free_bid}
      />

      {company.plan === "pro" && (
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="mb-3 text-sm font-semibold text-muted-foreground">Voice: add a change order or crew note</p>
          <VoiceBidButton tier={company.plan} companyId={company.id} quoteId={quote.id} />
        </div>
      )}

      <FreeBidReveal revealAt={quote.free_reveal_at} isFreeBid={quote.is_free_bid}>
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

        {ai && ai.line_items.length > 0 && (
          <QuoteLineItems quoteId={quote.id} ai={ai} rates={rates} />
        )}
      </FreeBidReveal>

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

      {quote.status === "won" && (
        <JobMaterialsChecklist quoteId={quote.id} materials={materials} />
      )}

      {changeOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {changeOrders.map((co) => (
              <a
                key={co.id}
                href={`/co/${co.public_token}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm hover:bg-muted"
              >
                <div>
                  <p className="line-clamp-1 font-medium">{co.description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(co.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{formatCurrency(co.price || 0)}</p>
                  <Badge variant={co.signed_at ? "success" : "secondary"} className="mt-1">
                    {co.signed_at ? "Approved" : "Pending"}
                  </Badge>
                </div>
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {crewNotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Form Vault — Crew Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {crewNotes.map((note) => (
              <div key={note.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{formatDate(note.created_at)}</p>
                <p>{note.transcript}</p>
                <audio controls src={note.audio_url} className="mt-2 h-8 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
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
