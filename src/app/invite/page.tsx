import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AcceptInvite } from "@/components/account/AcceptInvite";

export const metadata = {
  title: "Join a company account",
  robots: { index: false, follow: false },
};

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const user = await getSessionUser();
  // The invitation is tied to one e-mail address, so it only works once signed in as that person.
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);

  return (
    <div className="wrap flex min-h-[55vh] flex-col items-center justify-center py-16 text-center">
      <p className="eyebrow">Company account</p>
      <h1 className="display mt-2 text-[32px] leading-tight sm:text-[38px]">You have been invited</h1>
      <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-ink/72">
        Accepting adds <strong>{user.email}</strong> to the company account: the same trade terms, agreed prices,
        quotes and order history as your colleagues.
      </p>
      <AcceptInvite token={token} />
      <Link href="/account" className="mt-6 text-[11px] font-semibold text-ink/65 underline">
        Not now, take me to my account
      </Link>
    </div>
  );
}
