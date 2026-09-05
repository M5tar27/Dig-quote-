import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Supabase isn't configured yet (fresh clone, no .env.local) — let requests through
  // unmodified so at least the marketing pages render instead of hard-crashing every route.
  if (!isSupabaseConfigured()) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  const path = request.nextUrl.pathname;
  const isPublicPath =
    path.startsWith("/login") ||
    path.startsWith("/signup") ||
    path.startsWith("/auth") ||
    path.startsWith("/q/") ||
    path.startsWith("/pricing") ||
    path === "/" ||
    path.startsWith("/api/stripe/webhook");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Paywall: no more trial — gate purely on plan + usage. See supabase/schema.sql's
  // free-bid relaunch migration and lib/plans.ts's PLAN_LIMITS.
  if (user && path.startsWith("/quotes/new")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("plan, subscription_status")
        .eq("id", profile.company_id)
        .maybeSingle();

      if (company) {
        let blocked = false;

        if (company.plan === "free") {
          const { count } = await supabase
            .from("quotes")
            .select("id", { count: "exact", head: true })
            .eq("company_id", profile.company_id)
            .eq("is_free_bid", true);
          blocked = (count ?? 0) >= 1;
        } else if (company.plan === "starter") {
          if (company.subscription_status !== "active") {
            blocked = true;
          } else {
            const monthStart = new Date();
            monthStart.setUTCDate(1);
            monthStart.setUTCHours(0, 0, 0, 0);
            const { count } = await supabase
              .from("quotes")
              .select("id", { count: "exact", head: true })
              .eq("company_id", profile.company_id)
              .gte("created_at", monthStart.toISOString());
            blocked = (count ?? 0) >= 30;
          }
        } else if (company.plan === "pro") {
          blocked = company.subscription_status !== "active";
        }

        if (blocked) {
          const url = request.nextUrl.clone();
          url.pathname = "/pricing";
          url.searchParams.set("paywall", "1");
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}
