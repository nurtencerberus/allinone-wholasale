import { LegalPage } from "@/components/LegalPage";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";

export const metadata = {
  title: "Shipping Policy",
  description: "Where and how we ship wholesale orders from Paterson, NJ.",
  alternates: { canonical: "/legal/shipping" },
};

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Shipping Policy"
      intro={`Orders ship from our warehouse in ${SITE.city}, ${SITE.state}. Freight is calculated at checkout from your address and the weight and size of your cartons.`}
    >
      <section>
        <h2>Where we deliver</h2>
        <ul>
          <li>The contiguous 48 states and Washington, DC.</li>
          <li>We do not deliver to Alaska, Hawaii, US territories, APO/FPO/DPO addresses or PO Boxes.</li>
          <li>The ZIP code must match the state of the delivery address.</li>
        </ul>
      </section>
      <section>
        <h2>How orders ship</h2>
        <ul>
          <li>Smaller orders ship as parcels (for example UPS Ground). Heavy or oversized orders ship as LTL freight on pallets.</li>
          <li>LTL deliveries are curbside. If you need a liftgate, an appointment or inside delivery, contact us before ordering.</li>
          <li>Most in-stock orders leave the warehouse within 1–2 business days. Transit times shown at checkout are estimates, not guarantees.</li>
        </ul>
      </section>
      <section>
        <h2>Freight cost</h2>
        <p>
          Freight is priced at checkout from the billable weight of your cartons (the greater of actual and
          dimensional weight). Free ground parcel freight may apply to qualifying orders over{" "}
          {formatMoney(SITE.freeFreightThreshold)}; when it applies, it is shown at checkout before you pay.
        </p>
      </section>
      <section>
        <h2>Damage and shortages</h2>
        <p>
          Inspect deliveries on arrival. Note any visible damage on the carrier&apos;s delivery receipt and email us
          photos within 14 days of delivery, as described in our Returns Policy.
        </p>
      </section>
    </LegalPage>
  );
}
