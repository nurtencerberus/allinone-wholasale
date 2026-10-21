/**
 * UX-6: the page numbers a paginated list shows.
 *
 * Kept out of the page so the rule is testable: always the first and last page, a window around
 * the current one, and `null` where a run was skipped (rendered as an ellipsis).
 */
export function pageWindow(current: number, pages: number, span = 1): (number | null)[] {
  if (pages <= 1) return [1];
  const page = Math.min(Math.max(1, Math.round(current)), pages);
  const wanted = new Set<number>([1, pages]);
  for (let offset = -span; offset <= span; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pages) wanted.add(candidate);
  }
  const sorted = [...wanted].sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const entry of sorted) {
    if (previous && entry - previous > 1) out.push(null);
    out.push(entry);
    previous = entry;
  }
  return out;
}

/** "Showing 25–48 of 312" — the range this page covers, 1-based and clamped to the total. */
export function pageRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(page * pageSize, total) };
}
