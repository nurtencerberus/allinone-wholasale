import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Returns Policy",
  description: "Return wholesale orders within 14 days of delivery, including opened supplements and food.",
  alternates: { canonical: "/legal/returns" },
};

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Returns Policy"
      intro="You can return products within 14 days of delivery — including opened supplements and food."
    >
      <section>
        <h2>What you can return</h2>
        <ul>
          <li>Any product delivered within the last 14 days, opened or unopened, including supplements and food.</li>
          <li>Products that arrived damaged, defective, past or near their expiration date, or different from what you ordered.</li>
        </ul>
      </section>
      <section>
        <h2>How to return</h2>
        <ul>
          <li>
            Open the order in your account and choose <strong>Request a return</strong> within 14 days of delivery, or
            email <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> with your order number, the
            products and quantities, and the reason. For damage, email photos of the cartons and products.
          </li>
          <li>We reply within one business day with a return authorization (RMA) number. Write it on every carton and do not send items back without one.</li>
          <li>For food and supplements, include the lot number printed on the package if you can.</li>
        </ul>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>
          Once the cartons arrive and are checked, we refund the products to the original payment method (card refunds
          take 5–10 business days to appear), credit an open Net-30 invoice, or send a bank transfer for ACH payments.
          Sales tax charged on returned products is refunded with them. Original freight is refunded when the return is
          our error (damaged, defective, short-dated or wrong item).
        </p>
      </section>
      <section>
        <h2>Returned food and supplements</h2>
        <p>
          For safety, opened or returned food and supplements are never resold. They are quarantined and disposed of.
        </p>
      </section>
    </LegalPage>
  );
}
