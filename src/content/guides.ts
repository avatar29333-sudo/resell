/**
 * MKT-09 — الأدلة (من غير CMS): كل دليل هنا = عنوان، وصف، تاريخ آخر مراجعة، مصادر، CTA، وأقسام وأسئلة.
 * المحتوى ده مبدئي ومعلّم «مسودة» لحد ما يتكتب ويتراجع قانونياً — غيّر `draft` لـ false بعد المراجعة.
 */
export type Guide = {
  slug: string;
  draft: boolean;
  reviewedAt: string;
  cta: "rescue" | "list" | "valuation";
  title: [string, string];
  description: [string, string];
  sources: { label: [string, string]; url?: string }[];
  sections: { h: [string, string]; p: [string, string][] }[];
  faq: [[string, string], [string, string]][];
};

const NUCA = { label: ["هيئة المجتمعات العمرانية الجديدة", "New Urban Communities Authority"] as [string, string], url: "https://www.newcities.gov.eg" };
const DECISION = { label: ["قرار مجلس إدارة الهيئة رقم 220 بتاريخ 16 نوفمبر 2026", "NUCA board decision no. 220 of 16 November 2026"] as [string, string] };

export const GUIDES: Guide[] = [
  {
    slug: "transfer-conditions",
    draft: true,
    reviewedAt: "2026-11-27",
    cta: "list",
    title: ["شروط التنازل عن قطعة بيت الوطن", "Conditions for transferring a Beit El Watan plot"],
    description: ["إيه الورق اللي لازم يكون جاهز قبل ما تبيع قطعتك، وإزاي التنازل بيتم في جهاز المدينة.", "Which papers must be ready before you sell, and how the transfer is done at the city authority."],
    sources: [NUCA],
    sections: [
      {
        h: ["الورق الأساسي", "The core papers"],
        p: [["خطاب التخصيص، وإيصالات السداد، وآخر إفادة من جهاز المدينة. على Resell المحامي بيراجعهم قبل ما العرض يتنشر.", "The allocation letter, payment receipts and the latest statement from the city authority. On Resell a lawyer reviews them before the listing is published."]],
      },
      {
        h: ["خطوات التنازل", "Transfer steps"],
        p: [["بعد العقد المبدئي والعربون، الملف بيتقدّم للجهاز بتوكيل، والمشتري بيكمّل الأقساط الباقية باسمه بعد الموافقة.", "After the preliminary contract and deposit, the file is submitted to the authority by power of attorney, and the buyer continues the remaining instalments in their name once approved."]],
      },
    ],
    faq: [[["لازم أكون في مصر؟", "Do I need to be in Egypt?"], ["لأ — التنازل بيتم بتوكيل لمندوب، والتوقيع إلكتروني.", "No — the transfer is done by power of attorney to an agent, and signing is electronic."]]],
  },
  {
    slug: "fees",
    draft: true,
    reviewedAt: "2026-11-27",
    cta: "valuation",
    title: ["رسوم بيع وشراء قطعة بيت الوطن", "Fees for buying and selling a Beit El Watan plot"],
    description: ["الرسوم والعمولات اللي هتدفعها كبائع أو مشتري، وإزاي تحسب التكلفة الكاملة.", "The fees and commissions you pay as a seller or buyer, and how to work out the full cost."],
    sources: [NUCA],
    sections: [
      {
        h: ["العمولة", "Commission"],
        p: [["Resell بتاخد عمولة نسبة من سعر البيع من كل طرف، ومكتوبة في اتفاق العمولة قبل أي حاجة.", "Resell charges a percentage of the sale price from each side, written in the commission agreement before anything else."]],
      },
      {
        h: ["رسوم الجهاز", "Authority fees"],
        p: [["رسوم التنازل بيحددها الجهاز وبتظهر في إفادته. حاسبة التكلفة في صفحة كل قطعة بتجمع كل البنود.", "The transfer fee is set by the authority and shown in its statement. The cost calculator on each plot page adds up every item."]],
      },
    ],
    faq: [[["مين بيدفع رسوم التنازل؟", "Who pays the transfer fee?"], ["بتتحدد في العقد المبدئي بين الطرفين.", "It is agreed between the parties in the preliminary contract."]]],
  },
  {
    slug: "sell-from-abroad",
    draft: true,
    reviewedAt: "2026-11-27",
    cta: "list",
    title: ["إزاي تبيع قطعتك في بيت الوطن وأنت برّه مصر", "How to sell your Beit El Watan plot from abroad"],
    description: ["خطوة بخطوة: من رفع الورق لحد ما الفلوس توصلك، من غير ما تنزل مصر.", "Step by step: from uploading your papers to receiving the money, without travelling to Egypt."],
    sources: [NUCA],
    sections: [
      {
        h: ["الخطوات", "The steps"],
        p: [
          ["ترفع الورق وتوثّق هويتك أونلاين، المحامي يراجع، الوسيط ينشر العرض، وكل تحديث بيوصلك على واتساب.", "Upload your papers and verify your ID online, a lawyer reviews them, a broker publishes the listing, and every update reaches you on WhatsApp."],
          ["العربون بيتحفظ في حساب ضمان في البنك، وبيتصرف لك بعد موافقة الجهاز على التنازل.", "The deposit is held in a bank escrow account and released to you after the authority approves the transfer."],
        ],
      },
    ],
    faq: [[["الفلوس بتوصلني إزاي؟", "How does the money reach me?"], ["تحويل بنكي باسمك بعد قفل الصفقة.", "A bank transfer in your name once the deal closes."]]],
  },
  {
    slug: "relief-decision",
    draft: true,
    reviewedAt: "2026-11-27",
    cta: "rescue",
    title: ["قرار تسهيلات مهلة البناء في بيت الوطن", "The Beit El Watan build-deadline relief decision"],
    description: ["مين يستفيد من مد المهلة والدور الإضافي، والشروط، وآخر موعد للتقديم.", "Who qualifies for the extension and the extra floor, the conditions, and the application deadline."],
    sources: [DECISION, NUCA],
    sections: [
      {
        h: ["الشرايح", "The tiers"],
        p: [
          ["تنفيذ أكتر من 70%: 6 شهور زيادة من غير مقابل. من 35% لـ 70%: سنة مقابل 10% من سعر القطعة الحالي بالدولار. أقل من 35%: حالة خاصة.", "Over 70% built: 6 extra months free. 35% to 70%: one year for 10% of the current plot price in USD. Under 35%: a special case."],
          ["ولكل القطع: دور سكني إضافي مقابل علاوة، في حدود الارتفاع المسموح وبترخيص.", "For every plot: an extra residential floor for a premium, within height limits and with a permit."],
        ],
      },
      {
        h: ["الشروط", "Conditions"],
        p: [["سداد كل الأقساط المستحقة بأعبائها، ومفيش مخالفات على القطعة، ومفيش قضايا مرفوعة على الهيئة أو الجهاز بخصوصها.", "All due instalments paid with charges, no violations on the plot, and no lawsuits against the authority about it."]],
      },
    ],
    faq: [[["آخر موعد إمتى؟", "When is the deadline?"], ["التاريخ المحدّث دايماً في صفحة «إنقاذ المهلة».", "The current date is always on the deadline-rescue page."]]],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;
