/** MKT-12 — قمع التسويق لكل مصدر/حملة (منطق نقي، متغطي باختبار) */
export type FunnelEvent = { channel: string; kind: "lead" | "verified" | "agreement" | "closed"; value?: number };
export type FunnelRow = { channel: string; leads: number; verified: number; agreements: number; closed: number; commission: number; spend: number; costPerLead: number | null; costPerDeal: number | null };

export function funnelRows(events: FunnelEvent[], spend: Record<string, number>): FunnelRow[] {
  const m = new Map<string, FunnelRow>();
  const row = (c: string) => {
    if (!m.has(c)) m.set(c, { channel: c, leads: 0, verified: 0, agreements: 0, closed: 0, commission: 0, spend: 0, costPerLead: null, costPerDeal: null });
    return m.get(c)!;
  };
  for (const e of events) {
    const r = row(e.channel);
    if (e.kind === "lead") r.leads++;
    if (e.kind === "verified") r.verified++;
    if (e.kind === "agreement") r.agreements++;
    if (e.kind === "closed") {
      r.closed++;
      r.commission += e.value ?? 0;
    }
  }
  for (const [c, amount] of Object.entries(spend)) row(c).spend += amount;
  return [...m.values()]
    .map((r) => ({ ...r, costPerLead: r.spend && r.leads ? Math.round(r.spend / r.leads) : null, costPerDeal: r.spend && r.closed ? Math.round(r.spend / r.closed) : null }))
    .sort((a, b) => b.leads - a.leads || a.channel.localeCompare(b.channel));
}
