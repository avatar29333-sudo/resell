import type { Locale } from "@/i18n/config";
import { STAGES, stageIndex } from "@/lib/deal-machine";
import { DEAL_STAGE, label } from "@/lib/labels";
import { num } from "@/lib/format";

/** شريط مراحل الصفقة السبعة */
export function StageStepper({ stage, locale, cancelled }: { stage: string; locale: Locale; cancelled?: boolean }) {
  const current = stageIndex(stage);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {STAGES.map((s, i) => {
        const done = i < current || (s === "CLOSED" && current === i);
        const now = i === current && s !== "CLOSED";
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={`flex flex-col gap-1 border-t-[3px] pt-2 text-sm ${
              cancelled && now
                ? "border-red-700 text-red-700"
                : now
                  ? "border-brand font-bold text-navy"
                  : done
                    ? "border-ok text-ok"
                    : "border-line text-muted"
            }`}
          >
            <span className="font-bold">{num(i + 1, locale)}</span>
            <span>{label(DEAL_STAGE, s, locale)}</span>
          </li>
        );
      })}
    </ol>
  );
}
