// مولّد PDF صغير من غير مكتبات: صفحة A4 فيها سطور نص (حروف لاتينية بس).
// بيتستخدم لنسخ العقود الموقّعة والمستندات التجريبية.

function esc(s: string) {
  return s.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function makePdf(title: string, lines: string[], footer = "RESELL DEMO - SAMPLE DOCUMENT - NOT A REAL RECORD"): Buffer {
  const ops: string[] = [];
  // إطار وعنوان
  ops.push("0.04 0.1 0.27 RG 1.5 w 40 40 515 762 re S");
  ops.push(`BT /F2 18 Tf 0.04 0.1 0.27 rg 60 760 Td (${esc(title)}) Tj ET`);
  ops.push("0.1 0.24 0.66 RG 1 w 60 748 m 535 748 l S");
  let y = 720;
  for (const line of lines) {
    if (y < 90) break;
    if (line === "") {
      y -= 10;
      continue;
    }
    const bold = line.startsWith("# ");
    const text = bold ? line.slice(2) : line;
    ops.push(`BT /${bold ? "F2" : "F1"} ${bold ? 13 : 11} Tf 0.05 0.05 0.07 rg 60 ${y} Td (${esc(text)}) Tj ET`);
    y -= bold ? 22 : 18;
  }
  ops.push(`BT /F2 9 Tf 0.64 0.13 0.13 rg 60 60 Td (${esc(footer)}) Tj ET`);
  const stream = ops.join("\n");

  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
