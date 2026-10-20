import {
  boolean,
  customType,
  date,
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
/** A certification badge is shown to buyers only when its document is on file. */
export type Certification = { name: string; documentUrl: string | null };
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
    // customer | admin (owner, every permission) | ops | sales | accounting | viewer — see src/lib/staff.ts
    role: text("role").notNull().default("customer"),
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
    // TOTP two-factor (required for staff). The pending secret is replaced on confirmation.
    totpSecret: text("totp_secret"),
    totpPendingSecret: text("totp_pending_secret"),
    totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
    /** Last accepted 30-second step, so a code cannot be replayed. */
    totpLastStep: integer("totp_last_step"),
    /** SHA-256 digests of unused single-use recovery codes. */
    recoveryCodes: jsonb("recovery_codes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    // Sign-up verification and password reset look a user up by the token digest alone.
    index("users_verification_token_idx").on(table.verificationToken),
    index("users_reset_token_idx").on(table.resetToken),
  ],
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
  (table) => [
    index("sessions_user_idx").on(table.userId),
    // The daily cron deletes everything already expired.
    index("sessions_expires_idx").on(table.expiresAt),
  ],
);

/** Password accepted, second factor pending. The cookie holds the token; the row holds its digest. */
export const loginChallenges = pgTable("login_challenges", {
  tokenDigest: text("token_digest").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only record of staff actions (who, what, before/after). Never updated or deleted by the app. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_created_idx").on(table.createdAt),
  ],
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
    /** Case weight in whole ounces; pounds everywhere a person sees it (src/lib/weight.ts). */
    weightOz: integer("weight_oz").notNull(),
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
    // Identity. GTIN is the unit barcode (UPC-A, EAN-13, GTIN-8/14), stored as entered digits.
    gtin: text("gtin"),
    caseGtin: text("case_gtin"), // ITF-14 on the shipping carton
    asin: text("asin"), // Amazon reference only; the link is derived, never stored
    mpn: text("mpn"),
    manufacturer: text("manufacturer"),
    supplierName: text("supplier_name"),
    supplierSku: text("supplier_sku"),
    supplierUrl: text("supplier_url"),
    // Money in cents. Cost is per case and is never sent to a buyer; MAP is per unit.
    costPrice: integer("cost_price"),
    mapPrice: integer("map_price"),
    // Logistics
    unitsPerPallet: integer("units_per_pallet"), // cases per pallet
    palletTi: integer("pallet_ti"),
    palletHi: integer("pallet_hi"),
    freightClass: text("freight_class"),
    nmfc: text("nmfc"),
    hazmat: boolean("hazmat").notNull().default(false),
    unNumber: text("un_number"),
    htsCode: text("hts_code"),
    countryOfOrigin: text("country_of_origin"), // ISO 3166-1 alpha-2
    // Compliance (supplements and food)
    shelfLifeDays: integer("shelf_life_days"),
    ingredients: text("ingredients"),
    allergens: jsonb("allergens").$type<string[]>().notNull().default([]),
    factsPanelImage: text("facts_panel_image"),
    /** Structure/function claims → DSHEA disclaimer shown (21 CFR 101.93). */
    fdaDisclaimer: boolean("fda_disclaimer").notNull().default(false),
    prop65Warning: text("prop65_warning"),
    certifications: jsonb("certifications").$type<Certification[]>().notNull().default([]),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    /** Low-stock alert threshold, in cases. */
    reorderPoint: integer("reorder_point").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Bumped on every admin edit; the form sends it back so a stale edit is refused. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    uniqueIndex("products_sku_unique").on(table.sku),
    uniqueIndex("products_gtin_unique").on(table.gtin),
    index("products_asin_idx").on(table.asin),
    index("products_category_idx").on(table.category),
    // The storefront only ever lists active products, and the home page the featured ones.
    index("products_active_featured_idx").on(table.active, table.featured),
  ],
);

/**
 * Warehouse lots (batch + best-by). Sellable stock lives only in lots; products.stock is the
 * running total of `qty_on_hand` over lots with status "available", kept in step by
 * src/lib/inventory.ts in the same transaction as every lot change.
 */
export const productLots = pgTable(
  "product_lots",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    lotNumber: text("lot_number").notNull(),
    expiresOn: date("expires_on"), // null for goods without a best-by date
    supplier: text("supplier"),
    qtyReceived: integer("qty_received").notNull().default(0),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    /** Returned opened goods and other stock that must not be sold. */
    qtyQuarantine: integer("qty_quarantine").notNull().default(0),
    status: text("status").notNull().default("available"), // available | hold | expired | recalled
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_lots_product_lot_unique").on(table.productId, table.lotNumber),
    index("product_lots_product_status_idx").on(table.productId, table.status),
  ],
);

/** Stock ledger: every change to a lot, with the reason and who or what caused it. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    lotId: integer("lot_id").references(() => productLots.id, { onDelete: "set null" }),
    bucket: text("bucket").notNull().default("on_hand"), // on_hand | quarantine
    delta: integer("delta").notNull(),
    // receipt | order | cancel | return | adjust | count | writeoff | expire | release | recall | opening | import
    reason: text("reason").notNull(),
    refType: text("ref_type"), // order | return | import
    refId: text("ref_id"),
    note: text("note"),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_movements_product_idx").on(table.productId, table.createdAt),
    index("inventory_movements_lot_idx").on(table.lotId),
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
    /** Redemption window; null on either side means "no bound". */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Total redemptions allowed across all customers, and per customer; null means unlimited. */
    maxRedemptions: integer("max_redemptions"),
    perCustomerLimit: integer("per_customer_limit"),
    /** Account tiers that may use the code; empty means every tier. */
    allowedTiers: jsonb("allowed_tiers").$type<string[]>().notNull().default([]),
    /** False: the code cannot be combined with contract (account) pricing. */
    stackable: boolean("stackable").notNull().default(true),
    /** Kept in step with coupon_redemptions inside the order transaction. */
    redeemedCount: integer("redeemed_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("coupons_code_unique").on(table.code)],
);

/** One row per order that used a coupon: the usage counters and per-customer limits rest on it. */
export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("coupon_redemptions_order_unique").on(table.couponId, table.orderId),
    index("coupon_redemptions_customer_idx").on(table.couponId, table.userId),
  ],
);

/**
 * The signed-in buyer's cart, kept on the server so it follows them between devices and
 * survives a cleared browser (SEP-7). Guests keep theirs in local storage only.
 */
export const carts = pgTable(
  "carts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** When the abandoned-cart reminder was sent for the cart as it stood then. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("carts_user_unique").on(table.userId), index("carts_updated_idx").on(table.updatedAt)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    cases: integer("cases").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One row per product: the quantity is replaced, never appended to.
  (table) => [uniqueIndex("cart_items_product_unique").on(table.cartId, table.productId)],
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
    // Client-generated key (scoped to the account) so a retried submit cannot create a second order.
    idempotencyKey: text("idempotency_key"),
    notes: text("notes"), // the buyer's own note
    adminNotes: text("admin_notes"),
    // Tax record for filing and refunds (VRG-7).
    taxSource: text("tax_source"), // state_rate | exempt | no_nexus
    taxableAmount: integer("taxable_amount").notNull().default(0),
    shippingTaxable: integer("shipping_taxable").notNull().default(0),
    shippingTax: integer("shipping_tax").notNull().default(0),
    exemptionCert: text("exemption_cert"),
    refundedAmount: integer("refunded_amount").notNull().default(0),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.orderNumber),
    // One captured card payment can produce at most one order (NULLs are allowed repeatedly).
    uniqueIndex("orders_payment_ref_unique").on(table.paymentRef),
    uniqueIndex("orders_idempotency_key_unique").on(table.idempotencyKey),
    index("orders_user_idx").on(table.userId),
    // Account history matches on the verified email; every admin list is newest-first.
    index("orders_email_idx").on(table.email),
    index("orders_created_idx").on(table.createdAt),
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
    lineTotal: integer("line_total").notNull(), // after tier and account price, before coupon
    discount: integer("discount").notNull().default(0), // this line's share of the coupon
    taxClass: text("tax_class").notNull().default("general"),
    taxableAmount: integer("taxable_amount").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    returnedCases: integer("returned_cases").notNull().default(0),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

/** Which lots each order line was picked from (FEFO), for packing slips and recalls. */
export const orderItemLots = pgTable(
  "order_item_lots",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    lotId: integer("lot_id").references(() => productLots.id, { onDelete: "set null" }),
    lotNumber: text("lot_number").notNull(),
    expiresOn: date("expires_on"),
    cases: integer("cases").notNull(),
    returnedCases: integer("returned_cases").notNull().default(0),
  },
  (table) => [
    index("order_item_lots_item_idx").on(table.orderItemId),
    index("order_item_lots_lot_idx").on(table.lotId),
  ],
);

/** Order history: status changes, payments, refunds, notes. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // status | payment | refund | return | note | tracking
    fromValue: text("from_value"),
    toValue: text("to_value"),
    message: text("message"),
    actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull().default("system"),
    visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("order_events_order_idx").on(table.orderId, table.createdAt)],
);

/** Return authorisations (RMA). 14 days from delivery; opened food/supplements are quarantined. */
export const returnRequests = pgTable(
  "return_requests",
  {
    id: serial("id").primaryKey(),
    rmaNumber: text("rma_number").notNull(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull().default("requested"), // requested | approved | rejected | received | refunded
    reason: text("reason").notNull(),
    customerNote: text("customer_note"),
    adminNote: text("admin_note"),
    refundGoods: integer("refund_goods").notNull().default(0),
    refundTax: integer("refund_tax").notNull().default(0),
    refundShipping: integer("refund_shipping").notNull().default(0),
    refundRef: text("refund_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("return_requests_rma_unique").on(table.rmaNumber),
    index("return_requests_order_idx").on(table.orderId),
  ],
);

export const returnItems = pgTable(
  "return_items",
  {
    id: serial("id").primaryKey(),
    returnId: integer("return_id")
      .notNull()
      .references(() => returnRequests.id, { onDelete: "cascade" }),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    cases: integer("cases").notNull(),
    condition: text("condition"), // sealed | opened | damaged — set when the cartons arrive
    disposition: text("disposition"), // restock | quarantine | destroy
  },
  // One row per line: a request that claims the same line twice would be refunded twice.
  (table) => [
    index("return_items_return_idx").on(table.returnId),
    uniqueIndex("return_items_line_unique").on(table.returnId, table.orderItemId),
  ],
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

/**
 * Everything needed to create an order, saved when a card payment is started. The order is
 * created from this row (by the browser or the Stripe webhook, whichever arrives first), so a
 * closed tab can never leave an authorised card without an order.
 */
export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: serial("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<CheckoutPayload>().notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("open"), // open | finalizing | ordered | failed
    orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("checkout_sessions_pi_unique").on(table.paymentIntentId),
    index("checkout_sessions_status_idx").on(table.status, table.updatedAt),
  ],
);

export type CheckoutPayload = {
  items: { productId: number; cases: number }[];
  couponCode: string | null;
  address: { line1: string; line2?: string; city: string; state: string; zip: string };
  shippingOptionId: string;
  contact: { email: string; name: string; company: string | null; phone: string | null; notes: string | null };
};

/** Fixed-window counters for abuse limits (logins, sign-ups, card attempts, uploads). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  // The daily cron sweeps every window that has already closed.
  (table) => [index("rate_limits_reset_idx").on(table.resetAt)],
);

export type Cart = typeof carts.$inferSelect;
export type CartRow = typeof cartItems.$inferSelect;
export type WholesaleList = typeof wholesaleLists.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type WholesaleApplication = typeof wholesaleApplications.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type CouponRedemption = typeof couponRedemptions.$inferSelect;
export type CheckoutSession = typeof checkoutSessions.$inferSelect;
export type ProductLot = typeof productLots.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type OrderEvent = typeof orderEvents.$inferSelect;
export type ReturnRequest = typeof returnRequests.$inferSelect;
export type ReturnItem = typeof returnItems.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
