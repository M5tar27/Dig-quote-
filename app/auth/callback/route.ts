import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.company_id) {
        return NextResponse.redirect(`${origin}/app`);
      }
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
