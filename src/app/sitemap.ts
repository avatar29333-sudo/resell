import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/meta";

// UX-08: خريطة الموقع — الصفحات العامة بالعربي والإنجليزي + العروض المنشورة
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ["", "/listings", "/price-index", "/rescue", "/privacy", "/terms"];
  const listings = await db.listing.findMany({
    where: { status: { in: ["PUBLISHED", "IN_DEAL"] }, seller: { status: "ACTIVE" } },
    select: { id: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 5000,
  });
  const both = (path: string, lastModified?: Date, priority = 0.6): MetadataRoute.Sitemap =>
    (["ar", "en"] as const).map((l) => ({
      url: `${base}/${l}${path}`,
      lastModified,
      priority,
      alternates: { languages: { ar: `${base}/ar${path}`, en: `${base}/en${path}` } },
    }));
  return [...pages.flatMap((p) => both(p, undefined, p === "" ? 1 : 0.8)), ...listings.flatMap((l) => both(`/listings/${l.id}`, l.updatedAt, 0.7))];
}
