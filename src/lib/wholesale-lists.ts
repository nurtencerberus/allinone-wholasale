import type { SessionUser } from "@/lib/auth";
import { parseCsvMatrix } from "@/lib/order-sheet";

export type ListFormat = "xlsx" | "xls" | "csv";
export type ListAudience = "public" | "trade";

export const LIST_CATEGORIES = ["mixed", "supplements", "pantry", "home"] as const;
export const MAX_LIST_BYTES = 10 * 1024 * 1024;

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
  return Boolean(user && (user.accountTier === "wholesale" || user.role === "admin"));
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
  const format = detectFormat(data, filename);
  if (!format) throw new Error("Upload an .xlsx, .xls or .csv file.");

  let matrix: unknown[][];
  if (format === "csv") {
    matrix = parseCsvMatrix(data.toString("utf8"));
  } else {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(data, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("No readable sheet found in this workbook.");
    matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });
  }

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

  const XLSX = await import("xlsx");
  if (target === "csv") {
    const workbook = XLSX.read(data, { type: "buffer" });
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
    return { body: Buffer.from(`\uFEFF${csv}`, "utf8"), ext: "csv", type: MIME.csv };
  }

  let workbook;
  if (from === "csv") {
    // Never let the spreadsheet library guess numbers: it reads Turkish/EU
    // decimals like "8,50" as 850. Only plain dot-decimal values become
    // numbers; SKUs with leading zeros and comma decimals stay text.
    const matrix = parseCsvMatrix(data.toString("utf8")).map((row) =>
      row.map((cell) =>
        /^-?\d+(\.\d+)?$/.test(cell) && !/^-?0\d/.test(cell) ? Number(cell) : cell,
      ),
    );
    workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), "List");
  } else {
    workbook = XLSX.read(data, { type: "buffer" });
  }
  const output = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { body: output, ext: "xlsx", type: MIME.xlsx };
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
