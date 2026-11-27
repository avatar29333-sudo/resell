/** MKT-08 — روابط المدن والأحياء (منطق نقي، متغطي باختبار) */
export const CITY_SLUG: Record<string, string> = {
  NEW_CAIRO: "new-cairo",
  SHEIKH_ZAYED: "sheikh-zayed",
  OCTOBER: "6th-of-october",
  NEW_OCTOBER: "new-october",
  NEW_DAMIETTA: "new-damietta",
};
export const cityFromSlug = (slug: string) => Object.entries(CITY_SLUG).find(([, s]) => s === slug)?.[0] ?? null;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
