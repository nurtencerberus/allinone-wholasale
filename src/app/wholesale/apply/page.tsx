import Link from "next/link";
import { ArrowLeft, BadgeCheck, Clock, FileCheck2, ShieldCheck } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { WholesaleApplyForm } from "@/components/WholesaleApplyForm";
import { db } from "@/db";
import { wholesaleApplications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const metadata = {
  title: "Apply for a wholesale trade account",
  description:
    "Apply for Ciputra Corp. wholesale pricing: EIN verification, account-specific contract pricing and resale tax exemption for US retailers.",
  alternates: { canonical: "/wholesale/apply" },
};

export default async function ApplyPage() {
  const user = await getSessionUser();
  const [latest] = user
    ? await db
        .select({ status: wholesaleApplications.status, createdAt: wholesaleApplications.createdAt })
        .from(wholesaleApplications)
        .where(eq(wholesaleApplications.userId, user.id))
        .orderBy(desc(wholesaleApplications.createdAt))
        .limit(1)
    : [];

  return (
    <div>
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-10">
          <Link href="/wholesale" className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink/50 hover:text-ink">
            <ArrowLeft size={13} /> Wholesale program
          </Link>
          <h1 className="display mt-3 max-w-2xl text-[34px] leading-tight sm:text-[44px]">
            Trade application
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink/60">
            Four short sections. A trade specialist verifies your EIN and resale documentation —
            most applications are decided within one business day. Wholesale pricing and ordering
            unlock once your account is approved.
          </p>
        </div>
      </section>

      <div className="wrap grid gap-8 py-10 lg:grid-cols-[1.4fr_0.6fr]">
        <ApplyGate user={user} latestStatus={latest?.status ?? null} />

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">What you unlock</p>
            <ul className="mt-3 space-y-2.5">
              {[
                "Account-specific contract discount, stacked on volume case pricing",
                "Resale tax exemption where your certificate is verified",
                "Quick order by SKU for pallet replenishment",
                "Saved dock addresses and full order history",
                "Net-30 terms against a purchase order",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink/65">
                  <BadgeCheck size={13} className="mt-0.5 shrink-0 text-fern" /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-5">
            <p className="eyebrow">Review timeline</p>
            <div className="mt-3 space-y-3">
              {[
                { icon: FileCheck2, title: "Received", body: "Instant reference number by email." },
                { icon: ShieldCheck, title: "EIN verification", body: "Usually within one business day." },
                { icon: Clock, title: "Pricing activated", body: "Approval email + account update." },
              ].map((step) => (
                <div key={step.title} className="flex items-start gap-2.5">
                  <step.icon size={14} className="mt-0.5 shrink-0 text-fern" />
                  <div>
                    <p className="text-[11.5px] font-bold">{step.title}</p>
                    <p className="text-[10.5px] leading-relaxed text-ink/50">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-ink p-5 text-cream">
            <p className="text-[10.5px] font-bold tracking-[0.16em] text-gold uppercase">Need help?</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-cream/65">
              The trade desk answers EIN and freight questions directly, Monday–Friday 8am–6pm ET.
            </p>
            <a href="mailto:info@ciputracorp.com" className="mt-3 inline-block text-[11px] font-bold text-cream underline">
              info@ciputracorp.com
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ApplyGate({
  user,
  latestStatus,
}: {
  user: Awaited<ReturnType<typeof getSessionUser>>;
  latestStatus: string | null;
}) {
  const next = encodeURIComponent("/wholesale/apply");
  if (!user) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Step 1 of 2</p>
        <h2 className="display mt-2 text-[26px]">Create your login first</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink/65">
          Applications are attached to a confirmed account so your approval, pricing and order history stay
          in one place. It takes a minute.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href={`/signup?next=${next}`} className="btn btn-primary btn-sm">Create an account</Link>
          <Link href={`/login?next=${next}`} className="btn btn-outline btn-sm">Sign in</Link>
        </div>
      </div>
    );
  }
  if (!user.emailVerified) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Step 1 of 2</p>
        <h2 className="display mt-2 text-[26px]">Confirm your email</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink/65">
          We sent a confirmation link to <strong>{user.email}</strong>. Confirm it, then return to this page to
          apply. You can resend the link from your account page.
        </p>
        <Link href="/account" className="btn btn-primary btn-sm mt-5">Go to your account</Link>
      </div>
    );
  }
  if (user.accountTier === "wholesale" || latestStatus === "pending") {
    const approved = user.accountTier === "wholesale";
    return (
      <div className="card p-6">
        <h2 className="display text-[26px]">{approved ? "Your account is approved" : "Application under review"}</h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink/65">
          {approved
            ? "Wholesale pricing, quick order and checkout are active on this account."
            : "A trade specialist is reviewing your application. You will get an email with the decision."}
        </p>
        <Link href={approved ? "/shop" : "/account"} className="btn btn-primary btn-sm mt-5">
          {approved ? "Shop the catalog" : "Go to your account"}
        </Link>
      </div>
    );
  }
  return <WholesaleApplyForm account={{ name: user.name, email: user.email, company: user.company }} />;
}
