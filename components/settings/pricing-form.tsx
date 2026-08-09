"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateCompanyRates } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { CompanyRates } from "@/lib/types";

const FIELDS: { key: keyof CompanyRates; label: string; prefix?: string; suffix?: string }[] = [
  { key: "excavator_hr", label: "Excavator", prefix: "$", suffix: "/hr" },
  { key: "labor_hr", label: "Labor", prefix: "$", suffix: "/hr" },
  { key: "markup_pct", label: "Material markup", suffix: "%" },
  { key: "profit_pct", label: "Profit margin", suffix: "%" },
  { key: "gravel_ton", label: "Gravel", prefix: "$", suffix: "/ton" },
  { key: "disposal_yard", label: "Disposal", prefix: "$", suffix: "/yd³" },
  { key: "equipment_day", label: "Equipment", prefix: "$", suffix: "/day" },
];

export function PricingForm({ rates: initialRates }: { rates: CompanyRates }) {
  const [rates, setRates] = useState(initialRates);
  const [saving, setSaving] = useState(false);

  function setField(key: keyof CompanyRates, value: string) {
    setRates((prev) => ({ ...prev, [key]: Number(value) || 0 }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCompanyRates(rates);
      toast.success("Pricing saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing</CardTitle>
        <CardDescription>These rates feed every AI estimate. Defaults are Ohio averages.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <div className="relative">
                  {f.prefix && (
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">{f.prefix}</span>
                  )}
                  <Input
                    id={f.key}
                    type="number"
                    min={0}
                    step="0.01"
                    className={f.prefix ? "pl-8" : undefined}
                    value={rates[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                  {f.suffix && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">{f.suffix}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button type="submit" size="lg" disabled={saving}>
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            Save pricing
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
