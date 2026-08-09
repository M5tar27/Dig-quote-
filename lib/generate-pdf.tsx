import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { QuotePdf } from "@/components/quote-pdf";
import type { Company, Quote } from "@/lib/types";

/** Renders the quote PDF, caches it in Storage, and updates quotes.pdf_url. Returns the public URL. */
export async function renderAndStoreQuotePdf(
  supabase: SupabaseClient,
  quote: Quote,
  company: Company
): Promise<string> {
  const buffer = await renderToBuffer(<QuotePdf quote={quote} company={company} />);
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
