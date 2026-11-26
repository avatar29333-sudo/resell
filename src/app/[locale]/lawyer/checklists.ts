// بنود مراجعة المحامي لكل نوع مستند
export type CheckItem = { key: string; ar: string; en: string };

export const CHECKLISTS: Record<string, CheckItem[]> = {
  ALLOCATION_LETTER: [
    { key: "name", ar: "الاسم مطابق لهوية البائع", en: "Name matches the seller's ID" },
    { key: "plot", ar: "كود القطعة والمساحة مطابقين للعرض", en: "Plot code and area match the listing" },
    { key: "stamp", ar: "أختام الجهاز سليمة وواضحة", en: "Authority stamps are intact and clear" },
    { key: "nofraud", ar: "مفيش كشط أو تعديل في الخطاب", en: "No erasures or alterations" },
  ],
  PAYMENT_RECEIPT: [
    { key: "amounts", ar: "المبالغ متطابقة مع جدول الأقساط", en: "Amounts match the instalment schedule" },
    { key: "dates", ar: "مفيش أقساط متأخرة من غير غرامة محسوبة", en: "No late instalments without computed penalties" },
    { key: "bank", ar: "إيصالات بنكية رسمية", en: "Official bank receipts" },
  ],
  AUTHORITY_STATEMENT: [
    { key: "recent", ar: "الإفادة حديثة (أقل من 3 شهور)", en: "Statement is recent (under 3 months)" },
    { key: "nolien", ar: "مفيش حجز أو نزاع على القطعة", en: "No lien or dispute on the plot" },
    { key: "violations", ar: "مفيش مخالفات بناء مسجلة", en: "No recorded building violations" },
  ],
  OTHER: [
    { key: "legible", ar: "المستند واضح ومقروء", en: "Document is legible" },
    { key: "relevant", ar: "المستند يخص القطعة والأطراف", en: "Document relates to the plot and parties" },
  ],
};
