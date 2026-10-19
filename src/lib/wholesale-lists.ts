import type { SessionUser } from "@/lib/auth";
import { parseCsvMatrix } from "@/lib/order-sheet";
import { isLegacyXls, matrixToCsv, matrixToXlsx, readXlsxMatrix } from "@/lib/spreadsheet";
import { isStaffRole } from "@/lib/staff";

const LEGACY_XLS_MESSAGE = "Legacy .xls files are not supported. Save the list as .xlsx or .csv and upload again.";

export type ListFormat = "xlsx" | "xls" | "csv";
export type ListAudience = "public" | "trade";

export const LIST_CATEGORIES = ["mixed", "supplements", "pantry", "home"] as const;
// Vercel Functions reject request bodies over 4.5 MB, so stay safely under it.
export const MAX_LIST_BYTES = 4 * 1024 * 1024;

const MAX_COLUMNS = 16;
const PREVIEW_ROWS = 60;

export type ParsedList = {
  format: ListFormat;
  columns: string[];
  preview: string[][];
  rowCount: number;
};

const MIME: Record<ListFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv; charset=utf-8",
};

/** Trade-only lists are visible to approved wholesale accounts and admins. */
export function canAccessTrade(user: SessionUser | null): boolean {
  return Boolean(user && (user.accountTier === "wholesale" || isStaffRole(user.role)));
}

function clip(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function detectFormat(data: Buffer, filename: string): ListFormat | null {
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  if (data[0] === 0x50 && data[1] === 0x4b) return "xlsx";
  if (data[0] === 0xd0 && data[1] === 0xcf) return "xls";
  if (["csv", "tsv", "txt"].includes(extension)) return "csv";
  return null;
}

/** Reads the first sheet of an .xlsx / .xls / .csv file into a header + preview. */
export async function parseListFile(data: Buffer, filename: string): Promise<ParsedList> {
  if (isLegacyXls(data)) throw new Error(LEGACY_XLS_MESSAGE);
  const format = detectFormat(data, filename);
  if (!format || format === "xls") throw new Error("Upload an .xlsx or .csv file.");

  const matrix: string[][] =
    format === "csv"
      ? parseCsvMatrix(data.toString("utf8"))
      : (await readXlsxMatrix(data)).matrix;

  const rows = matrix.map((row) => row.map(clip)).filter((row) => row.some(Boolean));
  if (!rows.length) throw new Error("The file has no readable rows.");

  const headerIndex = Math.max(0, rows.findIndex((row) => row.filter(Boolean).length >= 2));
  const header = rows[headerIndex];
  let width = header.length;
  while (width > 0 && !header[width - 1]) width -= 1;
  width = Math.min(Math.max(width, 1), MAX_COLUMNS);

  const columns = header.slice(0, width).map((cell, index) => cell || `Column ${index + 1}`);
  // Footnotes and TOTAL rows carry a single filled cell — they are not products.
  const minimumCells = columns.length >= 3 ? 2 : 1;
  const body = rows
    .slice(headerIndex + 1)
    .filter((row) => row.filter(Boolean).length >= minimumCells)
    .map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));

  return { format, columns, preview: body.slice(0, PREVIEW_ROWS), rowCount: body.length };
}

/** Serves the stored file as-is, or converts between .xlsx and .csv on demand. */
export async function renderListFile(
  data: Buffer,
  from: ListFormat,
  target: "original" | "xlsx" | "csv",
): Promise<{ body: Buffer; ext: ListFormat; type: string }> {
  if (target === "original" || target === from) return { body: data, ext: from, type: MIME[from] };
  if (from === "xls") throw new Error(LEGACY_XLS_MESSAGE);

  if (target === "csv") {
    const matrix = from === "csv" ? parseCsvMatrix(data.toString("utf8")) : (await readXlsxMatrix(data)).matrix;
    return { body: Buffer.from(`\uFEFF${matrixToCsv(matrix)}`, "utf8"), ext: "csv", type: MIME.csv };
  }

  // csv -> xlsx: numbers are only inferred for plain dot-decimal values (see matrixToXlsx).
  const matrix = parseCsvMatrix(data.toString("utf8"));
  return { body: await matrixToXlsx(matrix), ext: "xlsx", type: MIME.xlsx };
}

export function listSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ç/g, "c")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "wholesale-list"
  );
}
