/** Name of the violated constraint on a Postgres error (drizzle wraps it in `cause`). */
export function pgConstraint(error: unknown): string | undefined {
  const candidate = error as { constraint?: string; cause?: { constraint?: string } };
  return candidate?.constraint ?? candidate?.cause?.constraint;
}

/** A readable message for a product unique-constraint violation, or null. */
export function productConflictMessage(error: unknown, values: { sku: string; gtin: string | null }): string | null {
  const constraint = pgConstraint(error);
  if (constraint === "products_sku_unique") return `SKU ${values.sku} is already used by another product.`;
  if (constraint === "products_gtin_unique") return `UPC / GTIN ${values.gtin} is already on another product.`;
  if (constraint === "products_slug_unique") return "Another product was just saved with the same name. Try again.";
  return null;
}
