import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { configError, isSupabaseConfigured } from "@/lib/config";

/** Server Component / Route Handler client — respects RLS as the signed-in user. */
export async function createClient() {
  // Call cookies() before any early return/throw: it's what tells Next.js this route
  // needs dynamic rendering. Throwing first would hide that signal and make Next treat
  // our friendly config error as a hard *build-time* prerender failure instead.
  const cookieStore = await cookies();

  if (!isSupabaseConfigured()) {
    throw configError(
      "Supabase isn't configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local (see README.md)."
    );
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

/** Service-role client for privileged server-side work (webhooks, team invites). Bypasses RLS. */
export function createServiceClient() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE) {
    throw configError("SUPABASE_SERVICE_ROLE (and the Supabase URL/anon key) must be set for this feature.");
  }
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
