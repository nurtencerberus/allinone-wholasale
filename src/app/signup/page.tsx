import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata = {
  title: "Create a trade account",
  description: "Create a Meridian Supply Co. account with email confirmation.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
