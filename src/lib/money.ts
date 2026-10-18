export function formatMoney(cents: number, opts: { decimals?: boolean } = {}): string {
  const decimals = opts.decimals ?? true;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  }).format((cents ?? 0) / 100);
}

/** rateX1000 is a per-mille rate (66.25 => 6.625%). */
export function formatRate(rateX1000: number): string {
  return `${(rateX1000 / 10).toFixed(3)}%`;
}

export function unitPriceOf(casePrice: number, caseSize: number): number {
  return Math.round(casePrice / Math.max(caseSize, 1));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
