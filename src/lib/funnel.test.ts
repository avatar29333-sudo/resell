import { describe, expect, it } from "vitest";
import { funnelRows } from "./funnel";

describe("MKT-12 marketing funnel", () => {
  it("counts each stage per channel and computes cost per lead and per deal", () => {
    const rows = funnelRows(
      [
        { channel: "google / rescue", kind: "lead" },
        { channel: "google / rescue", kind: "lead" },
        { channel: "google / rescue", kind: "verified" },
        { channel: "google / rescue", kind: "agreement" },
        { channel: "google / rescue", kind: "closed", value: 60_000 },
        { channel: "direct", kind: "lead" },
      ],
      { "google / rescue": 10_000, "meta / spring": 5_000 },
    );
    const g = rows.find((r) => r.channel === "google / rescue")!;
    expect(g).toMatchObject({ leads: 2, verified: 1, agreements: 1, closed: 1, commission: 60_000, spend: 10_000, costPerLead: 5_000, costPerDeal: 10_000 });
    expect(rows.find((r) => r.channel === "meta / spring")).toMatchObject({ leads: 0, spend: 5_000, costPerLead: null });
    expect(rows[0].channel).toBe("google / rescue");
  });
});
