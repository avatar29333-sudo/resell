import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ db: {} }));

const { parseCbe } = await import("./fx");

describe("سعر البنك المركزي", () => {
  it("بيقرا سطر الدولار من الجدول", () => {
    const html = `<table><tr><td>Currency</td><td>Buy</td><td>Sell</td></tr>
      <tr><td>US Dollar</td><td>50.4300</td><td>50.5300</td></tr>
      <tr><td>Euro</td><td>54.10</td><td>54.25</td></tr></table>`;
    expect(parseCbe(html)).toEqual({ buy: 50.43, sell: 50.53 });
  });
  it("بيرجّع null لو الشكل اتغير أو الأرقام مش منطقية", () => {
    expect(parseCbe("<p>maintenance</p>")).toBeNull();
    expect(parseCbe("<td>US Dollar</td><td>60.00</td><td>50.00</td>")).toBeNull();
  });
});
