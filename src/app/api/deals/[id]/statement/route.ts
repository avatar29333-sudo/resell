import { getCurrentUser } from "@/lib/auth";
import { loadDealFor, overviewOf } from "@/lib/access";
import { audit } from "@/lib/audit";
import { can, subject, dealCtx } from "@/lib/authz";
import { getSetting } from "@/lib/settings";
import { toNum } from "@/lib/format";
import { CITY, CONTRACT_TYPE, DEAL_STAGE, DOC_TYPE, ESCROW_STATUS, label } from "@/lib/labels";
import { moneyFor, eventSentence, type Side } from "@/lib/deal-overview";
import { dealRef } from "@/lib/action-otp-core";
import { issuePdf } from "@/lib/issue-pdf";
import { isDemoMode } from "@/lib/demo";
import type { Block } from "@/lib/pdf-ar";

const cairo = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(d).replace(",", "") : "—";
const egp = (n: number) => `${n.toLocaleString("en-US")} ج.م`;
const MONEY_STATUS = { DUE: "مستحق", PAID: "مدفوع", HELD: "محجوز في الضمان", RELEASED: "مُفرج عنه", REFUNDED: "مرتجع", ESTIMATE: "تقديري" } as const;
const CONTRACT_STATE: Record<string, string> = {
  VERIFIED: "متحقق منه",
  SIGNED: "موقّع",
  PARTIALLY_SIGNED: "موقّع جزئياً",
  SENT_FOR_SIGNATURE: "مرسل للتوقيع",
  APPROVED: "معتمد",
  PENDING_LAWYER: "عند المحامي",
  DRAFT: "مسودة",
};

/** TXN-01: كشف حساب الصفقة PDF — كل الحركات المالية والمستندات والتوقيعات بتواريخها، لكل طرف نسخته */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const deal = await loadDealFor(user, id);
  if (!deal) return new Response("Not allowed", { status: 403 });
  const side: Side | null = user.id === deal.buyerId ? "BUYER" : user.id === deal.listing.sellerId ? "SELLER" : null;
  const dc = { deal: dealCtx(deal) };
  const staffMoney = !side && can(subject(user), "deal.view_money", dc).allowed;
  const ov = overviewOf(deal);
  const ref = dealRef(deal.id);
  const plot = deal.listing.plot;
  const fees = await getSetting("deal.fees");
  const price = toNum(deal.agreedPrice ?? deal.proposedPrice ?? deal.listing.price);
  const commission = deal.commission
    ? {
        sellerAmount: toNum(deal.commission.sellerAmount),
        buyerAmount: toNum(deal.commission.buyerAmount),
        sellerRatePct: toNum(deal.commission.sellerRatePct),
        buyerRatePct: toNum(deal.commission.buyerRatePct),
        status: deal.commission.status,
      }
    : null;
  const codeVisible = can(subject(user), "listing.view_code", dc).allowed;

  const blocks: Block[] = [
    { kind: "h1", text: `كشف حساب صفقة ${ref}` },
    {
      kind: "kv",
      rows: [
        ["القطعة", `${label(CITY, plot.city, "ar")} — ${plot.district}${codeVisible ? ` — ${plot.code}` : ""}`],
        ["المساحة", `${toNum(plot.areaSqm)} م²`],
        ["المرحلة", `${label(DEAL_STAGE, deal.stage, "ar")} — من ${cairo(ov.stageEnteredAt)}`],
        ["سعر الاتفاق", deal.agreedPrice ? egp(toNum(deal.agreedPrice)) : "لسه ما اتفقش"],
        [
          "سعر الصرف",
          deal.lockedUsdEgpRate && deal.rateLockedAt
            ? `${toNum(deal.lockedUsdEgpRate)} — مقفول بتاريخ ${cairo(deal.rateLockedAt)}${deal.fxSource ? ` (${deal.fxSource})` : ""}`
            : "استرشادي — بيتقفل لحظة توقيع العقد الابتدائي",
        ],
      ],
    },
  ];

  const sides: Side[] = side ? [side] : staffMoney ? ["SELLER", "BUYER"] : [];
  for (const s of sides) {
    const m = moneyFor(s, { price, commission, deposits: ov.deposits, fees, remainingUsd: deal.listing.remainingUsd ? toNum(deal.listing.remainingUsd) : null });
    blocks.push({ kind: "h2", text: s === "SELLER" ? "التفصيل المالي — البائع" : "التفصيل المالي — المشتري" });
    blocks.push({
      kind: "table",
      head: ["البند", "المبلغ", "من ← إلى", "الحالة", "المرجع"],
      widths: [0.3, 0.17, 0.25, 0.14, 0.14],
      rows: [
        ...m.lines.map((l) => [
          l.label[0],
          l.status === "ESTIMATE" && !l.amount ? "بيتحدد" : `${l.sign < 0 ? "− " : ""}${egp(l.amount)}`,
          `${l.payer[0]} ← ${l.payee[0]}`,
          MONEY_STATUS[l.status],
          l.ref ?? "—",
        ]),
        [m.total.label[0], egp(m.total.amount), "", "", ""],
      ],
    });
    if ("after" in m && m.after) blocks.push({ kind: "p", text: `بعدها: ${m.after.label[0]} — $${m.after.amount.toLocaleString("en-US")}` });
  }

  if (deal.deposits.length) {
    blocks.push({ kind: "h2", text: "العربون" });
    blocks.push({
      kind: "table",
      head: ["المبلغ", "الحالة", "مرجع البنك", "محفوظ من", "اتسوّى"],
      rows: deal.deposits.map((d) => [egp(toNum(d.amount)), label(ESCROW_STATUS, d.escrowStatus, "ar"), d.bankReference ?? "—", cairo(d.heldAt), cairo(d.settledAt)]),
    });
  }

  blocks.push({ kind: "h2", text: "العقود والتوقيعات" });
  blocks.push({
    kind: "table",
    head: ["النموذج", "النسخة", "الحالة", "التوقيعات"],
    widths: [0.3, 0.12, 0.2, 0.38],
    rows: deal.contracts
      .filter((c) => c.status !== "VOID")
      .map((c) => [
        label(CONTRACT_TYPE, c.type, "ar"),
        c.templateVersion,
        CONTRACT_STATE[c.status] ?? c.status,
        ((c.signatures as { role: string; signedAt: string }[] | null) ?? []).map((s) => `${s.role === "BUYER" ? "المشتري" : "البائع"} ${cairo(new Date(s.signedAt))}`).join(" · ") || "—",
      ]),
  });

  const docs = deal.documents.filter((d) => d.status !== "SUPERSEDED");
  if (docs.length) {
    blocks.push({ kind: "h2", text: "المستندات" });
    blocks.push({ kind: "table", head: ["المستند", "التاريخ", "SHA-256"], widths: [0.35, 0.3, 0.35], rows: docs.map((d) => [label(DOC_TYPE, d.type, "ar"), cairo(d.createdAt), (d.sha256 ?? "").slice(0, 16)]) });
  }

  blocks.push({ kind: "h2", text: "سجل المعاملة" });
  const evs = deal.events
    .filter((e) => !side || !(e.data as { internal?: boolean } | null)?.internal)
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const actorName = (e: (typeof evs)[number]) => (e.actorId === user.id ? "إنت" : side && e.actor?.role === "CLIENT" ? "طرف في الصفقة" : (e.actor?.name ?? "—"));
  blocks.push({
    kind: "table",
    head: ["التاريخ (القاهرة)", "الحدث"],
    widths: [0.28, 0.72],
    rows: evs.map((e) => [cairo(e.createdAt), eventSentence({ type: e.type, toStage: e.toStage, data: (e.data ?? {}) as Record<string, unknown> }, actorName(e), true)]),
  });
  blocks.push({ kind: "small", text: "الكشف ده بيتولد من سجلات المنصة لحظة التنزيل. الفلوس نفسها في حساب ضمان بالبنك والمنصة بتتابع الحالة بس. للتحقق من صحة النسخة امسح الـ QR." });

  const copyFor = side ?? "STAFF";
  const pdf = await issuePdf(
    {
      title: "كشف حساب الصفقة",
      subtitle: `${copyFor === "BUYER" ? "نسخة المشتري" : copyFor === "SELLER" ? "نسخة البائع" : "نسخة الفريق"} — ${cairo(new Date())}`,
      codePrefix: `${ref}-ST`,
      locale: new URL(req.url).searchParams.get("locale") === "en" ? "en" : "ar",
      watermark: deal.isDemo || isDemoMode() ? "DEMO" : undefined,
    },
    blocks,
    { kind: "STATEMENT", dealId: deal.id, issuedToId: user.id, copyFor },
  );
  await audit(user.id, "deal.statement_downloaded", "Deal", deal.id, { code: pdf.code, seq: pdf.seq, sha256: pdf.sha256, pages: pdf.pages });
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`statement-${ref}.pdf`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
