import "server-only";
import { db } from "./db";
import { pickRateAt, type RateRow } from "./fx-pick";

/**
 * DATA-01 — السعر اللي بيتثبت في الصفقة: آخر سعر بيع في جدول ExchangeRate قبل لحظة التوقيع.
 * بيتخزن في الصفقة (القيمة + id السجل + تاريخه) ومش بيتغير بعد كده أبداً.
 */
export async function lockRateAt(at: Date) {
  const rows = await db.exchangeRate.findMany({
    where: { base: "USD", quote: "EGP", createdAt: { lte: at } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 5,
  });
  return pickRateAt(rows as (RateRow & (typeof rows)[number])[], at);
}
