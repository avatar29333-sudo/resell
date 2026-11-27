import { describe, expect, it } from "vitest";
import { digestText, groupDigest } from "./digest";

describe("MKT-13 one buy-request alert per user per day", () => {
  it("groups all of a buyer's matches into one message, deduplicated", () => {
    const g = groupDigest([
      { buyerId: "a", listingId: "1", title: "x" },
      { buyerId: "a", listingId: "2", title: "y" },
      { buyerId: "a", listingId: "1", title: "x" },
      { buyerId: "b", listingId: "1", title: "x" },
    ]);
    expect(g).toHaveLength(2);
    expect(g.find((d) => d.buyerId === "a")!.shown.map((m) => m.listingId)).toEqual(["1", "2"]);
  });
  it("caps the links per message and mentions the rest", () => {
    const g = groupDigest(Array.from({ length: 8 }, (_, i) => ({ buyerId: "a", listingId: String(i), title: `t${i}` })), 5)[0];
    expect(g.shown).toHaveLength(5);
    expect(g.more).toBe(3);
  });
  it("always ends with the stop link", () => {
    expect(digestText("ar", [{ title: "أرض", url: "https://x/1" }], 0, "https://x/unsub")).toContain("https://x/unsub");
  });
});
