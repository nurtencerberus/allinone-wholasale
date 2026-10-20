// Client-safe half of the quote feature (UX-7): the shape the browser renders and the few
// constants it needs. No database or server-only import may appear here — src/lib/quotes.ts
// holds the logic and imports these types.

export const QUOTE_STATUSES = ["requested", "quoted", "accepted", "declined", "expired", "withdrawn"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** How long a quote stands by default. */
export const QUOTE_VALID_DAYS = 14;
/** Lines per request: enough for a pallet build, few enough to price by hand. */
export const MAX_QUOTE_LINES = 40;

export type QuoteView = {
  id: number;
  reference: string;
  status: string;
  customerNote: string | null;
  adminNote: string | null;
  expiresAt: string | null;
  createdAt: string;
  account: { id: number; email: string; name: string; company: string | null };
  lines: {
    id: number;
    productId: number;
    sku: string;
    name: string;
    cases: number;
    listCasePrice: number;
    casePrice: number | null;
    note: string | null;
  }[];
};
