import { describe, expect, it } from "vitest";
import { computeIndex, dealPriceEgp } from "./price-index";

const d = (city: string, day: string, area: number, price: number) => ({ city, closedAt: new Date(`${day}T10:00:00Z`), areaSqm: area, priceEgp: price });

describe("DATA-04 price index from real closed deals", () => {
  const deals = [
    d("NEW_CAIRO", "2026-10-03", 400, 4_000_000),
    d("NEW_CAIRO", "2026-10-10", 500, 6_000_000),
    d("NEW_CAIRO", "2026-10-20", 400, 4_400_000),
    d("SHEIKH_ZAYED", "2026-10-05", 600, 9_000_000),
  ];

  it("averages price per m² for each city and month", () => {
    const idx = computeIndex(deals, 3);
    expect(idx.find((p) => p.city === "NEW_CAIRO")).toEqual({ city: "NEW_CAIRO", month: "2026-10", deals: 3, avgPerSqm: Math.round((10_000 + 12_000 + 11_000) / 3) });
  });

  it("shows no number below the minimum deal count (insufficient data)", () => {
    const zayed = computeIndex(deals, 3).find((p) => p.city === "SHEIKH_ZAYED")!;
    expect(zayed.deals).toBe(1);
    expect(zayed.avgPerSqm).toBeNull();
  });

  it("converts USD deals with the deal's locked rate", () => {
    expect(dealPriceEgp(100_000, "USD", 50)).toBe(5_000_000);
    expect(dealPriceEgp(4_000_000, "EGP", 50)).toBe(4_000_000);
  });
});
