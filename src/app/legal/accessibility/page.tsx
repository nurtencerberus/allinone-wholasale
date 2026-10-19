import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Accessibility",
  description: `${SITE.name}'s commitment to an accessible website.`,
  alternates: { canonical: "/legal/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility"
      intro="We want every buyer to be able to browse our catalog, place orders and manage their account, including people who use assistive technology."
    >
      <section>
        <h2>Our standard</h2>
        <p>
          We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.1, level AA, and we test and improve the
          site on an ongoing basis. Some areas may not yet fully meet this standard.
        </p>
      </section>
      <section>
        <h2>Need help or found a barrier?</h2>
        <p>
          If any part of the site is hard to use, email{" "}
          <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> or call {SITE.phone}. Tell us the page
          and the problem; we will help you place your order and work to fix the issue.
        </p>
      </section>
    </LegalPage>
  );
}
