import { describe, expect, it } from "vitest";
import { dueStage, reminderText } from "./reminders";

const now = new Date("2026-11-27T08:00:00Z");
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("MKT-04 deadline reminders at 90 / 30 / 7 days", () => {
  it("sends each stage once", () => {
    expect(dueStage(inDays(85), now, {})).toBe(90);
    expect(dueStage(inDays(85), now, { sent90At: now })).toBeNull();
    expect(dueStage(inDays(25), now, { sent90At: now })).toBe(30);
    expect(dueStage(inDays(5), now, { sent90At: now, sent30At: now })).toBe(7);
  });
  it("nothing far from the deadline or after it", () => {
    expect(dueStage(inDays(200), now, {})).toBeNull();
    expect(dueStage(inDays(-1), now, {})).toBeNull();
  });
  it("a late subscriber only gets the nearest reminder", () => {
    expect(dueStage(inDays(6), now, {})).toBe(7);
  });
  it("every message carries the unsubscribe link", () => {
    expect(reminderText(30, "ar", "الشيخ زايد", "https://x/ar/unsubscribe?t=abc")).toContain("https://x/ar/unsubscribe?t=abc");
  });
});
