import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">That page doesn't exist or you don't have access to it.</p>
      <Link href="/">
        <Button size="lg">Back home</Button>
      </Link>
    </main>
  );
}
