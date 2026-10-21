"use client";

import { useState } from "react";
import { FileUp, Trash2 } from "lucide-react";

type Document = { id: number; label: string; filename: string; bytes: number };

const KINDS: { value: string; label: string }[] = [
  { value: "resale_certificate", label: "Resale certificate" },
  { value: "w9", label: "W-9" },
  { value: "business_license", label: "Business licence" },
  { value: "other", label: "Other document" },
];

/** KYT-11: the applicant sends the paperwork the trade desk has to verify. */
export function ApplicationDocuments({ documents, canEdit }: { documents: Document[]; canEdit: boolean }) {
  const [kind, setKind] = useState("resale_certificate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      const response = await fetch("/api/wholesale/documents", { method: "POST", body: form });
      const data = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not upload that document.");
        return;
      }
      setNotice(data.message ?? "Uploaded.");
      window.location.reload();
    } catch {
      setError("Network error — the document was not uploaded.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/wholesale/documents?id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not remove that document.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 card p-4">
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] uppercase">
        <FileUp size={13} /> Application documents
      </p>
      {error ? (
        <p role="alert" className="mt-2 rounded-md border border-clay/40 bg-clay/10 px-3 py-2 text-[11.5px] font-semibold text-clay">
          {error}
        </p>
      ) : null}
      {notice ? <p className="mt-2 text-[11.5px] font-semibold text-fern">{notice}</p> : null}

      {documents.length ? (
        <ul className="mt-2 space-y-1 text-[11.5px]">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-3">
              <span>
                <strong className="font-semibold">{document.label}</strong>{" "}
                <span className="text-ink/65">
                  {document.filename} · {Math.max(1, Math.round(document.bytes / 1024))} KB
                </span>
              </span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${document.filename}`}
                  onClick={() => void remove(document.id)}
                  className="rounded p-1 text-ink/45 hover:text-clay"
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11.5px] text-ink/68">
          Send your resale certificate so the trade desk can approve tax exemption. PDF or a clear photo, up to 4 MB.
        </p>
      )}

      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="label">Document type</span>
            <select aria-label="Document type" className="field w-52" value={kind} onChange={(event) => setKind(event.target.value)}>
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">File</span>
            <input
              aria-label="Document file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={busy}
              className="field w-64"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
