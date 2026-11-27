"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { authorize } from "@/lib/authz";
import { heldTotalAt, monthEnd, reconcileDiff } from "@/lib/reconcile";
import { toNum } from "@/lib/format";
import { isLocale } from "@/i18n/config";

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
