"use client";

import { createBrowserClient } from "@supabase/ssr";
import { configError, isSupabaseConfigured } from "@/lib/config";

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw configError(
      "Supabase isn't configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local (see README.md)."
    );
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
