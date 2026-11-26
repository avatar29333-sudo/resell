import "server-only";
import type { Listing } from "@prisma/client";
import { db } from "./db";
import { toNum } from "./format";

export async function latestRate() {
  return db.exchangeRate.findFirst({ where: { base: "USD", quote: "EGP" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
}

/** السعر الشامل بالجنيه: شامل = السعر نفسه، مدفوع + أوفر = المدفوع بالدولار × سعر الصرف + الأوفر */
export function totalEgp(l: Pick<Listing, "priceType" | "price" | "currency" | "paidAmountUsd">, usdEgp: number) {
  const price = toNum(l.price) * (l.currency === "USD" ? usdEgp : 1);
  if (l.priceType === "PAID_PLUS_PREMIUM") return price + toNum(l.paidAmountUsd) * usdEgp;
  return price;
}
