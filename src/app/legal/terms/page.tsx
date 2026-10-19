import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Terms of Sale",
  description: `Terms that apply to wholesale orders placed with ${SITE.name}.`,
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Sale"
      intro={`These terms apply to every order placed with ${SITE.name} ("we", "us"). We sell at wholesale to businesses that resell our products; by placing an order you confirm you are buying for your business and accept these terms.`}
    >
      <section>
        <h2>1. Trade accounts</h2>
        <p>
          Wholesale prices and ordering are available only to approved trade accounts. We may ask for your EIN,
          business details and resale documentation, and we may decline or close an account at our discretion.
          Wholesale prices shown to your account are confidential and may not be published or shared.
        </p>
      </section>
      <section>
        <h2>2. Orders and minimums</h2>
        <ul>
          <li>The minimum order is {formatMoney(SITE.minOrderValue)} in products after discounts.</li>
          <li>Products are sold by the case. Some products have a minimum number of cases, shown on the product page.</li>
          <li>An order is accepted when we send the order confirmation. Prices, freight and tax are recalculated when you place the order; if anything changes while you are paying, the order is not placed and you are not charged.</li>
        </ul>
      </section>
      <section>
        <h2>3. Payment</h2>
        <ul>
          <li><strong>Card:</strong> your card is authorised when you pay and charged only once your order is recorded and stock is reserved.</li>
          <li><strong>ACH / wire transfer:</strong> payment is due within 7 days of the order. Unpaid orders are cancelled automatically after 7 days and the stock is released.</li>
          <li><strong>Net-30:</strong> available to approved accounts against a purchase order number; invoices are due 30 days from the order date. We may suspend terms on overdue accounts.</li>
        </ul>
      </section>
      <section>
        <h2>4. Sales tax</h2>
        <p>
          We are registered to collect sales tax in New Jersey only. On New Jersey deliveries we charge New Jersey
          sales tax on taxable products and the related share of freight, unless a valid New Jersey resale certificate
          is on file for your account. We do not collect sales tax on deliveries to other states; you are responsible
          for any use tax that applies to your purchases.
        </p>
      </section>
      <section>
        <h2>5. Shipping and delivery</h2>
        <p>
          We deliver to the contiguous 48 states and Washington, DC. Delivery terms are described in our{" "}
          <Link href="/legal/shipping" className="underline">Shipping Policy</Link>. Please inspect deliveries on
          arrival and note any visible damage on the carrier&apos;s delivery receipt.
        </p>
      </section>
      <section>
        <h2>6. Returns</h2>
        <p>
          Returns are accepted within 14 days of delivery, including opened supplements and food, as described in our{" "}
          <Link href="/legal/returns" className="underline">Returns Policy</Link>.
        </p>
      </section>
      <section>
        <h2>7. Product information</h2>
        <p>
          We take care that product information is accurate, but packaging and formulations are set by the
          manufacturer and may change. Always rely on the product label. Dietary supplement statements have not been
          evaluated by the Food and Drug Administration; supplements are not intended to diagnose, treat, cure or
          prevent any disease.
        </p>
      </section>
      <section>
        <h2>8. Limitation of liability</h2>
        <p>
          To the extent permitted by law, our liability for any order is limited to the amount you paid for that order,
          and we are not liable for lost profits or indirect or consequential damages.
        </p>
      </section>
      <section>
        <h2>9. Governing law</h2>
        <p>These terms are governed by the laws of the State of New Jersey.</p>
      </section>
    </LegalPage>
  );
}
