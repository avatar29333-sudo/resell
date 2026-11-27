import { createHash } from "node:crypto";
import type { Block } from "./pdf-ar";

/**
 * CON-01 — محرك النماذج (منطق نقي، متغطي باختبار):
 * المتغيرات {{name}}، التعبئة ببيانات صفقة حقيقية، كشف أي متغير ناقص (ممنوع يتولد عقد فيه {{…}})، مقارنة نسختين، وتحويل النص لـ PDF.
 */
const VAR = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

export function extractVariables(body: string) {
  return [...new Set([...body.matchAll(VAR)].map((m) => m[1]))].sort();
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** التعبئة: أي متغير مالوش قيمة (أو قيمته فاضية) بيرجع في missing والنص بيفضل فيه {{…}} */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>) {
  const missing = new Set<string>();
  const text = body.replace(VAR, (whole, name: string) => {
    const v = vars[name];
    if (v === null || v === undefined || String(v).trim() === "") {
      missing.add(name);
      return whole;
    }
    return String(v);
  });
  return { text, missing: [...missing].sort(), ok: missing.size === 0 && !/\{\{|\}\}/.test(text) };
}

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** مقارنة سطر بسطر (LCS) */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ kind: "del", text: x[i++] });
    else out.push({ kind: "add", text: y[j++] });
  }
  while (i < n) out.push({ kind: "del", text: x[i++] });
  while (j < m) out.push({ kind: "add", text: y[j++] });
  return out;
}

/** Markdown بسيط → كتل PDF: # عنوان، ## عنوان فرعي، - بند، سطر فاضي = مسافة */
export function markdownToBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) blocks.push({ kind: "space", h: 4 });
    else if (line.startsWith("## ")) blocks.push({ kind: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ kind: "h1", text: line.slice(2) });
    else if (line.startsWith("> ")) blocks.push({ kind: "small", text: line.slice(2) });
    else if (/^\s*[-•]\s+/.test(line)) blocks.push({ kind: "p", text: `• ${line.replace(/^\s*[-•]\s+/, "").replace(/\*\*/g, "")}` });
    else blocks.push({ kind: "p", text: line.replace(/\*\*/g, "") });
  }
  return blocks;
}

/** كود المستند: RS-DL-1042-PC-v3-7F2A */
export function documentCode(dealRef: string, formAbbr: string, version: number, suffix: string) {
  return `${dealRef}-${formAbbr}-v${version}-${suffix.toUpperCase()}`;
}
