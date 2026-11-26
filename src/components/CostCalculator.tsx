"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { money, num, tr } from "@/lib/format";

type Props = {
  locale: Locale;
  priceEgp: number;
  buyerPct: number;
  /** نسبة رسوم التنازل في الجهاز — null لو لسه ما اتحددتش في الإعدادات */
  transferPct: number | null;
  lawyerFeeEgp: number;
  usdEgp: number;
};

/** حاسبة التكلفة الكاملة للمشتري — بالجنيه أو بالدولار */
export function CostCalculator({ locale, priceEgp, buyerPct, transferPct, lawyerFeeEgp, usdEgp }: Props) {
  const L = tr(locale);
  const [cur, setCur] = useState<"EGP" | "USD">("EGP");
  const [offer, setOffer] = useState(Math.round(priceEgp));

  const commission = (offer * buyerPct) / 100;
  const transfer = transferPct === null ? null : (offer * transferPct) / 100;
  const total = offer + commission + (transfer ?? 0) + lawyerFeeEgp;
  const deposit = offer * 0.1;
  const show = (v: number) => (cur === "USD" ? money(v / usdEgp, "USD", locale) : money(v, "EGP", locale));

  const rows: [string, string, string?][] = [
    [L("سعر القطعة", "Plot price"), show(offer)],
    [L(`عمولة Resell (${num(buyerPct, locale, 2)}%)`, `Resell commission (${buyerPct}%)`), show(commission)],
    [
      L("رسوم التنازل في الجهاز", "Authority transfer fee"),
      transfer === null ? L("بتتحدد من إفادة الجهاز", "Set by the authority statement") : show(transfer),
      transfer === null ? undefined : L(`${num(transferPct!, locale, 2)}% — تقديري من الإعدادات`, `${transferPct}% — estimate from settings`),
    ],
    ...(lawyerFeeEgp > 0 ? ([[L("أتعاب المحامي", "Lawyer fee"), show(lawyerFeeEgp)]] as [string, string][]) : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          {L("السعر اللي هتعرضه (ج.م)", "Your offer (EGP)")}
          <input
            type="number"
            min={0}
            step={10000}
            value={offer}
            onChange={(e) => setOffer(Math.max(0, Number(e.target.value) || 0))}
            className="min-h-11 w-44 border border-line px-3 text-ink"
          />
        </label>
        <div role="radiogroup" aria-label={L("العملة", "Currency")} className="flex border border-line">
          {(["EGP", "USD"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cur === c}
              onClick={() => setCur(c)}
              className={`min-h-11 px-4 font-semibold ${cur === c ? "bg-navy text-white" : "bg-white text-navy"}`}
            >
              {c === "EGP" ? L("جنيه", "EGP") : L("دولار", "USD")}
            </button>
          ))}
        </div>
      </div>
      <dl className="flex flex-col divide-y divide-line border-y border-line">
        {rows.map(([k, v, hint]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="flex flex-col">
              <span>{k}</span>
              {hint && <span className="text-xs text-muted">{hint}</span>}
            </dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 py-2.5 text-lg">
          <dt className="font-bold">{L("الإجمالي التقديري", "Estimated total")}</dt>
          <dd className="font-bold text-navy">{show(total)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted">
        {L(`العربون (10%) وقت العقد المبدئي: ${show(deposit)} — بيتحفظ في حساب ضمان بالبنك.`, `Deposit (10%) at the preliminary contract: ${show(deposit)} — held in a bank escrow account.`)}{" "}
        {L(`سعر الدولار: ${num(usdEgp, locale, 2)} ج.م.`, `USD rate: EGP ${num(usdEgp, locale, 2)}.`)}
      </p>
    </div>
  );
}
