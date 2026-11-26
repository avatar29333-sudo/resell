// صور تجريبية (SVG) للمرفقات: صور الموقع، الهويات، الصور الشخصية.
// كلها مكتوب عليها «تجريبي» وما تمثّلش أي مستند حقيقي.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** صورة موقع: أرض وسما ومبنى على قد نسبة التنفيذ */
export function sitePhotoSvg(opts: { city: string; code: string; percent: number; date: string; seed: number; angle: number }) {
  const { percent, seed, angle } = opts;
  const floors = Math.max(0, Math.round((percent / 100) * 4));
  const x = 180 + ((seed * 37) % 160) - angle * 40;
  const sky = ["#BFD4EE", "#CFDDEE", "#D9E4F0"][seed % 3];
  const ground = ["#D8C7A6", "#CDBB97", "#E0CFAE"][seed % 3];
  let building = "";
  if (percent > 0) {
    // الأساسات
    building += `<rect x="${x - 10}" y="410" width="260" height="14" fill="#9B9486"/>`;
    for (let f = 0; f < floors; f++) {
      const y = 410 - (f + 1) * 70;
      building += `<rect x="${x}" y="${y}" width="240" height="70" fill="${f === floors - 1 && percent < 90 ? "#C9C3B6" : "#E9E4DA"}" stroke="#8A8475" stroke-width="2"/>`;
      for (let w = 0; w < 4; w++) building += `<rect x="${x + 20 + w * 55}" y="${y + 18}" width="30" height="34" fill="${percent > 70 ? "#5B6F8E" : "#77736A"}"/>`;
      // حديد التسليح فوق آخر دور لو لسه شغال
      if (f === floors - 1 && percent < 90) for (let r = 0; r < 7; r++) building += `<line x1="${x + 10 + r * 37}" y1="${y}" x2="${x + 10 + r * 37}" y2="${y - 26}" stroke="#5E5A52" stroke-width="3"/>`;
    }
  } else {
    building += `<rect x="${x}" y="395" width="240" height="20" fill="none" stroke="#B5432C" stroke-width="3" stroke-dasharray="10 8"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<rect width="800" height="420" fill="${sky}"/>
<rect y="420" width="800" height="180" fill="${ground}"/>
<circle cx="${640 - angle * 80}" cy="90" r="38" fill="#F6E7B0"/>
<rect x="${560 - angle * 60}" y="330" width="160" height="90" fill="#D6D0C4" stroke="#A39C8E"/>
${building}
<rect x="0" y="540" width="800" height="60" fill="rgba(10,25,68,0.82)"/>
<text x="20" y="577" fill="#fff" font-family="Arial, sans-serif" font-size="20">صورة تجريبية · ${esc(opts.city)} · تنفيذ ${percent}% · ${esc(opts.date)}</text>
</svg>`;
}

/** بطاقة هوية تجريبية — مفيش أرقام حقيقية */
export function idCardSvg(opts: { name: string; passport: boolean; seed: number }) {
  const n = String(10000000 + ((opts.seed * 7919) % 89999999));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="540" viewBox="0 0 860 540">
<rect x="10" y="10" width="840" height="520" rx="24" fill="${opts.passport ? "#1F3A5F" : "#E8EEF6"}" stroke="#5C6B80" stroke-width="3"/>
<text x="430" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${opts.passport ? "#fff" : "#0A1944"}">${opts.passport ? "جواز سفر — نموذج تجريبي" : "بطاقة — نموذج تجريبي"}</text>
<rect x="60" y="120" width="220" height="270" rx="10" fill="#C9D2DE"/>
<circle cx="170" cy="215" r="58" fill="#8D99AA"/>
<rect x="95" y="285" width="150" height="90" rx="40" fill="#8D99AA"/>
<text x="800" y="170" text-anchor="end" font-family="Arial, sans-serif" font-size="30" fill="${opts.passport ? "#fff" : "#0D0E12"}">${esc(opts.name)}</text>
<text x="800" y="230" text-anchor="end" font-family="Arial, sans-serif" font-size="24" fill="${opts.passport ? "#D6DCEE" : "#4B5263"}">رقم: SAMPLE-${n}</text>
<text x="800" y="280" text-anchor="end" font-family="Arial, sans-serif" font-size="24" fill="${opts.passport ? "#D6DCEE" : "#4B5263"}">صالحة حتى: 2031</text>
<text x="430" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#B5432C" transform="rotate(-8 430 470)">DEMO · NOT A REAL ID · للتجربة فقط</text>
</svg>`;
}

export function selfieSvg(opts: { name: string; seed: number }) {
  const skin = ["#E5C3A0", "#C99E7A", "#A87B58", "#F0D2B4"][opts.seed % 4];
  const bg = ["#DDE5F2", "#E7E1D6", "#DCE9E1"][opts.seed % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<rect width="600" height="600" fill="${bg}"/>
<circle cx="300" cy="235" r="110" fill="${skin}"/>
<rect x="150" y="370" width="300" height="230" rx="120" fill="#3D4A63"/>
<rect x="0" y="540" width="600" height="60" fill="rgba(10,25,68,0.8)"/>
<text x="300" y="578" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#fff">صورة شخصية تجريبية · ${esc(opts.name)}</text>
</svg>`;
}
