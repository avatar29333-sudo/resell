import { activeCities, allCities } from "@/lib/cities";
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/meta";
import { CITY_SLUG, slugify } from "@/lib/slugs";
import { GUIDES } from "@/content/guides";

// UX-08: خريطة الموقع — الصفحات العامة بالعربي والإنجليزي + العروض المنشورة
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const districts = await db.district.findMany({ where: { active: true }, select: { city: true, nameEn: true } });
  const pages = [
    "",
    "/listings",
    "/price-index",
    "/rescue",
    "/valuation",
    "/remind-me",
    "/guides",
    "/privacy",
    "/terms",
    // MKT-08: صفحات المدن والأحياء
    ...(await activeCities()).map((c) => `/beit-el-watan/${c.slug}`),
    ...districts.map((d) => `/beit-el-watan/${CITY_SLUG[d.city]}/${slugify(d.nameEn)}`),
    // MKT-09: الأدلة
    ...GUIDES.map((g) => `/guides/${g.slug}`),
  ];
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
