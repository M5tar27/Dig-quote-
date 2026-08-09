"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { CompanyRates } from "@/lib/types";

export function ManualEstimateForm({ quoteId, rates }: { quoteId: string; rates: CompanyRates }) {
  const router = useRouter();
  const [sqft, setSqft] = useState("");
  const [depth, setDepth] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sqft || !depth) {
      toast.error("Enter both square footage and depth");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/estimate/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quote_id: quoteId,
          sqft: Number(sqft),
          depth_inches: Number(depth),
          company_rates: rates,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to calculate estimate");
      }
      toast.success("Estimate calculated");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg">AI couldn't read photos. Enter sqft manually</CardTitle>
        <CardDescription>
          We'll calculate materials, labor, and pricing from these two numbers instead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="sqft">Square footage</Label>
            <Input id="sqft" type="number" min={0} value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="320" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="depth">Avg depth (inches)</Label>
            <Input id="depth" type="number" min={0} value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="12" />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-5 w-5 animate-spin" />}
              Calculate
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
