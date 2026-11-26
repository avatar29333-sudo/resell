import "server-only";
import { db } from "./db";

// سعر صرف الدولار: من موقع البنك المركزي أولاً، ولو مش متاح من مصدر سوق مفتوح.
// كل سعر بيتسجل بمصدره الحقيقي (CBE_AUTO أو MARKET_API) — مفيش تخمين.

const CBE_URL = process.env.FX_CBE_URL || "https://www.cbe.org.eg/en/economic-research/statistics/cbe-exchange-rates";
const MARKET_URL = process.env.FX_MARKET_URL || "https://open.er-api.com/v6/latest/USD";

async function get(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Resell-FX/1.0" }, cache: "no-store" });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r;
}

/** بيدوّر في جدول البنك المركزي على سطر الدولار ويرجّع الشراء والبيع */
export function parseCbe(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = text.match(/US Dollar\s+([\d]{2}\.\d{2,4})\s+([\d]{2}\.\d{2,4})/i);
  if (!m) return null;
  const buy = Number(m[1]);
  const sell = Number(m[2]);
  return buy > 10 && sell >= buy && sell < 500 ? { buy, sell } : null;
}

export async function fetchUsdEgp(): Promise<{ buy: number; sell: number; source: "CBE_AUTO" | "MARKET_API" } | null> {
  try {
    const r = parseCbe(await (await get(CBE_URL)).text());
    if (r) return { ...r, source: "CBE_AUTO" };
  } catch {
    // موقع البنك المركزي مش متاح أو اتغيّر شكله — نكمّل للمصدر التاني
  }
  try {
    const j = (await (await get(MARKET_URL)).json()) as { rates?: Record<string, number> };
    const egp = j.rates?.EGP;
    if (egp && egp > 10 && egp < 500) return { buy: egp, sell: egp, source: "MARKET_API" };
  } catch {
    // الاتنين مش متاحين
  }
  return null;
}

const cairoToday = () => new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()));

/** يسجّل سعر النهارده لو لسه ما اتسجلش آلي */
export async function updateDailyRate() {
  const date = cairoToday();
  const exists = await db.exchangeRate.findFirst({ where: { date, source: { in: ["CBE_AUTO", "MARKET_API"] } } });
  if (exists) return { status: "exists" as const, rate: exists };
  const r = await fetchUsdEgp();
  if (!r) return { status: "unavailable" as const };
  const rate = await db.exchangeRate.create({ data: { date, buy: r.buy, sell: r.sell, source: r.source } });
  return { status: "created" as const, rate };
}
