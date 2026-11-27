import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/lib/auth";
import { loadTx } from "@/lib/transactions-load";
import { totals } from "@/lib/transactions";
import { dealRef } from "@/lib/action-otp-core";
import { date, money, tr } from "@/lib/format";
import { Badge, Card, Container, Empty, PageHeader, Stat, Table } from "@/components/ui";
import { pageMeta } from "@/lib/meta";

export const generateMetadata = ({ params }: { params: Promise<{ locale: string }> }) => pageMeta(params, "معاملاتي", "My transactions", { noindex: true });

const DIR: Record<string, [string, string]> = { PAID: ["دفعت", "Paid"], RECEIVED: ["استلمت", "Received"], HELD: ["محجوز", "Held"] };
const ST: Record<string, [string, string, "amber" | "green" | "blue" | "red"]> = {
  DUE: ["مستحق", "Due", "amber"],
  PAID: ["مدفوع", "Paid", "green"],
  HELD: ["محجوز في الضمان", "Held in escrow", "blue"],
  RELEASED: ["مُفرج عنه", "Released", "green"],
  REFUNDED: ["مرتجع", "Refunded", "red"],
};

/** TXN-02 — «معاملاتي»: كل الحركات المالية في صفقاتي (بيع وشراء) */
export default async function MyTransactions({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const L = tr(locale);
  const ar = locale === "ar";
  const me = await requireUser(locale, `/${locale}/account/transactions`);
  const rows = await loadTx({ OR: [{ buyerId: me.id }, { listing: { sellerId: me.id } }] }, me.id);
  const t = totals(rows);
  return (
    <>
      <PageHeader crumbs={[{ href: `/${locale}/account`, label: L("حسابي", "My account") }]} title={L("معاملاتي", "My transactions")} subtitle={L("كل الحركات المالية في صفقاتك — بيع وشراء.", "Every money movement in your deals — selling and buying.")} />
      <Container className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={L("إجمالي اللي دفعته", "Total paid")} value={money(t.paid, "EGP", locale)} />
          <Stat label={L("إجمالي اللي استلمته", "Total received")} value={money(t.received, "EGP", locale)} />
          <Stat label={L("محجوز في الضمان", "Held in escrow")} value={money(t.held, "EGP", locale)} />
        </div>
        <Card>
          {rows.length === 0 ? (
            <Empty>{L("مفيش حركات مالية لسه.", "No money movements yet.")}</Empty>
          ) : (
            <Table head={[L("التاريخ", "Date"), L("الصفقة", "Deal"), L("البند", "Item"), L("المبلغ", "Amount"), L("الاتجاه", "Direction"), L("الحالة", "Status"), L("المرجع", "Ref")]}>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.date, locale)}</td>
                  <td>
                    <Link href={`/${locale}/deals/${r.dealId}`} dir="ltr" className="text-brand underline">
                      {dealRef(r.dealId)}
                    </Link>
                  </td>
                  <td>{r.item}</td>
                  <td className="tabular-nums">{money(r.amount, r.currency, locale)}</td>
                  <td>{r.direction ? DIR[r.direction][ar ? 0 : 1] : "—"}</td>
                  <td>
                    <Badge tone={ST[r.status][2]}>{ST[r.status][ar ? 0 : 1]}</Badge>
                  </td>
                  <td dir="ltr">{r.ref ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </Container>
    </>
  );
}
