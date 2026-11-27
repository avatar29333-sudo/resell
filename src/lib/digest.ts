/** MKT-13 — تجميع عروض اليوم المطابقة لطلبات الشراء: رسالة واحدة في اليوم لكل مستخدم (منطق نقي، متغطي باختبار) */
export type Match = { buyerId: string; listingId: string; title: string };

export function groupDigest(matches: Match[], maxPerMessage = 5) {
  const by = new Map<string, Match[]>();
  for (const m of matches) {
    const list = by.get(m.buyerId) ?? [];
    if (!list.some((x) => x.listingId === m.listingId)) list.push(m);
    by.set(m.buyerId, list);
  }
  return [...by.entries()].map(([buyerId, list]) => ({ buyerId, shown: list.slice(0, maxPerMessage), more: Math.max(0, list.length - maxPerMessage) }));
}

export function digestText(locale: string, items: { title: string; url: string }[], more: number, unsub: string) {
  const ar = locale !== "en";
  const head = ar ? `Resell: ${items.length + more} عرض جديد مطابق لطلبك النهارده:` : `Resell: ${items.length + more} new listing(s) match your request today:`;
  const lines = items.map((i) => `• ${i.title} — ${i.url}`);
  const tail = [more ? (ar ? `و${more} كمان في السجل.` : `and ${more} more in the register.`) : "", ar ? `لإيقاف التنبيهات: ${unsub}` : `Stop alerts: ${unsub}`].filter(Boolean);
  return [head, ...lines, ...tail].join("\n");
}
