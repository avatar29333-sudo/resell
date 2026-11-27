/**
 * CON-01 — النماذج العشرة (نصوص تشغيلية مبدئية بالمتغيرات).
 * ⚠️ النص النهائي بيتكتب من المحامي من شاشة النماذج (نسخة جديدة → اعتماد المحامي → نشر الأدمن).
 * البند الموحّد للسرية في كل النماذج (PRIV-01)، وبند مصاريف التحويل في 2، 3، 4، 7، 8، 9، 10 (FEE-01).
 */
export const CLAUSE_PRIVACY =
  "## سرية المعلومات وعدم بيعها\nالمعلومات والمستندات المرفوعة على المنصة سرية، ولا تُعرض على الطرف الآخر إلا بموافقة صاحبها، ولا تُباع ولا تُشارك مع أي جهة لأغراض تسويقية، وتقتصر مشاركتها على الجهات اللازمة لإتمام الصفقة (جهاز المدينة، بنك الضمان، مزوّد التوقيع، التخزين، الرسائل).";
export const CLAUSE_FEES =
  "## الحسابات البنكية ومصاريف التحويل\nأي عمولات أو مصاريف تحويل بنكي أو فروق عملة يتحملها المحوَّل له (مستلم المبلغ)، ولا تتحمل المنصة أي عمولات بأي حال. ويتم أي صرف على حساب بنكي باسم المستلم نفسه ومتحقق منه على المنصة.";
const NOTE = "> نص تشغيلي مبدئي — يُستبدل بالنص المعتمد من المحامي.";
const HEAD = "رقم الصفقة: {{deal_ref}} — التاريخ: {{today}} — نسخة النموذج: {{template_version}}";
const PLOT = "القطعة: {{plot_city}} — {{plot_district}} — الطرح: {{plot_round}} — كود القطعة {{plot_code}} — المساحة {{plot_area}} م²";

export type SeedTemplate = { key: string; formNo: number; abbr: string; titleAr: string; titleEn: string; contractType: string | null; signing: "CLICKWRAP" | "SIGNED" | "NOTARIAL"; body: string };

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    key: "terms_of_use",
    formNo: 0,
    abbr: "TU",
    titleAr: "شروط الاستخدام",
    titleEn: "Terms of use",
    contractType: null,
    signing: "CLICKWRAP",
    body: `# شروط استخدام منصة Resell
${NOTE}
التاريخ: {{today}} — نسخة الشروط: {{template_version}}
المستخدم: {{user_name}}
- Resell منصة وساطة خاصة مقيدة بسجل الوسطاء برقم {{broker_reg_no}}، وغير تابعة لوزارة الإسكان ولا لمشروع بيت الوطن.
- العمولة بتتحدد في اتفاق العمولة (نموذج 2) وبتتثبت وقت توقيعه.
- الموافقة الإلكترونية مع كود التحقق بتُعد توقيعاً منك على النماذج اللي بتتطلب كده.
${CLAUSE_FEES}
${CLAUSE_PRIVACY}`,
  },
  {
    key: "listing_authorization",
    formNo: 1,
    abbr: "LA",
    titleAr: "تفويض عرض القطعة",
    titleEn: "Listing authorization",
    contractType: "LISTING_AUTHORIZATION",
    signing: "CLICKWRAP",
    body: `# تفويض عرض قطعة (نموذج 1)\n${NOTE}\nالتاريخ: {{today}} — نسخة النموذج: {{template_version}}\nأنا {{seller_name}} أفوّض منصة Resell (مقيدة بسجل الوسطاء برقم {{broker_reg_no}}) في عرض القطعة الآتية للبيع:\n${PLOT}\n- السعر المطلوب: {{listing_price}} ج.م.\n- أقر بصحة بيانات القطعة والمستندات المرفوعة، وأن القطعة غير محمّلة بأي حقوق للغير.\n- التفويض غير حصري ويجوز سحبه في أي وقت قبل بدء صفقة.\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "commission_agreement",
    formNo: 2,
    abbr: "CA",
    titleAr: "اتفاق العمولة",
    titleEn: "Commission agreement",
    contractType: "COMMISSION_AGREEMENT",
    signing: "CLICKWRAP",
    body: `# اتفاق العمولة (نموذج 2)\n${NOTE}\n${HEAD}\n${PLOT}\nالبائع: {{seller_name}} — المشتري: {{buyer_name}}\n- يلتزم البائع بعمولة {{commission_seller_pct}}٪ من الثمن المتفق عليه، ويلتزم المشتري بعمولة {{commission_buyer_pct}}٪.\n- تُستحق العمولة عند إتمام التنازل، وتُحسب على الثمن المتفق عليه وتصل للمنصة كاملة.\n- لا يجوز للطرفين التعامل المباشر لإتمام هذه الصفقة بعيداً عن المنصة.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "preliminary_contract",
    formNo: 3,
    abbr: "PC",
    titleAr: "العقد الابتدائي",
    titleEn: "Preliminary contract",
    contractType: "PRELIMINARY_CONTRACT",
    signing: "SIGNED",
    body: `# عقد بيع ابتدائي (نموذج 3)\n${NOTE}\n${HEAD}\nالطرف الأول (البائع): {{seller_name}}\nالطرف الثاني (المشتري): {{buyer_name}}\n${PLOT}\n## الثمن\n- الثمن المتفق عليه: {{agreed_price}} ج.م، وسعر الصرف المرجعي {{fx_rate}} ج.م للدولار يُثبت لحظة توقيع هذا العقد.\n- العربون: {{deposit_amount}} ج.م يُودع في حساب الضمان ولا يُصرف إلا وفق محضر العربون (نموذج 4).\n## التزامات\n- البيع معلّق على موافقة جهاز المدينة على التنازل، ولا يُعتبر نهائياً قبلها.\n- يلتزم البائع بتقديم المستندات اللازمة والتوقيع على طلب التنازل.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "deposit_escrow",
    formNo: 4,
    abbr: "DE",
    titleAr: "محضر العربون",
    titleEn: "Deposit escrow agreement",
    contractType: "DEPOSIT_RECEIPT",
    signing: "SIGNED",
    body: `# محضر العربون وحساب الضمان (نموذج 4)\n${NOTE}\n${HEAD}\nالبائع: {{seller_name}} — المشتري: {{buyer_name}}\n${PLOT}\n- مبلغ العربون: {{deposit_amount}} ج.م يُحفظ في حساب الضمان بالبنك.\n- يُصرف للبائع بعد موافقة الجهاز على التنازل وتوقيع محضر الإغلاق (نموذج 7).\n- يُرد للمشتري كاملاً إذا رفض الجهاز التنازل أو انسحب البائع أو ثبت عدم صحة المستندات.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "poa_filing",
    formNo: 5,
    abbr: "PA",
    titleAr: "توكيل التقديم والمتابعة",
    titleEn: "Filing power of attorney",
    contractType: "POWER_OF_ATTORNEY",
    signing: "NOTARIAL",
    body: `# صيغة توكيل تقديم ومتابعة (نموذج 5) — يُوثّق في الشهر العقاري أو القنصلية\n${NOTE}\n${HEAD}\nأنا {{seller_name}} أوكّل المندوب المعتمد لدى المنصة في:\n- تقديم طلب التنازل عن القطعة الآتية لجهاز المدينة ومتابعته واستلام الإفادات:\n${PLOT}\n- **هذا التوكيل للتقديم والمتابعة فقط، ولا يتضمن أي صلاحية للبيع أو التنازل أو القبض.**\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "buyer_undertaking",
    formNo: 6,
    abbr: "BU",
    titleAr: "تعهد المشتري",
    titleEn: "Buyer undertaking",
    contractType: "BUYER_UNDERTAKING",
    signing: "SIGNED",
    body: `# تعهد المشتري (نموذج 6)\n${NOTE}\n${HEAD}\nأنا {{buyer_name}} أتعهد بشأن القطعة:\n${PLOT}\n- سداد باقي الثمن والأقساط المستحقة للجهاز في مواعيدها (تُدفع للجهاز مباشرة).\n- الالتزام بمهلة البناء واشتراطات الجهاز بعد التنازل.\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "closing",
    formNo: 7,
    abbr: "CL",
    titleAr: "محضر الإغلاق",
    titleEn: "Closing record",
    contractType: "CLOSING",
    signing: "SIGNED",
    body: `# محضر إغلاق الصفقة (نموذج 7)\n${NOTE}\n${HEAD}\nالبائع: {{seller_name}} — المشتري: {{buyer_name}}\n${PLOT}\n- وافق الجهاز على التنازل، ويُقر الطرفان باستلام كل منهما حقوقه وفق العقد الابتدائي.\n- يُصرف العربون ({{deposit_amount}} ج.م) للبائع من حساب الضمان.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "cancellation",
    formNo: 8,
    abbr: "CN",
    titleAr: "محضر الإلغاء",
    titleEn: "Cancellation record",
    contractType: "CANCELLATION",
    signing: "SIGNED",
    body: `# محضر إلغاء الصفقة (نموذج 8)\n${NOTE}\n${HEAD}\nالبائع: {{seller_name}} — المشتري: {{buyer_name}}\n${PLOT}\n- اتفق الطرفان على إلغاء الصفقة، ويُرد العربون أو يُصرف حسب سبب الإلغاء ووفق محضر العربون.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "rescue_service",
    formNo: 9,
    abbr: "RS",
    titleAr: "اتفاق خدمة إنقاذ المهلة",
    titleEn: "Deadline rescue service agreement",
    contractType: "RESCUE_SERVICE",
    signing: "CLICKWRAP",
    body: `# اتفاق خدمة إنقاذ المهلة (نموذج 9)\n${NOTE}\nالتاريخ: {{today}} — نسخة النموذج: {{template_version}}\nالعميل: {{user_name}}\n- تقدّم المنصة خدمة متابعة تقديم طلب مد مهلة البناء أو البيع قبل انتهائها، مقابل أتعاب {{rescue_fee_pct}}٪ من قيمة البيع حال إتمامه عبر المنصة.\n- لا تضمن المنصة قرار الجهاز.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
  {
    key: "partner_agreement",
    formNo: 10,
    abbr: "PB",
    titleAr: "اتفاقية السمسار الشريك",
    titleEn: "Partner broker agreement",
    contractType: "PARTNER_AGREEMENT",
    signing: "CLICKWRAP",
    body: `# اتفاقية السمسار الشريك (نموذج 10)\n${NOTE}\nالتاريخ: {{today}} — نسخة النموذج: {{template_version}}\nالسمسار الشريك: {{user_name}} — رقم القيد: {{partner_reg_no}}\n- يعرض الشريك قطع ملاكها بتفويض كتابي منهم (نموذج 1) أو يحيل مشترين.\n- يستحق الشريك {{partner_share_pct}}٪ من عمولة المنصة في الصفقات التي تتم عبره، وتُصرف على حسابه البنكي المتحقق منه.\n${CLAUSE_FEES}\n${CLAUSE_PRIVACY}`,
  },
];
