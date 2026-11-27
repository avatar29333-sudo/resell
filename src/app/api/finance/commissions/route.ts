import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { can, subject } from "@/lib/authz";
import { toNum } from "@/lib/format";

// OPS-01: تصدير العمولات CSV (المالي والأدمن بس)
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // منع حقن الصيغ في Excel + الهروب من الفواصل والعلامات
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(subject(user), "commission.collect").allowed) return new Response("Forbidden", { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db.commission.findMany({
    where: status && ["PENDING", "INVOICED", "PAID", "WAIVED"].includes(status) ? { status: status as never } : {},
    include: { deal: { include: { listing: { include: { plot: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const head = ["deal", "city", "stage", "status", "seller_pct", "seller_amount", "buyer_pct", "buyer_amount", "currency", "paid_at", "payment_ref", "created_at"];
  const lines = rows.map((r) =>
    [
      r.dealId.slice(-6).toUpperCase(),
      r.deal.listing.plot.city,
      r.deal.stage,
      r.status,
      toNum(r.sellerRatePct),
      r.sellerAmount ? toNum(r.sellerAmount) : "",
      toNum(r.buyerRatePct),
      r.buyerAmount ? toNum(r.buyerAmount) : "",
      r.currency,
      r.paidAt?.toISOString().slice(0, 10) ?? "",
      r.paymentRef ?? "",
      r.createdAt.toISOString().slice(0, 10),
    ]
      .map(cell)
      .join(","),
  );
  await audit(user.id, "commission.export", "Commission", "csv", { count: rows.length, status });
  // BOM عشان Excel يفتح العربي صح
  return new Response("﻿" + [head.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commissions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
