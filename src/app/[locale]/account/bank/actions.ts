"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { requireActionCode } from "@/lib/action-otp";
import { idsByRole, notify } from "@/lib/notifications";
import { queueMessage } from "@/lib/outbox";
import { COOLING_MS, ibanValid, namesMatch, normIban, swiftValid } from "@/lib/bank-rules";
import { encryptIban, ibanHash } from "@/lib/bank";
import { isLocale } from "@/i18n/config";

const loc = (l: string) => (isLocale(l) ? l : "ar");
const page = (l: string) => `/${loc(l)}/account/bank`;
const CURRENCIES = ["EGP", "USD", "EUR", "GBP", "SAR", "AED", "KWD", "QAR"];

/** BANK-01: إضافة حساب بكود تأكيد + إثبات ملكية؛ بيبدأ PENDING ومش بيتصرف عليه قبل 48 ساعة وتحقق المالية */
export async function addBankAccount(locale: string, form: FormData) {
  const l = loc(locale);
  const user = await requireUser(l, page(l));
  const s = (k: string) => String(form.get(k) ?? "").trim().replace(/\s+/g, " ");
  const iban = normIban(s("iban"));
  const swift = s("swiftBic").replace(/\s+/g, "").toUpperCase();
  const currency = CURRENCIES.includes(s("currency")) ? s("currency") : "EGP";
  const holderName = s("holderName");
  const bankName = s("bankName");
  if (!ibanValid(iban)) redirect(`${page(l)}?err=iban`);
  if (swift && !swiftValid(swift)) redirect(`${page(l)}?err=swift`);
  if (holderName.length < 3 || bankName.length < 2) redirect(`${page(l)}?err=fields`);
  // ممنوع حساب طرف تالت: نفس الـ IBAN متسجل لمستخدم تاني → مرفوض
  const hash = ibanHash(iban);
  const dup = await db.bankAccount.findFirst({ where: { ibanHash: hash, status: { not: "DISABLED" } } });
  if (dup && dup.userId !== user.id) redirect(`${page(l)}?err=taken`);
  if (dup) redirect(`${page(l)}?err=exists`);
  // الكود مربوط بالـ IBAN نفسه
  await requireActionCode(user, "bank.add", null, { iban }, form, page(l));
  const proofId = String(form.get("docIds") ?? "");
  const proof = proofId ? await db.document.findFirst({ where: { id: proofId, ownerId: user.id, uploadedById: user.id, type: "OTHER", dealId: null, listingId: null } }) : null;
  const first = !(await db.bankAccount.findFirst({ where: { userId: user.id, currency, status: { not: "DISABLED" } } }));
  const acc = await db.bankAccount.create({
    data: {
      userId: user.id,
      holderName,
      bankName,
      country: iban.slice(0, 2),
      currency,
      ibanEnc: encryptIban(iban),
      ibanLast4: iban.slice(-4),
      ibanHash: hash,
      swiftBic: swift || null,
      branch: s("branch") || null,
      isDefault: first,
      nameMatches: namesMatch(holderName, user.name),
      proofDocumentId: proof?.id ?? null,
      usableAfter: new Date(Date.now() + COOLING_MS),
    },
  });
  if (proof) await db.document.update({ where: { id: proof.id }, data: { title: "إثبات ملكية حساب بنكي" } });
  await audit(user.id, "bank.add", "BankAccount", acc.id, { country: acc.country, currency, last4: acc.ibanLast4, nameMatches: acc.nameMatches });
  // تنبيه أمان على القناتين
  const text = `تم إضافة حساب بنكي ينتهي بـ ${acc.ibanLast4} لحسابك على Resell. لو مش إنت، كلّمنا فوراً.`;
  await queueMessage("whatsapp", user.phone, "bank.added", text);
  if (user.email) await queueMessage("email", user.email, "bank.added", text);
  await notify(await idsByRole("FINANCE"), {
    kind: "bank.pending",
    ar: ["حساب بنكي جديد مستني التحقق", acc.nameMatches ? undefined : "الاسم مش مطابق للاسم الموثّق — راجعه يدوياً"],
    en: ["A new bank account awaits verification", acc.nameMatches ? undefined : "The name doesn't match the verified name — review manually"],
    link: `/finance?tab=banks`,
  });
  revalidatePath(page(l));
  redirect(`${page(l)}?ok=added`);
}

/** حساب افتراضي للعملة */
export async function setDefaultBank(locale: string, id: string) {
  const l = loc(locale);
  const user = await requireUser(l, page(l));
  const acc = await db.bankAccount.findFirst({ where: { id, userId: user.id, status: { not: "DISABLED" } } });
  if (!acc) return;
  await db.$transaction([
    db.bankAccount.updateMany({ where: { userId: user.id, currency: acc.currency }, data: { isDefault: false } }),
    db.bankAccount.update({ where: { id }, data: { isDefault: true } }),
  ]);
  await audit(user.id, "bank.default", "BankAccount", id);
  revalidatePath(page(l));
}

/** ممنوع الحذف: إيقاف بس (والمستخدم في صفقات بيفضل في السجل) */
export async function disableBank(locale: string, id: string) {
  const l = loc(locale);
  const user = await requireUser(l, page(l));
  const acc = await db.bankAccount.findFirst({ where: { id, userId: user.id } });
  if (!acc) return;
  const locked = await db.deal.findFirst({ where: { status: { in: ["ACTIVE", "ON_HOLD"] }, bankLockedAt: { not: null }, OR: [{ buyerBankAccountId: id }, { sellerBankAccountId: id }] } });
  if (locked) redirect(`${page(l)}?err=locked`);
  await db.bankAccount.update({ where: { id }, data: { status: "DISABLED", isDefault: false } });
  await audit(user.id, "bank.disable", "BankAccount", id);
  revalidatePath(page(l));
}
