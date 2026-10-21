import { formatMoney } from "@/lib/money";
import { isLegacyXls, isOoxml, readXlsxMatrix } from "@/lib/spreadsheet";

export type OrderSheetProduct = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  origin: string;
  caseSize: number;
  casePrice: number;
  priceTiers: { minCases: number; casePrice: number }[];
  msrpUnit: number;
  stock: number;
  weightLbs: number;
  dimensions: { l: number; w: number; h: number };
  leadTimeDays: number;
  slug: string;
};

export type ParsedOrderRow = { sku: string; cases: number; raw: string };

export type OrderSheetParseResult = {
  rows: ParsedOrderRow[];
  filename: string;
  totalRows: number;
  skuColumn: string | null;
  quantityColumn: string | null;
  warnings: string[];
};

export type OrderColumn = {
  key: string;
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  money?: boolean;
  input?: boolean;
};

/** Columns shared by the XLS workbook, the CSV export and the parser. */
export const ORDER_COLUMNS: OrderColumn[] = [
  { key: "sku", header: "SKU", width: 16 },
  { key: "name", header: "Product name", width: 34 },
  { key: "category", header: "Department", width: 18 },
  { key: "caseSize", header: "Units / case", width: 12, align: "center" },
  { key: "listPrice", header: "List case price (USD)", width: 18, money: true },
  { key: "tier2", header: "Case price 2+", width: 15, money: true },
  { key: "tier5", header: "Case price 5+", width: 15, money: true },
  { key: "tier10", header: "Case price 10+", width: 15, money: true },
  { key: "msrp", header: "MSRP / unit", width: 12, money: true },
  { key: "margin", header: "Retail margin %", width: 14, align: "center" },
  { key: "stock", header: "Stock (cases)", width: 13, align: "center" },
  { key: "cases", header: "Cases to order", width: 15, align: "center", input: true },
  { key: "notes", header: "Notes", width: 26 },
];

const BRAND_INK = "FF14241C";
const BRAND_CREAM = "FFF7F3EA";
const BRAND_CLAY = "FFB4552F";
const BRAND_FERN = "FFEAF0E9";
const BORDER = { style: "thin" as const, color: { argb: "FFD8D2C4" } };

function tierPrice(product: OrderSheetProduct, minCases: number, fallback: number): number {
  const tier = [...(product.priceTiers ?? [])]
    .sort((a, b) => a.minCases - b.minCases)
    .find((entry) => entry.minCases >= minCases);
  return tier ? tier.casePrice : fallback;
}

function marginPct(product: OrderSheetProduct): number {
  const msrpCase = product.msrpUnit * product.caseSize;
  return msrpCase ? Math.round(((msrpCase - product.casePrice) / msrpCase) * 100) : 0;
}

function rowData(product: OrderSheetProduct) {
  return {
    sku: product.sku,
    name: product.name,
    category: product.category,
    caseSize: product.caseSize,
    listPrice: product.casePrice / 100,
    tier2: tierPrice(product, 2, product.casePrice) / 100,
    tier5: tierPrice(product, 5, product.casePrice) / 100,
    tier10: tierPrice(product, 10, product.casePrice) / 100,
    msrp: product.msrpUnit / 100,
    margin: marginPct(product),
    stock: product.stock,
    cases: "" as string | number,
    notes: "",
  };
}

/** Styled .xlsx order form with a highlighted input column and live totals. */
export async function buildOrderSheetXlsx(products: OrderSheetProduct[]): Promise<Buffer> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "Ciputra Corp.";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = "Ciputra Corp. wholesale order sheet";
  workbook.subject = "Bulk case order form";
  workbook.company = "Ciputra Corp.";

  // Sheet 1 — fillable order form -------------------------------------
  const orderSheet = workbook.addWorksheet("Order Sheet", {
    views: [{ state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 19 },
  });
  orderSheet.columns = ORDER_COLUMNS.map((column) => ({
    key: column.key,
    width: column.width,
  }));

  const header = orderSheet.getRow(1);
  header.height = 30;
  ORDER_COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.input ? `${column.header} ← fill in` : column.header;
    cell.font = { bold: true, color: { argb: column.input ? "FFFFFFFF" : BRAND_CREAM }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.input ? BRAND_CLAY : BRAND_INK },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: column.align ?? "left",
      wrapText: true,
    };
    cell.border = { bottom: { style: "medium", color: { argb: BRAND_INK } } };
  });

  products.forEach((product, index) => {
    const row = orderSheet.addRow(rowData(product));
    const shade = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = ORDER_COLUMNS[colNumber - 1];
      cell.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
      cell.alignment = { vertical: "middle", horizontal: column?.align ?? "left" };
      cell.font = { size: 10.5, color: { argb: "FF14241C" } };
      if (column?.money) cell.numFmt = "$#,##0.00";
      if (column?.input) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDF3EC" } };
        cell.numFmt = "0";
      } else if (shade) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_FERN } };
      }
    });
    const first = row.getCell(1);
    first.font = { bold: true, size: 10.5, color: { argb: BRAND_INK } };
  });

  const lastDataRow = products.length + 1;
  const totalRow = orderSheet.addRow([]);
  totalRow.getCell(1).value = "TOTAL";
  totalRow.getCell(1).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  totalRow.getCell(12).value = { formula: `SUM(L2:L${lastDataRow})` };
  totalRow.getCell(12).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  totalRow.getCell(12).numFmt = "0";
  totalRow.getCell(13).value = { formula: `SUMPRODUCT(L2:L${lastDataRow},E2:E${lastDataRow})` };
  totalRow.getCell(13).font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  totalRow.getCell(13).numFmt = "$#,##0.00";
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_INK } };
    cell.border = { top: { style: "medium", color: { argb: BRAND_INK } } };
    cell.alignment = { vertical: "middle", horizontal: "right" };
  });

  orderSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ORDER_COLUMNS.length },
  };

  const footNote = orderSheet.addRow([]);
  footNote.getCell(1).value =
    "Fill only the “Cases to order” column, save the file and upload it back to /quick-order. Volume tiers are re-priced on our server — this sheet is an estimate in list pricing.";
  footNote.getCell(1).font = { size: 9, italic: true, color: { argb: "FF6B766E" } };
  orderSheet.mergeCells(footNote.number, 1, footNote.number, ORDER_COLUMNS.length);

  // Sheet 2 — full price list -----------------------------------------
  const priceSheet = workbook.addWorksheet("Price List", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const priceColumns: OrderColumn[] = [
    { key: "sku", header: "SKU", width: 16 },
    { key: "name", header: "Product name", width: 34 },
    { key: "brand", header: "Brand", width: 20 },
    { key: "category", header: "Department", width: 18 },
    { key: "origin", header: "Origin", width: 22 },
    { key: "caseSize", header: "Units / case", width: 12, align: "center" },
    { key: "listPrice", header: "List case price", width: 15, money: true },
    { key: "tier2", header: "Case price 2+", width: 15, money: true },
    { key: "tier5", header: "Case price 5+", width: 15, money: true },
    { key: "tier10", header: "Case price 10+", width: 15, money: true },
    { key: "unitCost", header: "Cost / unit", width: 13, money: true },
    { key: "msrp", header: "MSRP / unit", width: 12, money: true },
    { key: "margin", header: "Margin %", width: 11, align: "center" },
    { key: "stock", header: "Stock (cases)", width: 13, align: "center" },
    { key: "weight", header: "Carton weight (lb)", width: 17, align: "center" },
    { key: "dims", header: "Carton dims (in)", width: 20, align: "center" },
    { key: "lead", header: "Lead time (days)", width: 15, align: "center" },
  ];
  priceSheet.columns = priceColumns.map((column) => ({ key: column.key, width: column.width }));
  const priceHeader = priceSheet.getRow(1);
  priceHeader.height = 28;
  priceColumns.forEach((column, index) => {
    const cell = priceHeader.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: BRAND_CREAM }, size: 10.5 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_INK } };
    cell.alignment = { vertical: "middle", horizontal: column.align ?? "left", wrapText: true };
  });
  products.forEach((product, index) => {
    const row = priceSheet.addRow({
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
      origin: product.origin,
      caseSize: product.caseSize,
      listPrice: product.casePrice / 100,
      tier2: tierPrice(product, 2, product.casePrice) / 100,
      tier5: tierPrice(product, 5, product.casePrice) / 100,
      tier10: tierPrice(product, 10, product.casePrice) / 100,
      unitCost: product.casePrice / 100 / Math.max(product.caseSize, 1),
      msrp: product.msrpUnit / 100,
      margin: marginPct(product),
      stock: product.stock,
      weight: product.weightLbs,
      dims: `${product.dimensions.l} × ${product.dimensions.w} × ${product.dimensions.h}`,
      lead: product.leadTimeDays,
    });
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const column = priceColumns[colNumber - 1];
      if (column?.money) cell.numFmt = "$#,##0.00";
      cell.font = { size: 10 };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_FERN } };
      }
    });
  });
  priceSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: priceColumns.length },
  };

  // Sheet 3 — instructions ---------------------------------------------
  const guide = workbook.addWorksheet("How to order");
  guide.columns = [{ width: 4 }, { width: 92 }];
  const steps = [
    ["", "Ciputra Corp. — wholesale order sheet"],
    ["", `${products.length} active SKUs · case-packed · FOB Paterson, NJ 07503`],
    ["", ""],
    ["1.", "Download this workbook from your trade portal or /quick-order."],
    ["2.", "Fill the orange “Cases to order” column on the Order Sheet tab. Leave a line blank to skip it."],
    ["3.", "Save the file as .xlsx, .xls or .csv — anything Excel or Google Sheets exports."],
    ["4.", "Upload it back to /quick-order. We match SKUs against live inventory and resolve your volume tier."],
    ["5.", "Review the priced lines, add them to the cart, then confirm freight and destination sales tax."],
    ["", ""],
    ["", "Pricing rules"],
    ["", "• Volume tiers (2+, 5+, 10+ cases) resolve automatically per line."],
    ["", "• Approved trade accounts get their contract discount stacked on top at checkout."],
    ["", "• Resale tax-exempt accounts pay no sales tax where the certificate is verified."],
    ["", "• Freight is calculated on dimensional weight (L × W × H ÷ 139) and quoted per ZIP."],
    ["", ""],
    ["", "You can also upload a price list received from another supplier — we match on SKU or product code."],
  ];
  steps.forEach(([prefix, text], index) => {
    const row = guide.addRow([prefix, text]);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: "FFB4552F" } };
    row.getCell(2).font =
      index === 0
        ? { bold: true, size: 16, color: { argb: BRAND_INK } }
        : index === 1
          ? { size: 10, italic: true, color: { argb: "FF6B766E" } }
          : { size: 11, color: { argb: BRAND_INK } };
  });

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data as ArrayBuffer);
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildOrderSheetCsv(products: OrderSheetProduct[]): string {
  const lines: string[] = [];
  lines.push(ORDER_COLUMNS.map((column) => csvEscape(column.header)).join(","));
  for (const product of products) {
    const data = rowData(product);
    lines.push(
      ORDER_COLUMNS.map((column) => {
        const value = (data as Record<string, string | number>)[column.key] ?? "";
        return csvEscape(value);
      }).join(","),
    );
  }
  lines.push("");
  lines.push(
    `# Fill the "Cases to order" column and upload this file at ${"/quick-order"}. Volume tiers are re-priced server-side.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parsing — accepts .xlsx, legacy .xls, .csv, .tsv from any supplier
// ---------------------------------------------------------------------------

const SKU_ALIASES = new Set([
  "sku",
  "productsku",
  "itemsku",
  "itemcode",
  "itemnumber",
  "productcode",
  "productid",
  "code",
  "upc",
  "asin",
  "barcode",
  "urunkodu",
  "stokkodu",
  "urunkod",
  "stockcode",
  "reference",
  "ref",
  "partnumber",
]);

const QUANTITY_ALIASES = new Set([
  "cases",
  "casetoorder",
  "casestoorder",
  "casesordered",
  "ordercases",
  "casesqty",
  "caseqty",
  "qtycases",
  "qty",
  "quantity",
  "orderqty",
  "orderquantity",
  "qtyorder",
  "qtytobuy",
  "buycases",
  "miktar",
  "adet",
  "koli",
  "koliadet",
  "kolisayisi",
  "siparismiktar",
  "siparisadet",
  "quantitycases",
]);

/** Folds Turkish + Latin diacritics and drops separators so headers match reliably. */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const NON_SKU_ROWS = [
  "total",
  "totals",
  "subtotal",
  "grandtotal",
  "sum",
  "toplam",
  "gentoplam",
  "geneltoplam",
  "araToplam",
  "note",
  "notes",
  "not",
  "notlar",
  "legend",
  "instructions",
];

/** Rejects totals, footnotes and free text that sit in the SKU column. */
function isLikelySku(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 32) return false;
  if (NON_SKU_ROWS.includes(normalizeHeader(trimmed))) return false;
  return /^[A-Za-z0-9][A-Za-z0-9\-_/\\.]*$/.test(trimmed);
}

function findColumnIndex(
  header: string[],
  aliases: Set<string>,
): { index: number; label: string | null } {
  for (let i = 0; i < header.length; i += 1) {
    const normalized = normalizeHeader(header[i]);
    if (normalized && aliases.has(normalized)) {
      return { index: i, label: String(header[i]).trim() };
    }
  }
  // Fuzzy pass: handles our own “Cases to order ← fill in” header and variants
  // such as “Qty (cases)” or “Miktar / adet”.
  for (let i = 0; i < header.length; i += 1) {
    const normalized = normalizeHeader(header[i]);
    if (!normalized) continue;
    for (const alias of aliases) {
      const prefixOrSuffix = normalized.startsWith(alias) || normalized.endsWith(alias);
      const embedded = alias.length >= 8 && normalized.includes(alias);
      if (alias.length >= 6 && (prefixOrSuffix || embedded)) {
        return { index: i, label: String(header[i]).trim() };
      }
    }
  }
  return { index: -1, label: null };
}

function normalizeCases(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value ?? "").replace(/,/g, ".").trim();
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return 0;
  return Math.max(0, Math.round(Number(match[0])));
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

export function parseCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];
  const delimiter = candidates.reduce((best, candidate) => {
    const count = firstLine.split(candidate).length - 1;
    const bestCount = firstLine.split(best).length - 1;
    return count > bestCount ? candidate : best;
  }, ",");
  return clean
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => splitDelimitedLine(line, delimiter));
}

function locateColumns(matrix: string[][]): {
  headerRow: number;
  skuColumn: number;
  quantityColumn: number | null;
  skuHeader: string | null;
  quantityHeader: string | null;
} {
  const limit = Math.min(matrix.length, 12);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const sku = findColumnIndex(row, SKU_ALIASES);
    if (sku.index < 0) continue;
    const quantity = findColumnIndex(row, QUANTITY_ALIASES);
    return {
      headerRow: rowIndex,
      skuColumn: sku.index,
      quantityColumn: quantity.index >= 0 ? quantity.index : null,
      skuHeader: sku.label,
      quantityHeader: quantity.label,
    };
  }
  return { headerRow: -1, skuColumn: -1, quantityColumn: null, skuHeader: null, quantityHeader: null };
}

export async function parseOrderSheet(
  data: Buffer,
  filename: string,
): Promise<OrderSheetParseResult> {
  const warnings: string[] = [];
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  let matrix: string[][] = [];

  if (isLegacyXls(data)) {
    return {
      rows: [],
      filename,
      totalRows: 0,
      skuColumn: null,
      quantityColumn: null,
      warnings: ["Legacy .xls files are not supported. Save the file as .xlsx or .csv and upload again."],
    };
  }

  if (isOoxml(data)) {
    try {
      ({ matrix } = await readXlsxMatrix(data, (names) =>
        names.find((name) => /order|sipari|sheet|form/i.test(name)),
      ));
    } catch {
      return {
        rows: [],
        filename,
        totalRows: 0,
        skuColumn: null,
        quantityColumn: null,
        warnings: ["Could not read this workbook. Export it as .xlsx or .csv and try again."],
      };
    }
  } else {
    if (extension && !["csv", "txt", "tsv", "dat"].includes(extension)) {
      warnings.push(`Unrecognised extension “.${extension}” — read as text.`);
    }
    matrix = parseCsvMatrix(data.toString("utf8"));
  }

  const location = locateColumns(matrix);
  if (location.headerRow < 0) {
    return {
      rows: [],
      filename,
      totalRows: matrix.length,
      skuColumn: null,
      quantityColumn: null,
      warnings: [
        "Could not find a SKU column. Expected a header such as “SKU”, “Item code”, “Product code” or “Ürün kodu”.",
      ],
    };
  }

  if (location.quantityColumn === null) {
    warnings.push(
      `No quantity column found (looked for “Cases”, “Qty”, “Miktar”…). 1 case added per SKU — adjust quantities before checkout.`,
    );
  }

  const rows: ParsedOrderRow[] = [];
  let skipped = 0;
  for (let rowIndex = location.headerRow + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex] ?? [];
    const sku = String(row[location.skuColumn] ?? "").trim();
    if (!isLikelySku(sku)) {
      if (sku) skipped += 1;
      continue;
    }
    // Ignore repeated header rows inside multi-block exports.
    if (SKU_ALIASES.has(normalizeHeader(sku)) || QUANTITY_ALIASES.has(normalizeHeader(sku))) continue;
    const rawQuantity =
      location.quantityColumn === null ? "1" : String(row[location.quantityColumn] ?? "").trim();
    const cases = normalizeCases(rawQuantity);
    if (rawQuantity === "" || cases === 0) continue;
    rows.push({ sku: sku.toUpperCase(), cases, raw: rawQuantity });
  }

  if (!rows.length && location.quantityColumn !== null) {
    warnings.push(
      `The quantity column “${location.quantityHeader ?? "quantity"}” has no cases entered. Fill at least one row and upload again.`,
    );
  }
  if (skipped > 0) {
    warnings.push(
      `${skipped} row${skipped === 1 ? "" : "s"} skipped — totals, notes or free text in the SKU column.`,
    );
  }

  return {
    rows,
    filename,
    totalRows: rows.length,
    skuColumn: location.skuHeader,
    quantityColumn: location.quantityHeader,
    warnings,
  };
}

export function formatOrderSheetSummary(result: OrderSheetParseResult): string {
  const parts = [
    `${result.rows.length} line${result.rows.length === 1 ? "" : "s"} read from ${result.filename}`,
  ];
  if (result.skuColumn) parts.push(`SKU column “${result.skuColumn}”`);
  if (result.quantityColumn) parts.push(`quantity column “${result.quantityColumn}”`);
  return parts.join(" · ");
}

export const ORDER_SHEET_FILENAMES = {
  xlsx: "ciputra-order-sheet.xlsx",
  csv: "ciputra-order-sheet.csv",
} as const;

export const ORDER_SHEET_PRICE_HINT = (products: OrderSheetProduct[]) =>
  `List pricing published ${new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })} · ${products.length} SKUs · ${formatMoney(
    products.reduce((sum, product) => sum + product.casePrice * product.caseSize, 0),
    { decimals: false },
  )} catalog value per full case set`;
