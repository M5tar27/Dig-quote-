"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { updateCompanyProfile, updateCompanyLogo } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Upload } from "lucide-react";
import type { Company } from "@/lib/types";

export function CompanyForm({ company }: { company: Company }) {
  const supabase = createClient();
  const [name, setName] = useState(company.name);
  const [phone, setPhone] = useState(company.phone || "");
  const [email, setEmail] = useState(company.email || "");
  const [terms, setTerms] = useState(company.default_terms || "");
  const [logoUrl, setLogoUrl] = useState(company.logo_url);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const compressed = await compressImage(file, { maxDimension: 512, quality: 0.88 });
      const ext = compressed.name.split(".").pop() || "png";
      const path = `${company.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("quotes").upload(path, compressed, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("quotes").getPublicUrl(path);
      await updateCompanyLogo(publicUrl.publicUrl);
      setLogoUrl(publicUrl.publicUrl);
      toast.success("Logo updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCompanyProfile({ name, phone, email, default_terms: terms });
      toast.success("Company info saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company</CardTitle>
        <CardDescription>Shown on every quote PDF and the client approval page.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-md object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-dashed text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
              )}
              <Input type="file" accept="image/*" onChange={handleLogoChange} disabled={uploadingLogo} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Default terms</Label>
            <Textarea id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
          </div>

          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            Save company info
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
