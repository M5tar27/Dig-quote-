"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, PenLine } from "lucide-react";

export function SignChangeOrderButton({ token }: { token: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleSign() {
    setLoading(true);
    const { error } = await supabase.rpc("sign_public_change_order", { p_token: token });
    setLoading(false);
    if (error) {
      toast.error("Couldn't sign — try again or call your contractor.");
      return;
    }
    toast.success("Change order approved!");
    router.refresh();
  }

  return (
    <Button size="lg" className="w-full gap-2" onClick={handleSign} disabled={loading}>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PenLine className="h-5 w-5" />}
      Approve this change order
    </Button>
  );
}
