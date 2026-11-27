"use client";

import type { ReactNode } from "react";

/** زرار submit بيطلب تأكيد قبل ما الفورم يتبعت (أفعال الفلوس والحذف…) */
export function ConfirmButton({ message, className, children, name, value }: { message: string; className?: string; children: ReactNode; name?: string; value?: string }) {
  return (
    <button
      name={name}
      value={value}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
