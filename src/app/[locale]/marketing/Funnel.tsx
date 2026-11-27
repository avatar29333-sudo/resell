import { db } from "@/lib/db";
import { channelOf, type Touch } from "@/lib/attribution-core";
import { funnelRows, type FunnelEvent } from "@/lib/funnel";
import { money, num, toNum, tr } from "@/lib/format";
import { Card, Table, btn, field, labelCls } from "@/components/ui";
import { saveSpend } from "./actions";

type Src = { first?: Touch | null } | null;
const ch = (s: unknown) => channelOf(s as Src);

/** MKT-12: لكل مصدر/حملة — عملاء محتملين → عروض موثّقة → اتفاقات عمولة → صفقات مقفولة → قيمة العمولات + تكلفة العميل */
export async function Funnel({ locale, from, to }: { locale: "ar" | "en"; from?: string; to?: string }) {
  const L = tr(locale);
  const now = new Date();
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59Z`) : now;
  const range = { gte: start, lte: end };
  const months = new Set<string>();
  for (let d = new Date(start); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) months.add(d.toISOString().slice(0, 7));

  const [users, requests, listings, deals, spend] = await Promise.all([
    db.user.findMany({ where: { createdAt: range, role: { in: ["CLIENT", "PARTNER_BROKER"] } }, select: { source: true } }),
    db.serviceRequest.findMany({ where: { createdAt: range }, select: { source: true } }),
    db.listing.findMany({ where: { publishedAt: range }, select: { seller: { select: { source: true } } } }),
    db.deal.findMany({
      where: { createdAt: { lte: end }, OR: [{ createdAt: range }, { closedAt: range }] },
      select: { source: true, status: true, closedAt: true, buyer: { select: { source: true } }, contracts: { select: { type: true, status: true } }, commission: { select: { sellerAmount: true, buyerAmount: true, status: true } } },
    }),
    db.campaignSpend.findMany({ where: { month: { in: [...months] } } }),
  ]);
  const events: FunnelEvent[] = [
    ...users.map((u) => ({ channel: ch(u.source), kind: "lead" as const })),
    ...requests.map((r) => ({ channel: ch(r.source), kind: "lead" as const })),
    ...listings.map((l) => ({ channel: ch(l.seller.source), kind: "verified" as const })),
    ...deals
      .filter((d) => d.contracts.some((c) => c.type === "COMMISSION_AGREEMENT" && c.status === "SIGNED"))
      .map((d) => ({ channel: ch(d.source ?? d.buyer.source), kind: "agreement" as const })),
    ...deals
      .filter((d) => d.status === "COMPLETED" && d.closedAt && d.closedAt >= start && d.closedAt <= end)
      .map((d) => ({ channel: ch(d.source ?? d.buyer.source), kind: "closed" as const, value: d.commission ? toNum(d.commission.sellerAmount) + toNum(d.commission.buyerAmount) : 0 })),
  ];
  const spendBy: Record<string, number> = {};
  for (const s of spend) spendBy[s.channel] = (spendBy[s.channel] ?? 0) + toNum(s.amountEgp);
  const rows = funnelRows(events, spendBy);
  const thisMonth = now.toISOString().slice(0, 7);

  return (
    <Card title={L("القمع حسب المصدر / الحملة", "Funnel by source / campaign")}>
      <form className="flex flex-wrap items-end gap-2">
        <label className={labelCls}>
          {L("من", "From")}
          <input name="from" type="date" defaultValue={start.toISOString().slice(0, 10)} className={`${field} w-40`} />
        </label>
        <label className={labelCls}>
          {L("لحد", "To")}
          <input name="to" type="date" defaultValue={end.toISOString().slice(0, 10)} className={`${field} w-40`} />
        </label>
        <button className={btn.secondary}>{L("عرض", "Show")}</button>
      </form>
      <Table head={[L("المصدر / الحملة", "Source / campaign"), L("زيارات", "Visits"), L("عملاء محتملين", "Leads"), L("عروض موثّقة", "Verified listings"), L("اتفاقات عمولة", "Commission agreements"), L("صفقات مقفولة", "Closed deals"), L("العمولات", "Commission"), L("المصروف", "Spend"), L("تكلفة العميل", "Cost per lead"), L("تكلفة الصفقة", "Cost per deal")]}>
        {rows.map((r) => (
          <tr key={r.channel}>
            <td dir="ltr" className="text-start font-semibold">
              {r.channel === "direct" ? L("مباشر", "Direct") : r.channel === "referral" ? L("إحالة", "Referral") : r.channel}
            </td>
            <td className="text-xs text-muted">{L("مش متاح", "N/A")}</td>
            <td>{num(r.leads, locale)}</td>
            <td>{num(r.verified, locale)}</td>
            <td>{num(r.agreements, locale)}</td>
            <td>{num(r.closed, locale)}</td>
            <td>{money(r.commission, "EGP", locale)}</td>
            <td>{r.spend ? money(r.spend, "EGP", locale) : "—"}</td>
            <td>{r.costPerLead === null ? "—" : money(r.costPerLead, "EGP", locale)}</td>
            <td>{r.costPerDeal === null ? "—" : money(r.costPerDeal, "EGP", locale)}</td>
          </tr>
        ))}
      </Table>
      <p className="text-xs text-muted">
        {L("الزيارات مش متاحة لحد ما أدوات التحليلات تتربط (MKT-11). المصدر = أول لمسة (utm أو الموقع اللي جه منه).", "Visits aren't available until analytics are connected (MKT-11). Source = first touch (utm or referring site).")}
      </p>
      <form action={saveSpend.bind(null, locale)} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <label className={labelCls}>
          {L("الحملة (زي ما بتظهر في الجدول)", "Campaign (as shown in the table)")}
          <input name="channel" required dir="ltr" placeholder="google / rescue" aria-label={L("الحملة", "Campaign")} className={`${field} w-56`} />
        </label>
        <label className={labelCls}>
          {L("الشهر", "Month")}
          <input name="month" type="month" required defaultValue={thisMonth} className={`${field} w-40`} />
        </label>
        <label className={labelCls}>
          {L("المصروف (ج.م)", "Spend (EGP)")}
          <input name="amount" type="number" min={0} required className={`${field} w-36`} />
        </label>
        <button className={btn.primary}>{L("سجّل المصروف", "Save spend")}</button>
      </form>
    </Card>
  );
}
