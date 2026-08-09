"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resend, quoteEmailHtml } from "@/lib/resend";
import { renderAndStoreQuotePdf } from "@/lib/generate-pdf";
import { getCompanyContext } from "@/lib/data";
import { recalculateFromLineItems } from "@/lib/pricing";
import { DEFAULT_RATES } from "@/lib/types";
import type { AiDataJson, AiLineItem, Certification, Company, CompanyRates, Quote, QuoteStatus, UserRole } from "@/lib/types";

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").update({ status }).eq("id", quoteId);
  if (error) throw new Error(error.message);
  revalidatePath("/app");
  revalidatePath(`/quotes/${quoteId}`);
}

export async function emailQuoteToClient(quoteId: string) {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single<Quote>();
  if (error || !quote) throw new Error(error?.message || "Quote not found");

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", quote.company_id)
    .single<Company>();
  if (!company) throw new Error("Company not found");

  if (!process.env.RESEND_API_KEY) {
    throw new Error("Email is not configured yet (missing RESEND_API_KEY).");
  }

  const to = quote.client_email;
  if (!to) throw new Error("No client email on file for this quote — add one to send.");

  const pdfUrl = quote.pdf_url || (await renderAndStoreQuotePdf(supabase, quote, company));

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "DigQuote <onboarding@resend.dev>",
    to,
    subject: `Your estimate for ${quote.address}`,
    html: quoteEmailHtml({
      clientName: quote.client_name,
      address: quote.address,
      companyName: company.name,
      total: Number(quote.total) || 0,
    }),
    attachments: [{ path: pdfUrl, filename: "quote.pdf" }],
  });

  await supabase.from("quotes").update({ status: "sent" }).eq("id", quoteId);
  revalidatePath("/app");
  revalidatePath(`/quotes/${quoteId}`);
}

export async function updateCompanyProfile(fields: {
  name: string;
  phone: string;
  email: string;
  default_terms: string;
}) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update(fields).eq("id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function updateCompanyLogo(logoUrl: string) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function addCertification(cert: Omit<Certification, "id">) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const newCert: Certification = { ...cert, id: crypto.randomUUID() };
  const updated = [...(company.certifications || []), newCert];

  const { error } = await supabase.from("companies").update({ certifications: updated }).eq("id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/q/[token]", "page");
  return newCert;
}

export async function removeCertification(certId: string) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const updated = (company.certifications || []).filter((c) => c.id !== certId);

  const { error } = await supabase.from("companies").update({ certifications: updated }).eq("id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/q/[token]", "page");
}

export async function updateCompanyRates(rates: CompanyRates) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const { error } = await supabase.from("companies").update({ rates_json: rates }).eq("id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function inviteTeamMember(email: string, role: UserRole) {
  const { profile, company } = await getCompanyContext();
  if (!company || !profile) throw new Error("No company on file");
  if (profile.role !== "admin") throw new Error("Only admins can invite team members");

  if (!process.env.SUPABASE_SERVICE_ROLE) {
    throw new Error("Team invites require SUPABASE_SERVICE_ROLE to be set on the server.");
  }

  const admin = createServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/login`,
  });
  if (inviteError || !invited?.user) throw new Error(inviteError?.message || "Failed to invite user");

  const { error: profileError } = await admin.from("profiles").upsert({
    id: invited.user.id,
    company_id: company.id,
    role,
    email,
  });
  if (profileError) throw new Error(profileError.message);

  revalidatePath("/settings");
}

export async function updateQuoteLineItems(quoteId: string, lineItems: AiLineItem[]) {
  const { company } = await getCompanyContext();
  if (!company) throw new Error("No company on file");

  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("ai_data_json")
    .eq("id", quoteId)
    .single<{ ai_data_json: AiDataJson | null }>();
  if (error || !quote) throw new Error(error?.message || "Quote not found");

  const rates: CompanyRates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };
  const base: AiDataJson = quote.ai_data_json ?? {
    estimate: null,
    line_items: [],
    subtotal: 0,
    markup: 0,
    profit: 0,
    total: 0,
    ai_confidence_1to10: 0,
    ai_notes: "",
    manual_mode: false,
  };

  const updated = recalculateFromLineItems(lineItems, rates, base);

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ ai_data_json: updated, total: updated.total })
    .eq("id", quoteId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/app");
  revalidatePath(`/quotes/${quoteId}`);
  return updated;
}

export async function updateTeamMemberRole(memberId: string, role: UserRole) {
  const { profile, company } = await getCompanyContext();
  if (!company || !profile) throw new Error("No company on file");
  if (profile.role !== "admin") throw new Error("Only admins can change roles");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", memberId)
    .eq("company_id", company.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
