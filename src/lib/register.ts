/**
 * UX-07 — ترتيب وتقسيم سجل العروض (منطق نقي، متغطي باختبار):
 * العروض «في صفقة» بتتشال إلا لو الفلتر «اعرض اللي في صفقة كمان» متعلّم، وساعتها بتيجي في الآخر.
 * 24 عرض في الصفحة.
 */
export const PAGE_SIZE = 24;

export function arrangeListings<T extends { status: string; total: number; areaSqm: number; publishedAt: Date | null }>(
  list: T[],
  opts: { sort?: string; inDeal?: boolean; budget?: number; page?: number },
) {
  let rows = list.filter((l) => (opts.inDeal ? true : l.status !== "IN_DEAL"));
  if (opts.budget) rows = rows.filter((l) => l.total <= opts.budget!);
  const cmp =
    opts.sort === "price"
      ? (a: T, b: T) => a.total - b.total
      : opts.sort === "sqm"
        ? (a: T, b: T) => a.total / a.areaSqm - b.total / b.areaSqm
        : (a: T, b: T) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
  // المتاح الأول، واللي في صفقة في الآخر
  rows = [...rows].sort((a, b) => Number(a.status === "IN_DEAL") - Number(b.status === "IN_DEAL") || cmp(a, b));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(opts.page ?? 1)));
  return { total: rows.length, pages, page, items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

/** رابط بنفس الفلاتر (الفلاتر محفوظة في الرابط) */
export function registerHref(base: string, sp: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
