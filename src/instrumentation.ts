/**
 * DEV-3: one structured line for every unhandled error Next catches, so Vercel's log search
 * (or any drain) has something to filter on, and one email when it happened on a money path.
 * Loaded automatically by Next; it must not import anything that only runs in the browser.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routeType: string },
) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const path = request.path ?? "";
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: "error",
      alert: "unhandled",
      message,
      path,
      method: request.method,
      router: context.routerKind,
      routeType: context.routeType,
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined,
    }),
  );

  // Checkout, orders, payments and the cron are where silence costs money.
  if (!/^\/(api\/(orders|checkout|stripe|cron)|checkout)/.test(path)) return;
  try {
    const { alertOps } = await import("@/lib/alerts");
    await alertOps({
      key: `unhandled:${path}`,
      subject: `Unhandled error on ${path}`,
      message: "A request on a payment or order path failed with an unhandled error.",
      context: { path, method: request.method, error: message },
    });
  } catch {
    // The alert itself must never replace the original error.
  }
}
