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
            Email <a className="underline" href={`mailto:${SITE.email}`}>{SITE.email}</a> within 14 days of delivery with
            your order number, the products and quantities, and the reason. For damage, include photos of the cartons and
            products.
          </li>
          <li>We reply with a return authorization (RMA) and instructions. Please do not send items back without one.</li>
          <li>For food and supplements, include the lot number printed on the package if you can.</li>
        </ul>
      </section>
      <section>
        <h2>Refunds</h2>
        <p>
          Once the return is approved, we refund the products to the original payment method, or credit your Net-30
          account. Sales tax charged on returned products is refunded with them.
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
