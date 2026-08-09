import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ApproveQuoteButton } from "@/components/approve-quote-button";
import { AlertTriangle, Award, Download } from "lucide-react";
import type { Certification } from "@/lib/types";

interface PublicQuote {
  id: string;
  public_token: string;
  client_name: string;
  address: string;
  job_type: string;
  status: string;
  total: number;
  pdf_url: string | null;
  photos_urls: string[];
  created_at: string;
  company_name: string;
  company_logo_url: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_terms: string | null;
  company_certifications: Certification[] | null;
}

function activeCertifications(certs: Certification[] | null | undefined): Certification[] {
  if (!certs) return [];
  return certs.filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > Date.now());
}

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_quote", { p_token: params.token });
  const quote: PublicQuote | undefined = data?.[0];

  if (error || !quote) notFound();

  const certs = activeCertifications(quote.company_certifications);

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center gap-3">
          {quote.company_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={quote.company_logo_url} alt={quote.company_name} className="h-10 w-10 rounded-md object-cover" />
          ) : null}
          <div>
            <p className="font-bold">{quote.company_name}</p>
            {quote.company_phone && <p className="text-sm text-muted-foreground">{quote.company_phone}</p>}
          </div>
        </div>

        {certs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {certs.map((cert) => (
              <Badge key={cert.id} variant="secondary" className="flex items-center gap-1.5 py-1">
                <Award className="h-3.5 w-3.5" />
                {cert.title}
              </Badge>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Estimate for {quote.client_name}</CardTitle>
              <Badge variant={quote.status === "won" ? "success" : "default"}>{quote.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{quote.address}</p>
            <p className="text-sm text-muted-foreground">
              {quote.job_type} · {formatDate(quote.created_at)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-4xl font-extrabold text-primary">{formatCurrency(quote.total)}</p>

            {quote.photos_urls?.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {quote.photos_urls.slice(0, 6).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="Site photo" className="aspect-square rounded-lg object-cover" />
                ))}
              </div>
            )}

            {quote.pdf_url && (
              <a href={quote.pdf_url} target="_blank" rel="noreferrer" className="inline-flex">
                <span className="inline-flex h-12 items-center gap-2 rounded-lg border-2 px-5 text-sm font-semibold">
                  <Download className="h-5 w-5" />
                  Download full PDF
                </span>
              </a>
            )}

            {quote.company_terms && (
              <p className="text-sm text-muted-foreground">{quote.company_terms}</p>
            )}

            {quote.status === "sent" && <ApproveQuoteButton token={quote.public_token} />}
            {quote.status === "won" && (
              <p className="rounded-lg bg-success/10 p-3 text-center font-semibold text-success">
                ✓ You've approved this estimate. {quote.company_name} will be in touch to schedule.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This estimate is AI-generated for convenience only. {quote.company_name} must verify
            all measurements and site conditions. DigQuote is not liable for errors.
          </p>
        </div>
      </div>
    </main>
  );
}
