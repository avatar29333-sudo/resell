type Props = { className?: string; size?: number };

// شعار Resell: مربع القطعة مقسوم — نفس الرمز اللي في التصميم
export function LogoMark({ className, size = 26 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="22" height="22" />
      <path d="M2 10h22M13 10v14" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`} dir="ltr">
      <span className="text-[22px] font-bold tracking-wide">Resell</span>
      <LogoMark />
    </span>
  );
}
