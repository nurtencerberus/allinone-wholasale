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
import type { Product } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { ozToLbs } from "@/lib/weight";
import { ALLERGENS, amazonUrl, FREIGHT_CLASSES } from "@/lib/product-data";
import { CATEGORIES, categoryName } from "@/lib/site";
import { defaultTaxClass } from "@/lib/tax";

/** Staff-only view of a product (includes cost). `updatedAt` is the edit version. */
export type AdminProduct = Omit<Product, "createdAt" | "updatedAt" | "ratingX10"> & { updatedAt: string };

type FormState = {
  id: number | null;
  name: string;
  sku: string;
  category: string;
  taxClass: string;
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
  leadTimeDays: string;
  images: string[];
  featuresText: string;
  specsText: string;
  badgesText: string;
  featured: boolean;
  active: boolean;
  updatedAt: string | null;
  stock: number;
  openingStock: string;
  openingLot: string;
  openingExpiresOn: string;
  reorderPoint: string;
  gtin: string;
  caseGtin: string;
  asin: string;
  mpn: string;
  manufacturer: string;
  supplierName: string;
  supplierSku: string;
  supplierUrl: string;
  costPrice: string;
  mapPrice: string;
  countryOfOrigin: string;
  unitsPerPallet: string;
  palletTi: string;
  palletHi: string;
  freightClass: string;
  nmfc: string;
  hazmat: boolean;
  unNumber: string;
  htsCode: string;
  shelfLifeDays: string;
  ingredients: string;
  allergens: string[];
  factsPanelImage: string;
  fdaDisclaimer: boolean;
  prop65Warning: string;
  certificationsText: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY: FormState = {
  id: null,
  name: "",
  sku: "",
  category: "supplements",
  taxClass: "supplement",
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
  leadTimeDays: "2",
  images: [],
  featuresText: "",
  specsText: "",
  badgesText: "",
  featured: false,
  active: true,
  updatedAt: null,
  stock: 0,
  openingStock: "",
  openingLot: "",
  openingExpiresOn: "",
  reorderPoint: "10",
  gtin: "",
  caseGtin: "",
  asin: "",
  mpn: "",
  manufacturer: "",
  supplierName: "",
  supplierSku: "",
  supplierUrl: "",
  costPrice: "",
  mapPrice: "",
  countryOfOrigin: "",
  unitsPerPallet: "",
  palletTi: "",
  palletHi: "",
  freightClass: "",
  nmfc: "",
  hazmat: false,
  unNumber: "",
  htsCode: "",
  shelfLifeDays: "",
  ingredients: "",
  allergens: [],
  factsPanelImage: "",
  fdaDisclaimer: true,
  prop65Warning: "",
  certificationsText: "",
  seoTitle: "",
  seoDescription: "",
};

const str = (value: number | string | null | undefined) => (value === null || value === undefined ? "" : String(value));
const optionalCents = (value: string) => (value.trim() ? toCents(value) : null);

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
  taxClass: product.taxClass,
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
  weightLbs: String(ozToLbs(product.weightOz)),
  l: String(product.dimensions.l),
  w: String(product.dimensions.w),
  h: String(product.dimensions.h),
  leadTimeDays: String(product.leadTimeDays),
  images: product.images.length ? product.images : [product.image],
  featuresText: product.features.join("\n"),
  specsText: product.specs.map((spec) => `${spec.label}: ${spec.value}`).join("\n"),
  badgesText: product.badges.join(", "),
  featured: product.featured,
  active: product.active,
  updatedAt: product.updatedAt,
  stock: product.stock,
  openingStock: "",
  openingLot: "",
  openingExpiresOn: "",
  reorderPoint: String(product.reorderPoint),
  gtin: str(product.gtin),
  caseGtin: str(product.caseGtin),
  asin: str(product.asin),
  mpn: str(product.mpn),
  manufacturer: str(product.manufacturer),
  supplierName: str(product.supplierName),
  supplierSku: str(product.supplierSku),
  supplierUrl: str(product.supplierUrl),
  costPrice: product.costPrice === null ? "" : toDollars(product.costPrice),
  mapPrice: product.mapPrice === null ? "" : toDollars(product.mapPrice),
  countryOfOrigin: str(product.countryOfOrigin),
  unitsPerPallet: str(product.unitsPerPallet),
  palletTi: str(product.palletTi),
  palletHi: str(product.palletHi),
  freightClass: str(product.freightClass),
  nmfc: str(product.nmfc),
  hazmat: product.hazmat,
  unNumber: str(product.unNumber),
  htsCode: str(product.htsCode),
  shelfLifeDays: str(product.shelfLifeDays),
  ingredients: str(product.ingredients),
  allergens: product.allergens,
  factsPanelImage: str(product.factsPanelImage),
  fdaDisclaimer: product.fdaDisclaimer,
  prop65Warning: str(product.prop65Warning),
  certificationsText: product.certifications.map((cert) => (cert.documentUrl ? `${cert.name} | ${cert.documentUrl}` : cert.name)).join("\n"),
  seoTitle: str(product.seoTitle),
  seoDescription: str(product.seoDescription),
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

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className={`field ${mono ? "font-mono" : ""}`} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-ink/10 pt-5 first:border-0 first:pt-0">
      <legend className="flex items-center gap-2 text-[12px] font-bold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-cream">{step}</span>
        {title}
      </legend>
      {hint ? <p className="mt-1 text-[10.5px] leading-relaxed text-ink/68">{hint}</p> : null}
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
      return [product.name, product.sku, product.brand, product.gtin ?? "", product.asin ?? "", product.mpn ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
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
    const landed = form.costPrice.trim() ? toCents(form.costPrice) : Number.NaN;
    const ourMargin =
      Number.isFinite(landed) && Number.isFinite(casePrice) && casePrice > 0
        ? Math.round(((casePrice - landed) / casePrice) * 100)
        : null;
    const effectiveMsrp = Number.isFinite(msrp) ? msrp : unitCost !== null ? Math.round(unitCost * 1.6) : null;
    const margin =
      unitCost !== null && effectiveMsrp
        ? Math.round(((effectiveMsrp - unitCost) / effectiveMsrp) * 100)
        : null;
    const dim = l > 0 && w > 0 && h > 0 ? (l * w * h) / 139 : null;
    const billable = dim !== null && weight > 0 ? Math.max(weight, Math.round(dim * 10) / 10) : null;
    return { unitCost, effectiveMsrp, margin, ourMargin, dim, billable, msrpDefaulted: !Number.isFinite(msrp) };
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
      taxClass: form.taxClass,
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
      leadTimeDays: form.leadTimeDays,
      images: form.images,
      features: form.featuresText.split(/\n+/),
      specs: parseSpecs(form.specsText),
      badges: form.badgesText.split(","),
      featured: form.featured,
      active: form.active,
      updatedAt: form.updatedAt,
      reorderPoint: form.reorderPoint,
      gtin: form.gtin,
      caseGtin: form.caseGtin,
      asin: form.asin,
      mpn: form.mpn,
      manufacturer: form.manufacturer,
      supplierName: form.supplierName,
      supplierSku: form.supplierSku,
      supplierUrl: form.supplierUrl,
      costPrice: optionalCents(form.costPrice),
      mapPrice: optionalCents(form.mapPrice),
      countryOfOrigin: form.countryOfOrigin,
      unitsPerPallet: form.unitsPerPallet,
      palletTi: form.palletTi,
      palletHi: form.palletHi,
      freightClass: form.freightClass,
      nmfc: form.nmfc,
      hazmat: form.hazmat,
      unNumber: form.unNumber,
      htsCode: form.htsCode,
      shelfLifeDays: form.shelfLifeDays,
      ingredients: form.ingredients,
      allergens: form.allergens,
      factsPanelImage: form.factsPanelImage,
      fdaDisclaimer: form.fdaDisclaimer,
      prop65Warning: form.prop65Warning,
      certifications: form.certificationsText
        .split(/\n+/)
        .map((line) => {
          const [name, documentUrl] = line.split("|").map((part) => part.trim());
          return { name, documentUrl: documentUrl || null };
        })
        .filter((cert) => cert.name),
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      ...(form.id
        ? {}
        : { openingStock: form.openingStock, openingLot: form.openingLot, openingExpiresOn: form.openingExpiresOn }),
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
                status === key ? "border-ink bg-ink text-cream" : "border-ink/15 text-ink/72 hover:border-ink/40"
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
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50" />
            <input aria-label="Search products"
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
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-clay/30 bg-clay/10 px-4 py-3 text-[12px] font-medium text-clay">
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
              <p className="mt-0.5 text-[10.5px] text-ink/65">
                {form.id
                  ? "Changes go live the moment you save."
                  : "Fill the required fields — everything else gets a sensible default."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label="Close editor"
              className="rounded-full p-2 text-ink/68 hover:bg-ink/5 hover:text-ink"
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
                      onChange={(event) =>
                        patchForm({ category: event.target.value, taxClass: defaultTaxClass(event.target.value) })
                      }
                    >
                      {CATEGORIES.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-tax-class">Sales-tax class *</label>
                    <select
                      id="pf-tax-class"
                      className="field"
                      value={form.taxClass}
                      onChange={(event) => patchForm({ taxClass: event.target.value })}
                      aria-describedby="pf-tax-class-note"
                    >
                      <option value="general">General merchandise (taxable)</option>
                      <option value="food">Food / grocery (NJ exempt)</option>
                      <option value="supplement">Dietary supplement with Supplement Facts label (NJ exempt)</option>
                      <option value="candy">Candy or soft drink (taxable)</option>
                    </select>
                    <p id="pf-tax-class-note" className="mt-1 text-[10px] text-ink/65">
                      Confirm each class with your accountant. Bars or drinks without a Supplement Facts label are not supplements.
                    </p>
                  </div>
                  <div>
                    <label className="label" htmlFor="pf-brand">Brand *</label>
                    <input
                      id="pf-brand"
                      className="field"
                      required
                      value={form.brand}
                      onChange={(event) => patchForm({ brand: event.target.value })}
                      placeholder="Ciputra Labs"
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
                    <p className="text-[10.5px] font-bold tracking-[0.12em] text-ink/68 uppercase">Volume tiers</p>
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
                    <p className="mt-2 text-[11px] text-ink/65">No volume discounts — every case is the list price.</p>
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
                          <span className="text-[11px] text-ink/65">+ cases at $</span>
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
                            className="rounded p-2 text-ink/50 hover:bg-clay/10 hover:text-clay"
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
                      inputMode="decimal"
                      required
                      value={form.weightLbs}
                      onChange={(event) => patchForm({ weightLbs: event.target.value.replace(/[^\d.]/g, "") })}
                      placeholder="15.5"
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

              <Section
                step={4}
                title="Inventory & dispatch"
                hint={
                  form.id
                    ? "Stock changes only through lots: receive goods or adjust a lot on the Inventory screen."
                    : "Opening stock becomes the product's first lot. Food and supplements need a best-by date."
                }
              >
                <div className="grid gap-3 sm:grid-cols-4">
                  {form.id ? (
                    <div>
                      <p className="label">Sellable stock</p>
                      <p className="py-2 text-[13px] font-bold tabular-nums">
                        {form.stock} cases ·{" "}
                        <Link href="/admin/inventory" className="text-[11px] font-semibold text-fern hover:underline">
                          manage lots
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="label" htmlFor="pf-opening">Opening stock (cases)</label>
                        <input
                          id="pf-opening"
                          className="field"
                          inputMode="numeric"
                          value={form.openingStock}
                          onChange={(event) => patchForm({ openingStock: event.target.value.replace(/\D/g, "") })}
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="pf-opening-lot">Lot number</label>
                        <input
                          id="pf-opening-lot"
                          className="field font-mono uppercase"
                          value={form.openingLot}
                          onChange={(event) => patchForm({ openingLot: event.target.value.toUpperCase() })}
                          placeholder="auto"
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="pf-opening-bb">Best by</label>
                        <input
                          id="pf-opening-bb"
                          type="date"
                          className="field"
                          value={form.openingExpiresOn}
                          onChange={(event) => patchForm({ openingExpiresOn: event.target.value })}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="label" htmlFor="pf-reorder">Reorder point (cases)</label>
                    <input
                      id="pf-reorder"
                      className="field"
                      inputMode="numeric"
                      value={form.reorderPoint}
                      onChange={(event) => patchForm({ reorderPoint: event.target.value.replace(/\D/g, "") })}
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
                  <div className="sm:col-span-3">
                    <label className="label" htmlFor="pf-badges">Badges (comma separated)</label>
                    <input
                      id="pf-badges"
                      className="field"
                      value={form.badgesText}
                      onChange={(event) => patchForm({ badgesText: event.target.value })}
                      placeholder="New, Best seller (certifications go in Compliance)"
                    />
                  </div>
                </div>
              </Section>

              <Section
                step={5}
                title="Identity & sourcing"
                hint="UPC / GTIN is checked against its GS1 check digit. The ASIN is a reference only — the Amazon link is built from it."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField id="pf-gtin" label="UPC / GTIN (unit)" value={form.gtin} onChange={(value) => patchForm({ gtin: value.replace(/[^\d]/g, "") })} placeholder="012345678905" mono />
                  <TextField id="pf-case-gtin" label="Case GTIN (ITF-14)" value={form.caseGtin} onChange={(value) => patchForm({ caseGtin: value.replace(/[^\d]/g, "") })} placeholder="10012345678902" mono />
                  <div>
                    <TextField id="pf-asin" label="ASIN" value={form.asin} onChange={(value) => patchForm({ asin: value.toUpperCase().trim() })} placeholder="B0ABC12345" mono />
                    {amazonUrl(form.asin) ? (
                      <a href={amazonUrl(form.asin) ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-fern hover:underline">
                        amazon.com/dp/{form.asin} <ExternalLink size={10} />
                      </a>
                    ) : null}
                  </div>
                  <TextField id="pf-mpn" label="Manufacturer part no. (MPN)" value={form.mpn} onChange={(value) => patchForm({ mpn: value })} />
                  <TextField id="pf-mfr" label="Manufacturer" value={form.manufacturer} onChange={(value) => patchForm({ manufacturer: value })} />
                  <TextField id="pf-coo" label="Country of origin (ISO code)" value={form.countryOfOrigin} onChange={(value) => patchForm({ countryOfOrigin: value.toUpperCase().slice(0, 2) })} placeholder="US" mono />
                  <TextField id="pf-supplier" label="Supplier" value={form.supplierName} onChange={(value) => patchForm({ supplierName: value })} />
                  <TextField id="pf-supplier-sku" label="Supplier SKU" value={form.supplierSku} onChange={(value) => patchForm({ supplierSku: value })} mono />
                  <TextField id="pf-supplier-url" label="Supplier URL" value={form.supplierUrl} onChange={(value) => patchForm({ supplierUrl: value })} placeholder="https://" />
                  <TextField id="pf-cost" label="Landed cost / case ($) — staff only" value={form.costPrice} onChange={(value) => patchForm({ costPrice: value })} placeholder="96.00" />
                  <TextField id="pf-map" label="MAP / unit ($)" value={form.mapPrice} onChange={(value) => patchForm({ mapPrice: value })} placeholder="optional" />
                </div>
              </Section>

              <Section step={6} title="Logistics" hint="Pallet pattern and freight class are used for LTL quotes and the warehouse.">
                <div className="grid gap-3 sm:grid-cols-4">
                  <TextField id="pf-pallet" label="Cases / pallet" value={form.unitsPerPallet} onChange={(value) => patchForm({ unitsPerPallet: value.replace(/\D/g, "") })} />
                  <TextField id="pf-ti" label="TI (cases / layer)" value={form.palletTi} onChange={(value) => patchForm({ palletTi: value.replace(/\D/g, "") })} />
                  <TextField id="pf-hi" label="HI (layers)" value={form.palletHi} onChange={(value) => patchForm({ palletHi: value.replace(/\D/g, "") })} />
                  <div>
                    <label className="label" htmlFor="pf-class">Freight class</label>
                    <select id="pf-class" className="field" value={form.freightClass} onChange={(event) => patchForm({ freightClass: event.target.value })}>
                      <option value="">—</option>
                      {FREIGHT_CLASSES.map((entry) => (
                        <option key={entry} value={entry}>{entry}</option>
                      ))}
                    </select>
                  </div>
                  <TextField id="pf-nmfc" label="NMFC item" value={form.nmfc} onChange={(value) => patchForm({ nmfc: value })} />
                  <TextField id="pf-hts" label="HTS code" value={form.htsCode} onChange={(value) => patchForm({ htsCode: value })} placeholder="2106.90.9998" mono />
                  <label className="mt-6 flex items-center gap-2 text-[12px] font-medium">
                    <input type="checkbox" checked={form.hazmat} onChange={(event) => patchForm({ hazmat: event.target.checked })} className="accent-[#14241c]" />
                    Hazardous material
                  </label>
                  {form.hazmat ? (
                    <TextField id="pf-un" label="UN number" value={form.unNumber} onChange={(value) => patchForm({ unNumber: value.toUpperCase() })} placeholder="UN1993" mono />
                  ) : null}
                </div>
              </Section>

              <Section
                step={7}
                title="Compliance"
                hint="Shown on the product page. Certification badges appear only with a document on file."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField id="pf-shelf" label="Shelf life (days)" value={form.shelfLifeDays} onChange={(value) => patchForm({ shelfLifeDays: value.replace(/\D/g, "") })} placeholder="730" />
                  <TextField id="pf-facts" label="Supplement / Nutrition Facts image (URL or /api/product-images/…)" value={form.factsPanelImage} onChange={(value) => patchForm({ factsPanelImage: value })} />
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-ingredients">Ingredients</label>
                    <textarea id="pf-ingredients" className="field min-h-[70px]" value={form.ingredients} onChange={(event) => patchForm({ ingredients: event.target.value })} />
                  </div>
                  <fieldset className="sm:col-span-2">
                    <legend className="label">Major allergens (FALCPA)</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {ALLERGENS.map((allergen) => (
                        <label key={allergen} className="flex items-center gap-1.5 text-[11.5px] capitalize">
                          <input
                            type="checkbox"
                            className="accent-[#14241c]"
                            checked={form.allergens.includes(allergen)}
                            onChange={(event) =>
                              patchForm({
                                allergens: event.target.checked
                                  ? [...form.allergens, allergen]
                                  : form.allergens.filter((entry) => entry !== allergen),
                              })
                            }
                          />
                          {allergen}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex items-start gap-2 text-[12px] font-medium sm:col-span-2">
                    <input type="checkbox" checked={form.fdaDisclaimer} onChange={(event) => patchForm({ fdaDisclaimer: event.target.checked })} className="mt-0.5 accent-[#14241c]" />
                    Makes structure/function claims — show the FDA (DSHEA) disclaimer
                  </label>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-prop65">California Prop 65 warning (leave blank if none)</label>
                    <textarea id="pf-prop65" className="field min-h-[60px]" value={form.prop65Warning} onChange={(event) => patchForm({ prop65Warning: event.target.value })} placeholder="WARNING: This product can expose you to chemicals including lead, which is known to the State of California to cause cancer…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="pf-certs">Certifications — one per line: Name | document URL</label>
                    <textarea id="pf-certs" className="field min-h-[60px] font-mono text-[11px]" value={form.certificationsText} onChange={(event) => patchForm({ certificationsText: event.target.value })} placeholder={"NSF Certified for Sport | https://info.nsf.org/…\nNon-GMO Project Verified | /api/product-images/42"} />
                  </div>
                </div>
              </Section>

              <Section step={8} title="Search engines (optional)">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField id="pf-seo-title" label="SEO title (max 70)" value={form.seoTitle} onChange={(value) => patchForm({ seoTitle: value.slice(0, 70) })} />
                  <TextField id="pf-seo-desc" label="Meta description (max 170)" value={form.seoDescription} onChange={(value) => patchForm({ seoDescription: value.slice(0, 170) })} />
                </div>
              </Section>

              <Section step={9} title="Photos" hint="The first photo is the main image. JPG, PNG, WebP or GIF, up to 4 MB each, 8 photos max.">
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
                      className="flex h-[92px] w-[92px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink/20 text-ink/65 hover:border-ink/40 hover:text-ink/70"
                    >
                      {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                      <span className="text-[10px] font-bold">{uploading ? "Uploading" : "Add photos"}</span>
                    </button>
                  ) : null}
                  <input aria-label="Product photos to upload"
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void uploadPhotos(event.target.files)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <input aria-label="Image URL"
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
                      if (!/^https:\/\/\S+$/i.test(url) && !/^\/(?!\/)\S*$/.test(url)) {
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
                  <p className="mt-2 text-[10.5px] text-ink/65">
                    No photo? The department’s default image is used until you add one.
                  </p>
                ) : null}
              </Section>

              <Section step={10} title="Details (optional)">
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
                    <p className="mt-1 text-[10px] text-ink/65">Left blank, units / MSRP / weight specs are generated.</p>
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
                <p className="text-[10px] font-bold tracking-[0.14em] text-ink/65 uppercase">Live summary</p>
                <dl className="mt-3 space-y-2.5 text-[12px]">
                  {[
                    ["Cost per unit", metrics?.unitCost != null ? formatMoney(metrics.unitCost) : "—"],
                    [
                      `MSRP / unit${metrics?.msrpDefaulted ? " (auto 1.6×)" : ""}`,
                      metrics?.effectiveMsrp != null ? formatMoney(metrics.effectiveMsrp) : "—",
                    ],
                    ["Retailer margin", metrics?.margin != null ? `${metrics.margin}%` : "—"],
                    ["Our margin (on cost)", metrics?.ourMargin != null ? `${metrics.ourMargin}%` : "—"],
                    ["Dimensional weight", metrics?.dim != null ? `${metrics.dim.toFixed(1)} lb` : "—"],
                    ["Billable per case", metrics?.billable != null ? `${metrics.billable.toFixed(1)} lb` : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-ink/8 pb-2 last:border-0 last:pb-0">
                      <dt className="text-ink/68">{label}</dt>
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
            <thead className="bg-parchment/50 text-[9.5px] font-bold tracking-[0.1em] text-ink/65 uppercase">
              <tr className="border-b border-ink/10">
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-2 py-3">Department</th>
                <th scope="col" className="px-2 py-3 text-right">Case</th>
                <th scope="col" className="px-2 py-3">Pack</th>
                <th scope="col" className="px-2 py-3">Stock</th>
                <th scope="col" className="px-2 py-3">Status</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
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
                        <p className="text-[10px] text-ink/65">{product.brand}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-ink/72">{categoryName(product.category)}</td>
                  <td className="px-2 py-3 text-right">
                    <p className="font-bold tabular-nums">{formatMoney(product.casePrice)}</p>
                    <p className="text-[9.5px] text-ink/65">{formatMoney(Math.round(product.casePrice / product.caseSize))}/unit</p>
                  </td>
                  <td className="px-2 py-3 whitespace-nowrap text-ink/72">{product.caseSize} / case</td>
                  <td className="px-2 py-3">
                    <Link
                      href="/admin/inventory"
                      className={`font-bold tabular-nums hover:underline ${product.stock <= product.reorderPoint ? "text-clay" : ""}`}
                      title="Manage lots on the Inventory screen"
                    >
                      {product.stock}
                    </Link>
                    <p className="text-[9.5px] text-ink/65">reorder at {product.reorderPoint}</p>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${
                          product.active ? "bg-fern/15 text-fern" : "bg-ink/10 text-ink/68"
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
                        onClick={() => openEditor({ ...fromProduct(product), id: null, sku: "", gtin: "", caseGtin: "", updatedAt: null, name: `${product.name} (copy)`, active: false })}
                        className="rounded-full border border-ink/15 p-2 text-ink/70 hover:border-ink/40 hover:text-ink"
                        title="Duplicate as a new product"
                        aria-label={`Duplicate ${product.name}`}
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => quickPatch(product, { active: !product.active })}
                        disabled={rowBusy === product.id}
                        className="rounded-full border border-ink/15 p-2 text-ink/70 hover:border-ink/40 hover:text-ink"
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
                        className="rounded-full border border-ink/15 p-2 text-ink/70 hover:border-ink/40 hover:text-ink"
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
                  <td colSpan={7} className="px-5 py-14 text-center text-[12px] text-ink/65">
                    No products match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink/10 bg-parchment/30 px-4 py-2.5 text-[10px] text-ink/65">
          Stock is managed by lot on the Inventory screen. Archived products disappear from the store,
          search, sitemap and order sheets but stay in your order history.
        </p>
      </div>
    </div>
  );
}
