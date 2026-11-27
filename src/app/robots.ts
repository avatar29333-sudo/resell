import type { MetadataRoute } from "next";
import { PRIVATE_PREFIXES, siteUrl } from "@/lib/meta";

// UX-08: الصفحات الخاصة (حسابي، الصفقات، اللوحات) ما تتأرشفش
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...PRIVATE_PREFIXES.flatMap((p) => [`/ar/${p}`, `/en/${p}`]), "/*/listings/*/report"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
