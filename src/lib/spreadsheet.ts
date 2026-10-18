/**
 * Spreadsheet I/O on exceljs only. The `xlsx` (SheetJS) package was dropped: its
 * 0.18.x line has known prototype-pollution and ReDoS advisories with no npm fix, and
 * it parsed untrusted uploads on a public endpoint. Legacy binary .xls is not accepted.
 */

const MAX_COLUMNS = 200;

export function isLegacyXls(data: Buffer): boolean {
  return data[0] === 0xd0 && data[1] === 0xcf;
}

export function isOoxml(data: Buffer): boolean {
  return data[0] === 0x50 && data[1] === 0x4b;
}

function cellText(value: unknown, text: string | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof text === "string") return text;
  return String(value);
}

/** Reads one worksheet of an .xlsx file into a string matrix (blank rows dropped). */
export async function readXlsxMatrix(
  data: Buffer,
  pickSheet?: (names: string[]) => string | undefined,
): Promise<{ sheetName: string; matrix: string[][] }> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  await workbook.xlsx.load(data as unknown as ArrayBuffer);

  const names = workbook.worksheets.map((sheet) => sheet.name);
  const picked = pickSheet?.(names);
  const sheet = (picked && workbook.getWorksheet(picked)) || workbook.worksheets[0];
  if (!sheet) throw new Error("No readable sheet found in this workbook.");

  const width = Math.min(Math.max(sheet.actualColumnCount, 1), MAX_COLUMNS);
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column += 1) {
      const cell = row.getCell(column);
      cells.push(cellText(cell.value, cell.text));
    }
    matrix.push(cells);
  });
  return { sheetName: sheet.name, matrix };
}

/** RFC 4180-style CSV from a matrix, with a formula-injection guard on text cells. */
export function matrixToCsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((raw) => {
          const cell = /^[=+\-@]/.test(raw) && !/^-?\d/.test(raw) ? `'${raw}` : raw;
          return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
        })
        .join(","),
    )
    .join("\r\n");
}

/** Builds an .xlsx from a matrix. Plain dot-decimal numbers become numbers; SKUs with leading zeros and comma decimals stay text. */
export async function matrixToXlsx(matrix: string[][], sheetName = "List"): Promise<Buffer> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of matrix) {
    sheet.addRow(
      row.map((cell) => (/^-?\d+(\.\d+)?$/.test(cell) && !/^-?0\d/.test(cell) ? Number(cell) : cell)),
    );
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
