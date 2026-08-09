import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/data";
import { StatsCards } from "@/components/stats-cards";
import { QuotesFilterBar } from "@/components/quotes-filter-bar";
import { QuotesTable } from "@/components/quotes-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import type { Quote, QuoteStatus } from "@/lib/types";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; from?: string; to?: string };
}) {
  const supabase = await createClient();
  const { company } = await getCompanyContext();
  if (!company) return null;

  // Stats are computed off the full, unfiltered set for this company.
  const { data: allQuotes } = await supabase
    .from("quotes")
    .select("status, total")
    .eq("company_id", company.id);

  const totalQuotes = allQuotes?.length ?? 0;
  const won = allQuotes?.filter((q) => q.status === "won").length ?? 0;
  const lost = allQuotes?.filter((q) => q.status === "lost").length ?? 0;
  const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
  const pipeline =
    allQuotes
      ?.filter((q) => q.status === "draft" || q.status === "sent")
      .reduce((sum, q) => sum + (Number(q.total) || 0), 0) ?? 0;

  let query = supabase
    .from("quotes")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (searchParams.status && searchParams.status !== "all") {
    query = query.eq("status", searchParams.status as QuoteStatus);
  }
  if (searchParams.from) {
    query = query.gte("created_at", searchParams.from);
  }
  if (searchParams.to) {
    query = query.lte("created_at", `${searchParams.to}T23:59:59`);
  }

  const { data: quotes } = await query;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/quotes/new">
          <Button size="lg" className="w-full gap-2 sm:w-auto">
            <PlusCircle className="h-5 w-5" />
            New Quote
          </Button>
        </Link>
      </div>

      <StatsCards totalQuotes={totalQuotes} winRate={winRate} pipeline={pipeline} />

      <div className="space-y-4">
        <QuotesFilterBar />
        <QuotesTable quotes={(quotes as Quote[]) || []} />
      </div>
    </div>
  );
}
