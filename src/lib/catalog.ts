import type { Dimensions, PriceTier } from "@/db/schema";
import type { CategoryKey } from "@/lib/site";

export type SeedProduct = {
  slug: string;
  sku: string;
  name: string;
  category: CategoryKey;
  tagline: string;
  description: string;
  story: string;
  brand: string;
  origin: string;
  msrpUnit: number;
  casePrice: number;
  caseSize: number;
  minCases: number;
  priceTiers: PriceTier[];
  weightLbs: number;
  dimensions: Dimensions;
  stock: number;
  ratingX10: number;
  reviewCount: number;
  image: string;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  badges: string[];
  featured: boolean;
};

const tiers = (base: number): PriceTier[] => [
  { minCases: 2, casePrice: Math.round(base * 0.95) },
  { minCases: 5, casePrice: Math.round(base * 0.9) },
  { minCases: 10, casePrice: Math.round(base * 0.84) },
];

export const PRODUCTS: SeedProduct[] = [
  {
    slug: "daily-foundations-multivitamin",
    sku: "MSC-VIT-090",
    name: "Daily Foundations Multivitamin",
    category: "supplements",
    tagline: "90 capsules · 23 essential nutrients · case of 12 bottles",
    description:
      "A single-SKU daily multivitamin built for the shelf: clean label, third-party tested, and priced for a healthy 55% retail margin. Methylated B12 and chelated minerals for absorption, with no titanium dioxide or artificial dyes.\n\nEvery case ships with a lot-matched Certificate of Analysis and a printable shelf-talker. NSF Certified for Sport and produced in an FDA-registered, cGMP facility in Pennsylvania.",
    story:
      "Meridian Labs was founded in 2016 by two compounding pharmacists who were tired of watching independent retailers overpay for private-label vitamins. Daily Foundations is still our volume leader — over 1.4 million bottles shipped to independent pharmacies, gyms and grocery accounts.",
    brand: "Meridian Labs",
    origin: "Pittsburgh, PA",
    msrpUnit: 2499,
    casePrice: 11880,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(11880),
    weightLbs: 14,
    dimensions: { l: 16, w: 12, h: 9 },
    stock: 186,
    ratingX10: 48,
    reviewCount: 186,
    image: "/images/prod-multivitamin.jpg",
    images: ["/images/prod-multivitamin.jpg", "/images/cat-supplements.jpg", "/images/hero-warehouse.jpg"],
    features: [
      "23 nutrients including methylated B12 and 400 mcg folate",
      "NSF Certified for Sport · cGMP facility",
      "Lot-matched CoA in every case",
      "Retail-ready bottle with security seal and shelf-talker",
    ],
    specs: [
      { label: "Units per case", value: "12 bottles · 90 capsules each" },
      { label: "Suggested retail", value: "$24.99 / bottle" },
      { label: "Shelf life", value: "24 months from manufacture" },
      { label: "Certifications", value: "NSF Certified for Sport, Non-GMO" },
      { label: "Case weight / dims", value: "14 lb · 16 × 12 × 9 in" },
    ],
    badges: ["Best seller", "NSF certified"],
    featured: true,
  },
  {
    slug: "omega-3-ultra-1200",
    sku: "MSC-OM3-120",
    name: "Omega-3 Ultra 1200mg",
    category: "supplements",
    tagline: "120 softgels · IFOS 5-star fish oil · case of 12 bottles",
    description:
      "Molecularly distilled wild-caught anchovy and sardine oil delivering 720 mg EPA and 480 mg DHA per serving. IFOS 5-star rated for purity and heavy-metal testing, with a natural lemon coating that keeps the fishiness off the shelf.\n\nShips in a nitrogen-flushed HDPE bottle with induction seal. Batch documentation and IFOS certificates are available on request for retail compliance files.",
    story:
      "Sourced from a Peruvian anchovy fishery audited yearly against IFFO standards, then soft-gel encapsulated in New Jersey within 30 days of catch. The result is a lower oxidation value than most premium grocery brands — and a price your buyers can actually margin.",
    brand: "Meridian Labs",
    origin: "Newark, NJ",
    msrpUnit: 3999,
    casePrice: 20160,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(20160),
    weightLbs: 16,
    dimensions: { l: 15, w: 11, h: 8 },
    stock: 92,
    ratingX10: 47,
    reviewCount: 132,
    image: "/images/prod-omega.jpg",
    images: ["/images/prod-omega.jpg", "/images/cat-supplements.jpg"],
    features: [
      "1,200 mg total omega-3 per serving",
      "IFOS 5-star purity rating",
      "Nitrogen-flushed induction seal",
      "Traceable to a single fishery",
    ],
    specs: [
      { label: "Units per case", value: "12 bottles · 120 softgels each" },
      { label: "Suggested retail", value: "$39.99 / bottle" },
      { label: "Shelf life", value: "24 months" },
      { label: "Certifications", value: "IFOS 5-star, Friend of the Sea" },
      { label: "Case weight / dims", value: "16 lb · 15 × 11 × 8 in" },
    ],
    badges: ["IFOS 5-star"],
    featured: true,
  },
  {
    slug: "elderberry-immune-gummies",
    sku: "MSC-ELD-060",
    name: "Elderberry Immune Gummies",
    category: "supplements",
    tagline: "60 gummies · pectin-based, vegan · case of 24",
    description:
      "Black elderberry, zinc and vitamin C in a pectin gummy that ships well and sells fast at the register. Vegan, gelatin-free, and naturally coloured with carrot and blackcurrant — a real differentiator against the neon gummy wall.\n\nHigh case count keeps the per-unit freight low, which makes this our most requested impulse item for checkout racks and gift baskets.",
    story:
      "We built this SKU with an organic elderberry co-operative in Oregon, using a low-temperature extraction that keeps the anthocyanin content high. It is the fastest-turning supplement we carry among grocery and gift accounts.",
    brand: "Meridian Botanicals",
    origin: "Eugene, OR",
    msrpUnit: 1899,
    casePrice: 19176,
    caseSize: 24,
    minCases: 1,
    priceTiers: tiers(19176),
    weightLbs: 18,
    dimensions: { l: 18, w: 12, h: 10 },
    stock: 7,
    ratingX10: 45,
    reviewCount: 98,
    image: "https://images.pexels.com/photos/14029290/pexels-photo-14029290.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    images: [
      "https://images.pexels.com/photos/14029290/pexels-photo-14029290.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "/images/cat-supplements.jpg",
    ],
    features: [
      "Pectin-based, vegan and gelatin-free",
      "1,000 mg elderberry extract per serving",
      "High case count for low landed freight",
      "Counter display shipper available on request",
    ],
    specs: [
      { label: "Units per case", value: "24 bottles · 60 gummies each" },
      { label: "Suggested retail", value: "$18.99 / bottle" },
      { label: "Shelf life", value: "18 months" },
      { label: "Certifications", value: "Vegan, Non-GMO Project" },
      { label: "Case weight / dims", value: "18 lb · 18 × 12 × 10 in" },
    ],
    badges: ["Low stock", "Impulse buy"],
    featured: false,
  },
  {
    slug: "magnesium-glycinate-400",
    sku: "MSC-MAG-120",
    name: "Magnesium Glycinate 400",
    category: "supplements",
    tagline: "120 capsules · fully chelated · case of 12",
    description:
      "Fully chelated magnesium bisglycinate with no magnesium oxide filler. Gentle on digestion, popular for sleep and recovery, and one of the highest-margin supplements on a modern wellness shelf.\n\nCapsules are vegetarian and the bottle uses a wide-mouth 45 mm closure that takes standard security caps.",
    story:
      "Our most repurchased SKU by pharmacy and recovery-studio accounts. We hold three months of buffer stock on the raw material so our case price does not swing with the mineral market.",
    brand: "Meridian Labs",
    origin: "Pittsburgh, PA",
    msrpUnit: 2299,
    casePrice: 12960,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(12960),
    weightLbs: 13,
    dimensions: { l: 15, w: 11, h: 8 },
    stock: 140,
    ratingX10: 49,
    reviewCount: 211,
    image: "/images/cat-supplements.jpg",
    images: ["/images/cat-supplements.jpg", "/images/prod-multivitamin.jpg"],
    features: [
      "400 mg elemental magnesium per serving",
      "Zero oxide or citrate fillers",
      "Vegetarian capsule, no excipients",
      "Three-month raw material buffer",
    ],
    specs: [
      { label: "Units per case", value: "12 bottles · 120 capsules each" },
      { label: "Suggested retail", value: "$22.99 / bottle" },
      { label: "Shelf life", value: "24 months" },
      { label: "Certifications", value: "cGMP, Non-GMO" },
      { label: "Case weight / dims", value: "13 lb · 15 × 11 × 8 in" },
    ],
    badges: ["Top rated"],
    featured: true,
  },
  {
    slug: "estate-extra-virgin-olive-oil",
    sku: "MSC-PAN-OO1L",
    name: "Estate Extra Virgin Olive Oil",
    category: "pantry",
    tagline: "1 L dark glass · early harvest · case of 6",
    description:
      "Single-estate Picual olive oil pressed within six hours of harvest, with a peppery finish and a polyphenol count printed on every lot. Dark glass protects the oil from light damage during retail display.\n\nCase of six with moulded pulp dividers. This is the anchor SKU for pantry resets and gift assortments, and pairs naturally with our honey and pasta for consolidated freight.",
    story:
      "We buy directly from a 220-hectare estate near Jaén, Spain, on a fixed-price forward contract. That lets us publish a stable case price through the year while independent grocers still retail it at $28.99.",
    brand: "Casa Meridian",
    origin: "Jaén, Spain",
    msrpUnit: 2899,
    casePrice: 8940,
    caseSize: 6,
    minCases: 1,
    priceTiers: tiers(8940),
    weightLbs: 22,
    dimensions: { l: 14, w: 10, h: 12 },
    stock: 74,
    ratingX10: 49,
    reviewCount: 174,
    image: "/images/prod-oliveoil.jpg",
    images: ["/images/prod-oliveoil.jpg", "/images/cat-pantry.jpg"],
    features: [
      "Early-harvest Picual, cold extracted",
      "Polyphenol count printed per lot",
      "Dark glass with moulded pulp shippers",
      "Food-service 3 L format available on request",
    ],
    specs: [
      { label: "Units per case", value: "6 × 1 L bottles" },
      { label: "Suggested retail", value: "$28.99 / bottle" },
      { label: "Shelf life", value: "18 months" },
      { label: "Harvest", value: "2026 early harvest" },
      { label: "Case weight / dims", value: "22 lb · 14 × 10 × 12 in" },
    ],
    badges: ["Harvest 2026", "Best seller"],
    featured: true,
  },
  {
    slug: "raw-wildflower-honey",
    sku: "MSC-PAN-HNY16",
    name: "Raw Wildflower Honey",
    category: "pantry",
    tagline: "16 oz glass · unfiltered · case of 12",
    description:
      "Unfiltered, uncooked wildflower honey from small apiaries in the Hudson Valley. Natural crystallisation is left intact — a quality signal, not a defect, though we include shelf cards to explain it to shoppers.\n\nGlass jars with food-grade lined lids, packed 12 per case in a two-layer shipper that survives parcel handling.",
    story:
      "We aggregate from eleven family apiaries, which keeps the flavour profile consistent year to year while supporting pollinator habitat across the Northeast.",
    brand: "Meridian Pantry",
    origin: "Hudson Valley, NY",
    msrpUnit: 1799,
    casePrice: 10560,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(10560),
    weightLbs: 20,
    dimensions: { l: 15, w: 11, h: 9 },
    stock: 58,
    ratingX10: 47,
    reviewCount: 88,
    image: "/images/prod-honey.jpg",
    images: ["/images/prod-honey.jpg", "/images/cat-pantry.jpg"],
    features: [
      "Raw, unfiltered, never heated",
      "Aggregated from eleven family apiaries",
      "Two-layer retail shipper included",
      "Plastic-free packaging",
    ],
    specs: [
      { label: "Units per case", value: "12 × 16 oz jars" },
      { label: "Suggested retail", value: "$17.99 / jar" },
      { label: "Shelf life", value: "36 months" },
      { label: "Certifications", value: "True Source Honey verified" },
      { label: "Case weight / dims", value: "20 lb · 15 × 11 × 9 in" },
    ],
    badges: ["Small batch"],
    featured: false,
  },
  {
    slug: "single-origin-coffee-whole-bean",
    sku: "MSC-PAN-CFE2",
    name: "Single-Origin Coffee, Whole Bean",
    category: "pantry",
    tagline: "2 lb valve bag · Huila, Colombia · case of 6",
    description:
      "Washed Caturra and Colombia varietals from Huila, roasted to a full-city profile that works in batch brew and espresso. Degassed and packed in a one-way valve bag with a roast date stamp, 2 lb per bag for the take-home bean crowd.\n\nRoasted to order every Tuesday. Case of six with a 21-day freshness window — order freight early in the week for the freshest landed date.",
    story:
      "Direct-trade relationship since 2019 with a 34-member co-operative. Pricing is transparent: we publish the FOB price we pay, and our case price moves only when the harvest does.",
    brand: "Meridian Roasting",
    origin: "Huila, Colombia",
    msrpUnit: 3199,
    casePrice: 11100,
    caseSize: 6,
    minCases: 1,
    priceTiers: tiers(11100),
    weightLbs: 15,
    dimensions: { l: 14, w: 10, h: 8 },
    stock: 63,
    ratingX10: 48,
    reviewCount: 143,
    image: "https://images.pexels.com/photos/17077385/pexels-photo-17077385.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    images: [
      "https://images.pexels.com/photos/17077385/pexels-photo-17077385.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "/images/cat-pantry.jpg",
    ],
    features: [
      "Direct-trade Huila co-operative",
      "Roasted to order every Tuesday",
      "One-way valve bag with roast date",
      "Whole bean, full-city profile",
    ],
    specs: [
      { label: "Units per case", value: "6 × 2 lb bags" },
      { label: "Suggested retail", value: "$31.99 / bag" },
      { label: "Freshness window", value: "21 days from roast" },
      { label: "Roast", value: "Full city · whole bean" },
      { label: "Case weight / dims", value: "15 lb · 14 × 10 × 8 in" },
    ],
    badges: ["Roasted to order"],
    featured: true,
  },
  {
    slug: "bronze-die-artisan-pasta",
    sku: "MSC-PAN-PST5",
    name: "Bronze-Die Artisan Pasta",
    category: "pantry",
    tagline: "500 g bag · slow dried · case of 12",
    description:
      "Durum semolina pasta extruded through bronze dies and slow dried for a rough, sauce-gripping surface. Retail-ready kraft window bag with a clear cooking-time panel.\n\nThe highest turn on our pantry line: low case price, small footprint, and a natural add-on to olive oil and honey orders.",
    story:
      "Made in a fourth-generation pastificio outside Gragnano using the same slow-dry method the family has used since 1958. We import in full containers to keep landed case costs flat.",
    brand: "Meridian Pantry",
    origin: "Gragnano, Italy",
    msrpUnit: 999,
    casePrice: 5940,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(5940),
    weightLbs: 18,
    dimensions: { l: 16, w: 12, h: 8 },
    stock: 121,
    ratingX10: 46,
    reviewCount: 72,
    image: "https://images.pexels.com/photos/38802734/pexels-photo-38802734.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    images: [
      "https://images.pexels.com/photos/38802734/pexels-photo-38802734.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "/images/cat-pantry.jpg",
    ],
    features: [
      "Bronze-die extruded for sauce adhesion",
      "Slow dried at low temperature",
      "Kraft window retail bag",
      "Flat landed cost via full-container imports",
    ],
    specs: [
      { label: "Units per case", value: "12 × 500 g bags" },
      { label: "Suggested retail", value: "$9.99 / bag" },
      { label: "Shelf life", value: "24 months" },
      { label: "Certifications", value: "IGP Gragnano" },
      { label: "Case weight / dims", value: "18 lb · 16 × 12 × 8 in" },
    ],
    badges: ["High turn"],
    featured: false,
  },
  {
    slug: "hand-thrown-stoneware-vase",
    sku: "MSC-HOM-VAS1",
    name: "Hand-Thrown Stoneware Vase",
    category: "home",
    tagline: "Sand glaze · 9 in · case of 4",
    description:
      "Wheel-thrown stoneware in a speckled sand glaze, 9 inches tall with a narrow neck for single-stem styling. Each piece is slightly different — we photograph categories, not exact pieces, and ship the group shot to your web team on request.\n\nCase of four with moulded pulp corner protection. Breakage in transit is covered at 100% on this SKU with photo documentation.",
    story:
      "Thrown by a six-potter studio in western North Carolina. Capacity is limited to roughly 400 cases a month, and we hold allocation for accounts that reorder quarterly.",
    brand: "Meridian Home",
    origin: "Asheville, NC",
    msrpUnit: 6800,
    casePrice: 11600,
    caseSize: 4,
    minCases: 1,
    priceTiers: [
      { minCases: 2, casePrice: 11020 },
      { minCases: 5, casePrice: 10440 },
      { minCases: 10, casePrice: 9860 },
    ],
    weightLbs: 14,
    dimensions: { l: 18, w: 14, h: 14 },
    stock: 39,
    ratingX10: 48,
    reviewCount: 64,
    image: "/images/prod-vase.jpg",
    images: ["/images/prod-vase.jpg", "/images/cat-home.jpg"],
    features: [
      "Wheel-thrown, speckled sand glaze",
      "9 in tall · watertight interior",
      "Moulded pulp corner protection",
      "100% transit breakage cover with photos",
    ],
    specs: [
      { label: "Units per case", value: "4 vases" },
      { label: "Suggested retail", value: "$68.00 / vase" },
      { label: "Dimensions", value: "9 in H × 5 in W" },
      { label: "Material", value: "High-fire stoneware, food-safe glaze" },
      { label: "Case weight / dims", value: "14 lb · 18 × 14 × 14 in" },
    ],
    badges: ["Small batch", "Breakage covered"],
    featured: true,
  },
  {
    slug: "amber-soy-candle",
    sku: "MSC-HOM-CDL8",
    name: "Amber Soy Candle, Cedar & Fig",
    category: "home",
    tagline: "8 oz amber glass · 45 hr burn · case of 12",
    description:
      "Coconut-soy wax in an amber apothecary jar with a cotton wick and 45-hour burn time. Cedar & fig is the best-testing scent we have run — warm, not sweet, and safe for unisex gifting tables.\n\nCase of twelve with a printed tester card. Also available in a 4-SKU scent assortment on request.",
    story:
      "Poured in small batches in a Brooklyn workshop. We keep three scents on the wholesale line and rotate a seasonal fourth for Q4 gifting programs.",
    brand: "Meridian Home",
    origin: "Brooklyn, NY",
    msrpUnit: 1600,
    casePrice: 7800,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(7800),
    weightLbs: 12,
    dimensions: { l: 14, w: 10, h: 8 },
    stock: 84,
    ratingX10: 47,
    reviewCount: 121,
    image: "/images/prod-candle.jpg",
    images: ["/images/prod-candle.jpg", "/images/cat-home.jpg"],
    features: [
      "Coconut-soy wax, cotton wick",
      "45-hour burn time",
      "Amber apothecary glass with lid",
      "Printed tester card in every case",
    ],
    specs: [
      { label: "Units per case", value: "12 × 8 oz candles" },
      { label: "Suggested retail", value: "$16.00 / candle" },
      { label: "Scent", value: "Cedar & fig" },
      { label: "Burn time", value: "45 hours" },
      { label: "Case weight / dims", value: "12 lb · 14 × 10 × 8 in" },
    ],
    badges: ["Gifting"],
    featured: false,
  },
  {
    slug: "boucle-lounge-chair",
    sku: "MSC-HOM-CHR1",
    name: "Bouclé Lounge Chair",
    category: "home",
    tagline: "Solid ash frame · ivory bouclé · 1 per carton",
    description:
      "A low-slung lounge chair in ivory bouclé over a solid ash frame, shipped fully assembled in a single carton. Designed as an anchor piece for boutique hotel lobbies and furniture floors.\n\nAt 48 lb and 30 × 30 × 26 in this SKU is billed on dimensional freight weight and typically ships LTL on a pallet with other home goods. Request a freight quote at checkout — our engine prices parcel and LTL side by side.",
    story:
      "Made to our spec in a family-run upholstery shop in Hickory, North Carolina. Minimum order is one carton, but freight economics favour a 4-piece pallet build.",
    brand: "Meridian Home",
    origin: "Hickory, NC",
    msrpUnit: 64900,
    casePrice: 28900,
    caseSize: 1,
    minCases: 1,
    priceTiers: [
      { minCases: 2, casePrice: 27450 },
      { minCases: 4, casePrice: 26000 },
      { minCases: 8, casePrice: 24900 },
    ],
    weightLbs: 48,
    dimensions: { l: 30, w: 30, h: 26 },
    stock: 22,
    ratingX10: 46,
    reviewCount: 41,
    image: "https://images.pexels.com/photos/5793641/pexels-photo-5793641.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    images: [
      "https://images.pexels.com/photos/5793641/pexels-photo-5793641.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "/images/cat-home.jpg",
    ],
    features: [
      "Solid ash frame, webbed suspension",
      "Performance bouclé, 50k rub count",
      "Ships fully assembled in one carton",
      "LTL pallet pricing at checkout",
    ],
    specs: [
      { label: "Units per carton", value: "1 chair" },
      { label: "Suggested retail", value: "$649.00 / chair" },
      { label: "Dimensions", value: "30 in H × 30 in W × 26 in D" },
      { label: "Material", value: "Ivory bouclé, solid ash" },
      { label: "Carton weight / dims", value: "48 lb · 30 × 30 × 26 in" },
    ],
    badges: ["LTL freight"],
    featured: false,
  },
  {
    slug: "dried-botanical-stems",
    sku: "MSC-HOM-STM12",
    name: "Dried Botanical Stems",
    category: "home",
    tagline: "Natural bunch · 18 in · case of 12",
    description:
      "A natural dried bunch that turns a single vase into a $95 vignette. Colour-fast, no shedding, and light enough to ride free on most parcel orders.\n\nOne bunch per sleeve, 12 sleeves per case. Pairs as a margin multiplier with the stoneware vase SKU.",
    story:
      "Air-dried and hand-bundled in California from a flower farm that pivoted to dried goods during the import crunch of 2021. It has been a staple ever since.",
    brand: "Meridian Home",
    origin: "Carpinteria, CA",
    msrpUnit: 1400,
    casePrice: 6600,
    caseSize: 12,
    minCases: 1,
    priceTiers: tiers(6600),
    weightLbs: 6,
    dimensions: { l: 24, w: 8, h: 8 },
    stock: 46,
    ratingX10: 44,
    reviewCount: 37,
    image: "https://images.pexels.com/photos/38908537/pexels-photo-38908537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
    images: [
      "https://images.pexels.com/photos/38908537/pexels-photo-38908537.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
      "/images/cat-home.jpg",
    ],
    features: [
      "Air-dried, colour-fast, non-shedding",
      "18 in bunch, sleeved individually",
      "Attaches naturally to vase SKU",
      "Lightweight freight profile",
    ],
    specs: [
      { label: "Units per case", value: "12 sleeved bunches" },
      { label: "Suggested retail", value: "$14.00 / bunch" },
      { label: "Length", value: "18 in" },
      { label: "Material", value: "Natural dried botanicals" },
      { label: "Case weight / dims", value: "6 lb · 24 × 8 × 8 in" },
    ],
    badges: ["Add-on"],
    featured: false,
  },
];

export const REVIEW_SEED: {
  slug: string;
  author: string;
  company: string;
  rating: number;
  title: string;
  body: string;
}[] = [
  {
    slug: "daily-foundations-multivitamin",
    author: "Dana Whitfield",
    company: "Harbor House Pharmacy · Portland, ME",
    rating: 5,
    title: "The only multivitamin we reorder monthly",
    body:
      "Clean label and the CoA is in the box every time, which saves my staff a week of chasing paperwork. We run two facings and it turns in under three weeks. Case price leaves us a real margin against the national brands.",
  },
  {
    slug: "daily-foundations-multivitamin",
    author: "Marcus Reyes",
    company: "Reyes Nutrition · Austin, TX",
    rating: 5,
    title: "Freight landed exactly as quoted",
    body:
      "Dimensional weight was accurate, so the label came in at the number checkout promised. Small thing, but no other supplier gets that right for us.",
  },
  {
    slug: "omega-3-ultra-1200",
    author: "Priya Raman",
    company: "The Wellness Counter · Brooklyn, NY",
    rating: 5,
    title: "IFOS docs closed the sale for our buyers",
    body:
      "Our grocery buyer asked for purity documentation and Meridian emailed the full IFOS packet the same afternoon. No rancidity complaints in six months of reorders.",
  },
  {
    slug: "omega-3-ultra-1200",
    author: "Tom Baker",
    company: "Baker's Health Mart · Columbus, OH",
    rating: 4,
    title: "Great product, wish the 240ct existed",
    body:
      "Sells through well at $39.99. I would carry a larger count if it were available, but the 120ct is a reliable weekly reorder.",
  },
  {
    slug: "elderberry-immune-gummies",
    author: "Sloane Keeler",
    company: "Keeler Gift & Pantry · Savannah, GA",
    rating: 5,
    title: "Impulse register gold",
    body:
      "Moved 18 cases in the first month by the register. The pectin texture is better than the gelatin brands and parents actually read the label.",
  },
  {
    slug: "magnesium-glycinate-400",
    author: "Dr. Ellen Cho",
    company: "Cho Integrative · Seattle, WA",
    rating: 5,
    title: "No filler magnesium, finally",
    body:
      "Fully chelated and no oxide, which is exactly what I want to recommend to patients. The wide-mouth bottle works with our tamper caps.",
  },
  {
    slug: "magnesium-glycinate-400",
    author: "Nate Ellis",
    company: "Ellis Recovery Studio · Denver, CO",
    rating: 5,
    title: "Best margin on our shelf",
    body:
      "We buy ten cases at a time and the volume tier kicks in automatically. Members ask for it by name now.",
  },
  {
    slug: "estate-extra-virgin-olive-oil",
    author: "Giulia Moretti",
    company: "Moretti Market · Providence, RI",
    rating: 5,
    title: "Peppery, fresh, and the lot codes check out",
    body:
      "We taste every lot before it hits the shelf and this has been consistent for four harvests. The dark glass matters more than people realise.",
  },
  {
    slug: "estate-extra-virgin-olive-oil",
    author: "Ben Okafor",
    company: "Okafor Grocery · Houston, TX",
    rating: 5,
    title: "Consolidated freight saved us $180",
    body:
      "Ordered oil, honey and pasta together and the engine still priced it as one parcel. That is the whole reason we moved our pantry program here.",
  },
  {
    slug: "raw-wildflower-honey",
    author: "Hannah Lloyd",
    company: "Lloyd General Store · Burlington, VT",
    rating: 5,
    title: "Crystallisation shelf cards were a smart touch",
    body:
      "Customers were returning honey before I put the cards out. Now they see it as a quality signal. Excellent packaging too.",
  },
  {
    slug: "single-origin-coffee-whole-bean",
    author: "Rafael Duarte",
    company: "Duarte Coffee Bar · Miami, FL",
    rating: 5,
    title: "Roast dates are always inside a week",
    body:
      "We dial it in as espresso and it behaves beautifully. Freight from Newark to Miami lands next day on the 2nd-day option.",
  },
  {
    slug: "bronze-die-artisan-pasta",
    author: "Maggie Chen",
    company: "Chen Provisions · San Francisco, CA",
    rating: 5,
    title: "Rough surface actually holds sauce",
    body:
      "Bronze die makes a visible difference at this price point. It has become our default pasta, and the case cost lets us promote it.",
  },
  {
    slug: "hand-thrown-stoneware-vase",
    author: "Olivia Strand",
    company: "Strand Interiors · Minneapolis, MN",
    rating: 5,
    title: "Sold four in a weekend",
    body:
      "Photographed one against a linen backdrop and it moved immediately. Breakage cover is real — one arrived chipped and was credited same day.",
  },
  {
    slug: "hand-thrown-stoneware-vase",
    author: "James Ferrer",
    company: "Ferrer Home · Scottsdale, AZ",
    rating: 4,
    title: "Slight variation between pieces",
    body:
      "Exactly as described for hand-thrown work, but set customer expectations if you sell online. Sand glaze is beautiful in person.",
  },
  {
    slug: "amber-soy-candle",
    author: "Lucy Hart",
    company: "Hart & Vine · Nashville, TN",
    rating: 5,
    title: "Cedar & fig is a year-round seller",
    body:
      "Not too sweet, so it works for men's gifting tables too. The tester card means fewer popped lids on the display.",
  },
  {
    slug: "boucle-lounge-chair",
    author: "Devon Pike",
    company: "Pike Modern · Chicago, IL",
    rating: 5,
    title: "LTL quote was $60 cheaper than my broker",
    body:
      "Ordered four chairs on one pallet. The checkout LTL rate beat the quote I had in hand, and the tracking link updated on its own.",
  },
  {
    slug: "dried-botanical-stems",
    author: "Sara Whitmore",
    company: "Whitmore Florals · Boise, ID",
    rating: 4,
    title: "No shedding, good colour",
    body:
      "Held up much better than the imported bunch we used before. Pairs well with the stoneware vase for a $95 vignette.",
  },
];

export const COUPON_SEED = [
  {
    code: "MERIDIAN10",
    kind: "percent",
    value: 10,
    minSubtotal: 0,
    description: "10% off product subtotal — first-order trade discount",
    active: true,
  },
  {
    code: "WELCOME25",
    kind: "fixed",
    value: 2500,
    minSubtotal: 25000,
    description: "$25 off orders over $250",
    active: true,
  },
  {
    code: "FREIGHT150",
    kind: "shipping",
    value: 15000,
    minSubtotal: 15000,
    description: "Free freight on orders over $150 (max value $600)",
    active: true,
  },
] as const;
