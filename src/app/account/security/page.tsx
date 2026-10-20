import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { getSessionUser, safeNextPath, staffTwoFactorRequired } from "@/lib/auth";
import { isStaffRole } from "@/lib/staff";
import { TwoFactorSetup } from "@/components/account/TwoFactorSetup";

export const metadata = {
  title: "Sign-in security",
  robots: { index: false, follow: false },
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string; next?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/security");
  const { required, next } = await searchParams;
  const mustEnable = isStaffRole(user.role) && staffTwoFactorRequired();

  return (
    <div className="wrap max-w-2xl py-8 lg:py-10">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/68 hover:text-ink">
        <ArrowLeft size={13} /> Account
      </Link>
      <h1 className="display mt-2 text-[32px] leading-tight">Sign-in security</h1>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/72">
        Two-factor sign-in asks for a code from an authenticator app (Google Authenticator, 1Password, Authy,
        Microsoft Authenticator) after your password.
      </p>
      {required && !user.twoFactorEnabled ? (
        <p className="mt-4 flex items-start gap-2 rounded-md border border-clay/30 bg-clay/10 px-3 py-2.5 text-[12px] font-medium text-clay">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          Staff accounts must turn on two-factor sign-in before using the admin console.
        </p>
      ) : null}
      <div className="mt-6">
        <TwoFactorSetup
          initiallyEnabled={user.twoFactorEnabled}
          mustStayOn={mustEnable}
          continueTo={safeNextPath(next) ?? (isStaffRole(user.role) ? "/admin" : "/account")}
        />
      </div>
    </div>
  );
}
