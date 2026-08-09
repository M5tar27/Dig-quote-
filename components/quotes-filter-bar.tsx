"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const STATUSES = ["all", "draft", "sent", "won", "lost"] as const;

export function QuotesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select defaultValue={searchParams.get("status") || "all"} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          defaultValue={searchParams.get("from") || ""}
          onChange={(e) => setParam("from", e.target.value)}
          className="w-full sm:w-[160px]"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          defaultValue={searchParams.get("to") || ""}
          onChange={(e) => setParam("to", e.target.value)}
          className="w-full sm:w-[160px]"
        />
      </div>
    </div>
  );
}
