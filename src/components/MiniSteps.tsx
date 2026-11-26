/** شريط مراحل مصغّر للكروت: المراحل اللي خلصت خضرا، والحالية أزرق */
export function MiniSteps({ steps, current, stopped }: { steps: string[]; current: number; stopped?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <ol className="flex gap-1" aria-label={steps[current]}>
        {steps.map((s, i) => (
          <li
            key={s}
            title={s}
            aria-current={i === current ? "step" : undefined}
            className={`h-2 flex-1 ${i < current ? "bg-ok" : i === current ? (stopped ? "bg-[#A32020]" : "bg-brand") : "bg-line"}`}
          />
        ))}
      </ol>
      <div className="flex justify-between text-xs text-muted">
        <span>{steps[0]}</span>
        <span>{steps[steps.length - 1]}</span>
      </div>
    </div>
  );
}
