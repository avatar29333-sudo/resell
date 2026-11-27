import { describe, expect, it } from "vitest";
import { documentCode, extractVariables, lineDiff, markdownToBlocks, renderTemplate } from "./templates";

describe("CON-01 templates", () => {
  const body = "# العقد\nالبائع: {{seller_name}}\nالسعر {{ agreed_price }} ج.م — صفقة {{deal_ref}}";
  it("lists the variables", () => {
    expect(extractVariables(body)).toEqual(["agreed_price", "deal_ref", "seller_name"]);
  });
  it("fills real deal data", () => {
    const r = renderTemplate(body, { seller_name: "ايمان حسين", agreed_price: "3,360,000", deal_ref: "RS-DL-58DDDB" });
    expect(r.ok).toBe(true);
    expect(r.text).toContain("السعر 3,360,000 ج.م");
  });
  it("never generates a contract with a {{…}} left: missing variables are reported", () => {
    const r = renderTemplate(body, { seller_name: "x", agreed_price: "" });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["agreed_price", "deal_ref"]);
  });
  it("diffs two versions line by line", () => {
    const d = lineDiff("أ\nب\nج", "أ\nب٢\nج\nد");
    expect(d.filter((x) => x.kind !== "same")).toEqual([
      { kind: "del", text: "ب" },
      { kind: "add", text: "ب٢" },
      { kind: "add", text: "د" },
    ]);
  });
  it("turns markdown into PDF blocks", () => {
    expect(markdownToBlocks("# عنوان\n- بند").map((b) => b.kind)).toEqual(["h1", "p"]);
  });
  it("document code format", () => {
    expect(documentCode("RS-DL-1042", "PC", 3, "7f2a")).toBe("RS-DL-1042-PC-v3-7F2A");
  });
});
