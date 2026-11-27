import { checkCode } from "@/lib/plot-code";

/** UX-02: تحقق خطوة بخطوة في المتصفح بنفس قواعد السيرفر (السيرفر بيتحقق تاني) */
export type Draft = Record<string, string>;
export const DRAFT_KEY = "resell.listDraft.v1";

export function stepErrors(step: number, v: Draft, files: Record<string, { id: string; name: string } | undefined>) {
  const e: Record<string, string> = {};
  if (step === 0) {
    if (!v.city) e.city = "required";
    if (!v.districtId) e.district = "required";
    if (!v.code?.trim()) e.code = "required";
    else {
      const c = checkCode(v.city, v.code);
      if (c.error) e.code = c.error;
    }
    const area = Number(v.area);
    if (!(area >= 50 && area <= 5000)) e.area = "range";
    const cons = v.construction?.trim() ? Number(v.construction) : 0;
    if (!Number.isInteger(cons) || cons < 0 || cons > 100) e.construction = "range";
    if (v.deadline && Number.isNaN(new Date(v.deadline).getTime())) e.deadline = "invalid";
  }
  if (step === 1) {
    if (!(Number(v.price) > 0)) e.price = "required";
    if (v.priceType === "PAID_PLUS_PREMIUM" && !(Number(v.paidUsd) > 0)) e.paidUsd = "required";
  }
  if (step === 2) {
    if (!files.allocation) e.allocation = "required";
  }
  return e;
}
