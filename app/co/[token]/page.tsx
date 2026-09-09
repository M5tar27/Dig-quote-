import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SignChangeOrderButton } from "@/components/sign-change-order-button";
import { AlertTriangle, Download } from "lucide-react";

// Signing changes status right on this page — always fetch fresh, same as /q/[token].
export const dynamic = "force-dynamic";

interface PublicChangeOrder {
  id: string;
  description: string;
  price: number | null;
  pdf_url: string | null;
  customer_name: string | null;
  signed_at: string | null;
  created_at: string;
  company_name: string;
  company_phone: string | null;
}

export default async function PublicChangeOrderPage({ params }: { params: { token: string } }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_change_order", { p_token: params.token });
  const changeOrder: PublicChangeOrder | undefined = data?.[0];

  if (error || !changeOrder) notFound();

  return (
    <main className="min-h-screen bg-secondary/40 px-4 py-8">
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <p className="font-bold">{changeOrder.company_name}</p>
          {changeOrder.company_phone && <p className="text-sm text-muted-foreground">{changeOrder.company_phone}</p>}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Change Order{changeOrder.customer_name ? ` for ${changeOrder.customer_name}` : ""}</CardTitle>
              <Badge variant={changeOrder.signed_at ? "success" : "default"}>
                {changeOrder.signed_at ? "Approved" : "Pending"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{formatDate(changeOrder.created_at)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{changeOrder.description}</p>
            <p className="text-4xl font-extrabold text-primary">{formatCurrency(changeOrder.price || 0)}</p>

            {changeOrder.pdf_url && (
              <a href={changeOrder.pdf_url} target="_blank" rel="noreferrer" className="inline-flex">
                <span className="inline-flex h-12 items-center gap-2 rounded-lg border-2 px-5 text-sm font-semibold">
                  <Download className="h-5 w-5" />
                  Download PDF
                </span>
              </a>
            )}

            {!changeOrder.signed_at && <SignChangeOrderButton token={params.token} />}
            {changeOrder.signed_at && (
              <p className="rounded-lg bg-success/10 p-3 text-center font-semibold text-success">
                ✓ Approved {formatDate(changeOrder.signed_at)}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>This adjusts the price and scope of your original estimate. Work on this change begins once approved.</p>
        </div>
      </div>
    </main>
  );
}
