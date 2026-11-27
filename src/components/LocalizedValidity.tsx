"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";

/**
 * UX-04: رسايل تحقق المتصفح («Value must be…») بتتبدّل برسايل من عندنا بالعربي أو الإنجليزي،
 * لكل الفورمات في الموقع مرة واحدة.
 */
type V = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function validityMessage(el: V, locale: Locale) {
  const ar = locale === "ar";
  const v = el.validity;
  const input = el as HTMLInputElement;
  if (v.valueMissing) {
    if (input.type === "file") return ar ? "اختار ملف" : "Choose a file";
    if (el.tagName === "SELECT") return ar ? "اختار من القايمة" : "Choose an option";
    if (input.type === "checkbox") return ar ? "لازم تعلّم على الخانة دي" : "Please tick this box";
    return ar ? "الخانة دي مطلوبة" : "This field is required";
  }
  if (v.typeMismatch) return input.type === "email" ? (ar ? "اكتب إيميل صحيح" : "Enter a valid email") : ar ? "القيمة مش بالشكل الصحيح" : "Enter a valid value";
  if (v.rangeUnderflow) return ar ? `أقل قيمة مسموحة ${input.min}` : `The minimum is ${input.min}`;
  if (v.rangeOverflow) return ar ? `أكبر قيمة مسموحة ${input.max}` : `The maximum is ${input.max}`;
  if (v.stepMismatch) return ar ? "اكتب رقم صحيح" : "Enter a whole number";
  if (v.tooShort) return ar ? `على الأقل ${input.minLength} حروف (كتبت ${input.value.length})` : `At least ${input.minLength} characters (you have ${input.value.length})`;
  if (v.tooLong) return ar ? `بحد أقصى ${input.maxLength} حرف` : `At most ${input.maxLength} characters`;
  if (v.patternMismatch) return el.title || (ar ? "القيمة مش بالشكل المطلوب" : "Please match the requested format");
  if (v.badInput) return ar ? "اكتب رقم" : "Enter a number";
  return "";
}

export function LocalizedValidity({ locale }: { locale: Locale }) {
  useEffect(() => {
    const onInvalid = (e: Event) => {
      const el = e.target as V;
      if (!el || !("setCustomValidity" in el)) return;
      el.setCustomValidity("");
      const msg = validityMessage(el, locale);
      if (msg) el.setCustomValidity(msg);
    };
    const onInput = (e: Event) => {
      const el = e.target as V;
      if (el && "setCustomValidity" in el) el.setCustomValidity("");
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, [locale]);
  return null;
}
