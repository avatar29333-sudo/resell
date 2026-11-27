import "server-only";
import { createHmac } from "node:crypto";
import { db } from "./db";
import { decryptSecret, encryptSecret } from "./totp";
import { normIban, payoutBlock, type PayoutBlock } from "./bank-rules";

/** BANK-01: الـ IBAN متشفّر على مستوى الحقل (AES-256-GCM) + بصمة HMAC لكشف التكرار من غير فك التشفير */
export const encryptIban = (iban: string) => encryptSecret(normIban(iban));
export const decryptIban = (enc: string) => decryptSecret(enc);
export const ibanHash = (iban: string) => createHmac("sha256", process.env.SESSION_SECRET || "dev-only-secret-change-me-please").update(`iban:${normIban(iban)}`).digest("hex");

export const PAYOUT_ERRORS: Record<PayoutBlock, [string, string]> = {
  no_account: ["المستلم لسه ما اختارش حساب بنكي للصفقة دي.", "The recipient hasn't chosen a bank account for this deal."],
  not_verified: ["حساب المستلم لسه مش متحقق منه من المالية — ممنوع الصرف عليه.", "The recipient's account isn't verified by finance yet — payouts are blocked."],
  cooling: ["الحساب اتضاف/اتعدّل من أقل من 48 ساعة — الصرف بيتفتح بعد فترة الانتظار.", "The account was added/changed under 48 hours ago — payouts open after the waiting period."],
  disabled: ["حساب المستلم موقوف.", "The recipient's account is disabled."],
  wrong_owner: ["الحساب مش باسم المستلم.", "The account isn't in the recipient's name."],
};

/** الحساب اللي هيتصرف عليه (إفراج للبائع / رد للمشتري) + هل الصرف مسموح */
export async function payoutTarget(deal: { buyerId: string; buyerBankAccountId: string | null; sellerBankAccountId: string | null; listing: { sellerId: string } }, to: "RELEASED_TO_SELLER" | "REFUNDED_TO_BUYER", now = new Date()) {
  const recipientId = to === "RELEASED_TO_SELLER" ? deal.listing.sellerId : deal.buyerId;
  const accId = to === "RELEASED_TO_SELLER" ? deal.sellerBankAccountId : deal.buyerBankAccountId;
  const acc = accId ? await db.bankAccount.findUnique({ where: { id: accId } }) : null;
  return { acc, block: payoutBlock(acc, recipientId, now) };
}

/** عمولة شريك / مكافأة إحالة: الحساب الافتراضي المتحقق منه للمستلم */
export async function defaultPayoutAccount(userId: string, now = new Date()) {
  const acc = await db.bankAccount.findFirst({ where: { userId, status: "VERIFIED" }, orderBy: [{ isDefault: "desc" }, { verifiedAt: "desc" }] });
  return { acc, block: payoutBlock(acc, userId, now) };
}
