import { describe, expect, it } from "vitest";
import { checkReview } from "./review-rules";

const all = [{ passed: true }, { passed: true }];
const partial = [{ passed: true }, { passed: false }];

describe("SEC-02 lawyer review rules", () => {
  it("refuses approval when any checklist item is unticked", () => {
    expect(checkReview("APPROVED", partial, null)).toBe("checklist");
    expect(checkReview("APPROVED", [], null)).toBe("checklist");
  });
  it("allows approval with every item ticked", () => {
    expect(checkReview("APPROVED", all, null)).toBeNull();
  });
  it("requires a note of 10+ characters to reject or request changes", () => {
    expect(checkReview("REJECTED", all, null)).toBe("note_required");
    expect(checkReview("CHANGES_REQUESTED", partial, "قصير")).toBe("note_required");
    expect(checkReview("REJECTED", partial, "الختم مش واضح في الصفحة")).toBeNull();
  });
});
