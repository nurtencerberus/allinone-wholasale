import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = SITE.domain.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shop", "/products/", "/wholesale", "/quick-order"],
        disallow: [
          "/account",
          "/account/",
          "/admin",
          "/admin/",
          "/checkout",
          "/checkout/",
          "/order/",
          "/api/",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/shop", "/products/", "/wholesale", "/wholesale/apply"],
        disallow: ["/account/", "/admin/", "/checkout", "/api/", "/order/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
