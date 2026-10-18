import { promises as fs } from "node:fs";
import path from "node:path";

export type StaticDownload = {
  name: string;
  href: string;
  ext: "xlsx" | "xls" | "csv";
  bytes: number;
  modifiedAt: string;
};

const ALLOWED = new Set([".xlsx", ".xls", ".csv"]);

/**
 * Lists spreadsheet files placed in `public/downloads/`. Drop any .xlsx / .xls /
 * .csv supplier list into that folder and it appears on the homepage with a
 * download button — no code change required.
 */
export async function listStaticDownloads(): Promise<StaticDownload[]> {
  const folder = path.join(process.cwd(), "public", "downloads");
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && ALLOWED.has(path.extname(entry.name).toLowerCase()))
        .map(async (entry) => {
          const stats = await fs.stat(path.join(folder, entry.name));
          return {
            name: entry.name,
            href: `/downloads/${encodeURIComponent(entry.name)}`,
            ext: path.extname(entry.name).slice(1).toLowerCase() as StaticDownload["ext"],
            bytes: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          };
        }),
    );
    return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  } catch {
    return [];
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
