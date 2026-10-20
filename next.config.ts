import type { NextConfig } from "next";

/**
 * Content-Security-Policy (DEV-5). Everything is same-origin except Stripe (Elements loads
 * js.stripe.com and frames hooks.stripe.com / m.stripe.network for 3-D Secure and fraud
 * signals) and the sample catalog photos. Scripts still need 'unsafe-inline' because the app
 * router emits inline bootstrap and flight-data scripts and this project runs no middleware to
 * mint a per-request nonce; the policy still blocks every third-party script host, plugins,
 * framing and off-site form posts. Dev adds 'unsafe-eval' for the HMR runtime.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://images.pexels.com https://*.stripe.com",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://js.stripe.com https://*.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.stripe.network",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://*.stripe.network",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Catalog photos come from our own upload route or the sample photo host; everything else
    // is served from /public. AVIF first, WebP next, original as the fallback (PRF-2).
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
