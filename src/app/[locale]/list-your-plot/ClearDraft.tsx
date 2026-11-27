"use client";

import { useEffect } from "react";
import { DRAFT_KEY } from "./wizard-rules";

/** UX-02: العرض اتبعت بنجاح → المسودة المحفوظة في المتصفح تتمسح */
export function ClearDraft() {
  useEffect(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* التخزين مقفول */
    }
  }, []);
  return null;
}
