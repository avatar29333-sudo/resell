"use client";

import { useState } from "react";
import { shareUrl, whatsappHref } from "@/lib/share";

/** MKT-05: «شارك على واتساب» + «انسخ الرابط» — الرابط فيه UTM وكود الإحالة لو موجود */
export function ShareButtons({ base, path, text, refCode, ar, compact = false }: { base: string; path: string; text: string; refCode?: string | null; ar: boolean; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const wa = whatsappHref(text, shareUrl(base, path, refCode, "whatsapp"));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(base, path, refCode, "copy"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* المتصفح منع النسخ */
    }
  };
  const cls = compact ? "inline-flex min-h-11 items-center gap-1 border px-2.5 text-sm font-semibold" : "inline-flex min-h-11 items-center gap-1.5 border px-4 font-semibold";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={wa} target="_blank" rel="noopener noreferrer" className={`${cls} border-[#1F9D55] text-[#157A42] hover:bg-[#EAF6EE]`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
        </svg>
        {ar ? "شارك على واتساب" : "Share on WhatsApp"}
      </a>
      <button type="button" onClick={copy} className={`${cls} border-line hover:border-brand`} aria-live="polite">
        {copied ? (ar ? "✓ اتنسخ" : "✓ Copied") : ar ? "انسخ الرابط" : "Copy link"}
      </button>
    </div>
  );
}
