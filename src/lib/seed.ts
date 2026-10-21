import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays, isoDate, receiveLot } from "@/lib/inventory";
import {
  addresses,
  coupons,
  orderItems,
  orders,
  products,
  reviews,
  users,
  wholesaleApplications,
  wholesaleLists,
} from "@/db/schema";
import { COUPON_SEED, PRODUCTS, REVIEW_SEED } from "@/lib/catalog";
import { buildOrderSheetCsv, buildOrderSheetXlsx, type OrderSheetProduct } from "@/lib/order-sheet";
import { parseListFile } from "@/lib/wholesale-lists";
import { demoModeEnabled } from "@/lib/demo-mode";
import { hashPassword } from "@/lib/password";
import { defaultTaxClass } from "@/lib/tax";
import { lbsToOz, ozToLbs } from "@/lib/weight";

const globalForSeed = globalThis as typeof globalThis & {
  __meridianSeedPromise?: Promise<void>;
};

/**
 * Demo logins, sample applications and sample orders are seeded by default so
 * the storefront is explorable out of the box. Set SEED_DEMO_DATA=false on a
 * live deployment and only catalog, reviews and coupons are created.
 */
export const shouldSeedDemoData = demoModeEnabled;

/**
 * Three clearly-labelled sample lists generated from our own catalog so the
 * homepage section is visible on first run. Replace them in Admin → Wholesale
 * lists with the real files received from your suppliers.
 */
async function seedSampleWholesaleLists(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(wholesaleLists);
  if (count > 0) return;

  const rows = await db.select().from(products);
  const toSheet = (list: typeof rows): OrderSheetProduct[] =>
    list.map((product) => ({
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand,
      origin: product.origin,
      caseSize: product.caseSize,
      casePrice: product.casePrice,
      priceTiers: product.priceTiers ?? [],
      msrpUnit: product.msrpUnit,
      stock: product.stock,
      weightLbs: ozToLbs(product.weightOz),
      dimensions: product.dimensions,
      leadTimeDays: product.leadTimeDays,
      slug: product.slug,
    }));

  const definitions = [
    {
      title: "Vitamins & supplements — case price list",
      supplier: "Meridian Labs",
      description:
        "Sample file. Case pricing, 2+/5+/10+ volume tiers, MSRP and stock for the supplement line. Replace it in Admin → Wholesale lists.",
      category: "supplements",
      audience: "public",
      format: "xlsx" as const,
      items: rows.filter((product) => product.category === "supplements"),
    },
    {
      title: "Pantry & home goods — case price list",
      supplier: "Meridian Pantry & Home",
      description:
        "Sample file in CSV format covering pantry staples and home décor. Replace it in Admin → Wholesale lists.",
      category: "mixed",
      audience: "public",
      format: "csv" as const,
      items: rows.filter((product) => product.category !== "supplements"),
    },
    {
      title: "Full trade cost sheet — all departments",
      supplier: "Ciputra Corp. trade desk",
      description:
        "Sample trade-only list: visible after signing in with an approved wholesale account (try buyer@harborhouse.com).",
      category: "mixed",
      audience: "trade",
      format: "xlsx" as const,
      items: rows,
    },
  ];

  for (const definition of definitions) {
    if (!definition.items.length) continue;
    const sheet = toSheet(definition.items);
    const filename = `${definition.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${definition.format}`;
    const content =
      definition.format === "xlsx"
        ? await buildOrderSheetXlsx(sheet)
        : Buffer.from(`\uFEFF${buildOrderSheetCsv(sheet)}`, "utf8");
    const parsed = await parseListFile(content, filename);
    await db.insert(wholesaleLists).values({
      title: definition.title,
      supplier: definition.supplier,
      description: definition.description,
      category: definition.category,
      audience: definition.audience,
      filename,
      format: parsed.format,
      bytes: content.length,
      rowCount: parsed.rowCount,
      columns: parsed.columns,
      preview: parsed.preview,
      content,
      published: true,
    });
  }
}

async function seed(): Promise<void> {
  // A live deployment starts empty. The business enters its own products, and no sample
  // catalog, reviews, coupon codes, accounts or orders are ever created in it.
  if (!shouldSeedDemoData()) return;

  // Catalog ------------------------------------------------------------
  const inserted = await db
    .insert(products)
    .values(
      PRODUCTS.map(({ weightLbs, ...product }) => ({
        ...product,
        // The sample catalog is written in pounds; storage is ounces (src/lib/weight.ts).
        weightOz: lbsToOz(weightLbs),
        priceTiers: product.priceTiers,
        images: product.images,
        features: product.features,
        specs: product.specs,
        badges: product.badges,
        active: true,
        taxClass: defaultTaxClass(product.category),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: products.id, slug: products.slug });

  // Demo stock lives in lots like real stock: food and supplements get two lots with
  // different best-by dates so FEFO picking is visible; home goods have no best-by date.
  if (inserted.length) {
    const bySlug = new Map(PRODUCTS.map((product) => [product.slug, product]));
    await db.transaction(async (tx) => {
      for (const row of inserted) {
        const product = bySlug.get(row.slug);
        if (!product || product.stock <= 0) continue;
        await tx.update(products).set({ stock: 0 }).where(eq(products.id, row.id));
        const dated = product.category !== "home";
        const first = dated ? Math.max(1, Math.floor(product.stock / 3)) : product.stock;
        await receiveLot(tx, {
          productId: row.id,
          lotNumber: `${product.sku}-A`,
          expiresOn: dated ? isoDate(addDays(new Date(), 240)) : null,
          cases: first,
          supplier: "Demo supplier",
          reason: "opening",
        });
        if (dated && product.stock - first > 0) {
          await receiveLot(tx, {
            productId: row.id,
            lotNumber: `${product.sku}-B`,
            expiresOn: isoDate(addDays(new Date(), 540)),
            cases: product.stock - first,
            supplier: "Demo supplier",
            reason: "opening",
          });
        }
      }
    });
  }

  const productRows = inserted.length
    ? inserted
    : await db.select({ id: products.id, slug: products.slug }).from(products);
  const idBySlug = new Map(productRows.map((row) => [row.slug, row.id]));

  const [{ count: reviewCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviews);
  if (reviewCount === 0) {
    await db.insert(reviews).values(
      REVIEW_SEED.flatMap((review) => {
        const productId = idBySlug.get(review.slug);
        if (!productId) return [];
        return [
          {
            productId,
            author: review.author,
            company: review.company,
            rating: review.rating,
            title: review.title,
            body: review.body,
            verified: true,
          },
        ];
      }),
    );
  }

  await db
    .insert(coupons)
    .values(COUPON_SEED.map((coupon) => ({ ...coupon })))
    .onConflictDoNothing();

  // Everything below is demo content — skip it on a live deployment.
  if (!shouldSeedDemoData()) return;

  await seedSampleWholesaleLists();

  // Accounts -----------------------------------------------------------
  await db
    .insert(users)
    .values([
      {
        email: "admin@meridiansupply.co",
        passwordHash: await hashPassword("Admin123!"),
        name: "Avery Merchant",
        company: "Ciputra Corp.",
        role: "admin",
        emailVerified: true,
        accountTier: "wholesale",
      },
      {
        email: "buyer@harborhouse.com",
        passwordHash: await hashPassword("Trade123!"),
        name: "Dana Whitfield",
        company: "Harbor House Pharmacy",
        phone: "(207) 555-0184",
        role: "customer",
        emailVerified: true,
        accountTier: "wholesale",
        wholesaleDiscountPct: 8,
        taxExempt: true,
        taxExemptState: "NJ",
        taxExemptCertType: "NJ ST-3",
        taxExemptCertNumber: "DEMO-ST3-0001",
        ein: "88-1234567",
      },
      {
        email: "customer@example.com",
        passwordHash: await hashPassword("Customer123!"),
        name: "Jamie Ortega",
        phone: "(512) 555-0110",
        role: "customer",
        emailVerified: true,
      },
    ])
    .onConflictDoNothing();

  const buyer = await db
    .select()
    .from(users)
    .where(sql`${users.email} = 'buyer@harborhouse.com'`)
    .limit(1);
  const buyerRow = buyer[0];

  if (buyerRow) {
    const existingAddresses = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(sql`${addresses.userId} = ${buyerRow.id}`)
      .limit(1);
    if (existingAddresses.length === 0) {
      await db.insert(addresses).values([
        {
          userId: buyerRow.id,
          label: "Pharmacy · receiving",
          name: "Dana Whitfield",
          company: "Harbor House Pharmacy",
          line1: "88 Exchange Street",
          line2: "Bay 3",
          city: "Portland",
          state: "ME",
          zip: "04101",
          phone: "(207) 555-0184",
          isDefault: true,
        },
        {
          userId: buyerRow.id,
          label: "Second location",
          name: "Dana Whitfield",
          company: "Harbor House Pharmacy",
          line1: "14 Main Street",
          city: "Brunswick",
          state: "ME",
          zip: "04011",
          phone: "(207) 555-0189",
          isDefault: false,
        },
      ]);
    }
  }

  // Wholesale applications --------------------------------------------
  const [{ count: applicationCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wholesaleApplications);
  if (applicationCount === 0) {
    await db.insert(wholesaleApplications).values([
      {
        companyName: "Sunrise Natural Grocers",
        ein: "84-5521904",
        businessType: "Independent grocery",
        contactName: "Priya Anand",
        email: "priya@sunrisenatural.com",
        phone: "(720) 555-0177",
        website: "https://sunrisenatural.com",
        addressLine1: "2210 Blake Street",
        city: "Denver",
        state: "CO",
        zip: "80205",
        annualVolume: "$250k – $1M",
        categories: "Vitamins & Supplements, Pantry & Staples",
        notes:
          "Three stores in the Denver metro. Resale certificate attached, EIN filed 2019. Looking for net-30 after two prepaid orders.",
        status: "pending",
      },
      {
        companyName: "Northline Boutique Hotels",
        ein: "47-9910238",
        businessType: "Hospitality group",
        contactName: "Marcus Hale",
        email: "marcus@northlinehotels.com",
        phone: "(312) 555-0143",
        website: "https://northlinehotels.com",
        addressLine1: "410 N Wells Street",
        city: "Chicago",
        state: "IL",
        zip: "60654",
        annualVolume: "$1M+",
        categories: "Home & Living",
        notes:
          "Refitting 11 lobbies in Q3. Needs LTL pallet freight and a net-45 application. Illinois resale certificate on file.",
        status: "pending",
      },
      {
        companyName: "Harbor House Pharmacy",
        ein: "88-1234567",
        businessType: "Independent pharmacy",
        contactName: "Dana Whitfield",
        email: "buyer@harborhouse.com",
        phone: "(207) 555-0184",
        website: "https://harborhousepharmacy.com",
        addressLine1: "88 Exchange Street",
        city: "Portland",
        state: "ME",
        zip: "04101",
        annualVolume: "$250k – $1M",
        categories: "Vitamins & Supplements, Pantry & Staples",
        notes: "Existing account — tax exemption on file for Maine resale.",
        status: "approved",
        discountPct: 8,
        taxExempt: true,
        verifiedEin: true,
        userId: buyerRow?.id ?? null,
        reviewedAt: new Date(),
      },
    ]);
  }

  // Demo orders --------------------------------------------------------
  if (buyerRow) {
    const existingOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(sql`${orders.userId} = ${buyerRow.id}`)
      .limit(1);
    if (existingOrders.length === 0) {
      const catalog = await db.select().from(products);
      const bySlug = new Map(catalog.map((product) => [product.slug, product]));
      const lines = [
        { slug: "daily-foundations-multivitamin", cases: 4 },
        { slug: "magnesium-glycinate-400", cases: 2 },
        { slug: "estate-extra-virgin-olive-oil", cases: 1 },
      ];
      const subtotal = lines.reduce((sum, line) => {
        const product = bySlug.get(line.slug);
        return sum + (product ? product.casePrice * line.cases : 0);
      }, 0);
      const accountDiscount = Math.round(subtotal * 0.08);
      const shippingCost = 4280;
      const total = subtotal - accountDiscount + shippingCost;

      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: "MSC-1042",
          userId: buyerRow.id,
          email: buyerRow.email,
          customerName: buyerRow.name,
          company: buyerRow.company,
          phone: buyerRow.phone,
          status: "shipped",
          shippingAddress: {
            line1: "88 Exchange Street",
            line2: "Bay 3",
            city: "Portland",
            state: "ME",
            zip: "04101",
            country: "United States",
          },
          shippingService: "UPS Ground",
          shippingCarrier: "UPS",
          trackingNumber: "1Z999AA10123456784",
          trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
          subtotal,
          accountDiscount,
          shippingCost,
          taxExempt: true,
          total,
          isWholesale: true,
          paymentStatus: "paid",
          paymentRef: "pi_demo_1042",
          notes: "Tax exemption certificate ME-2024-8812 verified.",
        })
        .returning({ id: orders.id });

      await db.insert(orderItems).values(
        lines.flatMap((line) => {
          const product = bySlug.get(line.slug);
          if (!product || !order) return [];
          return [
            {
              orderId: order.id,
              productId: product.id,
              name: product.name,
              sku: product.sku,
              image: product.image,
              cases: line.cases,
              unitsPerCase: product.caseSize,
              unitPrice: Math.round(product.casePrice / product.caseSize),
              lineTotal: product.casePrice * line.cases,
            },
          ];
        }),
      );

      const [order2] = await db
        .insert(orders)
        .values({
          orderNumber: "MSC-1043",
          userId: buyerRow.id,
          email: buyerRow.email,
          customerName: buyerRow.name,
          company: buyerRow.company,
          phone: buyerRow.phone,
          status: "processing",
          shippingAddress: {
            line1: "14 Main Street",
            city: "Brunswick",
            state: "ME",
            zip: "04011",
            country: "United States",
          },
          shippingService: "UPS 2nd Day Air",
          shippingCarrier: "UPS",
          subtotal: 24480,
          accountDiscount: 1958,
          shippingCost: 8940,
          taxExempt: true,
          total: 31462,
          isWholesale: true,
          paymentStatus: "paid",
          paymentRef: "pi_demo_1043",
        })
        .returning({ id: orders.id });

      const product = bySlug.get("omega-3-ultra-1200");
      if (order2 && product) {
        await db.insert(orderItems).values({
          orderId: order2.id,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          image: product.image,
          cases: 1,
          unitsPerCase: product.caseSize,
          unitPrice: Math.round(product.casePrice / product.caseSize),
          lineTotal: product.casePrice,
        });
      }
    }
  }
}

export function ensureSeeded(): Promise<void> {
  if (!globalForSeed.__meridianSeedPromise) {
    globalForSeed.__meridianSeedPromise = seed().catch((error) => {
      globalForSeed.__meridianSeedPromise = undefined;
      throw error;
    });
  }
  return globalForSeed.__meridianSeedPromise;
}
