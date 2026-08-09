import { LoginForm } from "@/components/login-form";

// Auth pages depend on the browser Supabase client and should never be statically
// prerendered (that would run the client at build time with no session/env context).
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
