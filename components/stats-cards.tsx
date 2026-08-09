import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { FileText, Percent, TrendingUp } from "lucide-react";

export function StatsCards({
  totalQuotes,
  winRate,
  pipeline,
}: {
  totalQuotes: number;
  winRate: number;
  pipeline: number;
}) {
  const stats = [
    { label: "Total Quotes", value: String(totalQuotes), icon: FileText },
    { label: "Win Rate", value: `${winRate.toFixed(0)}%`, icon: Percent },
    { label: "Pipeline", value: formatCurrency(pipeline), icon: TrendingUp },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-3xl font-bold">{s.value}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <s.icon className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
