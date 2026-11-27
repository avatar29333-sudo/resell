/** SEC-02 — قواعد قرار المحامي (منطق نقي، متغطي باختبار) */
export type ReviewDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export function checkReview(decision: ReviewDecision, checklist: { passed: boolean }[], notes: string | null): "checklist" | "note_required" | null {
  if (decision === "APPROVED") return checklist.length > 0 && checklist.every((c) => c.passed) ? null : "checklist";
  return (notes?.trim().length ?? 0) >= 10 ? null : "note_required";
}
