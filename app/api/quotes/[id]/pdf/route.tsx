import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderAndStoreQuotePdf } from "@/lib/generate-pdf";
import type { Company, Quote } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single<Quote>();
  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", quote.company_id)
    .single<Company>();
  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  await renderAndStoreQuotePdf(supabase, quote, company);

  // Re-fetch the freshly rendered file so the response reflects exactly what's stored.
  const path = `${company.id}/${quote.id}/quote.pdf`;
  const { data: file, error: downloadError } = await supabase.storage.from("quotes").download(path);
  if (downloadError || !file) {
    return NextResponse.json({ error: "Could not read generated PDF" }, { status: 500 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="quote-${quote.id.slice(0, 8)}.pdf"`,
    },
  });
}
