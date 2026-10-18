/**
 * Canonical production URL. Set NEXT_PUBLIC_SITE_URL in the deployment
 * environment (for example https://meridiansupply.co) — it is inlined at build
 * time and feeds sitemap.xml, robots.txt, JSON-LD and Open Graph metadata.
 */
function resolveCanonicalUrl(): string {
  // Empty strings count as "not set" — hosting dashboards often create blank slots.
  const candidate = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim() || "https://meridiansupply.co";
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return "https://meridiansupply.co";
  }
}

const CANONICAL_URL = resolveCanonicalUrl();

export const SITE = {
  name: "Meridian Supply Co.",
  shortName: "Meridian",
  domain: CANONICAL_URL,
  tagline: "Wholesale provisions for modern American retail.",
  description:
    "B2B wholesale supplier of NSF-certified vitamins and supplements, pantry staples, and considered home goods. Case pricing, dimensional freight quotes, resale tax exemption and net terms for verified retailers.",
  email: "trade@meridiansupply.co",
  phone: "+1 (201) 555-0142",
  address: "1401 Raymond Boulevard, Newark, NJ 07102",
  originZip: "07102",
  originState: "NJ",
  freeFreightThreshold: 75000,
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
      "NSF-certified capsules, softgels and gummies from cGMP facilities. Full CoA packets with every pallet.",
    image: "/images/cat-supplements.jpg",
    specs: "4 stock-keeping units · cGMP · NSF certified",
  },
  {
    key: "pantry",
    name: "Pantry & Staples",
    shortName: "Pantry",
    eyebrow: "Provisions",
    blurb:
      "Shelf-stable, retail-ready provisions with 12+ month dates. Consolidate dry goods into one inbound freight lane.",
    image: "/images/cat-pantry.jpg",
    specs: "4 stock-keeping units · 12+ month shelf life",
  },
  {
    key: "home",
    name: "Home & Living",
    shortName: "Home",
    eyebrow: "Home",
    blurb:
      "Small-batch ceramics, candles and textiles with case-packed protection. LTL freight eligible on pallet builds.",
    image: "/images/cat-home.jpg",
    specs: "4 stock-keeping units · LTL freight ready",
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
