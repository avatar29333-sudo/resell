"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireRecentAuth, requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authz";
import { heldTotalAt, monthEnd, reconcileDiff } from "@/lib/reconcile";
import { toNum } from "@/lib/format";
import { defaultPayoutAccount } from "@/lib/bank";
import { isLocale } from "@/i18n/config";

/** MKT-06: صرف مكافأة إحالة (بمرجع + إعادة تحقق + تدقيق) */
export async function payReferral(locale: string, id: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/finance?tab=referrals`;
  const user = await requireUser(l, back, ["FINANCE", "ADMIN"]);
  await authorize(user, "commission.collect", {}, { back, reason: "referral payout" });
  await requireRecentAuth(user, l, back);
  const ref = String(form.get("reference") ?? "").trim();
  if (ref.length < 3) redirect(`${back}&err=reference`);
  const r = await db.referralReward.findUnique({ where: { id } });
  if (!r || r.status === "PAID") redirect(back);
  // BANK-01: الصرف على حساب VERIFIED بتاع المستلم بس
  const target = await defaultPayoutAccount(r!.referrerId);
  if (target.block) {
    await audit(user.id, "payment.blocked", "ReferralReward", id, { reason: target.block });
    redirect(`${back}&err=payout_${target.block}`);
  }
  await db.referralReward.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), paymentRef: ref } });
  await audit(user.id, "referral.reward_paid", "ReferralReward", id, { amount: toNum(r!.amount), reference: ref });
  revalidatePath(`/${l}/finance`);
  redirect(`${back}&ok=settled`);
}

/** OPS-01: المالي يدخل رقم كشف البنك آخر الشهر، والنظام يحسب رقمه ويسجّل الفرق */
export async function saveReconciliation(locale: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/finance?tab=reconcile`;
  const user = await requireUser(l, back, ["FINANCE", "ADMIN"]);
  await authorize(user, "finance.reconcile", {}, { back });
  const month = String(form.get("month") ?? "");
  const bankTotal = Number(form.get("bankTotal"));
  if (!/^\d{4}-\d{2}$/.test(month) || !(bankTotal >= 0)) redirect(`${back}&err=reconcile`);
  const deposits = await db.deposit.findMany({ where: { currency: "EGP" }, select: { amount: true, heldAt: true, settledAt: true } });
  const systemTotal = heldTotalAt(
    deposits.map((d) => ({ amount: toNum(d.amount), heldAt: d.heldAt, settledAt: d.settledAt })),
    monthEnd(month),
  );
  const note = String(form.get("note") ?? "").trim() || null;
  const r = await db.reconciliation.create({ data: { month, systemTotal, bankTotal, note, enteredById: user.id } });
  const { diff, matched } = reconcileDiff(systemTotal, bankTotal);
  await audit(user.id, "finance.reconcile", "Reconciliation", r.id, { month, systemTotal, bankTotal, diff, matched });
  revalidatePath(`/${l}/finance`);
  redirect(`${back}&ok=${matched ? "matched" : "diff"}`);
}

/** BANK-01: المالية تتحقق من الحساب (إثبات الملكية + الاسم) أو ترفضه بسبب */
export async function decideBankAccount(locale: string, id: string, form: FormData) {
  const l = isLocale(locale) ? locale : "ar";
  const back = `/${l}/finance?tab=banks`;
  const user = await requireUser(l, back, ["FINANCE", "ADMIN"]);
  await authorize(user, "finance.reconcile", {}, { back });
  const acc = await db.bankAccount.findUnique({ where: { id } });
  if (!acc || acc.status !== "PENDING") redirect(back);
  if (acc!.userId === user.id) redirect(`${back}&err=self`);
  const approve = form.get("decision") === "VERIFIED";
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!approve && reason.length < 5) redirect(`${back}&err=reason`);
  if (approve && !acc!.nameMatches && form.get("nameChecked") !== "on") redirect(`${back}&err=name_check`);
  await db.bankAccount.update({ where: { id }, data: approve ? { status: "VERIFIED", verifiedById: user.id, verifiedAt: new Date() } : { status: "REJECTED", rejectReason: reason, verifiedById: user.id, verifiedAt: new Date() } });
  await audit(user.id, approve ? "bank.verified" : "bank.rejected", "BankAccount", id, { reason: reason || undefined });
  const { notify } = await import("@/lib/notifications");
  await notify([acc!.userId], {
    kind: approve ? "bank.verified" : "bank.rejected",
    ar: [approve ? `حسابك البنكي المنتهي بـ ${acc!.ibanLast4} اتحقق منه` : `حسابك البنكي المنتهي بـ ${acc!.ibanLast4} اترفض`, reason || undefined],
    en: [approve ? `Your bank account ending ${acc!.ibanLast4} was verified` : `Your bank account ending ${acc!.ibanLast4} was rejected`, reason || undefined],
    link: `/account/bank`,
  });
  revalidatePath(`/${l}/finance`);
  redirect(`${back}&ok=bank`);
}
