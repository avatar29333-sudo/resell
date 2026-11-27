"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { loadDealFor } from "@/lib/access";
import { requestActionCode, CHANNEL_LABEL } from "@/lib/action-otp";
import { dealRef, isActionKey, type ActionKey } from "@/lib/action-otp-core";
import { CONTRACT_TYPE } from "@/lib/labels";
import { toNum } from "@/lib/format";
import { normIban } from "@/lib/bank-rules";
import { isLocale } from "@/i18n/config";

export type CodeRequest = { ok?: boolean; error?: string; summary?: string; channel?: string; demoCode?: string | null };

const egp = (n: number, ar: boolean) => (ar ? `${n.toLocaleString("en-US")} ج.م` : `EGP ${n.toLocaleString("en-US")}`);

/**
 * DEAL-03: الملخص بيتبني في السيرفر من البيانات الحقيقية (مش من المتصفح)، وبيتكتب في رسالة الكود.
 * subjectId = الصفقة (أو العرض لإجراءات العرض، أو المستخدم لإجراءات الحساب).
 */
export async function requestCode(locale: string, action: string, subjectId: string | null, fields: Record<string, string>): Promise<CodeRequest> {
  const l = isLocale(locale) ? locale : "ar";
  const ar = l === "ar";
  if (!isActionKey(action)) return { error: "action" };
  const user = await requireUser(l, `/${l}/account`);
  // نفس التوحيد اللي السيرفر بيعمله وقت التنفيذ (وإلا الكود ما يطابقش)
  if (action === "bank.add") fields = { ...fields, iban: normIban(fields.iban ?? "") };
  let summary: string | null = null;

  if (action.startsWith("listing.")) {
    const listing = subjectId ? await db.listing.findUnique({ where: { id: subjectId }, include: { plot: true } }) : null;
    if (!listing || (listing.sellerId !== user.id && listing.submittedById !== user.id)) return { error: "forbidden" };
    const ref = `RS-LS-${listing.id.slice(-6).toUpperCase()}`;
    summary =
      action === "listing.withdraw"
        ? ar ? `سحب عرضك ${ref} رغم وجود صفقة شغالة` : `Withdraw your listing ${ref} despite an active deal`
        : ar ? `تعديل سعر عرضك ${ref} إلى ${egp(Number(fields.price), true)}` : `Change your listing ${ref} price to ${egp(Number(fields.price), false)}`;
  } else if (action === "otp.channel_change" || action === "bank.add") {
    summary =
      action === "otp.channel_change"
        ? ar ? `تغيير قناة كود التحقق إلى ${CHANNEL_LABEL[(fields.channel as keyof typeof CHANNEL_LABEL) ?? "whatsapp"]?.[0] ?? fields.channel}` : `Change your verification channel to ${CHANNEL_LABEL[(fields.channel as keyof typeof CHANNEL_LABEL) ?? "whatsapp"]?.[1] ?? fields.channel}`
        : ar ? `إضافة حساب بنكي ينتهي بـ ${String(fields.iban ?? "").slice(-4)}` : `Add a bank account ending ${String(fields.iban ?? "").slice(-4)}`;
  } else {
    const deal = subjectId ? await loadDealFor(user, subjectId) : null;
    if (!deal) return { error: "forbidden" };
    const isParty = user.id === deal.buyerId || user.id === deal.listing.sellerId;
    if (!isParty) return { error: "forbidden" }; // موافقة الطرف لازم تيجي بكوده هو
    const ref = dealRef(deal.id);
    const contract = fields.contractId ? deal.contracts.find((c) => c.id === fields.contractId) : null;
    const deposit = fields.depositId ? deal.deposits.find((d) => d.id === fields.depositId) : null;
    const k = action as ActionKey;
    // الملخص بيتبني من الحساب نفسه (القيم المربوطة بالكود بتفضل accountId بس)
    let bankLast4 = "";
    if (k === "bank.select") {
      const acc = fields.accountId ? await db.bankAccount.findFirst({ where: { id: fields.accountId, userId: user.id }, select: { ibanLast4: true } }) : null;
      if (!acc) return { error: "forbidden" };
      bankLast4 = acc.ibanLast4;
    }
    const FIELD_AR: Record<string, [string, string]> = { name: ["اسمك", "your name"], plotCode: ["كود القطعة", "the plot code"], documents: ["مستندات القطعة", "the plot documents"] };
    const fieldsText = String(fields.fields ?? "").split(",").filter(Boolean).map((f) => FIELD_AR[f]?.[ar ? 0 : 1] ?? f).join(ar ? " + " : " + ");
    const t: Partial<Record<ActionKey, [string, string]>> = {
      "price.accept": [`كود موافقتك على سعر ${egp(toNum(deal.proposedPrice), true)} — صفقة ${ref}`, `Your approval of the price ${egp(toNum(deal.proposedPrice), false)} — deal ${ref}`],
      "price.offer": [`كود عرضك بسعر ${egp(Number(fields.price), true)} — صفقة ${ref}`, `Your offer of ${egp(Number(fields.price), false)} — deal ${ref}`],
      "price.counter": [`كود عرضك المقابل بسعر ${egp(Number(fields.price), true)} — صفقة ${ref}`, `Your counter-offer of ${egp(Number(fields.price), false)} — deal ${ref}`],
      "price.reject": [`كود رفضك للسعر المقترح ${egp(toNum(deal.proposedPrice), true)} — صفقة ${ref}`, `Your rejection of the proposed price ${egp(toNum(deal.proposedPrice), false)} — deal ${ref}`],
      "deposit.sent": [`كود تأكيدك إنك حوّلت العربون ${egp(toNum(deposit?.amount), true)} — صفقة ${ref}`, `Your confirmation that you transferred the deposit ${egp(toNum(deposit?.amount), false)} — deal ${ref}`],
      "deposit.received": [`كود تأكيدك إنك استلمت ${egp(toNum(deposit?.amount), true)} — صفقة ${ref}`, `Your confirmation that you received ${egp(toNum(deposit?.amount), false)} — deal ${ref}`],
      "deal.cancel_request": [`كود طلبك إلغاء الصفقة ${ref}`, `Your request to cancel deal ${ref}`],
      "document.share": [`كود موافقتك على مشاركة مستند مع الطرف الآخر — صفقة ${ref}`, `Your approval to share a document with the other party — deal ${ref}`],
      "disclosure.consent": [`كود موافقتك على كشف ${fieldsText} للطرف الآخر — صفقة ${ref}`, `Your consent to disclose ${fieldsText} to the other party — deal ${ref}`],
      "bank.select": [`كود اختيارك الحساب البنكي المنتهي بـ ${bankLast4} لاستلام/رد الفلوس — صفقة ${ref}`, `Your choice of the bank account ending ${bankLast4} for payouts/refunds — deal ${ref}`],
    };
    if (contract && ["contract.sign", "commission.approve", "closing.approve", "cancellation.approve"].includes(k)) {
      const name = CONTRACT_TYPE[contract.type] ?? [contract.type, contract.type];
      const price = deal.agreedPrice ? ` — ${ar ? "السعر" : "price"} ${egp(toNum(deal.agreedPrice), ar)}` : "";
      summary = ar ? `كود موافقتك وتوقيعك على ${name[0]} (نسخة ${contract.templateVersion})${price} — صفقة ${ref}` : `Your approval and signature of the ${name[1]} (version ${contract.templateVersion})${price} — deal ${ref}`;
    } else if (t[k]) summary = t[k]![ar ? 0 : 1];
  }
  if (!summary) return { error: "action" };
  const r = await requestActionCode(user, action, subjectId, fields, summary);
  if (!r.ok) return { error: r.error };
  return { ok: true, summary, channel: CHANNEL_LABEL[r.channel][ar ? 0 : 1], demoCode: r.demoCode };
}
