import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { jsonLdHtml, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Fonts are downloaded at build time and served from our own origin (PRF-2): no render-blocking
 * request to Google, no visitor IP handed to a third party, and no font host in the CSP.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.domain),
  title: {
    default: "Ciputra Corp. — Wholesale Vitamins, Pantry Staples & Home Goods",
    template: "%s · Ciputra Corp.",
  },
  description: SITE.description,
  keywords: [
    "wholesale supplements",
    "B2B vitamin distributor",
    "wholesale pantry staples",
    "home goods wholesale USA",
    "resale tax exemption",
    "case pricing",
    "LTL freight wholesale",
  ],
  openGraph: {
    title: "Ciputra Corp. — Wholesale for modern American retail",
    description: SITE.description,
    type: "website",
    url: SITE.domain,
    siteName: SITE.name,
    images: [{ url: "/images/hero-warehouse.jpg", width: 1200, height: 630, alt: "Ciputra Corp. warehouse" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ciputra Corp. — Wholesale for modern American retail",
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#14241c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let user: SessionUser | null = null;
  try {
    await ensureSeeded();
    user = await getSessionUser();
  } catch (error) {
    console.error("[layout] session/seed unavailable", error);
  }

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.domain,
    logo: `${SITE.domain}/images/hero-warehouse.jpg`,
    description: SITE.description,
    email: SITE.email,
    telephone: SITE.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.street,
      addressLocality: SITE.city,
      addressRegion: SITE.state,
      postalCode: SITE.zip,
      addressCountry: "US",
    },
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.domain,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.domain}/shop?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en-US" className={`${fraunces.variable} ${manrope.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdHtml(organizationJsonLd)}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdHtml(websiteJsonLd)}
        />
      </head>
      <body className="min-h-screen bg-cream text-ink antialiased">
        <CartProvider>
          <SiteHeader user={user} />
          <main>{children}</main>
          <SiteFooter />
          <CartDrawer user={user} />
        </CartProvider>
      </body>
    </html>
  );
}
