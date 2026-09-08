import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QuotePdf } from "@/components/quote-pdf";
import { ChangeOrderPdf, type ChangeOrderPdfProps } from "@/components/change-order-pdf";
import type { Company, Quote } from "@/lib/types";

/**
 * Renders the quote PDF, caches it in Storage, and updates quotes.pdf_url. Returns the public URL.
 * `voiceTranscript` is passed through from the linked voice_memos row (see
 * app/api/quotes/[id]/pdf/route.tsx) when this quote was built from a voice bid — it
 * renders as a "Field Notes" section on the PDF per the Voice Memo feature spec.
 */
export async function renderAndStoreQuotePdf(
  supabase: SupabaseClient,
  quote: Quote,
  company: Company,
  voiceTranscript?: string | null
): Promise<string> {
  const buffer = await renderToBuffer(<QuotePdf quote={quote} company={company} voiceTranscript={voiceTranscript} />);
  const path = `${company.id}/${quote.id}/quote.pdf`;

  const { error: uploadError } = await supabase.storage.from("quotes").upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);
  await supabase.from("quotes").update({ pdf_url: publicUrl.publicUrl }).eq("id", quote.id);

  return publicUrl.publicUrl;
}

/** Pro-only: renders + stores a Change Order PDF (signature line included), mirroring
 * renderAndStoreQuotePdf's shape. Path lives under the owning company's storage
 * folder, scoped separately from any quote so it works whether or not the change
 * order is linked to one. */
export async function renderAndStoreChangeOrderPdf(
  supabase: SupabaseClient,
  changeOrder: ChangeOrderPdfProps,
  companyId: string
): Promise<string> {
  const buffer = await renderToBuffer(<ChangeOrderPdf {...changeOrder} />);
  const path = `${companyId}/change-orders/${changeOrder.id}.pdf`;

  const { error: uploadError } = await supabase.storage.from("quotes").upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);
  await supabase.from("change_orders").update({ pdf_url: publicUrl.publicUrl }).eq("id", changeOrder.id);

  return publicUrl.publicUrl;
}
