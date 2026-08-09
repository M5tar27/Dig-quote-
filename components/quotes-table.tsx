"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import { updateQuoteStatus } from "@/app/actions";
import type { Quote, QuoteStatus } from "@/lib/types";
import { Check, X } from "lucide-react";

const STATUS_VARIANT: Record<QuoteStatus, "secondary" | "default" | "success" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  won: "success",
  lost: "destructive",
};

export function QuotesTable({ quotes }: { quotes: Quote[] }) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleStatus(id: string, status: QuoteStatus) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await updateQuoteStatus(id, status);
        toast.success(`Marked ${status}`);
      } catch (err: any) {
        toast.error(err.message || "Failed to update status");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (quotes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center">
        <p className="text-lg font-medium">No quotes yet.</p>
        <p className="mt-1 text-muted-foreground">Create your first in 60sec →</p>
        <Link href="/quotes/new">
          <Button size="lg" className="mt-4">
            New Quote
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-medium">
                <Link href={`/quotes/${q.id}`} className="hover:underline">
                  {q.client_name}
                </Link>
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground">{q.address}</TableCell>
              <TableCell>{formatCurrency(q.total || 0)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(q.created_at)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {q.status !== "won" && (
                    <Button
                      size="sm"
                      variant="success"
                      disabled={isPending && pendingId === q.id}
                      onClick={() => handleStatus(q.id, "won")}
                      title="Mark Won"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  {q.status !== "lost" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending && pendingId === q.id}
                      onClick={() => handleStatus(q.id, "lost")}
                      title="Mark Lost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
