import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export type Dimensions = { l: number; w: number; h: number };
export type PriceTier = { minCases: number; casePrice: number };

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    phone: text("phone"),
    role: text("role").notNull().default("customer"), // customer | admin
    emailVerified: boolean("email_verified").notNull().default(false),
    verificationToken: text("verification_token"),
    verificationExpires: timestamp("verification_expires", { withTimezone: true }),
    resetToken: text("reset_token"),
    resetExpires: timestamp("reset_expires", { withTimezone: true }),
    accountTier: text("account_tier").notNull().default("retail"), // retail | wholesale
    wholesaleDiscountPct: integer("wholesale_discount_pct").notNull().default(0),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    taxExemptState: text("tax_exempt_state"),
    // Resale certificate on file. Exemption applies only to deliveries in taxExemptState,
    // with a certificate number, and before the expiry date when one is set.
    taxExemptCertType: text("tax_exempt_cert_type"), // e.g. NJ ST-3, NJ ST-3NR, MTC, SST
    taxExemptCertNumber: text("tax_exempt_cert_number"),
    taxExemptExpires: timestamp("tax_exempt_expires", { withTimezone: true }),
    ein: text("ein"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const wholesaleApplications = pgTable("wholesale_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  companyName: text("company_name").notNull(),
  ein: text("ein").notNull(),
  businessType: text("business_type").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  website: text("website"),
  addressLine1: text("address_line1").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  annualVolume: text("annual_volume").notNull(),
  categories: text("categories").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  rejectionReason: text("rejection_reason"),
  discountPct: integer("discount_pct").notNull().default(0),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  verifiedEin: boolean("verified_ein").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // supplements | pantry | home
    tagline: text("tagline").notNull(),
    description: text("description").notNull(),
    story: text("story").notNull(),
    brand: text("brand").notNull(),
    origin: text("origin").notNull(),
    msrpUnit: integer("msrp_unit").notNull(),
    casePrice: integer("case_price").notNull(),
    caseSize: integer("case_size").notNull(),
    minCases: integer("min_cases").notNull().default(1),
    priceTiers: jsonb("price_tiers").$type<PriceTier[]>().notNull().default([]),
    weightLbs: integer("weight_lbs").notNull(),
    dimensions: jsonb("dimensions").$type<Dimensions>().notNull(),
    stock: integer("stock").notNull().default(0),
    leadTimeDays: integer("lead_time_days").notNull().default(2),
    ratingX10: integer("rating_x10").notNull().default(45),
    reviewCount: integer("review_count").notNull().default(0),
    image: text("image").notNull(),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    specs: jsonb("specs").$type<{ label: string; value: string }[]>().notNull().default([]),
    badges: jsonb("badges").$type<string[]>().notNull().default([]),
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    // Sales-tax class: general (taxable) | food | supplement | candy. See src/lib/tax.ts.
    taxClass: text("tax_class").notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    uniqueIndex("products_sku_unique").on(table.sku),
    index("products_category_idx").on(table.category),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    company: text("company"),
    rating: integer("rating").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    verified: boolean("verified").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reviews_product_idx").on(table.productId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    kind: text("kind").notNull(), // percent | fixed | shipping
    value: integer("value").notNull(),
    minSubtotal: integer("min_subtotal").notNull().default(0),
    description: text("description").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("coupons_code_unique").on(table.code)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    phone: text("phone"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("addresses_user_idx").on(table.userId)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    customerName: text("customer_name").notNull(),
    company: text("company"),
    phone: text("phone"),
    status: text("status").notNull().default("processing"),
    shippingAddress: jsonb("shipping_address")
      .$type<{
        line1: string;
        line2?: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }>()
      .notNull(),
    shippingService: text("shipping_service").notNull(),
    shippingCarrier: text("shipping_carrier").notNull(),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    subtotal: integer("subtotal").notNull(),
    accountDiscount: integer("account_discount").notNull().default(0),
    couponCode: text("coupon_code"),
    couponDiscount: integer("coupon_discount").notNull().default(0),
    shippingCost: integer("shipping_cost").notNull().default(0),
    // Per-mille, can be fractional (NJ 6.625% = 66.25), so this is not an integer column.
    taxRate: doublePrecision("tax_rate_x1000").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    total: integer("total").notNull(),
    isWholesale: boolean("is_wholesale").notNull().default(false),
    paymentStatus: text("payment_status").notNull().default("paid"), // paid | paid_demo | net30_invoice | awaiting_payment
    paymentMethod: text("payment_method").notNull().default("card"), // card | net30 | ach
    poNumber: text("po_number"),
    // Unguessable key that lets a guest buyer open their own confirmation page.
    accessToken: text("access_token"),
    paymentRef: text("payment_ref"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    // One captured card payment can produce at most one order (NULLs are allowed repeatedly).
    uniqueIndex("orders_payment_ref_unique").on(table.paymentRef),
    index("orders_user_idx").on(table.userId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    image: text("image").notNull(),
    cases: integer("cases").notNull(),
    unitsPerCase: integer("units_per_case").notNull(),
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

/** Product photos uploaded from the admin panel, served from /api/product-images/[id]. */
export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  content: bytea("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Supplier / wholesaler product lists (.xlsx, .xls, .csv) published on the homepage. */
export const wholesaleLists = pgTable(
  "wholesale_lists",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    supplier: text("supplier").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("mixed"), // mixed | supplements | pantry | home
    audience: text("audience").notNull().default("public"), // public | trade
    filename: text("filename").notNull(),
    format: text("format").notNull(), // xlsx | xls | csv
    bytes: integer("bytes").notNull(),
    rowCount: integer("row_count").notNull().default(0),
    columns: jsonb("columns").$type<string[]>().notNull().default([]),
    preview: jsonb("preview").$type<string[][]>().notNull().default([]),
    content: bytea("content").notNull(),
    published: boolean("published").notNull().default(true),
    downloads: integer("downloads").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wholesale_lists_published_idx").on(table.published)],
);

/** Fixed-window counters for abuse limits (logins, sign-ups, card attempts, uploads). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export type WholesaleList = typeof wholesaleLists.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type WholesaleApplication = typeof wholesaleApplications.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
