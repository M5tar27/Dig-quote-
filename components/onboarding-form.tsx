"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload } from "lucide-react";
import { DEFAULT_RATES } from "@/lib/types";

export function OnboardingForm() {
  const router = useRouter();
  const supabase = createClient();
  const [companyName, setCompanyName] = useState("");
  const [hourlyRate, setHourlyRate] = useState(String(DEFAULT_RATES.excavator_hr));
  const [markupPct, setMarkupPct] = useState(String(DEFAULT_RATES.markup_pct));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const rates = {
        ...DEFAULT_RATES,
        excavator_hr: Number(hourlyRate) || DEFAULT_RATES.excavator_hr,
        markup_pct: Number(markupPct) || DEFAULT_RATES.markup_pct,
      };

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({ name: companyName.trim(), owner_id: user.id, email: user.email, rates_json: rates })
        .select()
        .single();
      if (companyError) throw companyError;

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        company_id: company.id,
        role: "admin",
        full_name: user.user_metadata?.full_name ?? null,
        email: user.email,
      });
      if (profileError) throw profileError;

      let logoUrl: string | null = null;
      if (logoFile) {
        const compressedLogo = await compressImage(logoFile, { maxDimension: 512, quality: 0.88 });
        const ext = compressedLogo.name.split(".").pop() || "png";
        const path = `${company.id}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage.from("quotes").upload(path, compressedLogo, {
          upsert: true,
        });
        if (uploadError) throw uploadError;
        const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);
        logoUrl = publicUrl.publicUrl;

        const { error: updateError } = await supabase
          .from("companies")
          .update({ logo_url: logoUrl })
          .eq("id", company.id);
        if (updateError) throw updateError;
      }

      toast.success("You're all set!");
      router.push("/app");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set up your company</CardTitle>
          <CardDescription>Takes about 30 seconds. You can change all of this later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company name *</Label>
              <Input
                id="companyName"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Buckeye Excavation & Landscaping"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo">Company logo</Label>
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Logo preview" className="h-12 w-12 rounded-md object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate">Default hourly rate</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="rate"
                    type="number"
                    min={0}
                    className="pl-8"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="markup">Material markup %</Label>
                <div className="relative">
                  <Input
                    id="markup"
                    type="number"
                    min={0}
                    className="pr-8"
                    value={markupPct}
                    onChange={(e) => setMarkupPct(e.target.value)}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Finish setup
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
