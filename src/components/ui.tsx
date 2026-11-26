import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";

// أزرار وحقول موحّدة — نفس هوية الصفحة الرئيسية (زوايا حادة، كحلي وأزرق)
export const btn = {
  primary:
    "inline-flex min-h-11 items-center justify-center gap-2 bg-brand px-5 font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-11 items-center justify-center gap-2 border border-navy bg-white px-5 font-semibold text-navy hover:bg-paper disabled:opacity-50",
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 px-3 font-medium text-brand hover:bg-paper",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 border border-red-700 bg-white px-5 font-semibold text-red-700 hover:bg-red-50",
  small: "inline-flex min-h-9 items-center justify-center gap-1.5 px-3 text-sm font-semibold",
};

export const field = "min-h-11 w-full border border-line bg-white px-3 text-ink focus:border-brand";
export const labelCls = "flex flex-col gap-1.5 text-sm font-medium text-muted";

const TONES: Record<Tone, string> = {
  gray: "bg-paper text-muted border-line",
  blue: "bg-[#E8EEFC] text-brand border-[#C9D5F5]",
  green: "bg-[#E6F3EC] text-ok border-[#BFDCCB]",
  amber: "bg-[#FDF3E1] text-[#8A5A00] border-[#F0D9A8]",
  red: "bg-[#FBEAEA] text-[#A32020] border-[#EFC4C4]",
  navy: "bg-navy text-white border-navy",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  crumbs,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: { href: string; label: string }[];
}) {
  return (
    <section className="bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 pt-8 pb-10 md:px-8">
        {crumbs && (
          <nav aria-label="breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#B9C3DE]">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex gap-2">
                {i > 0 && <span aria-hidden="true">/</span>}
                <Link href={c.href} className="hover:text-white">
                  {c.label}
                </Link>
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
            {subtitle && <div className="max-w-3xl leading-7 text-[#D6DCEE]">{subtitle}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </section>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 py-8 md:px-8 ${className}`}>{children}</div>;
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-4 border border-line bg-white p-5 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-3xl font-bold text-navy">{value}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </>
  );
  const cls = "flex flex-col gap-1 border border-line bg-white p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-line bg-paper px-4 py-6 text-center text-muted">{children}</p>;
}

export function Notice({ tone = "blue", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`border px-4 py-3 leading-7 ${TONES[tone]}`}>{children}</div>;
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-b border-line pb-2">
          <dt className="text-sm text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** جدول بيتمرر أفقياً على الموبايل */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-paper text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 text-start font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-line" aria-label="tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px flex min-h-11 items-center gap-2 border-b-[3px] px-4 font-semibold ${
            t.key === current ? "border-brand text-navy" : "border-transparent text-muted hover:text-navy"
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="bg-paper px-1.5 text-xs text-muted">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function FileLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a href={`/api/files/${id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-medium text-brand hover:text-navy">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M14 3H6v18h12V7z M14 3v4h4" />
      </svg>
      {children}
    </a>
  );
}
