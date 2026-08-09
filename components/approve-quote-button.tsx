"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ThumbsUp } from "lucide-react";

export function ApproveQuoteButton({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    const { error } = await supabase.rpc("approve_public_quote", { p_token: token });
    setLoading(false);
    if (error) {
      toast.error("Couldn't approve — try again or call your contractor.");
      return;
    }
    toast.success("Estimate approved!");
    router.refresh();
  }

  return (
    <Button size="lg" className="w-full gap-2" onClick={handleApprove} disabled={loading}>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ThumbsUp className="h-5 w-5" />}
      Approve this estimate
    </Button>
  );
}
