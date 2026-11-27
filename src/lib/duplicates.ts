import { normalizeCode } from "./plot-code";

/**
 * DATA-08 — كشف القطع المحتمل تكرارها (منطق نقي، متغطي باختبار):
 * نفس المدينة + نفس الحي + نفس المساحة (±1 م²) + كود متقارب (نفس الكود بعد التوحيد، أو فرق حرفين بالكتير).
 */
export type PlotLite = { id: string; city: string; district: string; areaSqm: number; code: string };

export function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/**
 * علامة تانية: نفس المدينة + الحي + المساحة، ونفس المشتري عنده صفقات على أكتر من قطعة منهم
 * (حتى لو الكود مختلف) — زي «الشيخ زايد — الحي الثاني 575م²» في صفقتين لنفس المشتري بسعرين.
 */
export function sameBuyerGroups<T extends PlotLite & { buyerIds: string[] }>(plots: T[]): T[][] {
  const buckets = new Map<string, T[]>();
  for (const p of plots) {
    const k = `${p.city}|${p.district.trim()}|${Math.round(p.areaSqm)}`;
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  const out: T[][] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const byBuyer = new Map<string, Set<string>>();
    for (const p of list) for (const b of new Set(p.buyerIds)) byBuyer.set(b, new Set([...(byBuyer.get(b) ?? []), p.id]));
    const ids = new Set([...byBuyer.values()].filter((s) => s.size > 1).flatMap((s) => [...s]));
    if (ids.size > 1) out.push(list.filter((p) => ids.has(p.id)));
  }
  return out;
}

export function findDuplicates<T extends PlotLite>(plots: T[], maxDistance = 2): T[][] {
  const buckets = new Map<string, T[]>();
  for (const p of plots) {
    const k = `${p.city}|${p.district.trim()}|${Math.round(p.areaSqm)}`;
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  const groups: T[][] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // تجميع بالاتصال: أي اتنين كودهم متقارب في نفس المجموعة
    const seen = new Set<string>();
    for (const p of list) {
      if (seen.has(p.id)) continue;
      const group = [p];
      seen.add(p.id);
      for (let i = 0; i < group.length; i++) {
        for (const q of list) {
          if (seen.has(q.id)) continue;
          if (distance(normalizeCode(group[i].code), normalizeCode(q.code)) <= maxDistance) {
            group.push(q);
            seen.add(q.id);
          }
        }
      }
      if (group.length > 1) groups.push(group);
    }
  }
  return groups;
}
