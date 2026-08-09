"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateQuoteLineItems } from "@/app/actions";
import { formatCurrency } from "@/lib/utils";
import { Pencil, Plus, Trash2, Loader2, X } from "lucide-react";
import type { AiDataJson, AiLineItem, CompanyRates } from "@/lib/types";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function recompute(lineItems: AiLineItem[], rates: CompanyRates) {
  const normalized = lineItems.map((li) => ({
    ...li,
    total: round2((Number(li.quantity) || 0) * (Number(li.unit_cost) || 0)),
  }));
  const subtotal = round2(normalized.reduce((sum, li) => sum + li.total, 0));
  const markup = round2(subtotal * (rates.markup_pct / 100));
  const profit = round2(subtotal * (rates.profit_pct / 100));
  const total = round2(subtotal + markup + profit);
  return { normalized, subtotal, markup, profit, total };
}

export function QuoteLineItems({
  quoteId,
  ai,
  rates,
}: {
  quoteId: string;
  ai: AiDataJson;
  rates: CompanyRates;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<AiLineItem[]>(ai.line_items);
  const [saving, setSaving] = useState(false);

  const preview = recompute(items, rates);

  function updateItem(index: number, field: keyof AiLineItem, value: string) {
    setItems((prev) =>
      prev.map((li, i) =>
        i === index
          ? { ...li, [field]: field === "label" || field === "unit" ? value : Number(value) || 0 }
          : li
      )
    );
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addItem() {
    setItems((prev) => [...prev, { label: "New item", quantity: 1, unit: "ea", unit_cost: 0, total: 0 }]);
  }

  function cancelEdit() {
    setItems(ai.line_items);
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateQuoteLineItems(quoteId, items);
      toast.success("Line items updated");
      setEditing(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {ai.line_items.map((li, i) => (
            <div key={i} className="flex justify-between border-b py-2 text-sm last:border-0">
              <span>
                {li.label}{" "}
                <span className="text-muted-foreground">
                  ({li.quantity} {li.unit} × {formatCurrency(li.unit_cost)})
                </span>
              </span>
              <span className="font-medium">{formatCurrency(li.total)}</span>
            </div>
          ))}
          <Totals subtotal={ai.subtotal} markup={ai.markup} profit={ai.profit} total={ai.total} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Edit Line Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-3">
          {items.map((li, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <Input
                value={li.label}
                onChange={(e) => updateItem(i, "label", e.target.value)}
                className="h-10 min-w-[120px] flex-1"
                placeholder="Label"
              />
              <Input
                type="number"
                value={li.quantity}
                onChange={(e) => updateItem(i, "quantity", e.target.value)}
                className="h-10 w-20"
                min={0}
                step="0.1"
                aria-label="Quantity"
              />
              <Input
                value={li.unit}
                onChange={(e) => updateItem(i, "unit", e.target.value)}
                className="h-10 w-16"
                aria-label="Unit"
              />
              <span className="text-muted-foreground">×</span>
              <Input
                type="number"
                value={li.unit_cost}
                onChange={(e) => updateItem(i, "unit_cost", e.target.value)}
                className="h-10 w-24"
                min={0}
                step="0.01"
                aria-label="Rate"
              />
              <span className="w-20 text-right text-sm font-medium">
                {formatCurrency(round2((Number(li.quantity) || 0) * (Number(li.unit_cost) || 0)))}
              </span>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" onClick={() => removeItem(i)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="gap-2" onClick={addItem}>
          <Plus className="h-4 w-4" />
          Add line item
        </Button>

        <Totals subtotal={preview.subtotal} markup={preview.markup} profit={preview.profit} total={preview.total} />

        <div className="flex gap-2">
          <Button size="lg" className="flex-1 gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            Save changes
          </Button>
          <Button variant="outline" size="lg" className="gap-2" onClick={cancelEdit} disabled={saving}>
            <X className="h-5 w-5" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Totals({
  subtotal,
  markup,
  profit,
  total,
}: {
  subtotal: number;
  markup: number;
  profit: number;
  total: number;
}) {
  return (
    <div className="space-y-1 border-t pt-3 text-sm">
      <div className="flex justify-between text-muted-foreground">
        <span>Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Markup</span>
        <span>{formatCurrency(markup)}</span>
      </div>
      <div className="flex justify-between text-muted-foreground">
        <span>Profit</span>
        <span>{formatCurrency(profit)}</span>
      </div>
      <div className="flex justify-between border-t pt-2 text-base font-bold">
        <span>Total</span>
        <span className="text-primary">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
