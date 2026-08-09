import Link from "next/link";
import { getCompanyContext } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "@/components/settings/company-form";
import { CertificationsForm } from "@/components/settings/certifications-form";
import { PricingForm } from "@/components/settings/pricing-form";
import { TeamPanel } from "@/components/settings/team-panel";
import { DEFAULT_RATES, type Profile } from "@/lib/types";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { user, profile, company } = await getCompanyContext();
  if (!user || !profile || !company) return null;

  const isAdmin = profile.role === "admin";

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: true });

  const rates = { ...DEFAULT_RATES, ...(company.rates_json || {}) };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          {isAdmin && <TabsTrigger value="billing">Billing</TabsTrigger>}
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <CompanyForm company={company} />
          <CertificationsForm company={company} />
        </TabsContent>

        <TabsContent value="pricing">
          <PricingForm rates={rates} />
        </TabsContent>

        <TabsContent value="team">
          <TeamPanel members={(members as Profile[]) || []} isAdmin={isAdmin} currentUserId={user.id} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Manage your DigQuote subscription.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Plan</p>
                    <p className="text-sm text-muted-foreground">$99/mo unlimited quotes</p>
                  </div>
                  <Badge variant={company.subscription_status === "active" ? "success" : "secondary"} className="capitalize">
                    {company.subscription_status}
                  </Badge>
                </div>
                <Link href="/pricing">
                  <Button size="lg">Manage subscription</Button>
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
