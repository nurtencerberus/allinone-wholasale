"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-sm border border-cream/25 text-cream hover:bg-cream/10">
      <Printer size={13} /> {label}
    </button>
  );
}
