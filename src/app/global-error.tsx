"use client";

import { useEffect } from "react";

/**
 * UX-4: the root layout itself failed, so there is no header, no footer and no stylesheet from
 * the layout to rely on — this file renders its own <html> and carries its own styles inline.
 *
 * Reachable in practice when the session read in the layout throws something the layout's own
 * try/catch cannot cover, or a font/asset import fails at runtime.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);

  return (
    <html lang="en-US">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf6ee",
          color: "#14241c",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.75rem", letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.65 }}>
            Ciputra Corp.
          </p>
          <h1 style={{ fontSize: "1.75rem", lineHeight: 1.2, margin: "0.75rem 0 0" }}>
            The site could not be loaded
          </h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, opacity: 0.75, marginTop: "0.75rem" }}>
            This is on our side, not yours. Reload the page, or email{" "}
            <a href="mailto:info@ciputracorp.com" style={{ color: "#14241c" }}>
              info@ciputracorp.com
            </a>{" "}
            and the trade desk will help.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.7rem 1.4rem",
              borderRadius: "999px",
              border: "none",
              background: "#14241c",
              color: "#faf6ee",
              fontSize: "0.8125rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.6875rem", letterSpacing: "0.08em", opacity: 0.6 }}>
              REFERENCE {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
