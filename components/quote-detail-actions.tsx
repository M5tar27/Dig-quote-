"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateQuoteStatus, emailQuoteToClient } from "@/app/actions";
import { Download, Mail, Check, X, Link2, Loader2 } from "lucide-react";
import type { QuoteStatus } from "@/lib/types";

export function QuoteDetailActions({
  quoteId,
  status,
  publicToken,
  hasClientEmail,
}: {
  quoteId: string;
  status: QuoteStatus;
  publicToken: string;
  hasClientEmail: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emailing, setEmailing] = useState(false);

  function setStatus(next: QuoteStatus) {
    startTransition(async () => {
      try {
        await updateQuoteStatus(quoteId, next);
        toast.success(`Marked ${next}`);
      } catch (err: any) {
        toast.error(err.message || "Failed to update status");
      }
    });
  }

  async function handleEmail() {
    if (!hasClientEmail) {
      toast.error("Add a client email to this quote before sending");
      return;
    }
    setEmailing(true);
    try {
      await emailQuoteToClient(quoteId);
      toast.success("Emailed to client");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setEmailing(false);
    }
  }

  function copyPublicLink() {
    const url = `${window.location.origin}/q/${publicToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Public link copied");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/quotes/${quoteId}/pdf`} target="_blank" rel="noreferrer">
        <Button variant="outline" size="lg" className="gap-2">
          <Download className="h-5 w-5" />
          Download PDF
        </Button>
      </a>
      <Button variant="outline" size="lg" className="gap-2" onClick={handleEmail} disabled={emailing}>
        {emailing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
        Email to Client
      </Button>
      <Button variant="outline" size="lg" className="gap-2" onClick={copyPublicLink}>
        <Link2 className="h-5 w-5" />
        Copy Client Link
      </Button>
      {status !== "won" && (
        <Button variant="success" size="lg" className="gap-2" onClick={() => setStatus("won")} disabled={isPending}>
          <Check className="h-5 w-5" />
          Mark Won
        </Button>
      )}
      {status !== "lost" && (
        <Button variant="destructive" size="lg" className="gap-2" onClick={() => setStatus("lost")} disabled={isPending}>
          <X className="h-5 w-5" />
          Mark Lost
        </Button>
      )}
    </div>
  );
}
