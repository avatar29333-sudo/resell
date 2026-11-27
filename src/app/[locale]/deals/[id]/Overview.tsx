import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { Badge, Card } from "@/components/ui";
import { date, money, num } from "@/lib/format";
import { label, CITY, CONTRACT_TYPE } from "@/lib/labels";
import { districtName } from "@/lib/district";
import { STAGES, stageIndex } from "@/lib/deal-machine";
import { daysLeft, depositBar, docStageLabel, isUrgent, moneyFor, nextActionFor, timeline, type MoneyStatus, type OverviewInput, type Side } from "@/lib/deal-overview";
import type { Tone } from "@/lib/labels";

const STATUS: Record<MoneyStatus, [string, string, Tone]> = {
  DUE: ["مستحق", "Due", "amber"],
  PAID: ["مدفوع", "Paid", "green"],
  HELD: ["محجوز في الضمان", "Held in escrow", "blue"],
  RELEASED: ["مُفرج عنه", "Released", "green"],
  REFUNDED: ["مرتجع", "Refunded", "red"],
  ESTIMATE: ["تقديري", "Estimate", "gray"],
};

/** عدّاد «باقي X يوم» — أحمر لو أقل من 3 أيام */
export function Countdown({ due, ar, now = new Date() }: { due: Date | null; ar: boolean; now?: Date }) {
  if (!due) return null;
  const d = daysLeft(due, now);
  const red = isUrgent(d);
  const n = (x: number) => (ar ? x.toLocaleString("ar-EG") : String(x));
  const text = d < 0 ? (ar ? `متأخر ${n(-d)} يوم` : `${-d} days late`) : d === 0 ? (ar ? "آخر يوم النهارده" : "Due today") : ar ? `باقي ${n(d)} يوم` : `${d} days left`;
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-sm font-semibold tabular-nums ${red ? "border-[#E3B4B4] bg-[#FBECEC] text-[#A32020]" : "border-line bg-paper text-ink"}`}>
      {text}
    </span>
  );
}

type Props = {
  locale: Locale;
  facts: OverviewInput;
  side: Side | null;
  /** موظف بيشوف التفصيل المالي (الطرفين) */
  staffMoney: boolean;
  plot: { city: string; district: string; districtEn: string | null; code: string; areaSqm: unknown; buildDeadline: Date | null };
  codeVisible: boolean;
  price: number;
  commission: { sellerAmount: number; buyerAmount: number; sellerRatePct: number; buyerRatePct: number; status: string } | null;
  fees: { transferFeeEgp: number; notaryFeeEgp: number };
  remainingUsd: number | null;
  fx: { locked: boolean; rate: number; at: Date | null };
  dealId: string;
};

export function DealOverview(p: Props) {
  const ar = p.locale === "ar";
  const L = (a: string, e: string) => (ar ? a : e);
  const next = nextActionFor(p.facts, p.side, ar);
  const cur = stageIndex(p.facts.stage) + 1;
  const buildDays = p.plot.buildDeadline ? daysLeft(p.plot.buildDeadline, new Date()) : null;
  const dep = p.facts.deposits.find((d) => d.escrowStatus !== "REFUNDED_TO_BUYER") ?? p.facts.deposits[0];
  const bar = depositBar(dep);
  const sides: Side[] = p.side ? [p.side] : p.staffMoney ? ["SELLER", "BUYER"] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 1. المطلوب منك الآن */}
      <section aria-labelledby="ov-next" className={`flex flex-col gap-3 border-2 p-5 ${next?.mine ? "border-brand bg-[#EEF3FC]" : "border-line bg-white"}`}>
        <h2 id="ov-next" className="text-lg font-bold">
          {p.side ? L("المطلوب منك الآن", "Required from you now") : L("الخطوة الحالية", "Current step")}
        </h2>
        {next ? (
          <>
            <p className="text-base leading-7 font-semibold">{next.text}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Countdown due={next.dueAt} ar={ar} />
              {next.mine && (
                <a href={next.anchor} className="inline-flex min-h-11 items-center bg-brand px-4 font-semibold text-white">
                  {L("نفّذ دلوقتي", "Do it now")}
                </a>
              )}
            </div>
          </>
        ) : (
          <p className="text-base">{p.facts.status === "COMPLETED" ? L("الصفقة اتقفلت بنجاح.", "The deal closed successfully.") : L("الصفقة مش شغالة.", "The deal isn't active.")}</p>
        )}
      </section>

      {/* 2. ملخص الصفقة */}
      <Card title={L("ملخص الصفقة", "Deal summary")}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{L("القطعة", "Plot")}</dt>
          <dd className="font-semibold">
            {label(CITY, p.plot.city, p.locale)} — {districtName(p.plot, p.locale)}
            {p.codeVisible && (
              <span dir="ltr" className="ms-1 tabular-nums">
                · {p.plot.code}
              </span>
            )}
          </dd>
          <dt className="text-muted">{L("المساحة", "Area")}</dt>
          <dd className="font-semibold tabular-nums">
            {num(p.plot.areaSqm as number, p.locale)} {L("م²", "m²")}
          </dd>
          <dt className="text-muted">{L("سعر الاتفاق", "Agreed price")}</dt>
          <dd className="font-semibold tabular-nums">{p.facts.agreedPrice ? money(p.facts.agreedPrice, "EGP", p.locale) : L("لسه ما اتفقش", "Not agreed yet")}</dd>
          <dt className="text-muted">{L("سعر الصرف", "FX rate")}</dt>
          <dd className="font-semibold tabular-nums">
            {num(p.fx.rate, p.locale, 2)}{" "}
            {p.fx.locked && p.fx.at ? <Badge tone="green">{L(`مقفول بتاريخ ${date(p.fx.at, p.locale)}`, `Locked ${date(p.fx.at, p.locale)}`)}</Badge> : <Badge tone="amber">{L("استرشادي", "Indicative")}</Badge>}
          </dd>
          <dt className="text-muted">{L("المرحلة", "Stage")}</dt>
          <dd className="font-semibold">
            {L(`${num(cur, p.locale)} من ${num(7, p.locale)}`, `${cur} of 7`)} · {L("من", "since")} {date(p.facts.stageEnteredAt, p.locale)}
          </dd>
          <dt className="text-muted">{L("مهلة البناء المتبقية", "Build deadline left")}</dt>
          <dd className={`font-semibold tabular-nums ${buildDays !== null && buildDays < 120 ? "text-[#A32020]" : ""}`}>
            {buildDays === null ? "—" : buildDays < 0 ? L("خلصت", "Passed") : L(`${num(buildDays, p.locale)} يوم`, `${buildDays} days`)}
          </dd>
        </dl>
      </Card>

      {/* 3. التفصيل المالي — كل طرف بيشوف نصيبه بس */}
      {sides.length > 0 && p.facts.agreedPrice !== null && (
        <Card title={L("التفصيل المالي", "Financial breakdown")} className="lg:col-span-2">
          <div className={`grid gap-6 ${sides.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {sides.map((s) => {
              const m = moneyFor(s, { price: p.price, commission: p.commission, deposits: p.facts.deposits, fees: p.fees, remainingUsd: p.remainingUsd });
              return (
                <div key={s} className="flex flex-col gap-2">
                  {sides.length > 1 && <h3 className="font-bold">{s === "SELLER" ? L("البائع", "Seller") : L("المشتري", "Buyer")}</h3>}
                  <ul className="flex flex-col divide-y divide-line text-sm">
                    {m.lines.map((l, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="flex flex-col">
                          <span className="font-semibold">{l.label[ar ? 0 : 1]}</span>
                          <span className="text-[13px] text-muted">
                            {l.payer[ar ? 0 : 1]} ← {l.payee[ar ? 0 : 1]}
                            {l.ref && (
                              <>
                                {" "}
                                · {L("مرجع", "ref")} <span dir="ltr">{l.ref}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            {l.status === "ESTIMATE" && !l.amount ? L("بيتحدد من الجهاز", "Set by the authority") : `${l.sign < 0 ? "− " : ""}${money(l.amount, l.currency, p.locale)}`}
                          </span>
                          <Badge tone={STATUS[l.status][2]}>{STATUS[l.status][ar ? 0 : 1]}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t-2 border-navy pt-2 text-base font-bold">
                    <span>{m.total.label[ar ? 0 : 1]}</span>
                    <span className="tabular-nums">{money(m.total.amount, "EGP", p.locale)}</span>
                  </div>
                  {"after" in m && m.after && (
                    <p className="text-sm text-muted">
                      {L("بعدها", "Then")}: {m.after.label[ar ? 0 : 1]} — <span className="font-semibold tabular-nums">{money(m.after.amount, m.after.currency, p.locale)}</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 4. العربون فين دلوقتي */}
      <Card title={L("العربون فين دلوقتي؟", "Where is the deposit now?")} className={sides.length ? "lg:col-span-2" : ""}>
        <ol className="grid grid-cols-3 gap-1 text-center text-sm" aria-label={L("حالة العربون", "Deposit status")}>
          {bar.map((s) => (
            <li
              key={s.key}
              aria-current={s.state === "current" ? "step" : undefined}
              className={`flex min-h-11 items-center justify-center border px-2 py-2 font-semibold ${s.state === "done" ? "border-ok bg-[#E9F6EE] text-ok" : s.state === "current" ? "border-brand bg-[#EEF3FC] text-brand" : "border-line text-muted"}`}
            >
              {s.state === "done" && "✓ "}
              {s.label[ar ? 0 : 1]}
            </li>
          ))}
        </ol>
        <p className="text-sm">
          {dep ? (
            <>
              <span className="font-semibold tabular-nums">{money(dep.amount, "EGP", p.locale)}</span>
              {dep.bankReference && (
                <>
                  {" "}
                  · {L("مرجع البنك", "Bank ref")} <span dir="ltr">{dep.bankReference}</span>
                </>
              )}
            </>
          ) : (
            L("العربون لسه ما اتسجلش.", "No deposit recorded yet.")
          )}
        </p>
        <p className="text-sm text-muted">
          {L(
            "شرط الإفراج (محضر العربون — نموذج 4): بيتصرف للبائع بعد موافقة الجهاز على التنازل وتوقيع محضر الإغلاق، وبيترد للمشتري لو الجهاز رفض أو البائع انسحب.",
            "Release condition (deposit agreement — form 4): paid to the seller after the authority approves the transfer and the closing record is signed; refunded to the buyer if the authority refuses or the seller withdraws.",
          )}
        </p>
      </Card>
    </div>
  );
}

/** الخط الزمني للمراحل السبعة: الشروط ومين مسؤول، الموعد، والمستندات وحالتها */
export function DealTimeline({ locale, facts }: { locale: Locale; facts: OverviewInput }) {
  const ar = locale === "ar";
  const L = (a: string, e: string) => (ar ? a : e);
  const STAGE_NAMES: Record<string, [string, string]> = {
    INTEREST: ["اهتمام", "Interest"],
    COMMISSION_AGREEMENT: ["اتفاق العمولة", "Commission agreement"],
    PRICE_AGREED: ["اتفاق السعر", "Price agreed"],
    PRELIMINARY_CONTRACT: ["العقد المبدئي والعربون", "Preliminary contract & deposit"],
    TRANSFER_FILED: ["تقديم التنازل", "Transfer filed"],
    AUTHORITY_APPROVED: ["موافقة الجهاز", "Authority approval"],
    CLOSED: ["الإغلاق", "Closed"],
  };
  return (
    <Card title={L("الخط الزمني للصفقة", "Deal timeline")}>
      <ol className="flex flex-col gap-3">
        {timeline(facts).map((t) => (
          <li key={t.stage} className={`border-s-4 ps-3 ${t.state === "done" ? "border-ok" : t.state === "current" ? "border-brand" : "border-line"}`}>
            <details open={t.state === "current"}>
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2">
                <span className="font-bold tabular-nums">{t.index}.</span>
                <span className="font-semibold">{STAGE_NAMES[t.stage][ar ? 0 : 1]}</span>
                {t.state === "done" && <Badge tone="green">{L("خلصت", "Done")}</Badge>}
                {t.state === "current" && <Badge tone="blue">{L("إنت هنا", "Current")}</Badge>}
                {t.state === "current" && <Countdown due={t.dueAt} ar={ar} />}
              </summary>
              <div className="flex flex-col gap-2 pb-2 text-sm">
                {t.conds.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {t.conds.map((c) => (
                      <li key={c.key} className="flex flex-wrap gap-1">
                        <span className={c.ok || t.state === "done" ? "text-ok" : "text-[#A32020]"}>{c.ok || t.state === "done" ? "✓" : "✗"}</span>
                        <span>{c.text[ar ? 0 : 1]}</span>
                        <span className="text-muted">— {L("المسؤول", "owner")}: {c.owner[ar ? 0 : 1]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {t.docs.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {t.docs.map((d) => (
                      <li key={d.type}>
                        <Badge tone={d.status === "VERIFIED" ? "green" : d.status ? "amber" : "gray"}>
                          {label(CONTRACT_TYPE, d.type, locale)}: {docStageLabel(d.status)[ar ? 0 : 1]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">{L(`${STAGES.length} مراحل — كل مرحلة فيها شروطها ومين مسؤول عنها.`, `${STAGES.length} stages — each lists its conditions and who owns them.`)}</p>
    </Card>
  );
}

export function StatementLink({ locale, dealId }: { locale: Locale; dealId: string }) {
  return (
    <Link href={`/api/deals/${dealId}/statement?locale=${locale}`} prefetch={false} className="inline-flex min-h-11 items-center border border-brand px-4 font-semibold text-brand">
      {locale === "ar" ? "كشف حساب الصفقة PDF" : "Deal statement PDF"}
    </Link>
  );
}
