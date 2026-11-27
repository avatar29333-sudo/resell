import { activeCities, allCities } from "@/lib/cities";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
/** GEO-01: المدينة = مفتاح نصي من جدول المدن */
type City = string;
import { isLocale } from "@/i18n/config";
import { CITY, label } from "@/lib/labels";
import { cityFromSlug } from "@/lib/slugs";
import { CityView } from "../CityView";

type Props = { params: Promise<{ locale: string; city: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, city } = await params;
  await allCities();
  const c = cityFromSlug(city);
  if (!isLocale(locale) || !c) return {};
  const name = label(CITY, c, locale);
  return {
    title: locale === "ar" ? `أراضي بيت الوطن في ${name}` : `Beit El Watan plots in ${name}`,
    description: locale === "ar" ? `عروض قطع بيت الوطن في ${name} بورق متراجع، ومتوسط سعر المتر من صفقات حقيقية.` : `Beit El Watan plots in ${name} with checked papers, and the average price per m² from real deals.`,
  };
}

/** MKT-08: /[locale]/beit-el-watan/[city] */
export default async function CityPage({ params }: Props) {
  const { locale, city } = await params;
  await allCities();
  const c = cityFromSlug(city);
  if (!isLocale(locale) || !c) notFound();
  return <CityView locale={locale} city={c as City} />;
}
