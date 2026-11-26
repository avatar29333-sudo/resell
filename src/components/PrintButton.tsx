"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center bg-brand px-5 font-semibold text-white hover:bg-navy print:hidden">
      {label}
    </button>
  );
}
