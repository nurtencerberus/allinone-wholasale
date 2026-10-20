"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, Download, Eye, EyeOff, FileSpreadsheet, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { formatDate } from "@/lib/money";
import { categoryName } from "@/lib/site";

export type AdminListRow = {
  id: number;
  title: string;
  supplier: string;
  description: string;
  category: string;
  audience: string;
  filename: string;
  format: string;
  bytes: number;
  rowCount: number;
  published: boolean;
  downloads: number;
  updatedAt: string;
};

const EMPTY = { title: "", supplier: "", description: "", category: "mixed", audience: "public" };

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function AdminLists({ lists }: { lists: AdminListRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return setError("Choose an .xlsx, .xls or .csv file first.");
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      Object.entries(values).forEach(([key, value]) => form.append(key, value));
      const response = await fetch("/api/admin/lists", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Upload failed.");
      setMessage(data.message as string);
      setValues(EMPTY);
      setFile(null);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    setRowBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/lists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Update failed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (list: AdminListRow) => {
    if (!window.confirm(`Delete “${list.title}”? This removes the file permanently.`)) return;
    setRowBusy(list.id);
    await fetch(`/api/admin/lists/${list.id}`, { method: "DELETE" });
    setRowBusy(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={upload} className="card h-fit p-5">
        <p className="flex items-center gap-2 text-[12px] font-bold">
          <Upload size={14} /> Publish a supplier list
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink/70">
          Upload the .xlsx / .xls / .csv you received from a wholesaler. It appears in the homepage
          “Wholesale lists” section, downloadable in both Excel and CSV.
        </p>

        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`mt-4 flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
            file ? "border-fern bg-fern/5" : "border-ink/18 bg-parchment/25 hover:border-ink/35"
          }`}
        >
          <FileSpreadsheet size={20} className={file ? "text-fern" : "text-ink/65"} />
          <span className="text-[12px] font-bold">{file ? file.name : "Choose file"}</span>
          <span className="text-[10.5px] text-ink/65">
            {file ? formatBytes(file.size) : ".xlsx · .xls · .csv — up to 4 MB"}
          </span>
        </button>
        <input aria-label="Supplier list file"
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            setFile(picked);
            if (picked && !values.title) {
              setValues((current) => ({ ...current, title: picked.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") }));
            }
          }}
        />

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="supplier">Supplier / wholesaler *</label>
            <input
              id="supplier"
              className="field"
              required
              value={values.supplier}
              onChange={(event) => setValues({ ...values, supplier: event.target.value })}
              placeholder="Aura BioSciences"
            />
          </div>
          <div>
            <label className="label" htmlFor="title">List title</label>
            <input
              id="title"
              className="field"
              value={values.title}
              onChange={(event) => setValues({ ...values, title: event.target.value })}
              placeholder="Q4 2026 supplements price list"
            />
          </div>
          <div>
            <label className="label" htmlFor="description">Description</label>
            <textarea
              id="description"
              className="field min-h-[70px]"
              value={values.description}
              onChange={(event) => setValues({ ...values, description: event.target.value })}
              placeholder="What buyers will find in this list"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="category">Department</label>
              <select
                id="category"
                className="field"
                value={values.category}
                onChange={(event) => setValues({ ...values, category: event.target.value })}
              >
                <option value="mixed">All departments</option>
                <option value="supplements">Supplements</option>
                <option value="pantry">Pantry</option>
                <option value="home">Home</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="audience">Visible to</label>
              <select
                id="audience"
                className="field"
                value={values.audience}
                onChange={(event) => setValues({ ...values, audience: event.target.value })}
              >
                <option value="public">Everyone</option>
                <option value="trade">Trade accounts only</option>
              </select>
            </div>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-clay/30 bg-clay/10 px-3 py-2 text-[11px] text-clay">{error}</p>
        ) : null}
        {message ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-md border border-fern/30 bg-fern/8 px-3 py-2 text-[11px] font-medium text-fern">
            <Check size={13} className="mt-0.5 shrink-0" /> {message}
          </p>
        ) : null}

        <button type="submit" disabled={busy} className="btn btn-primary mt-4 w-full">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload &amp; publish
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-ink/65">
          Supplier pricing can be sensitive — choose “Trade accounts only” to hide the preview and download
          from anonymous visitors.
        </p>
      </form>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-4 py-3">
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase">Published lists</p>
          <span className="text-[10.5px] text-ink/65">{lists.length} total</span>
        </div>

        {lists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
            <FileSpreadsheet size={26} className="text-ink/25" />
            <p className="text-[12.5px] font-bold">No lists yet</p>
            <p className="max-w-xs text-[11px] text-ink/68">
              Upload your first supplier file — it goes live on the homepage immediately.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/8">
            {lists.map((list) => (
              <li key={list.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-fern uppercase">{list.supplier}</p>
                    <p className="mt-0.5 text-[13px] font-bold leading-snug">{list.title}</p>
                    <p className="mt-0.5 text-[10.5px] text-ink/65">
                      {list.filename} · {list.format.toUpperCase()} · {formatBytes(list.bytes)} · {list.rowCount} rows ·{" "}
                      {list.category === "mixed" ? "All departments" : categoryName(list.category)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink/50">
                      Updated {formatDate(list.updatedAt)} · {list.downloads} download{list.downloads === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${
                        list.published ? "bg-fern/15 text-fern" : "bg-ink/10 text-ink/68"
                      }`}
                    >
                      {list.published ? "Live" : "Hidden"}
                    </span>
                    {list.audience === "trade" ? (
                      <span className="flex items-center gap-1 rounded-full bg-gold/20 px-2 py-1 text-[9px] font-bold text-[#7a5a1f] uppercase">
                        <Lock size={9} /> Trade
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Audience for ${list.title}`}
                    value={list.audience}
                    disabled={rowBusy === list.id}
                    onChange={(event) => patch(list.id, { audience: event.target.value })}
                    className="rounded border border-ink/20 bg-white px-2 py-1.5 text-[10.5px]"
                  >
                    <option value="public">Everyone</option>
                    <option value="trade">Trade only</option>
                  </select>
                  <button
                    onClick={() => patch(list.id, { published: !list.published })}
                    disabled={rowBusy === list.id}
                    className="btn btn-outline btn-sm"
                  >
                    {rowBusy === list.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : list.published ? (
                      <EyeOff size={12} />
                    ) : (
                      <Eye size={12} />
                    )}
                    {list.published ? "Unpublish" : "Publish"}
                  </button>
                  <a
                    href={`/api/wholesale-lists/${list.id}/download?format=xlsx`}
                    download
                    className="btn btn-outline btn-sm"
                  >
                    <Download size={12} /> .xlsx
                  </a>
                  <a
                    href={`/api/wholesale-lists/${list.id}/download?format=csv`}
                    download
                    className="btn btn-outline btn-sm"
                  >
                    <Download size={12} /> .csv
                  </a>
                  <button
                    onClick={() => remove(list)}
                    disabled={rowBusy === list.id}
                    className="btn btn-sm ml-auto border border-clay/30 text-clay hover:bg-clay/10"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
