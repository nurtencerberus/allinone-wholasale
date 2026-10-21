/**
 * UX-4: the shape of the catalogue while its queries run.
 *
 * Rendered from a `<Suspense>` inside the shop page rather than from a `loading.tsx`. A route-level
 * loading file suspends the whole page, so the shell is flushed with status 200 before the page
 * body runs — and then `notFound()` and `redirect()` can no longer set a status (an unknown
 * product became a soft 404, and the exact-SKU search stopped being a 307). Suspending only the
 * grid keeps those statuses and still paints something immediately on a cold database.
 */
export function CatalogSkeleton() {
  return (
    <div className="wrap grid gap-8 py-8 lg:grid-cols-[240px_1fr] lg:py-10" role="status" aria-live="polite">
      <span className="sr-only">Loading the catalog…</span>
      <aside className="space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((index) => (
          <div key={index} className="h-8 animate-pulse rounded-md bg-ink/8" />
        ))}
      </aside>
      <div>
        <div className="h-9 w-full max-w-lg animate-pulse rounded-full bg-ink/8" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="rounded-xl border border-ink/10 bg-[#fffdf8] p-4">
              <div className="h-40 animate-pulse rounded-lg bg-ink/8" />
              <div className="mt-4 h-3.5 w-3/4 animate-pulse rounded-full bg-ink/10" />
              <div className="mt-2 h-3 w-1/3 animate-pulse rounded-full bg-ink/8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
