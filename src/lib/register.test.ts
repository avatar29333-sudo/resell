import { describe, expect, it } from "vitest";
import { PAGE_SIZE, arrangeListings, registerHref } from "./register";

const mk = (i: number, status = "PUBLISHED", total = 1_000_000 + i * 1000) => ({ id: String(i), status, total, areaSqm: 400, publishedAt: new Date(2026, 0, 1 + i) });

describe("UX-07 listings register", () => {
  const list = [...Array.from({ length: 30 }, (_, i) => mk(i)), mk(100, "IN_DEAL", 1), mk(101, "IN_DEAL", 2)];

  it("pages of 24", () => {
    const r = arrangeListings(list, { page: 2 });
    expect(PAGE_SIZE).toBe(24);
    expect(r.pages).toBe(2);
    expect(r.items).toHaveLength(6);
  });
  it("hides in-deal listings unless asked, then puts them last", () => {
    expect(arrangeListings(list, {}).total).toBe(30);
    const all = arrangeListings(list, { inDeal: true, sort: "price", page: 2 });
    expect(all.total).toBe(32);
    expect(all.items.slice(-2).map((x) => x.status)).toEqual(["IN_DEAL", "IN_DEAL"]);
  });
  it("keeps filters in the link", () => {
    expect(registerHref("/ar/listings", { city: "NEW_CAIRO", sort: "price" }, { page: "2" })).toBe("/ar/listings?city=NEW_CAIRO&sort=price&page=2");
  });
});
