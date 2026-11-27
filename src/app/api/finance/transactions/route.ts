import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { loadTx } from "@/lib/transactions-load";
import { toCsv } from "@/lib/export-core";
import { dealRef } from "@/lib/action-otp-core";

/** TXN-02: تصدير حركات المنصة CSV (المالية والأدمن بس) — بنفس الفلاتر */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !["FINANCE", "ADMIN"].includes(user.role)) return new Response("Not allowed", { status: 403 });
  const sp = new URL(req.url).searchParams;
  let rows = await loadTx({}, null);
  if (sp.get("status")) rows = rows.filter((r) => r.status === sp.get("status"));
  if (sp.get("overdue") === "1") rows = rows.filter((r) => r.overdue);
  await audit(user.id, "finance.transactions_csv", "Report", "transactions", { rows: rows.length, status: sp.get("status"), overdue: sp.get("overdue") });
  const csv = toCsv([["التاريخ", "الصفقة", "البند", "المبلغ", "العملة", "الحالة", "متأخر", "المرجع"], ...rows.map((r) => [r.date.toISOString().slice(0, 10), dealRef(r.dealId), r.item, r.amount, r.currency, r.status, r.overdue ? "نعم" : "", r.ref])]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
