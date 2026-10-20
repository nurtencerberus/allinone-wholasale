/**
 * Canonical production URL. Set NEXT_PUBLIC_SITE_URL in the deployment
 * environment (for example https://ciputracorp.com) — it is inlined at build
 * time and feeds sitemap.xml, robots.txt, JSON-LD and Open Graph metadata.
 */
function resolveCanonicalUrl(): string {
  // Empty strings count as "not set" — hosting dashboards often create blank slots.
  const candidate = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || "https://ciputracorp.com";
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return "https://ciputracorp.com";
  }
}

const CANONICAL_URL = resolveCanonicalUrl();

/**
 * Origin for links in outgoing e-mail (verify, reset, order). Never derived from the
 * request's Host header, which a client controls. Vercel preview deployments use their
 * own platform-provided URL so links stay on the preview being tested.
 */
export function appOrigin(): string {
  const previewHost = process.env.VERCEL_ENV === "preview" ? process.env.VERCEL_URL?.trim() : "";
  if (previewHost) return `https://${previewHost}`;
  if (process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    return `http://localhost:${process.env.PORT ?? 3000}`;
  }
  return CANONICAL_URL;
}

export const SITE = {
  name: "Ciputra Corp",
  shortName: "Ciputra",
  domain: CANONICAL_URL,
  tagline: "Wholesale provisions for modern American retail.",
  description:
    "B2B wholesale supplier of vitamins and supplements, pantry staples and home goods. Case pricing, dimensional freight quotes, resale tax exemption and trade terms for verified retailers.",
  email: "info@ciputracorp.com",
  phone: "+1 516-567-6662",
  phoneHref: "+15165676662",
  street: "238 Lindbergh Pl",
  city: "Paterson",
  state: "NJ",
  zip: "07503",
  address: "238 Lindbergh Pl, Paterson, NJ 07503",
  // Freight and tax are calculated from this origin.
  originZip: "07503",
  originState: "NJ",
  freeFreightThreshold: 75000,
  /** The freight allowance covers ground parcel to zones 1–6 only (src/lib/shipping.ts). */
  freeFreightMaxZone: 6,
  minOrderValue: 15000,
};

export type CategoryKey = "supplements" | "pantry" | "home";

export const CATEGORIES: {
  key: CategoryKey;
  name: string;
  shortName: string;
  eyebrow: string;
  blurb: string;
  image: string;
  specs: string;
}[] = [
  {
    key: "supplements",
    name: "Vitamins & Supplements",
    shortName: "Supplements",
    eyebrow: "Wellness",
    blurb:
      "Vitamins, capsules, softgels and gummies, case-packed for independent retail.",
    image: "/images/cat-supplements.jpg",
    specs: "Case-packed for retail",
  },
  {
    key: "pantry",
    name: "Pantry & Staples",
    shortName: "Pantry",
    eyebrow: "Provisions",
    blurb:
      "Shelf-stable, retail-ready provisions. Consolidate dry goods into one inbound freight lane.",
    image: "/images/cat-pantry.jpg",
    specs: "Shelf-stable, case-packed",
  },
  {
    key: "home",
    name: "Home & Living",
    shortName: "Home",
    eyebrow: "Home",
    blurb:
      "Ceramics, candles, textiles and décor, case-packed for protection. LTL freight on pallet builds.",
    image: "/images/cat-home.jpg",
    specs: "LTL freight on pallet builds",
  },
];

export const categoryName = (key: string) =>
  CATEGORIES.find((category) => category.key === key)?.name ?? key;

export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

export const stateName = (code: string) =>
  US_STATES.find((state) => state.code === code)?.name ?? code;

export const ORDER_STATUSES = [
  "processing",
  "picking",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Serialises structured data for a `<script type="application/ld+json">` tag. `<` is escaped
 * so text such as a product description containing `</script>` cannot close the tag.
 */
export function jsonLdHtml(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
