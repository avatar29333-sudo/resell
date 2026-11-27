import { createHash } from "node:crypto";

/**
 * DEAL-03 — كود تحقق مربوط بالإجراء (منطق نقي، متغطي باختبار).
 * كل كود: 6 أرقام، صالح 5 دقايق، مرة واحدة، ومربوط بـ (المستخدم + الإجراء + الصفقة + القيم اللي هيوافق عليها).
 * 5 محاولات غلط → الإجراء يتقفل 15 دقيقة. أقصى حد 5 أكواد في الساعة لكل مستخدم.
 */
export const CODE_TTL_MS = 5 * 60_000;
export const MAX_WRONG = 5;
export const LOCK_MS = 15 * 60_000;
export const MAX_PER_HOUR = 5;

export const ACTION_KEYS = [
  "commission.approve", // 1 اتفاق العمولة (نموذج 2)
  "disclosure.consent", // 2 كشف البيانات للطرف الآخر
  "price.offer", // 3 عرض سعر
  "price.accept", // 3 قبول عرض / 4 الموافقة على السعر النهائي ونسخة العقد
  "price.reject", // 3 رفض
  "price.counter", // 3 عرض مقابل
  "contract.sign", // 5 توقيع/موافقة على نموذج
  "bank.select", // 6 اختيار/تغيير الحساب البنكي للصفقة
  "deposit.sent", // 7 «حوّلت العربون»
  "deposit.received", // 7 «استلمت المبلغ»
  "document.share", // 8 مشاركة مستند مع الطرف الآخر
  "deal.cancel_request", // 9 طلب إلغاء
  "cancellation.approve", // 9 الموافقة على محضر الإلغاء (نموذج 8)
  "closing.approve", // 10 الموافقة على محضر الإغلاق (نموذج 7)
  "listing.withdraw", // 11 سحب العرض بعد بدء صفقة
  "listing.reprice", // 11 تعديل السعر المعلن بعد بدء صفقة
  "otp.channel_change", // تغيير قناة التحقق (بتحقق من القناة القديمة)
  "bank.add", // BANK-01 إضافة/تعديل حساب بنكي
  "consent.accept", // CON-03 موافقة إلكترونية على نموذج (Clickwrap + كود)
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const isActionKey = (k: string): k is ActionKey => (ACTION_KEYS as readonly string[]).includes(k);

/** بصمة القيم اللي هيوافق عليها (ترتيب المفاتيح ثابت) — الكود ما يعدّيش لو القيم اتغيرت */
export function paramsHash(action: string, dealId: string | null, params: Record<string, unknown>) {
  const norm = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`)
    .join("&");
  return createHash("sha256").update(`${action}|${dealId ?? "-"}|${norm}`).digest("hex");
}

export const hashCode = (code: string) => createHash("sha256").update(code.trim()).digest("hex");

export type CodeRow = { action: string; dealId: string | null; paramsHash: string; codeHash: string; expiresAt: Date; usedAt: Date | null; attempts: number };
export type Verdict = "ok" | "wrong" | "expired" | "used" | "mismatch" | "missing" | "locked";

/** القرار على كود مُدخل */
export function decide(row: CodeRow | null, input: { action: string; dealId: string | null; paramsHash: string; code: string; now: Date; lockedUntil?: Date | null }): Verdict {
  if (input.lockedUntil && input.lockedUntil > input.now) return "locked";
  if (!row) return "missing";
  // الكود مربوط بنفس الإجراء ونفس الصفقة ونفس القيم
  if (row.action !== input.action || row.dealId !== input.dealId || row.paramsHash !== input.paramsHash) return "mismatch";
  if (row.usedAt) return "used";
  if (row.expiresAt <= input.now) return "expired";
  if (row.attempts >= MAX_WRONG) return "locked";
  return row.codeHash === hashCode(input.code) ? "ok" : "wrong";
}

/** بعد غلطة: لو وصلت 5 → قفل 15 دقيقة */
export function lockAfterWrong(attemptsAfter: number, now: Date) {
  return attemptsAfter >= MAX_WRONG ? new Date(now.getTime() + LOCK_MS) : null;
}

export const dealRef = (dealId: string) => `RS-DL-${dealId.slice(-6).toUpperCase()}`;

/** نوع الكود حسب النموذج اللي بيتوقّع */
export function contractActionKey(type: string): ActionKey {
  if (type === "COMMISSION_AGREEMENT") return "commission.approve";
  if (type === "CLOSING") return "closing.approve";
  if (type === "CANCELLATION") return "cancellation.approve";
  return "contract.sign";
}
