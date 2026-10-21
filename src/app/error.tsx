"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { SITE } from "@/lib/site";

/**
 * UX-4: a page threw. Most often that is the database refusing the first connection while it
 * wakes up, which `reset()` fixes on the second attempt — so the retry is the primary action.
 *
 * Nothing about the error is shown to the buyer beyond the digest Next.js assigns it; the message
 * could name a table or a connection string. `console.error` keeps it in the browser log, and the
 * server already recorded it through `instrumentation.ts` (DEV-3).
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page]", error);
  }, [error]);

  return (
    <div className="wrap flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="rounded-full bg-clay/10 p-4 text-clay">
        <AlertTriangle size={28} />
      </span>
      <h1 className="display mt-5 text-[32px] leading-tight sm:text-[40px]">Something went wrong</h1>
      <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink/72">
        This page could not be loaded. Nothing you had in the cart or in an order form was lost —
        try again, and if it keeps happening the trade desk can place the order for you.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button onClick={reset} className="btn btn-primary">
          <RefreshCw size={15} /> Try again
        </button>
        <Link href="/shop" className="btn btn-outline">
          Back to the catalog
        </Link>
        <a href={`mailto:${SITE.email}`} className="btn btn-outline">
          Email the trade desk
        </a>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[10.5px] tracking-wide text-ink/65 uppercase">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
