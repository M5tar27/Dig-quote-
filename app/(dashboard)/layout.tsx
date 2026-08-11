import { redirect } from "next/navigation";
import { getCompanyContext } from "@/lib/data";
import { Nav } from "@/components/nav";

// Every page under this layout shows one company's private data (quotes, settings,
// billing). Without this, a cached response could theoretically be served to a
// different logged-in visitor — same class of bug as the /pricing caching issue.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, company } = await getCompanyContext();

  if (!user) redirect("/login");
  if (!company) redirect("/onboarding");

  const trialEndsAt = company.trial_ends_at ? new Date(company.trial_ends_at) : null;
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : null;
  const showTrialBanner =
    company.subscription_status === "trialing" && daysLeft !== null && daysLeft <= 5;

  return (
    <div className="min-h-screen bg-secondary/40">
      <Nav companyName={company.name} logoUrl={company.logo_url} />
      {showTrialBanner && (
        <div className="bg-primary/10 py-2 text-center text-sm font-medium text-primary">
          {daysLeft === 0 ? "Your trial ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial`}
          {" — "}
          <a href="/pricing" className="underline">
            upgrade now
          </a>
        </div>
      )}
      <div className="container py-6">{children}</div>
    </div>
  );
}
