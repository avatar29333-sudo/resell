"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * UX-30: قائمة الموبايل كـ Sheet — بتقفل لما المسار يتغير، أو تضغط أي رابط جواها، أو تضغط برّه، أو Esc.
 * aria-expanded + قفل تمرير الصفحة وهي مفتوحة.
 */
export function MobileMenu({ label, resetKey, children }: { label: string; resetKey?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrap = useRef<HTMLDivElement>(null);

  // بتتقفل لما المسار يتغير، أو لما المستخدم يتغير (خروج من نفس الصفحة مثلاً)
  useEffect(() => setOpen(false), [pathname, resetKey]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-11 items-center justify-center text-2xl text-white"
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      {open && (
        <nav
          id="mobile-menu"
          aria-label={label}
          // أي ضغطة على رابط جوه القايمة بتقفلها. زراير الفورم (زي «خروج») لأ: لو القايمة اتقفلت في نفس اللحظة
          // الفورم بيتشال قبل ما يتبعت والطلب ما يحصلش — القايمة بتتقفل لوحدها لما الصفحة تتحوّل بعد الإرسال
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className="absolute inset-x-0 top-full z-50 flex max-h-[80vh] flex-col overflow-y-auto bg-navy px-4 pb-4 shadow-lg"
        >
          {children}
        </nav>
      )}
    </div>
  );
}
