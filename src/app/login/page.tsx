import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { demoModeEnabled } from "@/lib/demo-mode";

export const metadata = {
  title: "Trade portal sign in",
  description: "Sign in to the Ciputra Corp. wholesale portal.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode="login" next={next} showDemo={demoModeEnabled()} />
    </AuthShell>
  );
}
