import { describe, expect, it } from "vitest";
import { pickRateAt } from "./fx-pick";

const d = (s: string) => new Date(s);
const r = (id: string, day: string, sell: number) => ({ id, date: d(`${day}T00:00:00Z`), createdAt: d(`${day}T08:00:00Z`), sell });

describe("DATA-01 locked exchange rate", () => {
  const rates = [r("a", "2026-11-24", 50.3), r("b", "2026-11-25", 50.4), r("c", "2026-11-26", 50.43)];
  const signedAt = d("2026-11-25T12:00:00Z");

  it("locks the last rate recorded before the signing moment", () => {
    expect(pickRateAt(rates, signedAt)?.id).toBe("b");
  });

  it("today's new rate does not change an already-locked deal", () => {
    const locked = pickRateAt(rates, signedAt)!;
    const later = [...rates, r("d", "2026-11-27", 52)];
    expect(pickRateAt(later, signedAt)?.id).toBe(locked.id);
  });

  it("the date shown is the rate's own date, not today's", () => {
    expect(pickRateAt(rates, signedAt)?.date.toISOString().slice(0, 10)).toBe("2026-11-25");
  });
});
