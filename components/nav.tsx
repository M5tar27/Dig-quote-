"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, PlusCircle, Settings, LogOut } from "lucide-react";

export function Nav({ companyName, logoUrl }: { companyName: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const links = [
    { href: "/app", label: "Dashboard", icon: LayoutDashboard },
    { href: "/quotes/new", label: "New Quote", icon: PlusCircle },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} className="h-8 w-8 rounded-md object-cover" />
          ) : null}
          <span className="hidden font-bold sm:inline">{companyName}</span>
        </div>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={active ? "default" : "ghost"}
                  size="sm"
                  className={cn("gap-2", active && "shadow-sm")}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Button>
              </Link>
            );
          })}
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
