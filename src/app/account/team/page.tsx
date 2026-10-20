import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { canManageCompany, companyFor, membersOf, pendingInvites } from "@/lib/companies";
import { CompanyTeam } from "@/components/account/CompanyTeam";

export const metadata = {
  title: "Your team",
  robots: { index: false, follow: false },
};

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/team");

  const company = await companyFor(user.companyId);
  const [members, invites] = company
    ? await Promise.all([membersOf(company.id), pendingInvites(company.id)])
    : [[], []];

  return (
    <div>
      <section className="border-b border-ink/10 bg-parchment/40">
        <div className="wrap py-9">
          <Link href="/account" className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-ink/65 hover:text-ink">
            <ArrowLeft size={12} /> Your account
          </Link>
          <h1 className="display mt-2 text-[32px] leading-tight sm:text-[40px]">
            {company ? company.name : "Your team"}
          </h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-ink/72">
            {company
              ? "Everyone here buys on the same trade terms and sees the same orders, quotes and agreed prices."
              : "Turn this into a company account so colleagues can order on the same terms and see the same history."}
          </p>
        </div>
      </section>
      <div className="wrap py-8">
        <CompanyTeam
          company={company ? { id: company.id, name: company.name } : null}
          members={members}
          invites={invites}
          viewerId={user.id}
          canManage={canManageCompany(user)}
          defaultName={user.company ?? ""}
        />
      </div>
    </div>
  );
}
