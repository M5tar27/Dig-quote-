"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addJobMaterial, removeJobMaterial, updateMaterialStatus } from "@/app/actions";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { JobMaterial, MaterialStatus } from "@/lib/types";

const STATUS_LABEL: Record<MaterialStatus, string> = {
  needed: "Needed",
  ordered: "Ordered",
  delivered: "Delivered",
  installed: "Installed",
};

const STATUS_VARIANT: Record<MaterialStatus, "secondary" | "default" | "success"> = {
  needed: "secondary",
  ordered: "default",
  delivered: "default",
  installed: "success",
};

const STATUS_ORDER: MaterialStatus[] = ["needed", "ordered", "delivered", "installed"];

export function JobMaterialsChecklist({ quoteId, materials }: { quoteId: string; materials: JobMaterial[] }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");

  const installedCount = materials.filter((m) => m.status === "installed").length;

  async function handleStatusChange(materialId: string, status: MaterialStatus) {
    setUpdatingId(materialId);
    try {
      await updateMaterialStatus(materialId, status);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't update status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemove(materialId: string) {
    setUpdatingId(materialId);
    try {
      await removeJobMaterial(materialId, quoteId);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't remove item");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAdd() {
    if (!label.trim()) {
      toast.error("Enter what material is needed");
      return;
    }
    setAdding(true);
    try {
      await addJobMaterial(quoteId, {
        label: label.trim(),
        quantity: quantity.trim() ? Number(quantity) : null,
        unit: unit.trim() || null,
      });
      setLabel("");
      setQuantity("");
      setUnit("");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Couldn't add material");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Materials</CardTitle>
        {materials.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {installedCount} / {materials.length} installed
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {materials.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No materials tracked yet — add what's needed below.
          </p>
        )}

        {materials.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-[140px] flex-1">
              <p className="font-medium">{m.label}</p>
              {(m.quantity || m.unit) && (
                <p className="text-sm text-muted-foreground">
                  {m.quantity ?? ""} {m.unit ?? ""}
                </p>
              )}
            </div>

            <Badge variant={STATUS_VARIANT[m.status]}>{STATUS_LABEL[m.status]}</Badge>

            <Select
              value={m.status}
              onValueChange={(v) => handleStatusChange(m.id, v as MaterialStatus)}
              disabled={updatingId === m.id}
            >
              <SelectTrigger className="h-10 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-destructive"
              onClick={() => handleRemove(m.id)}
              disabled={updatingId === m.id}
            >
              {updatingId === m.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Material (e.g. Mulch)"
            className="h-10 min-w-[140px] flex-1"
          />
          <Input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            type="number"
            placeholder="Qty"
            className="h-10 w-20"
          />
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit"
            className="h-10 w-24"
          />
          <Button variant="outline" size="sm" className="gap-2" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
