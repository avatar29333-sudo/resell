import type { Locale } from "@/i18n/config";

/** DATA-07: اسم الحي حسب اللغة — الإنجليزي من جدول District (متخزن على القطعة) */
export function districtName(plot: { district: string; districtEn?: string | null }, locale: Locale) {
  return locale === "en" ? (plot.districtEn ?? plot.district) : plot.district;
}
