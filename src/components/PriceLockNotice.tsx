import Link from "next/link";
import { Lock } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

/** Full-page notice for trade-only pages (checkout, quick order) when the viewer cannot see prices. */
export function PriceLockNotice({ user, next }: { user: SessionUser | null; next: string }) {
  return (
    <div className="wrap flex min-h-[52vh] flex-col items-center justify-center py-20 text-center">
      <span className="rounded-full bg-gold/15 p-3 text-ink/70">
        <Lock size={22} />
      </span>
      <h1 className="display mt-4 text-[30px]">For approved trade accounts</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink/60">
        {user
          ? "Wholesale pricing and ordering unlock once your trade application is approved. Most applications are decided within one business day."
          : "Sign in to your trade account to see wholesale pricing and place orders, or apply with your EIN and resale certificate."}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {user ? null : (
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-outline">
            Sign in
          </Link>
        )}
        <Link href="/wholesale/apply" className="btn btn-primary">
          Apply for wholesale
        </Link>
      </div>
    </div>
  );
}
