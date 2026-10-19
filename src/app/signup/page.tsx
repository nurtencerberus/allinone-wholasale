import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { safeNextPath } from "@/lib/auth";

export const metadata = {
  title: "Create a trade account",
  description: "Create a Ciputra Corp. account with email confirmation.",
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode="signup" next={safeNextPath(next)} />
    </AuthShell>
  );
}
