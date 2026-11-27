import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { City } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { db } from "@/lib/db";
import { CITY, label } from "@/lib/labels";
import { cityFromSlug, slugify } from "@/lib/slugs";
import { CityView } from "../../CityView";

type Props = { params: Promise<{ locale: string; city: string; district: string }> };

async function find(citySlug: string, districtSlug: string) {
  const city = cityFromSlug(citySlug);
  if (!city) return null;
  const ds = await db.district.findMany({ where: { city: city as City, active: true } });
  const d = ds.find((x) => slugify(x.nameEn) === districtSlug);
  return d ? { city: city as City, d } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, city, district } = await params;
  const f = isLocale(locale) ? await find(city, district) : null;
  if (!f) return {};
  const place = `${label(CITY, f.city, locale as "ar" | "en")} — ${locale === "ar" ? f.d.nameAr : f.d.nameEn}`;
  return { title: locale === "ar" ? `أراضي بيت الوطن في ${place}` : `Beit El Watan plots in ${place}` };
}

/** MKT-08: /[locale]/beit-el-watan/[city]/[district] */
export default async function DistrictPage({ params }: Props) {
  const { locale, city, district } = await params;
  if (!isLocale(locale)) notFound();
  const f = await find(city, district);
  if (!f) notFound();
  return <CityView locale={locale} city={f.city} district={{ nameAr: f.d.nameAr, nameEn: f.d.nameEn }} />;
}
