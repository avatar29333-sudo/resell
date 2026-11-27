import { describe, expect, it } from "vitest";
import { authorityDocType, checkAuthorityUpdate, cleanGeo } from "./authority";

describe("OPS-02 authority file and site photos", () => {
  it("maps each status to the document it needs", () => {
    expect(authorityDocType("SUBMITTED")).toBe("FILING_RECEIPT");
    expect(authorityDocType("APPROVED")).toBe("AUTHORITY_STATEMENT");
    expect(authorityDocType("NEEDS_INFO")).toBe("OTHER");
  });
  it("submitted/approved need the receipt or letter; needs-info/refused need a note", () => {
    expect(checkAuthorityUpdate("SUBMITTED", false, "")).toBe("file");
    expect(checkAuthorityUpdate("APPROVED", true, "")).toBeNull();
    expect(checkAuthorityUpdate("NEEDS_INFO", false, "ناقص")).toBe("note");
    expect(checkAuthorityUpdate("REJECTED", false, "الجهاز رفض لعدم السداد")).toBeNull();
    expect(checkAuthorityUpdate("DONE", true, "")).toBe("status");
  });
  it("keeps real GPS coordinates and drops nonsense", () => {
    const now = new Date("2026-11-27T10:00:00Z");
    expect(cleanGeo("30.0444", "31.2357", "12", "2026-11-27T09:58:00Z", now)).toMatchObject({ lat: 30.0444, lng: 31.2357, accuracy: 12 });
    expect(cleanGeo("0", "0", "5", null, now).lat).toBeNull();
    expect(cleanGeo("200", "31", "5", null, now).lat).toBeNull();
    // وقت في المستقبل → وقت الرفع
    expect(cleanGeo("30", "31", "5", "2027-01-01T00:00:00Z", now).takenAt).toEqual(now);
  });
});
