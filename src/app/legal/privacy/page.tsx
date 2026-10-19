import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses and protects personal information.`,
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains what personal information ${SITE.name} collects when you use this website, why, who we share it with, and the choices and rights you have, including under the California Consumer Privacy Act (CCPA).`}
    >
      <section>
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account and contact details:</strong> name, email address, phone number, company name and password (stored only as a one-way hash).</li>
          <li><strong>Business details:</strong> EIN, business address, business type and resale certificate details you provide when applying for a trade account.</li>
          <li><strong>Orders:</strong> products ordered, delivery addresses, purchase order numbers and order history.</li>
          <li><strong>Payment:</strong> card payments are processed by Stripe. Card numbers are entered in Stripe&apos;s secure fields and never reach or are stored on our servers.</li>
          <li><strong>Technical data:</strong> IP address and request information used for security, fraud prevention and rate limiting.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          To review trade applications, process and deliver orders, calculate sales tax, send order and account emails,
          keep the site secure, and meet legal and tax record-keeping obligations.
        </p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>We share personal information only with service providers that help us run the store, under contract:</p>
        <ul>
          <li>Payment processing (Stripe)</li>
          <li>Email delivery (our transactional email provider)</li>
          <li>Shipping carriers and freight services, to deliver your order</li>
          <li>Website hosting and database providers</li>
        </ul>
        <p>
          We do not sell personal information and do not share it for cross-context behavioral advertising. We may
          disclose information when required by law.
        </p>
      </section>
      <section>
        <h2>Cookies and storage</h2>
        <p>
          We use a strictly necessary cookie to keep you signed in, and your browser&apos;s local storage to remember
          your cart. We do not use advertising cookies.
        </p>
      </section>
      <section>
        <h2>Retention and security</h2>
        <p>
          We keep order and tax records for as long as tax law requires, and account information while your account is
          open. Access is limited to staff who need it, passwords are hashed, and sign-in and session tokens are stored
          only as one-way digests.
        </p>
      </section>
      <section>
        <h2>Your rights (including California residents)</h2>
        <p>
          You may ask to know what personal information we hold about you, to receive a copy, to correct it, or to
          delete it (subject to records we must keep by law). We will not discriminate against you for exercising
          these rights. Email{" "}
          <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> from the address on your account; we
          will verify your request before acting on it and respond within 45 days.
        </p>
      </section>
      <section>
        <h2>Children</h2>
        <p>This site is for businesses and is not directed to children under 16.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We will post any changes on this page and update the date above.</p>
      </section>
    </LegalPage>
  );
}
