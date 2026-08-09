import { createClient } from "@/lib/supabase/server";
import type { Company, Profile } from "@/lib/types";

/** Fetches the signed-in user + their profile + company. Returns null pieces if missing. */
export async function getCompanyContext() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { user: null, profile: null, company: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile?.company_id) {
    return { user, profile: profile ?? null, company: null };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle<Company>();

  return { user, profile, company };
}
