import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PDFArray, PDFDocument, PDFHexString, PDFNumber, PDFOperator, PDFOperatorNames, beginText, endText, rgb, setFillingColor, setFontAndSize, setTextMatrix, type Color, type PDFFont, type PDFPage, degrees } from "pdf-lib";

/** التشكيل (فتحة/شدة/…) بيتشال من نص الـ PDF — العقود مش محتاجاه، وبيبوّظ الرسم في بعض الحروف */
/** البدائل السياقية (calt) محتاجة إزاحة رأسية pdf-lib ما بيدعمهاش — بنقفلها */
const NO_CALT = { calt: false };
const stripMarks = (s: string) => s.replace(/[ً-ْٰـ]/g, "");

type FkGlyph = { id: number; advanceWidth: number };
type FkRun = { glyphs: FkGlyph[]; positions: { xAdvance: number; xOffset: number }[] };
const fk = (font: PDFFont) => (font as unknown as { embedder: { font: { unitsPerEm: number; layout: (t: string, features?: Record<string, boolean>) => FkRun } } }).embedder.font;

/** عرض المقطع بمسافات الخط الحقيقية (GPOS) — pdf-lib لوحده بيتجاهلها فيبان «ر ح» مفصولين */
export function runWidth(font: PDFFont, text: string, size: number) {
  const f = fk(font);
  const run = f.layout(stripMarks(text), NO_CALT);
  return (run.positions.reduce((a, p) => a + p.xAdvance, 0) * size) / f.unitsPerEm;
}

/** رسم المقطع حرف بحرف بمواضع الخط (TJ مع تعديل المسافات) */
function drawRun(page: PDFPage, font: PDFFont, text: string, x: number, y: number, size: number, color: Color) {
  const clean = stripMarks(text);
  const f = fk(font);
  const run = f.layout(clean, NO_CALT);
  font.encodeText(clean); // تسجيل الحروف المستخدمة في جدول العروض
  page.setFont(font);
  const key = (page as unknown as { fontKey: string }).fontKey;
  const arr = PDFArray.withContext(page.doc.context);
  const k = 1000 / f.unitsPerEm;
  run.glyphs.forEach((g, i) => {
    const p = run.positions[i];
    if (p.xOffset) arr.push(PDFNumber.of(-p.xOffset * k));
    arr.push(PDFHexString.of(g.id.toString(16).padStart(4, "0")));
    const adj = (g.advanceWidth - p.xAdvance) * k + (p.xOffset ? p.xOffset * k : 0);
    if (adj) arr.push(PDFNumber.of(adj));
  });
  page.pushOperators(beginText(), setFillingColor(color), setFontAndSize(key, size), setTextMatrix(1, 0, 0, 1, x, y), PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [arr]), endText());
}
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

/**
 * مولّد PDF عربي (CON-06 / TXN-01): خط مضمّن، اتجاه من اليمين للشمال، هيدر وفوتر،
 * «صفحة X من Y»، كود المستند، QR لصفحة التحقق، خانات توقيع وأحرف أولى، علامة مائية، و SHA-256.
 */

const A4: [number, number] = [595.28, 841.89];
const M = 48; // الهامش
const NAVY = rgb(0.04, 0.1, 0.27);
const MUTED = rgb(0.35, 0.37, 0.42);
const LINE = rgb(0.82, 0.84, 0.88);

let fontCache: { regular: Buffer; bold: Buffer } | null = null;
function fontBytes() {
  if (!fontCache) {
    const dir = join(process.cwd(), "assets", "fonts");
    fontCache = { regular: readFileSync(join(dir, "IBMPlexSansArabic-Regular.ttf")), bold: readFileSync(join(dir, "IBMPlexSansArabic-Bold.ttf")) };
  }
  return fontCache;
}

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
/** مقطع لاتيني/أرقام جوه سطر عربي (بيتكتب من الشمال لليمين زي ما هو) */
const LTR_RUN = /[A-Za-z0-9٠-٩@#][A-Za-z0-9٠-٩@#.,:/_\-+%×²]*(?:\s+[A-Za-z0-9@#][A-Za-z0-9٠-٩@#.,:/_\-+%×²]*)*/g;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "«": "»", "»": "«", "<": ">", ">": "<" };

/** يقسّم السطر لمقاطع بالترتيب المنطقي: rtl (عربي ومحايد) و ltr (لاتيني وأرقام) */
export function bidiRuns(text: string): { text: string; rtl: boolean }[] {
  if (!ARABIC.test(text)) return [{ text, rtl: false }];
  const runs: { text: string; rtl: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(LTR_RUN)) {
    // علامات الترقيم في آخر المقطع بتتبع الجملة العربية (مش الرقم)
    const core = m[0].replace(/[.,:/_-]+$/, "");
    if (m.index! > last) runs.push({ text: text.slice(last, m.index), rtl: true });
    runs.push({ text: core, rtl: false });
    last = m.index! + core.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), rtl: true });
  return runs.filter((r) => r.text.length);
}

/** شكل المقطع العربي للرسم: fontkit بيعمل التشكيل وبيعكس الحروف؛ إحنا بنعكس الأقواس بس */
const rtlGlyphText = (s: string) => [...s].map((c) => MIRROR[c] ?? c).join("");

export type Block =
  | { kind: "h1" | "h2" | "p" | "small"; text: string; color?: "navy" | "muted" | "red" | "green" }
  | { kind: "kv"; rows: [string, string][] }
  | { kind: "table"; head: string[]; rows: string[][]; widths?: number[] }
  | { kind: "space"; h?: number }
  | { kind: "rule" }
  | { kind: "signatures"; parties: string[] };

export type PdfMeta = {
  title: string;
  /** كود المستند — بيظهر في الفوتر وجوه الـ QR */
  code: string;
  /** رابط صفحة التحقق (بيتحول QR) */
  verifyUrl?: string;
  watermark?: string;
  /** خانة الأحرف الأولى في كل صفحة */
  initials?: boolean;
  rtl?: boolean;
  /** سطر تحت العنوان (مثلاً: «نسخة البائع») */
  subtitle?: string;
};

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  constructor(
    public doc: PDFDocument,
    public f: PDFFont,
    public b: PDFFont,
    public rtl: boolean,
  ) {
    this.newPage();
  }
  get right() {
    return A4[0] - M;
  }
  get width() {
    return A4[0] - 2 * M;
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M - 56; // مساحة الهيدر
  }
  ensure(h: number) {
    if (this.y - h < M + 70) this.newPage();
  }
  measure(text: string, size: number, bold = false) {
    return runWidth(bold ? this.b : this.f, text, size);
  }
  /** يرسم سطر واحد (من غير لف) بمحاذاة اتجاه المستند، أو عند x محدد */
  line(text: string, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; w?: number; align?: "start" | "end" | "center"; page?: PDFPage; y?: number } = {}) {
    const font = opts.bold ? this.b : this.f;
    const page = opts.page ?? this.page;
    const y = opts.y ?? this.y;
    const color = opts.color ?? rgb(0.05, 0.05, 0.07);
    const runs = bidiRuns(text);
    const rtlLine = this.rtl && runs.some((r) => r.rtl && ARABIC.test(r.text));
    const widths = runs.map((r) => runWidth(font, r.rtl ? rtlGlyphText(r.text) : r.text, size));
    const total = widths.reduce((a, c) => a + c, 0);
    const boxX = opts.x ?? M;
    const boxW = opts.w ?? this.width;
    const align = opts.align ?? "start";
    let start: number; // الحافة الشمال للسطر كله
    if (align === "center") start = boxX + (boxW - total) / 2;
    else if ((align === "start") === this.rtl) start = boxX + boxW - total;
    else start = boxX;
    if (rtlLine) {
      // المقاطع بالترتيب المنطقي من اليمين للشمال
      let x = start + total;
      runs.forEach((r, i) => {
        x -= widths[i];
        drawRun(page, font, r.rtl ? rtlGlyphText(r.text) : r.text, x, y, size, color);
      });
    } else {
      let x = start;
      runs.forEach((r, i) => {
        drawRun(page, font, r.text, x, y, size, color);
        x += widths[i];
      });
    }
  }
  /** لف النص على أكتر من سطر بالكلمات */
  wrap(text: string, size: number, maxW: number, bold = false) {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let cur = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        const next = cur ? `${cur} ${w}` : w;
        if (this.measure(next, size, bold) > maxW && cur) {
          out.push(cur);
          cur = w;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  }
  para(text: string, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const lh = size * 1.7;
    for (const l of this.wrap(text, size, this.width, opts.bold)) {
      this.ensure(lh);
      this.line(l, size, opts);
      this.y -= lh;
    }
    this.y -= opts.gap ?? 4;
  }
}

const COLORS = { navy: NAVY, muted: MUTED, red: rgb(0.64, 0.13, 0.13), green: rgb(0.08, 0.45, 0.22) };

export async function renderPdf(meta: PdfMeta, blocks: Block[]) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fb = fontBytes();
  const f = await doc.embedFont(fb.regular, { subset: false, features: { calt: false } });
  const b = await doc.embedFont(fb.bold, { subset: false, features: { calt: false } });
  const rtl = meta.rtl ?? true;
  doc.setTitle(`${meta.title} — ${meta.code}`);
  doc.setProducer("Resell");
  doc.setCreator("Resell");
  const w = new Writer(doc, f, b, rtl);

  for (const bl of blocks) {
    switch (bl.kind) {
      case "h1":
        w.ensure(40);
        w.para(bl.text, 17, { bold: true, color: COLORS[bl.color ?? "navy"], gap: 8 });
        break;
      case "h2":
        w.ensure(90);
        w.y -= 6;
        w.para(bl.text, 13, { bold: true, color: COLORS[bl.color ?? "navy"], gap: 4 });
        break;
      case "p":
        w.para(bl.text, 10.5, { color: bl.color ? COLORS[bl.color] : undefined });
        break;
      case "small":
        w.para(bl.text, 9, { color: COLORS[bl.color ?? "muted"] });
        break;
      case "space":
        w.y -= bl.h ?? 10;
        break;
      case "rule":
        w.ensure(12);
        w.page.drawLine({ start: { x: M, y: w.y + 6 }, end: { x: w.right, y: w.y + 6 }, thickness: 0.7, color: LINE });
        w.y -= 8;
        break;
      case "kv": {
        const keyW = w.width * 0.34;
        for (const [k, v] of bl.rows) {
          const vLines = w.wrap(v || "—", 10.5, w.width - keyW - 8);
          w.ensure(18 * vLines.length);
          const kx = rtl ? M + w.width - keyW : M;
          const vx = rtl ? M : M + keyW + 8;
          w.line(k, 10, { color: MUTED, x: kx, w: keyW });
          vLines.forEach((vl, i) => w.line(vl, 10.5, { bold: true, x: vx, w: w.width - keyW - 8, y: w.y - i * 16 }));
          w.y -= 16 * vLines.length + 3;
        }
        w.y -= 4;
        break;
      }
      case "table": {
        const n = bl.head.length;
        const ws = (bl.widths ?? Array(n).fill(1 / n)).map((x) => x * w.width);
        // الأعمدة بتتحسب من اليمين في المستند العربي
        const colX = (i: number) => {
          const before = ws.slice(0, i).reduce((a, c) => a + c, 0);
          return rtl ? M + w.width - before - ws[i] : M + before;
        };
        const row = (cells: string[], head: boolean) => {
          const lines = cells.map((c, i) => w.wrap(c ?? "", head ? 9 : 9.5, ws[i] - 8, head));
          const h = Math.max(...lines.map((l) => l.length)) * 13 + 8;
          w.ensure(h);
          if (head) w.page.drawRectangle({ x: M, y: w.y - h + 11, width: w.width, height: h, color: rgb(0.93, 0.95, 0.98) });
          lines.forEach((ls, i) => ls.forEach((l, j) => w.line(l, head ? 9 : 9.5, { bold: head, x: colX(i) + 4, w: ws[i] - 8, y: w.y - j * 13 })));
          w.page.drawLine({ start: { x: M, y: w.y - h + 11 }, end: { x: w.right, y: w.y - h + 11 }, thickness: 0.5, color: LINE });
          w.y -= h;
        };
        w.ensure(70); // العنوان ما يتسابش لوحده في آخر الصفحة
        row(bl.head, true);
        for (const r of bl.rows) row(r, false);
        w.y -= 8;
        break;
      }
      case "signatures": {
        const n = bl.parties.length;
        const bw = (w.width - (n - 1) * 12) / n;
        w.ensure(110);
        bl.parties.forEach((p, i) => {
          const x = rtl ? M + w.width - (i + 1) * bw - i * 12 : M + i * (bw + 12);
          w.page.drawRectangle({ x, y: w.y - 80, width: bw, height: 90, borderColor: NAVY, borderWidth: 0.8 });
          w.line(p, 10, { bold: true, x: x + 6, w: bw - 12, y: w.y - 6 });
          w.line(rtl ? "التوقيع:" : "Signature:", 9, { color: MUTED, x: x + 6, w: bw - 12, y: w.y - 30 });
          w.line(rtl ? "التاريخ:" : "Date:", 9, { color: MUTED, x: x + 6, w: bw - 12, y: w.y - 62 });
        });
        w.y -= 100;
        break;
      }
    }
  }

  // هيدر وفوتر وQR وعلامة مائية وخانة أحرف أولى على كل صفحة
  const total = w.pages.length;
  const qr = meta.verifyUrl ? await doc.embedPng(await QRCode.toBuffer(meta.verifyUrl, { margin: 1, width: 180 })) : null;
  w.pages.forEach((page, i) => {
    const top = A4[1] - M;
    // الرمز قبل الكلمة (من الشمال) زي مجموعة الشعار
    const markX = rtl ? M : A4[0] - M - w.measure("Resell", 14, true) - 26;
    w.line("Resell", 14, { bold: true, color: NAVY, page, y: top - 14, x: markX + 25, w: 120, align: rtl ? "end" : "start" });
    // شعار Resell (سهم البيع + علامة الصح) جنب الاسم — نفس مسارات مجموعة الشعار
    const markY = top - 18 + 20;
    page.drawSvgPath("M49.34 18.46A22 22 0 1 1 23.76 11.60", { x: markX, y: markY, scale: 20 / 64, borderColor: NAVY, borderWidth: 7.5 });
    page.drawSvgPath("M35.17 10.23L19.09 3.81L26.59 20.18Z", { x: markX, y: markY, scale: 20 / 64, color: NAVY });
    page.drawSvgPath("M21 32.5l7.5 7.5L43 25", { x: markX, y: markY, scale: 20 / 64, borderColor: rgb(0.17, 0.33, 0.84), borderWidth: 7.5, borderLineCap: 1 });
    w.line(meta.title, 12, { bold: true, color: NAVY, page, y: top - 14, align: "start" });
    if (meta.subtitle) w.line(meta.subtitle, 9, { color: MUTED, page, y: top - 30, align: "start" });
    page.drawLine({ start: { x: M, y: top - 38 }, end: { x: A4[0] - M, y: top - 38 }, thickness: 1, color: NAVY });
    // فوتر
    page.drawLine({ start: { x: M, y: M + 40 }, end: { x: A4[0] - M, y: M + 40 }, thickness: 0.6, color: LINE });
    const pageText = rtl ? `صفحة ${i + 1} من ${total}` : `Page ${i + 1} of ${total}`;
    w.line(pageText, 9, { color: MUTED, page, y: M + 24, align: "start" });
    w.line(meta.code, 9, { bold: true, color: NAVY, page, y: M + 24, align: "center" });
    if (meta.initials) {
      const bx = rtl ? M + 46 : A4[0] - M - 46 - 80;
      page.drawRectangle({ x: bx, y: M + 4, width: 80, height: 30, borderColor: MUTED, borderWidth: 0.6 });
      w.line(rtl ? "أحرف أولى" : "Initials", 7, { color: MUTED, page, x: bx, w: 80, y: M + 38, align: "center" });
    }
    if (qr) page.drawImage(qr, { x: rtl ? M : A4[0] - M - 40, y: M + 2, width: 36, height: 36 });
    if (meta.watermark) {
      page.drawText(stripMarks(meta.watermark), { x: 120, y: 260, size: 46, font: b, color: rgb(0.85, 0.2, 0.2), opacity: 0.12, rotate: degrees(35) });
    }
  });

  const bytes = Buffer.from(await doc.save());
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex"), pages: total };
}

/** عدد صفحات PDF مرفوع (للتحقق عند إعادة الرفع — CON-06) */
export async function pdfPageCount(buf: Buffer) {
  try {
    const d = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    return d.getPageCount();
  } catch {
    return null;
  }
}

/** حد أدنى لوضوح الصفحة المصوّرة (أقصر ضلع بالبكسل) */
export const MIN_PAGE_PX = 900;

/**
 * CON-06: صور متعددة (JPG/PNG) → PDF واحد بالترتيب، صفحة لكل صورة على A4.
 * بيرجع رقم أول صفحة مش واضحة (دقة أقل من الحد) عشان الرسالة تقول «الصفحة 3 مش واضحة — صوّرها تاني».
 */
export async function imagesToPdf(images: { data: Uint8Array; mime: string }[]) {
  const doc = await PDFDocument.create();
  let lowQualityPage: number | null = null;
  for (const [i, img] of images.entries()) {
    const e = img.mime === "image/png" ? await doc.embedPng(img.data) : await doc.embedJpg(img.data);
    if (Math.min(e.width, e.height) < MIN_PAGE_PX && lowQualityPage === null) lowQualityPage = i + 1;
    const page = doc.addPage(A4);
    const scale = Math.min((A4[0] - 20) / e.width, (A4[1] - 20) / e.height);
    const w = e.width * scale;
    const h = e.height * scale;
    page.drawImage(e, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
  }
  const bytes = Buffer.from(await doc.save());
  return { bytes, pages: images.length, lowQualityPage, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/**
 * ADM-EXP-03: ختم على كل صفحة في PDF موجود: «صادر بواسطة … — التاريخ — للاستخدام الداخلي».
 * لو الملف مش PDF سليم (أو متشفّر) بيرجع زي ما هو.
 */
export async function stampPdf(bytes: Uint8Array, text: string) {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fontBytes().bold, { subset: false, features: { calt: false } });
    const size = 9;
    const color = rgb(0.64, 0.13, 0.13);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const runs = bidiRuns(text);
      const widths = runs.map((r) => runWidth(font, r.rtl ? rtlGlyphText(r.text) : r.text, size));
      const total = widths.reduce((a, c) => a + c, 0);
      page.drawRectangle({ x: width - total - 24, y: height - 22, width: total + 16, height: 16, color: rgb(1, 1, 1), opacity: 0.85 });
      let x = width - 16;
      runs.forEach((r, i) => {
        x -= widths[i];
        drawRun(page, font, r.rtl ? rtlGlyphText(r.text) : r.text, x, height - 17, size, color);
      });
    }
    return new Uint8Array(await doc.save());
  } catch {
    return bytes;
  }
}
