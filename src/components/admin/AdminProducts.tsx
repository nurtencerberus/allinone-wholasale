"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Dimensions, PriceTier } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { CATEGORIES, categoryName } from "@/lib/site";

export type AdminProduct = {
  id: number;
  slug: string;
  sku: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  story: string;
  brand: string;
  origin: string;
  msrpUnit: number;
  casePrice: number;
  caseSize: number;
  minCases: number;
  priceTiers: PriceTier[];
  weightLbs: number;
  dimensions: Dimensions;
  stock: number;
  leadTimeDays: number;
  image: string;
  images: string[];
  features: string[];
  specs: { label: string; value: string }[];
  badges: string[];
  featured: boolean;
  active: boolean;
  reviewCount: number;
};

type FormState = {
  id: number | null;
  name: string;
  sku: string;
  category: string;
  brand: string;
  origin: string;
  tagline: string;
  description: string;
  story: string;
  caseSize: string;
  casePrice: string;
  msrp: string;
  minCases: string;
  tiers: { minCases: string; casePrice: string }[];
  weightLbs: string;
  l: string;
  w: string;
  h: string;
  stock: string;
  leadTimeDays: string;
  images: string[];
  featuresText: string;
  specsText: string;
  badgesText: string;
  featured: boolean;
  active: boolean;
};

const EMPTY: FormState = {
  id: null,
  name: "",
  sku: "",
  category: "supplements",
  brand: "",
  origin: "",
  tagline: "",
  description: "",
  story: "",
  caseSize: "12",
  casePrice: "",
  msrp: "",
  minCases: "1",
  tiers: [],
  weightLbs: "",
  l: "",
  w: "",
  h: "",
  stock: "50",
  leadTimeDays: "2",
  images: [],
  featuresText: "",
  specsText: "",
  badgesText: "",
  featured: false,
  active: true,
};

const toDollars = (cents: number) => (cents / 100).toFixed(2);

const toCents = (value: string) => {
  const number = Number(value.replace(/[$,\s]/g, ""));
  return value.trim() && Number.isFinite(number) ? Math.round(number * 100) : Number.NaN;
};

const fromProduct = (product: AdminProduct): FormState => ({
  id: product.id,
  name: product.name,
  sku: product.sku,
  category: product.category,
  brand: product.brand,
  origin: product.origin,
  tagline: product.tagline,
  description: product.description,
  story: product.story,
  caseSize: String(product.caseSize),
  casePrice: toDollars(product.casePrice),
  msrp: toDollars(product.msrpUnit),
  minCases: String(product.minCases),
  tiers: product.priceTiers.map((tier) => ({
    minCases: String(tier.minCases),
    casePrice: toDollars(tier.casePrice),
  })),
  weightLbs: String(product.weightLbs),
  l: String(product.dimensions.l),
  w: String(product.dimensions.w),
  h: String(product.dimensions.h),
  stock: String(product.stock),
  leadTimeDays: String(product.leadTimeDays),
  images: product.images.length ? product.images : [product.image],
  featuresText: product.features.join("\n"),
  specsText: product.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n"),
  badgesText: product.badges.join(", "),
  featured: product.featured,
  active: product.active,
});

function parseSpecs(text: string) {
  return text
    .split(/\n+/)
    .map((line) => {
      const index = line.indexOf(":");
      if (index < 1) return null;
      return { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    })
    .filter((row): row is { label: string; value: string } => Boolean(row && row.label && row.value));
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-ink/10 pt-5 first:border-0 first:pt-0">
      <legend className="flex items-center gap-2 text-[12px] font-bold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-cream">{step}</span>
        {title}
      </legend>
      {hint ? <p className="mt-1 text-[10.5px] leading-relaxed text-ink/50">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

export function AdminProducts({ products }: { products: AdminProduct[] }) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | "live" | "archived">("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (department !== "all" && product.category !== department) return false;
      if (status === "live" && !product.active) return false;
      if (status === "archived" && product.active) return false;
      if (!needle) return true;
      return [product.name, product.sku, product.brand].join(" ").toLowerCase().includes(needle);
    });
  }, [products, query, department, status]);

  const liveCount = products.filter((product) => product.active).length;

  const metrics = useMemo(() => {
    if (!form) return null;
    const casePrice = toCents(form.casePrice);
    const caseSize = Number(form.caseSize);
    const msrp = form.msrp.trim() ? toCents(form.msrp) : Number.NaN;
    const l = Number(form.l);
    const w = Number(form.w);
    const h = Number(form.h);
    const weight = Number(form.weightLbs);
    const unitCost = Number.isFinite(casePrice) && caseSize > 0 ? Math.round(casePrice / caseSize) : null;
    const effectiveMsrp = Number.isFinite(msrp) ? msrp : unitCost !== null ? Math.round(unitCost * 1.6) : null;
    const margin =
      unitCost !== null && effectiveMsrp
        ? Math.round(((effectiveMsrp - unitCost) / effectiveMsrp) * 100)
        : null;
    const dim = l > 0 && w > 0 && h > 0 ? (l * w * h) / 139 : null;
    const billable = dim !== null && weight > 0 ? Math.max(weight, Math.round(dim * 10) / 10) : null;
    return { unitCost, effectiveMsrp, margin, dim, billable, msrpDefaulted: !Number.isFinite(msrp) };
  }, [form]);

  const openEditor = (next: FormState) => {
    setForm(next);
    setError(null);
    setMessage(null);
    setImageUrl("");
    window.setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const patchForm = (patch: Partial<FormState>) => setForm((current) => (current ? { ...current, ...patch } : current));

  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !form) return;
    setUploading(true);
    setError(null);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/admin/product-images", { method: "POST", body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Upload failed.");
        added.push(data.url as string);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Upload failed.");
      }
    }
    if (added.length) setForm((current) => (current ? { ...current, images: [...current.images, ...added].slice(0, 8) } : current));
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const suggestTiers = () => {
    const base = toCents(form?.casePrice ?? "");
    if (!Number.isFinite(base)) return setError("Enter the case price first, then suggest tiers.");
    setError(null);
    patchForm({
      tiers: [
        { minCases: "2", casePrice: toDollars(Math.round(base * 0.95)) },
        { minCases: "5", casePrice: toDollars(Math.round(base * 0.9)) },
        { minCases: "10", casePrice: toDollars(Math.round(base * 0.84)) },
      ],
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const payload = {
      full: true,
      name: form.name,
      sku: form.sku,
      category: form.category,
      brand: form.brand,
      origin: form.origin,
      tagline: form.tagline,
      description: form.description,
      story: form.story,
      caseSize: form.caseSize,
      casePrice: toCents(form.casePrice),
      msrpUnit: form.msrp.trim() ? toCents(form.msrp) : undefined,
      minCases: form.minCases,
      priceTiers: form.tiers
        .filter((tier) => tier.minCases.trim() || tier.casePrice.trim())
        .map((tier) => ({ minCases: Number(tier.minCases), casePrice: toCents(tier.casePrice) })),
      weightLbs: form.weightLbs,
      dimensions: { l: form.l, w: form.w, h: form.h },
      stock: form.stock,
      leadTimeDays: form.leadTimeDays,
      images: form.images,
      features: form.featuresText.split(/\n+/),
      specs: parseSpecs(form.specsText),
      badges: form.badgesText.split(","),
      featured: form.featured,
      active: form.active,
    };

    try {
      const response = await fetch(form.id ? `/api/admin/products/${form.id}` : "/api/admin/products", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the product.");
      setMessage(data.message as string);
      setForm(null);
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the product.");
    } finally {
      setBusy(false);
    }
  };

  const quickPatch = async (product: AdminProduct, body: Record<string, unknown>) => {
    setRowBusy(product.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
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

  const remove = async (product: AdminProduct) => {
    if (
      !window.confirm(
        `Permanently delete “${product.name}”?\n\nPast orders keep their line items. To hide it from the store without deleting, use Archive instead.`,
      )
    ) {
      return;
    }
    setRowBusy(product.id);
    const response = await fetch(`/api/admin/products/${product.id}`, { method: "DELETE" });
    const data = await response.json();
    setRowBusy(null);
    if (!response.ok) return setError(data.error ?? "Could not delete the product.");
    setMessage(data.message as string);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", `All (${products.length})`],
              ["live", `Live (${liveCount})`],
              ["archived", `Archived (${products.length - liveCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                status === key ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink/60 hover:border-ink/40"
              }`}
            >
              {label}
            </button>
          ))}
          <select
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            className="rounded-full border border-ink/15 bg-[#fffdf8] px-3 py-1.5 text-[11px] font-semibold"
            aria-label="Filter by department"
          >
            <option value="all">All departments</option>
            {CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>
                {category.shortName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, SKU, brand…"
              className="w-[220px] rounded-full border border-ink/15 bg-[#fffdf8] py-2 pl-8 pr-3 text-[12px] focus:border-ink/40 focus:outline-none"
            />
          </div>
          <button onClick={() => openEditor({ ...EMPTY })} className="btn btn-primary btn-sm">
            <Plus size={14} /> Add product
          </button>
        </div>
      </div>

      {message ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-fern/25 bg-fern/5 px-4 py-3 text-[12px] font-semibold text-fern">
          <Check size={14} className="mt-0.5 shrink-0" /> {message}
        </p>
      ) : null}
      {error && !form ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-clay/30 bg-clay/10 px-4 py-3 text-[12px] font-medium text-clay">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {/* Editor ---------------------------------------------------- */}
      {form ? (
        <div ref={editorRef} className="card mt-4 scroll-mt-28 overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink/10 bg-parchment/50 px-5 py-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] uppercase">
                {form.id ? "Edit product" : "New product"}
              </p>
              <p className="mt-0.5 text-[10.5px] text-ink/45">
                {form.id
                  ? "Changes go live the moment you save."
                  : "Fill the required fields — everything else gets a sensible default."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label="Close editor"
              className="rounded-full p-2 text-ink/50 hover:bg-ink/5 hover:text-ink"
            >
              <X size={17} />
            </button>
          </div>

          <form onSubmit={save} className="grid gap-6 p-5 lg:grid-cols-[1fr_300px]">
            <div className="space-y-6">
              <Section step={1} title="Basics">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-name">Product name *</label>
                    <input
                      id="pf-name"
                      className="field"
                      required
                      value={form.name}
                      onChange={(event) => patchForm({ name: event.target.value })}
                      placeholder="Collagen Peptides, Grass-Fed (16 oz)"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-sku">SKU *</label>
                    <input
                      id="pf-sku"
                      className="field font-mono uppercase"
                      required
                      value={form.sku}
                      onChange={(event) => patchForm({ sku: event.target.value.toUpperCase() })}
                      placeholder="MSC-COL-016"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-category">Department *</label>
                    <select
                      id="pf-category"
                      className="field"
                      value={form.category}
                      onChange={(event) => patchForm({ category: event.target.value })}
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-brand">Brand</label>
                    <input
                      id="pf-brand"
                      className="field"
                      value={form.brand}
                      onChange={(event) => patchForm({ brand: event.target.value })}
                      placeholder="Meridian Labs"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-origin">Origin</label>
                    <input
                      id="pf-origin"
                      className="field"
                      value={form.origin}
                      onChange={(event) => patchForm({ origin: event.target.value })}
                      placeholder="Pittsburgh, PA"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-tagline">Tagline</label>
                    <input
                      id="pf-tagline"
                      className="field"
                      value={form.tagline}
                      onChange={(event) => patchForm({ tagline: event.target.value })}
                      placeholder="16 oz tub · unflavoured · case of 12"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-description">Description *</label>
                    <textarea
                      id="pf-description"
                      className="field min-h-[110px]"
                      required
                      value={form.description}
                      onChange={(event) => patchForm({ description: event.target.value })}
                      placeholder="What it is, who buys it, certifications. Leave a blank line to start a new paragraph."
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-story">Sourcing note</label>
                    <textarea
                      id="pf-story"
                      className="field min-h-[70px]"
                      value={form.story}
                      onChange={(event) => patchForm({ story: event.target.value })}
                      placeholder="Where it is made and why buyers trust it (optional)"
                    />
                  </div>
                </div>
              </Section>

              <Section
                step={2}
                title="Case pricing"
                hint="Prices are per case in US dollars. Volume tiers apply automatically at checkout."
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="label" htmlFor="pf-size">Units / case *</label>
                    <input
                      id="pf-size"
                      className="field"
                      inputMode="numeric"
                      required
                      value={form.caseSize}
                      onChange={(event) => patchForm({ caseSize: event.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-price">Case price ($) *</label>
                    <input
                      id="pf-price"
                      className="field"
                      inputMode="decimal"
                      required
                      value={form.casePrice}
                      onChange={(event) => patchForm({ casePrice: event.target.value })}
                      placeholder="144.00"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-msrp">MSRP / unit ($)</label>
                    <input
                      id="pf-msrp"
                      className="field"
                      inputMode="decimal"
                      value={form.msrp}
                      onChange={(event) => patchForm({ msrp: event.target.value })}
                      placeholder="auto"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-min">Min. order (cases)</label>
                    <input
                      id="pf-min"
                      className="field"
                      inputMode="numeric"
                      value={form.minCases}
                      onChange={(event) => patchForm({ minCases: event.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-ink/10 bg-parchment/30 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10.5px] font-bold tracking-[0.12em] text-ink/50 uppercase">Volume tiers</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={suggestTiers} className="btn btn-outline btn-sm">
                        Suggest 5 / 10 / 16% tiers
                      </button>
                      {form.tiers.length < 5 ? (
                        <button
                          type="button"
                          onClick={() => patchForm({ tiers: [...form.tiers, { minCases: "", casePrice: "" }] })}
                          className="btn btn-outline btn-sm"
                        >
                          <Plus size={12} /> Tier
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {form.tiers.length === 0 ? (
                    <p className="mt-2 text-[11px] text-ink/45">No volume discounts — every case is the list price.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {form.tiers.map((tier, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            className="field w-[110px]"
                            inputMode="numeric"
                            aria-label={`Tier ${index + 1} minimum cases`}
                            value={tier.minCases}
                            onChange={(event) =>
                              patchForm({
                                tiers: form.tiers.map((row, rowIndex) =>
                                  rowIndex === index ? { ...row, minCases: event.target.value.replace(/\D/g, "") } : row,
                                ),
                              })
                            }
                            placeholder="Cases"
                          />
                          <span className="text-[11px] text-ink/40">+ cases at $</span>
                          <input
                            className="field w-[130px]"
                            inputMode="decimal"
                            aria-label={`Tier ${index + 1} case price`}
                            value={tier.casePrice}
                            onChange={(event) =>
                              patchForm({
                                tiers: form.tiers.map((row, rowIndex) =>
                                  rowIndex === index ? { ...row, casePrice: event.target.value } : row,
                                ),
                              })
                            }
                            placeholder="Case price"
                          />
                          <button
                            type="button"
                            onClick={() => patchForm({ tiers: form.tiers.filter((_, rowIndex) => rowIndex !== index) })}
                            aria-label="Remove tier"
                            className="rounded p-2 text-ink/35 hover:bg-clay/10 hover:text-clay"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>

              <Section
                step={3}
                title="Freight data"
                hint="Carton weight and dimensions drive dimensional-weight freight and LTL pricing at checkout. Measure the packed case."
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="label" htmlFor="pf-weight">Weight (lb) *</label>
                    <input
                      id="pf-weight"
                      className="field"
                      inputMode="numeric"
                      required
                      value={form.weightLbs}
                      onChange={(event) => patchForm({ weightLbs: event.target.value.replace(/\D/g, "") })}
                      placeholder="15"
                    />
                  </div>
                  {(
                    [
                      ["l", "Length (in) *"],
                      ["w", "Width (in) *"],
                      ["h", "Height (in) *"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <label className="label" htmlFor={`pf-${key}`}>{label}</label>
                      <input
                        id={`pf-${key}`}
                        className="field"
                        inputMode="numeric"
                        required
                        value={form[key]}
                        onChange={(event) => patchForm({ [key]: event.target.value.replace(/\D/g, "") } as Partial<FormState>)}
                        placeholder="12"
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section step={4} title="Inventory & dispatch">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="label" htmlFor="pf-stock">Stock (cases) *</label>
                    <input
                      id="pf-stock"
                      className="field"
                      inputMode="numeric"
                      required
                      value={form.stock}
                      onChange={(event) => patchForm({ stock: event.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-lead">Dispatch (days)</label>
                    <input
                      id="pf-lead"
                      className="field"
                      inputMode="numeric"
                      value={form.leadTimeDays}
                      onChange={(event) => patchForm({ leadTimeDays: event.target.value.replace(/\D/g, "") })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-badges">Badges (comma separated)</label>
                    <input
                      id="pf-badges"
                      className="field"
                      value={form.badgesText}
                      onChange={(event) => patchForm({ badgesText: event.target.value })}
                      placeholder="New, NSF certified"
                    />
                  </div>
                </div>
              </Section>

              <Section step={5} title="Photos" hint="The first photo is the main image. JPG, PNG, WebP or GIF, up to 5 MB each, 8 photos max.">
                <div className="flex flex-wrap gap-3">
                  {form.images.map((url, index) => (
                    <div key={url} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Product photo ${index + 1}`}
                        className={`h-[92px] w-[92px] rounded-lg border object-cover ${
                          index === 0 ? "border-ink ring-2 ring-ink/15" : "border-ink/15"
                        }`}
                      />
                      {index === 0 ? (
                        <span className="absolute left-1 top-1 rounded bg-ink px-1.5 py-0.5 text-[8.5px] font-bold text-cream uppercase">
                          Main
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            patchForm({ images: [url, ...form.images.filter((_, imageIndex) => imageIndex !== index)] })
                          }
                          className="absolute bottom-1 left-1 hidden rounded bg-ink/85 px-1.5 py-0.5 text-[8.5px] font-bold text-cream group-hover:block"
                        >
                          Make main
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => patchForm({ images: form.images.filter((_, imageIndex) => imageIndex !== index) })}
                        aria-label="Remove photo"
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-clay p-1 text-white shadow"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  {form.images.length < 8 ? (
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                      className="flex h-[92px] w-[92px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink/20 text-ink/45 hover:border-ink/40 hover:text-ink/70"
                    >
                      {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                      <span className="text-[10px] font-bold">{uploading ? "Uploading" : "Add photos"}</span>
                    </button>
                  ) : null}
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void uploadPhotos(event.target.files)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    className="field"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    placeholder="…or paste an image URL (https://…)"
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm shrink-0"
                    onClick={() => {
                      const url = imageUrl.trim();
                      if (!/^https?:\/\/\S+$/i.test(url) && !/^\/(?!\/)\S*$/.test(url)) {
                        return setError("Enter a full https:// image URL or a /path on this site.");
                      }
                      setError(null);
                      patchForm({ images: Array.from(new Set([...form.images, url])).slice(0, 8) });
                      setImageUrl("");
                    }}
                  >
                    Add URL
                  </button>
                </div>
                {form.images.length === 0 ? (
                  <p className="mt-2 text-[10.5px] text-ink/45">
                    No photo? The department’s default image is used until you add one.
                  </p>
                ) : null}
              </Section>

              <Section step={6} title="Details (optional)">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="pf-features">What ships in the case</label>
                    <textarea
                      id="pf-features"
                      className="field min-h-[110px]"
                      value={form.featuresText}
                      onChange={(event) => patchForm({ featuresText: event.target.value })}
                      placeholder={"One bullet per line\nNSF Certified for Sport\nLot-matched CoA in every case"}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-specs">Specifications</label>
                    <textarea
                      id="pf-specs"
                      className="field min-h-[110px]"
                      value={form.specsText}
                      onChange={(event) => patchForm({ specsText: event.target.value })}
                      placeholder={"Label: value, one per line\nShelf life: 24 months\nCertifications: NSF, Non-GMO"}
                    />
                    <p className="mt-1 text-[10px] text-ink/40">Left blank, units / MSRP / weight specs are generated.</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-[12px] font-medium">
                    <input
                      type="checkbox"
                      checked={form.featured}
                      onChange={(event) => patchForm({ featured: event.target.checked })}
                      className="accent-[#14241c]"
                    />
                    Feature on the homepage
                  </label>
                  <label className="flex items-center gap-2 text-[12px] font-medium">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(event) => patchForm({ active: event.target.checked })}
                      className="accent-[#14241c]"
                    />
                    Live in the store
                  </label>
                </div>
              </Section>
            </div>

            {/* Live summary ---------------------------------------- */}
            <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
              <div className="rounded-xl border border-ink/10 bg-parchment/40 p-4">
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/45 uppercase">Live summary</p>
                <dl className="mt-3 space-y-2.5 text-[12px]">
                  {[
                    ["Cost per unit", metrics?.unitCost != null ? formatMoney(metrics.unitCost) : "—"],
                    [
                      `MSRP / unit${metrics?.msrpDefaulted ? " (auto 1.6×)" : ""}`,
                      metrics?.effectiveMsrp != null ? formatMoney(metrics.effectiveMsrp) : "—",
                    ],
                    ["Retailer margin", metrics?.margin != null ? `${metrics.margin}%` : "—"],
                    ["Dimensional weight", metrics?.dim != null ? `${metrics.dim.toFixed(1)} lb` : "—"],
                    ["Billable per case", metrics?.billable != null ? `${metrics.billable.toFixed(1)} lb` : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-ink/8 pb-2 last:border-0 last:pb-0">
                      <dt className="text-ink/50">{label}</dt>
                      <dd className="font-bold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {metrics?.margin != null && metrics.margin < 20 ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-md bg-clay/10 px-2.5 py-2 text-[10.5px] text-clay">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> Margin under 20% is hard to sell to
                    retailers — check the case price or MSRP.
                  </p>
                ) : null}
                {metrics?.billable != null && metrics.billable >= 40 ? (
                  <p className="mt-3 rounded-md bg-gold/15 px-2.5 py-2 text-[10.5px] text-[#7a5a1f]">
                    Heavy carton — this SKU can trigger LTL freight at checkout.
                  </p>
                ) : null}
              </div>

              {error ? (
                <p className="flex items-start gap-2 rounded-lg border border-clay/30 bg-clay/10 px-3 py-2.5 text-[11.5px] font-medium text-clay">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}

              <button type="submit" disabled={busy || uploading} className="btn btn-primary w-full">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {form.id ? "Save changes" : form.active ? "Create & publish" : "Save as archived"}
              </button>
              <button type="button" onClick={() => setForm(null)} className="btn btn-outline w-full">
                Cancel
              </button>
            </aside>
          </form>
        </div>
      ) : null}

      {/* Product table -------------------------------------------- */}
      <div className="card mt-4 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[11.5px]">
            <thead className="bg-parchment/50 text-[9.5px] font-bold tracking-[0.1em] text-ink/45 uppercase">
              <tr className="border-b border-ink/10">
                <th className="px-4 py-3">Product</th>
                <th className="px-2 py-3">Department</th>
                <th className="px-2 py-3 text-right">Case</th>
                <th className="px-2 py-3">Pack</th>
                <th className="px-2 py-3">Stock</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className={`border-b border-ink/6 last:border-0 ${product.active ? "" : "bg-ink/[0.03]"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={product.image}
                        alt=""
                        className={`h-11 w-11 rounded-md border border-ink/10 object-cover ${product.active ? "" : "opacity-50 grayscale"}`}
                      />
                      <div className="min-w-0">
                        <p className="max-w-[300px] truncate text-[12.5px] font-bold" title={product.name}>
                          {product.name}
                        </p>
                        <p className="font-mono text-[10px] font-bold text-fern">{product.sku}</p>
                        <p className="text-[10px] text-ink/40">{product.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-ink/60">{categoryName(product.category)}</td>
                  <td className="px-2 py-3 text-right">
                    <p className="font-bold tabular-nums">{formatMoney(product.casePrice)}</p>
                    <p className="text-[9.5px] text-ink/40">{formatMoney(Math.round(product.casePrice / product.caseSize))}/unit</p>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap text-ink/60">{product.caseSize} / case</td>
                  <td className="px-2 py-3">
                    <input
                      key={`${product.id}-${product.stock}`}
                      type="number"
                      min={0}
                      defaultValue={product.stock}
                      aria-label={`Stock for ${product.name}`}
                      disabled={rowBusy === product.id}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (Number.isFinite(next) && next !== product.stock) void quickPatch(product, { stock: next });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                      }}
                      className={`w-[72px] rounded border bg-white px-2 py-1 text-[11.5px] font-bold tabular-nums ${
                        product.stock <= 10 ? "border-clay/40 text-clay" : "border-ink/20"
                      }`}
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${
                          product.active ? "bg-fern/15 text-fern" : "bg-ink/10 text-ink/50"
                        }`}
                      >
                        {product.active ? "Live" : "Archived"}
                      </span>
                      <button
                        type="button"
                        onClick={() => quickPatch(product, { featured: !product.featured })}
                        disabled={rowBusy === product.id}
                        aria-label={product.featured ? "Remove from homepage" : "Feature on homepage"}
                        title={product.featured ? "Featured on the homepage" : "Feature on the homepage"}
                        className="rounded p-1 hover:bg-gold/15"
                      >
                        <Star size={14} className={product.featured ? "fill-gold text-gold" : "text-ink/25"} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditor(fromProduct(product))}
                        className="btn btn-outline btn-sm"
                        title="Edit"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor({ ...fromProduct(product), id: null, sku: "", name: `${product.name} (copy)`, active: false })}
                        className="rounded-full border border-ink/15 p-2 text-ink/55 hover:border-ink/40 hover:text-ink"
                        title="Duplicate as a new product"
                        aria-label={`Duplicate ${product.name}`}
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => quickPatch(product, { active: !product.active })}
                        disabled={rowBusy === product.id}
                        className="rounded-full border border-ink/15 p-2 text-ink/55 hover:border-ink/40 hover:text-ink"
                        title={product.active ? "Archive (hide from store)" : "Restore to the store"}
                        aria-label={product.active ? `Archive ${product.name}` : `Restore ${product.name}`}
                      >
                        {rowBusy === product.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : product.active ? (
                          <Archive size={12} />
                        ) : (
                          <ArchiveRestore size={12} />
                        )}
                      </button>
                      <Link
                        href={`/products/${product.slug}`}
                        target="_blank"
                        className="rounded-full border border-ink/15 p-2 text-ink/55 hover:border-ink/40 hover:text-ink"
                        title="View product page"
                        aria-label={`View ${product.name}`}
                      >
                        <ExternalLink size={12} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(product)}
                        disabled={rowBusy === product.id}
                        className="rounded-full border border-clay/25 p-2 text-clay hover:bg-clay/10"
                        title="Delete permanently"
                        aria-label={`Delete ${product.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-[12px] text-ink/45">
                    No products match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink/10 bg-parchment/30 px-4 py-2.5 text-[10px] text-ink/45">
          Edit stock in place — press Enter or click away to save. Archived products disappear from the store,
          search, sitemap and order sheets but stay in your order history.
        </p>
      </div>
    </div>
  );
}
