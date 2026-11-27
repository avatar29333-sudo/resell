"use client";

import { useEffect } from "react";
import { DRAFT_KEY } from "./wizard-rules";
import { track } from "@/components/Analytics";

/** UX-02: العرض اتبعت بنجاح → المسودة المحفوظة في المتصفح تتمسح */
export function ClearDraft() {
  useEffect(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* التخزين مقفول */
    }
    track("listing_submitted"); // MKT-11
  }, []);
  return null;
}
