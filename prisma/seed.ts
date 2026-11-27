// بيانات تجريبية كاملة: 10 نماذج على الأقل في كل حالة، ومع كل حاجة مرفقاتها (PDF وصور).
// التشغيل:  npm run db:seed   — بيتخطى لو البيانات موجودة. للبداية من الأول: npm run db:clean -- --yes
// كل الأرقام والأسماء وهمية. الإيميلات على example.com (دومين محجوز للأمثلة).
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import type {
  City,
  ContractStatus,
  ContractType,
  DealStage,
  DealStatus,
  DocumentStatus,
  DocumentType,
  EscrowStatus,
  ListingStatus,
  Role,
} from "@prisma/client";
import { makePdf } from "../src/lib/pdf";
import { idCardSvg, selfieSvg, sitePhotoSvg } from "./demo-assets";

const prisma = new PrismaClient();
const id = () => randomUUID().replace(/-/g, "").slice(0, 25);
const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number) => new Date(now - days * DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// مولّد أرقام ثابت عشان البيانات تطلع نفسها كل مرة
let s = 42;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

// ─── تجميع الصفوف قبل الكتابة ───
const rows = {
  users: [] as Prisma.UserCreateManyInput[],
  kyc: [] as Prisma.KycProfileCreateManyInput[],
  plots: [] as Prisma.PlotCreateManyInput[],
  listings: [] as Prisma.ListingCreateManyInput[],
  blobs: [] as Prisma.FileBlobCreateManyInput[],
  docs: [] as Prisma.DocumentCreateManyInput[],
  reviews: [] as Prisma.ReviewCreateManyInput[],
  deals: [] as Prisma.DealCreateManyInput[],
  events: [] as Prisma.DealEventCreateManyInput[],
  contracts: [] as Prisma.ContractCreateManyInput[],
  commissions: [] as Prisma.CommissionCreateManyInput[],
  deposits: [] as Prisma.DepositCreateManyInput[],
  rates: [] as Prisma.ExchangeRateCreateManyInput[],
  index: [] as Prisma.PriceIndexCreateManyInput[],
  buy: [] as Prisma.BuyRequestCreateManyInput[],
  services: [] as Prisma.ServiceRequestCreateManyInput[],
  audit: [] as Prisma.AuditLogCreateManyInput[],
};

function file(data: Buffer | string, mimeType: string, prefix = "demo") {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const key = `${prefix}/${randomUUID()}`;
  rows.blobs.push({ key, data: new Uint8Array(buf), mimeType });
  return { storageKey: key, sha256: createHash("sha256").update(buf).digest("hex"), sizeBytes: buf.length, mimeType };
}

function doc(o: {
  type: DocumentType;
  owner: string;
  uploader?: string;
  status: DocumentStatus;
  data: Buffer | string;
  mime: string;
  name: string;
  plotId?: string;
  listingId?: string;
  dealId?: string;
  serviceRequestId?: string;
  groupId?: string;
  version?: number;
  expiresAt?: Date;
  createdAt?: Date;
}) {
  const docId = id();
  rows.docs.push({
    id: docId,
    type: o.type,
    status: o.status,
    ownerId: o.owner,
    uploadedById: o.uploader ?? o.owner,
    plotId: o.plotId,
    listingId: o.listingId,
    dealId: o.dealId,
    serviceRequestId: o.serviceRequestId,
    groupId: o.groupId ?? id(),
    version: o.version ?? 1,
    expiresAt: o.expiresAt,
    fileName: o.name,
    createdAt: o.createdAt ?? ago(int(20, 200)),
    ...file(o.data, o.mime),
  });
  return docId;
}

const audit = (actorId: string | null, action: string, entityType: string, entityId: string, createdAt: Date) =>
  rows.audit.push({ actorId, action, entityType, entityId, createdAt, ip: "10.0.0." + int(2, 250), userAgent: "seed" });

// ─── الناس ───
const STAFF: [string, Role][] = [
  ["مها الشريف", "ADMIN"],
  ["كريم عبد الفتاح", "BROKER"],
  ["ياسمين فؤاد", "BROKER"],
  ["أ. هشام البدري", "LAWYER"],
  ["أ. نهى سليمان", "LAWYER"],
  ["سيد حمدان", "AGENT"],
  ["محمود الجمال", "AGENT"],
  ["رانيا منصور", "FINANCE"],
];
const FIRST = ["أحمد", "محمد", "عمرو", "مصطفى", "طارق", "هاني", "شريف", "وليد", "خالد", "إيهاب", "منى", "سارة", "دينا", "هبة", "نادية", "ريم", "إيمان", "رشا", "علا", "مروة"];
const LAST = ["عبد الرحمن", "الشناوي", "حسنين", "المصري", "فهمي", "رضوان", "سالم", "عبد الله", "النجار", "زكي", "شاهين", "يوسف", "الحسيني", "بدر", "عثمان", "مراد", "غنيم", "سعيد", "القاضي", "رمضان"];
const PHONE_PREFIX: Record<string, string> = { SA: "+9665", AE: "+9715", KW: "+9656", QA: "+9745", EG: "+2010", US: "+1202", GB: "+447", DE: "+4915" };
const COUNTRIES = ["SA", "AE", "KW", "QA", "EG", "US", "GB", "DE"];

const staff: Record<string, string> = {};
STAFF.forEach(([name, role], i) => {
  const uid = id();
  staff[`${role}${Object.keys(staff).filter((k) => k.startsWith(role)).length}`] = uid;
  rows.users.push({ id: uid, name, role, phone: `+2010000000${String(i + 1).padStart(2, "0")}`, email: `staff${i + 1}@example.com`, countryOfResidence: "EG", accountLevel: "VERIFIED", twoFactorEnabled: true, createdAt: ago(400) });
});
const brokers = [staff.BROKER0, staff.BROKER1];
const lawyers = [staff.LAWYER0, staff.LAWYER1];
const agents = [staff.AGENT0, staff.AGENT1];

const clients: { id: string; name: string }[] = [];
for (let i = 0; i < 40; i++) {
  const country = COUNTRIES[i % COUNTRIES.length];
  // كل اسم مختلف (عشان الدخول بالاسم يشتغل): الاسم الأخير بيتزحزح في العشرين التانية
  const name = `${FIRST[i % 20]} ${LAST[(i * 7 + Math.floor(i / 20) * 3) % 20]}`;
  const uid = id();
  const digits = String(10000000 + i * 1234567).slice(-8);
  rows.users.push({
    id: uid,
    name,
    phone: `${PHONE_PREFIX[country]}${digits}`.slice(0, country === "US" ? 12 : 14),
    email: i % 2 === 0 ? `client${i + 1}@example.com` : null,
    countryOfResidence: country,
    accountLevel: i < 10 || (i >= 20 && i < 30) ? "VERIFIED" : "BASIC",
    createdAt: ago(300 - i * 3),
  });
  clients.push({ id: uid, name: rows.users[rows.users.length - 1].name as string });
}
const sellers = clients.slice(0, 20);
const buyers = clients.slice(20, 40);

// التوثيق: 20 مقبول، 10 قيد المراجعة، 10 مرفوض
clients.forEach((c, i) => {
  const status = i < 10 || (i >= 20 && i < 30) ? "APPROVED" : i < 20 ? "PENDING" : "REJECTED";
  const passport = i % 3 === 0;
  const idDoc = doc({ type: passport ? "PASSPORT" : "NATIONAL_ID", owner: c.id, status: status === "REJECTED" ? "REJECTED" : status === "APPROVED" ? "APPROVED" : "UPLOADED", data: idCardSvg({ name: c.name, passport, seed: i }), mime: "image/svg+xml", name: `id-${i + 1}.svg` });
  const selfie = doc({ type: "SELFIE", owner: c.id, status: status === "REJECTED" ? "REJECTED" : status === "APPROVED" ? "APPROVED" : "UPLOADED", data: selfieSvg({ name: c.name, seed: i }), mime: "image/svg+xml", name: `selfie-${i + 1}.svg` });
  rows.kyc.push({
    userId: c.id,
    idType: passport ? "PASSPORT" : "NATIONAL_ID",
    idDocumentId: idDoc,
    selfieDocumentId: selfie,
    status,
    reviewedById: status === "PENDING" ? null : pick(brokers),
    reviewedAt: status === "PENDING" ? null : ago(int(5, 60)),
    rejectionReason: status === "REJECTED" ? pick(["الصورة مش واضحة، ارفعها تاني بإضاءة أحسن", "الاسم في الهوية مش مطابق لاسم الحساب", "الهوية منتهية الصلاحية"]) : null,
  });
});

// ─── سعر الصرف: 90 يوم آلي + 10 يدوي ───
const rateByDay: number[] = [];
for (let d = 89; d >= 0; d--) {
  const base = 48.2 + (89 - d) * 0.025 + Math.sin(d / 6) * 0.25;
  rateByDay[d] = Math.round(base * 100) / 100;
  rows.rates.push({ id: id(), date: new Date(iso(ago(d))), buy: rateByDay[d] - 0.1, sell: rateByDay[d], source: "CBE_AUTO", createdAt: ago(d) });
}
for (let k = 0; k < 10; k++) {
  const d = k * 9 + 3;
  rows.rates.push({ id: id(), date: new Date(iso(ago(d))), buy: rateByDay[d] - 0.05, sell: rateByDay[d] + 0.05, source: "MANUAL", enteredById: staff.FINANCE0, createdAt: ago(d) });
}
const latestRateId = rows.rates[89].id as string;
const usdAt = (daysAgo: number) => rateByDay[Math.min(89, Math.max(0, Math.round(daysAgo)))];

// ─── مؤشر الأسعار: 5 مدن × 24 شهر ───
const PER_SQM: Record<City, number> = { NEW_CAIRO: 26000, SHEIKH_ZAYED: 23000, OCTOBER: 15500, NEW_OCTOBER: 9500, NEW_DAMIETTA: 7200 };
const CITIES = Object.keys(PER_SQM) as City[];
const CITY_EN: Record<City, string> = { NEW_CAIRO: "New Cairo", SHEIKH_ZAYED: "Sheikh Zayed", OCTOBER: "6th of October", NEW_OCTOBER: "New October", NEW_DAMIETTA: "New Damietta" };
const CITY_AR: Record<City, string> = { NEW_CAIRO: "القاهرة الجديدة", SHEIKH_ZAYED: "الشيخ زايد", OCTOBER: "6 أكتوبر", NEW_OCTOBER: "أكتوبر الجديدة", NEW_DAMIETTA: "دمياط الجديدة" };
for (const city of CITIES) {
  for (let m = 23; m >= 0; m--) {
    const start = new Date(new Date().getFullYear(), new Date().getMonth() - m, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const growth = 1 + ((23 - m) / 23) * 0.32 + Math.sin(m) * 0.015;
    rows.index.push({ city, district: "", periodStart: start, periodEnd: end, avgPricePerSqm: Math.round((PER_SQM[city] / 1.3) * growth), dealCount: int(3, 16) });
  }
}

// ─── القطع والعروض ───
type Spec = { status: ListingStatus; deal?: { stage: DealStage; status: DealStatus } };
const specs: Spec[] = [];
const add = (n: number, f: (j: number) => Spec) => {
  for (let j = 0; j < n; j++) specs.push(f(j));
};
add(10, () => ({ status: "DRAFT" }));
add(10, () => ({ status: "IN_REVIEW" }));
add(10, () => ({ status: "VERIFIED" }));
add(10, () => ({ status: "PUBLISHED" }));
add(10, () => ({ status: "WITHDRAWN" }));
const STAGE_ORDER: DealStage[] = ["INTEREST", "COMMISSION_AGREEMENT", "PRICE_AGREED", "PRELIMINARY_CONTRACT", "TRANSFER_FILED", "AUTHORITY_APPROVED", "CLOSED"];
for (const stage of STAGE_ORDER) {
  add(10, (j) => ({
    status: stage === "CLOSED" ? "SOLD" : ["INTEREST", "COMMISSION_AGREEMENT"].includes(stage) ? "PUBLISHED" : "IN_DEAL",
    deal: {
      stage,
      status: stage === "CLOSED" ? "COMPLETED" : j === 9 || (j === 8 && STAGE_ORDER.indexOf(stage) < 4) ? "ON_HOLD" : "ACTIVE",
    },
  }));
}
// 10 صفقات اتلغت بعد رفض الجهاز → العربون اترد، والعرض رجع منشور
add(10, () => ({ status: "PUBLISHED", deal: { stage: "TRANSFER_FILED", status: "CANCELLED" } }));

const DISTRICTS = ["الحي الأول", "الحي الثاني", "الحي الثالث", "المرحلة الأولى", "المرحلة الثانية", "المرحلة الثالثة", "المرحلة الرابعة", "منطقة الجامعات"];
const CONTRACT_STATUS_CYCLE: ContractStatus[] = ["PENDING_LAWYER", "PENDING_LAWYER", "PENDING_LAWYER", "PENDING_LAWYER", "APPROVED", "APPROVED", "APPROVED", "SENT_FOR_SIGNATURE", "SENT_FOR_SIGNATURE", "SENT_FOR_SIGNATURE"];
const stageIdx = (st: DealStage) => STAGE_ORDER.indexOf(st);
const counters: Record<string, number> = {};

specs.forEach((spec, n) => {
  const key = spec.deal ? `${spec.deal.stage}-${spec.deal.status}` : spec.status;
  const j = (counters[key] = (counters[key] ?? -1) + 1);
  const city = CITIES[n % 5];
  const seller = sellers[n % 20];
  const area = int(30, 120) * 5;
  const code = `${city.slice(0, 2)}-${String(int(1, 9))}${String.fromCharCode(65 + (n % 6))}-${String(1000 + n)}`;
  const percent = spec.status === "DRAFT" ? 0 : [0, 0, 15, 30, 45, 60, 75, 90][n % 8];
  const deadline = ago(-int(-40, 900)); // من 40 يوم فاتوا لحد 900 يوم جاية
  const plotId = id();
  const listingId = id();
  const listedDaysAgo = spec.deal ? 150 + stageIdx(spec.deal.stage) * 15 : int(5, 140);
  const created = ago(listedDaysAgo);
  rows.plots.push({ id: plotId, city, district: pick(DISTRICTS), code, areaSqm: area, paymentStatus: n % 3 === 0 ? "INSTALLMENTS" : "FULLY_PAID", buildDeadline: deadline, constructionPercent: percent, createdById: seller.id, createdAt: created });

  const usd = usdAt(listedDaysAgo > 89 ? 89 : listedDaysAgo);
  const total = Math.round((area * PER_SQM[city] * (0.9 + rnd() * 0.25)) / 10000) * 10000;
  const premiumType = n % 4 === 3;
  const paidUsd = premiumType ? Math.round((total * 0.55) / usd / 100) * 100 : null;
  rows.listings.push({
    id: listingId,
    plotId,
    sellerId: seller.id,
    priceType: premiumType ? "PAID_PLUS_PREMIUM" : "ALL_INCLUSIVE",
    price: premiumType ? total - Math.round(paidUsd! * usd) : total,
    currency: "EGP",
    paidAmountUsd: paidUsd,
    status: spec.status,
    publishedAt: ["PUBLISHED", "IN_DEAL", "SOLD"].includes(spec.status) ? ago(listedDaysAgo - 10) : null,
    createdAt: created,
  });
  audit(seller.id, "listing.create", "Listing", listingId, created);

  // ── مستندات العرض ──
  const pdf = (title: string, extra: string[] = []) =>
    makePdf(title, [`# ${CITY_EN[city]} - Beit El Watan`, `Plot code: ${code}`, `Area: ${area} m2`, `Owner: client #${(n % 20) + 1}`, `Issued: ${iso(created)}`, "", ...extra]);
  const base = { owner: seller.id, plotId, listingId, mime: "application/pdf", createdAt: created };
  const approved = !["DRAFT", "IN_REVIEW"].includes(spec.status);
  const reviewDocStatus: DocumentStatus = spec.status === "DRAFT" ? "UPLOADED" : spec.status === "IN_REVIEW" ? (j < 5 ? "UPLOADED" : "IN_REVIEW") : "APPROVED";

  const alloc = doc({
    ...base,
    type: "ALLOCATION_LETTER",
    status: spec.status === "WITHDRAWN" ? "REJECTED" : reviewDocStatus,
    data: pdf("Allocation Letter (sample)", ["Allocation under the Beit El Watan programme for Egyptians abroad.", `Total plot price paid in USD: ${paidUsd ?? Math.round(total / usd)}`]),
    name: `allocation-letter-${code}.pdf`,
  });
  if (approved || spec.status === "WITHDRAWN") {
    const lawyer = pick(lawyers);
    rows.reviews.push({
      documentId: alloc,
      lawyerId: lawyer,
      decision: spec.status === "WITHDRAWN" ? "REJECTED" : "APPROVED",
      notes: spec.status === "WITHDRAWN" ? "الاسم في الخطاب مش مطابق للبطاقة — البائع سحب العرض" : null,
      checklist: [
        { key: "name", label: "الاسم مطابق لهوية البائع", passed: spec.status !== "WITHDRAWN" },
        { key: "plot", label: "كود القطعة والمساحة مطابقين للعرض", passed: true },
        { key: "stamp", label: "أختام الجهاز سليمة وواضحة", passed: true },
      ],
      createdAt: ago(listedDaysAgo - 3),
    });
  }
  if (spec.status !== "DRAFT" || j % 2 === 0) {
    doc({ ...base, type: "PAYMENT_RECEIPT", status: spec.status === "WITHDRAWN" ? "UPLOADED" : reviewDocStatus, data: pdf("Payment Receipts (sample)", ["Instalments 1-8 paid", `Last payment: ${iso(ago(listedDaysAgo + 30))}`]), name: `receipts-${code}.pdf` });
  }
  if (spec.status !== "DRAFT") {
    const group = id();
    // 10 عروض موثّقة: الإفادة القديمة اتطلب تعديلها واترفعت نسخة جديدة
    if (spec.status === "VERIFIED") {
      const old = doc({ ...base, type: "AUTHORITY_STATEMENT", status: "SUPERSEDED", groupId: group, version: 1, data: pdf("Authority Statement v1 (sample)", ["Status: under review"]), name: `statement-${code}-v1.pdf` });
      rows.reviews.push({ documentId: old, lawyerId: pick(lawyers), decision: "CHANGES_REQUESTED", notes: "الإفادة أقدم من 3 شهور — مطلوب إفادة حديثة", checklist: [{ key: "recent", label: "الإفادة حديثة (أقل من 3 شهور)", passed: false }], createdAt: ago(listedDaysAgo - 2) });
    }
    // 10 عروض منشورة من غير صفقات: الإفادة انتهت وتحتاج تجديد
    const expired = spec.status === "PUBLISHED" && !spec.deal;
    doc({
      ...base,
      type: "AUTHORITY_STATEMENT",
      status: expired ? "EXPIRED" : spec.status === "WITHDRAWN" ? "UPLOADED" : reviewDocStatus,
      groupId: group,
      version: spec.status === "VERIFIED" ? 2 : 1,
      expiresAt: expired ? ago(int(3, 40)) : approved ? ago(-int(10, 120)) : undefined,
      data: pdf("Authority Statement (sample)", ["No liens recorded", "No building violations recorded"]),
      name: `statement-${code}.pdf`,
    });
  }
  if (approved && spec.status !== "WITHDRAWN") {
    const agent = pick(agents);
    for (let a = 0; a < 2; a++) {
      doc({ ...base, type: "SITE_PHOTO", owner: seller.id, uploader: agent, status: "APPROVED", mime: "image/svg+xml", data: sitePhotoSvg({ city: CITY_AR[city], code, percent, date: iso(ago(listedDaysAgo - 5)), seed: n + a, angle: a }), name: `site-${code}-${a + 1}.svg` });
    }
  }

  // ── الصفقة ──
  if (!spec.deal) return;
  const { stage, status } = spec.deal;
  const si = stageIdx(stage);
  const buyer = spec.deal.status === "CANCELLED" || stage === "INTEREST" ? buyers[10 + (j % 10)] : buyers[j % 10];
  const dealId = id();
  const opened = ago(listedDaysAgo - 12);
  const broker = brokers[n % 2];
  const agreedDaysAgo = listedDaysAgo - 30;
  const agreed = si >= 2 ? Math.round((total * (0.95 + rnd() * 0.04)) / 10000) * 10000 : null;
  rows.deals.push({
    id: dealId,
    listingId,
    buyerId: buyer.id,
    stage,
    status,
    brokerId: broker,
    lawyerId: si >= 1 ? lawyers[n % 2] : null,
    agentId: si >= 4 ? agents[n % 2] : null,
    agreedPrice: agreed,
    agreedCurrency: agreed ? "EGP" : null,
    lockedUsdEgpRate: agreed ? usdAt(Math.min(89, agreedDaysAgo)) : null,
    exchangeRateId: agreed ? latestRateId : null,
    stageChangedAt: ago(int(1, 25)),
    closedAt: stage === "CLOSED" ? ago(int(2, 20)) : null,
    createdAt: opened,
  });
  audit(buyer.id, "deal.create", "Deal", dealId, opened);
  rows.events.push({ dealId, type: "CREATED", toStage: "INTEREST", actorId: buyer.id, createdAt: opened });
  for (let k = 1; k <= si; k++) {
    rows.events.push({ dealId, type: "STAGE_CHANGED", fromStage: STAGE_ORDER[k - 1], toStage: STAGE_ORDER[k], actorId: broker, createdAt: new Date(opened.getTime() + k * 9 * DAY) });
  }
  if (status === "ON_HOLD") rows.events.push({ dealId, type: "NOTE", actorId: broker, data: { note: "البائع مسافر — الصفقة متوقفة لحد ما يرجع", status: "ON_HOLD" }, createdAt: ago(3) });

  const signed = (type: ContractType, daysAgo: number) => {
    const cid = id();
    const sigs = (type === "POWER_OF_ATTORNEY" ? ["SELLER"] : ["BUYER", "SELLER"]).map((r) => ({
      userId: r === "BUYER" ? buyer.id : seller.id,
      role: r,
      signedAt: ago(daysAgo).toISOString(),
      providerRef: `DEMO-SIG-${cid.slice(-6)}-${r}`,
    }));
    const pdfId = doc({
      type: "CONTRACT_PDF",
      owner: seller.id,
      uploader: broker,
      dealId,
      status: "APPROVED",
      mime: "application/pdf",
      createdAt: ago(daysAgo),
      data: makePdf(`Resell - ${type.replace(/_/g, " ")} (sample)`, [`# Contract ${cid.slice(-8).toUpperCase()}`, `Plot: ${CITY_EN[city]} / ${code}`, agreed ? `Agreed price: EGP ${agreed.toLocaleString("en-US")}` : "", "", "# Signatures", ...sigs.map((x) => `${x.role}: ${x.signedAt.slice(0, 10)} - ${x.providerRef}`), "", "Subject to prior approval of the city authority."]),
      name: `${type.toLowerCase()}-${cid.slice(-6)}.pdf`,
    });
    rows.contracts.push({ id: cid, dealId, type, templateVersion: "v3", status: "SIGNED", signatures: sigs, providerEnvelopeId: `DEMO-${cid.slice(-8)}`, pdfDocumentId: pdfId, approvedById: lawyers[n % 2], approvedAt: ago(daysAgo + 2), signedAt: ago(daysAgo), createdAt: ago(daysAgo + 5) });
  };
  const pending = (type: ContractType, st: ContractStatus, buyerSigned = false) => {
    rows.contracts.push({
      id: id(),
      dealId,
      type,
      templateVersion: "v3",
      status: st,
      signatures: buyerSigned ? [{ userId: buyer.id, role: "BUYER", signedAt: ago(1).toISOString(), providerRef: "DEMO-SIG-PARTIAL" }] : [],
      approvedById: ["APPROVED", "SENT_FOR_SIGNATURE"].includes(st) ? lawyers[n % 2] : null,
      approvedAt: ["APPROVED", "SENT_FOR_SIGNATURE"].includes(st) ? ago(2) : null,
      providerEnvelopeId: st === "SENT_FOR_SIGNATURE" ? `DEMO-ENV-${dealId.slice(-6)}` : null,
      createdAt: ago(5),
    });
  };
  const depositRow = (st: EscrowStatus, withReceipt: boolean) => {
    const amount = Math.round((agreed ?? total) * 0.1);
    const receipt = withReceipt
      ? doc({ type: "TRANSFER_RECEIPT", owner: buyer.id, dealId, status: "APPROVED", mime: "application/pdf", data: makePdf("Bank Transfer Receipt (sample)", [`# Escrow deposit`, `Amount: EGP ${amount.toLocaleString("en-US")}`, `Reference: ESC-${dealId.slice(-7)}`, `Date: ${iso(ago(agreedDaysAgo - 10))}`]), name: `transfer-${dealId.slice(-6)}.pdf`, createdAt: ago(agreedDaysAgo - 10) })
      : null;
    rows.deposits.push({ dealId, amount, currency: "EGP", escrowStatus: st, receiptDocumentId: receipt, bankReference: st === "AWAITING_TRANSFER" ? null : `ESC-${dealId.slice(-7)}`, heldAt: st === "AWAITING_TRANSFER" ? null : ago(agreedDaysAgo - 12), settledAt: ["RELEASED_TO_SELLER", "REFUNDED_TO_BUYER"].includes(st) ? ago(int(1, 10)) : null, createdAt: ago(agreedDaysAgo - 8) });
  };

  // العقود والعربون حسب المرحلة
  if (stage === "INTEREST") pending("COMMISSION_AGREEMENT", "DRAFT");
  if (stage === "COMMISSION_AGREEMENT") pending("COMMISSION_AGREEMENT", CONTRACT_STATUS_CYCLE[j], j === 7 || j === 8);
  if (si >= 2) signed("COMMISSION_AGREEMENT", agreedDaysAgo + 10);
  if (stage === "PRICE_AGREED") pending("PRELIMINARY_CONTRACT", CONTRACT_STATUS_CYCLE[j], j === 9);
  if (stage === "PRELIMINARY_CONTRACT") {
    pending("PRELIMINARY_CONTRACT", CONTRACT_STATUS_CYCLE[(j + 3) % 10]);
    pending("DEPOSIT_RECEIPT", j < 3 ? "DRAFT" : "APPROVED");
    depositRow("AWAITING_TRANSFER", j >= 5);
  }
  if (si >= 4) {
    signed("PRELIMINARY_CONTRACT", agreedDaysAgo - 5);
    signed("DEPOSIT_RECEIPT", agreedDaysAgo - 5);
  }
  if (stage === "TRANSFER_FILED" && status !== "CANCELLED") {
    if (j < 5) pending("POWER_OF_ATTORNEY", "SENT_FOR_SIGNATURE");
    else signed("POWER_OF_ATTORNEY", 6);
    depositRow("HELD", true);
    if (j >= 6) doc({ type: "AUTHORITY_STATEMENT", owner: seller.id, uploader: agents[n % 2], dealId, status: "APPROVED", mime: "application/pdf", data: makePdf("Authority Transfer Approval (sample)", ["# Transfer approved", `Plot: ${code}`, `From: seller #${(n % 20) + 1} To: buyer`, `Date: ${iso(ago(2))}`]), name: `approval-${code}.pdf`, createdAt: ago(2) });
  }
  if (si >= 5) {
    signed("POWER_OF_ATTORNEY", 30);
    doc({ type: "AUTHORITY_STATEMENT", owner: seller.id, uploader: agents[n % 2], dealId, status: "APPROVED", mime: "application/pdf", data: makePdf("Authority Transfer Approval (sample)", ["# Transfer approved", `Plot: ${code}`, `Date: ${iso(ago(20))}`]), name: `approval-${code}.pdf`, createdAt: ago(20) });
    depositRow(stage === "CLOSED" || j >= 5 ? "RELEASED_TO_SELLER" : "HELD", true);
  }
  if (status === "CANCELLED") {
    rows.contracts.push({ id: id(), dealId, type: "POWER_OF_ATTORNEY", templateVersion: "v2", status: "VOID", signatures: [], createdAt: ago(20) });
    depositRow("REFUNDED_TO_BUYER", true);
    rows.events.push({ dealId, type: "CANCELLED", actorId: broker, data: { reason: "authority_refused", note: "الجهاز رفض التنازل لوجود مخالفة — العربون اترد للمشتري بالكامل", status: "CANCELLED" }, createdAt: ago(8) });
  }
  // القطع اللي اتباعت: كان فيه مشتري تاني مهتم وصفقته اتقفلت لما القطعة اتباعت
  if (stage === "CLOSED") {
    const loser = buyers[10 + ((j + 3) % 10)];
    const lostId = id();
    rows.deals.push({ id: lostId, listingId, buyerId: loser.id, stage: "COMMISSION_AGREEMENT", status: "CANCELLED", brokerId: brokers[(n + 1) % 2], lawyerId: lawyers[(n + 1) % 2], stageChangedAt: ago(40), createdAt: ago(listedDaysAgo - 15) });
    rows.events.push({ dealId: lostId, type: "CREATED", toStage: "INTEREST", actorId: loser.id, createdAt: ago(listedDaysAgo - 15) });
    rows.events.push({ dealId: lostId, type: "STAGE_CHANGED", fromStage: "INTEREST", toStage: "COMMISSION_AGREEMENT", actorId: brokers[(n + 1) % 2], createdAt: ago(listedDaysAgo - 8) });
    rows.events.push({ dealId: lostId, type: "CANCELLED", actorId: broker, data: { reason: "sold_to_other" }, createdAt: ago(int(2, 20)) });
    rows.contracts.push({ id: id(), dealId: lostId, type: "COMMISSION_AGREEMENT", templateVersion: "v3", status: "VOID", signatures: [], createdAt: ago(45) });
  }

  if (si >= 2) {
    const rates = { seller: 1.5, buyer: 1.5 };
    rows.commissions.push({
      dealId,
      sellerRatePct: rates.seller,
      buyerRatePct: rates.buyer,
      sellerAmount: Math.round((agreed! * rates.seller) / 100),
      buyerAmount: Math.round((agreed! * rates.buyer) / 100),
      status: status === "CANCELLED" ? "WAIVED" : stage === "CLOSED" ? "PAID" : stage === "AUTHORITY_APPROVED" ? "INVOICED" : "PENDING",
      paidAt: stage === "CLOSED" ? ago(int(1, 15)) : null,
    });
  }
});

// ─── طلبات الخدمات: 5 حالات × 10 ───
const SERVICE_STATUSES = ["NEW", "CONTACTED", "IN_PROGRESS", "DELIVERED", "CANCELLED"] as const;
SERVICE_STATUSES.forEach((st, si) => {
  for (let j = 0; j < 10; j++) {
    const k = si * 10 + j;
    const city = CITIES[k % 5];
    const reqId = id();
    const owner = k % 3 === 0 ? clients[k % 40] : null;
    rows.services.push({
      id: reqId,
      type: k % 4 === 3 ? "SITE_INSPECTION" : "DEADLINE_RESCUE",
      status: st,
      contactName: owner?.name ?? `${FIRST[(k * 3) % 20]} ${LAST[(k * 11) % 20]}`,
      contactPhone: `${PHONE_PREFIX[COUNTRIES[k % 8]]}${String(20000000 + k * 7777).slice(-8)}`,
      requesterId: owner?.id,
      city,
      district: pick(DISTRICTS),
      plotCode: `${city.slice(0, 2)}-R-${2000 + k}`,
      message: pick(["المهلة بتخلص الشهر الجاي ومحتاج أعرف أستفيد من القرار", "نسبة التنفيذ حوالي 40% — عايز أعرف المبلغ المطلوب", "مش عارف وضع القطعة إيه في الجهاز", "عايز تقرير معاينة بالصور قبل ما أقرر أبيع"]),
      assignedToId: st === "NEW" ? null : k % 2 ? pick(agents) : pick(brokers),
      fee: st === "DELIVERED" ? (k % 4 === 3 ? 3500 : 15000) : null,
      feeCurrency: st === "DELIVERED" ? "EGP" : null,
      createdAt: ago(60 - k),
    });
    if (j % 2 === 0) {
      doc({ type: "ALLOCATION_LETTER", owner: owner?.id ?? brokers[0], status: "UPLOADED", serviceRequestId: reqId, mime: "application/pdf", data: makePdf("Allocation Letter (sample)", [`# ${CITY_EN[city]} - Beit El Watan`, `Plot code: ${city.slice(0, 2)}-R-${2000 + k}`, "Submitted with a deadline-rescue request"]), name: `rescue-${k}.pdf`, createdAt: ago(60 - k) });
    }
    if (st === "DELIVERED") {
      doc({ type: "SITE_PHOTO", owner: owner?.id ?? brokers[0], uploader: pick(agents), status: "APPROVED", serviceRequestId: reqId, mime: "image/svg+xml", data: sitePhotoSvg({ city: CITY_AR[city], code: `R-${2000 + k}`, percent: [20, 40, 55, 80][k % 4], date: iso(ago(30 - j)), seed: k, angle: 0 }), name: `inspection-${k}.svg`, createdAt: ago(30 - j) });
    }
  }
});

// ─── طلبات الشراء: 4 حالات × 10 ───
(["ACTIVE", "PAUSED", "FULFILLED", "CANCELLED"] as const).forEach((st, si) => {
  for (let j = 0; j < 10; j++) {
    const minA = int(4, 8) * 50;
    rows.buy.push({ buyerId: buyers[(si * 10 + j) % 20].id, cities: [CITIES[j % 5], CITIES[(j + 2) % 5]], minAreaSqm: minA, maxAreaSqm: minA + 200, budgetMax: int(5, 18) * 1_000_000, status: st, createdAt: ago(int(5, 120)) });
  }
});

// ─── إضافات بتشتغل حتى لو البيانات موجودة (من غير ما تمسح حاجة) ───

/** مراكز تقريبية لمناطق بيت الوطن في كل مدينة (للخريطة التجريبية) */
const CITY_CENTER: Record<string, [number, number]> = {
  NEW_CAIRO: [30.0205, 31.5605],
  SHEIKH_ZAYED: [30.0452, 30.9855],
  OCTOBER: [29.9612, 30.9248],
  NEW_OCTOBER: [29.9955, 30.8305],
  NEW_DAMIETTA: [31.4405, 31.6805],
};

/** حدود مستطيلة لكل قطعة ملهاش حدود: مساحتها بالظبط، ومكانها ثابت جوه منطقة المدينة */
async function backfillBoundaries() {
  const plots = await prisma.$queryRaw<{ id: string; city: string; area: number }[]>`
    SELECT id, city::text AS city, "areaSqm"::float AS area FROM "Plot" WHERE boundary IS NULL`;
  for (const p of plots) {
    let h = 0;
    for (const ch of p.id) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    const [clat, clng] = CITY_CENTER[p.city] ?? CITY_CENTER.NEW_CAIRO;
    const lat = clat + (((h % 997) / 997) - 0.5) * 0.03;
    const lng = clng + ((((h >>> 8) % 991) / 991) - 0.5) * 0.03;
    const side = Math.sqrt(p.area);
    const w = side * 1.25; // القطع غالباً مستطيلة
    const d = p.area / w;
    const dLat = d / 2 / 111_320;
    const dLng = w / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
    const ring = [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ];
    const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });
    await prisma.$executeRaw`UPDATE "Plot" SET boundary = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)) WHERE id = ${p.id}`;
  }
  if (plots.length) console.log(`حدود ${plots.length} قطعة اتضافت للخريطة.`);
}

/** إشعارات تجريبية لحسابات «الدخول السريع» عشان الجرس ما يبقاش فاضي */
async function seedNotifications() {
  if ((await prisma.notification.count()) > 0) return;
  const staffUsers = await prisma.user.findMany({ where: { role: { not: "CLIENT" } } });
  const sellerWithListing = await prisma.user.findFirst({ where: { role: "CLIENT", listings: { some: {} } }, orderBy: { phone: "asc" } });
  const buyerWithDeal = await prisma.user.findFirst({ where: { role: "CLIENT", dealsAsBuyer: { some: {} } }, orderBy: { phone: "asc" } });
  const byRole: Record<string, [string, string, string][]> = {
    BROKER: [
      ["listing.new", "عرض جديد مستني المراجعة", "/broker?tab=queue"],
      ["contract.approved", "المحامي اعتمد اتفاق العمولة — ابعته للتوقيع", "/broker?tab=deals"],
      ["plots.deadline", "4 قطع معروضة مهلة بنائها هتخلص خلال 60 يوم", "/broker?tab=queue"],
    ],
    LAWYER: [
      ["documents.review_needed", "3 مستندات مستنية مراجعتك", "/lawyer"],
      ["contract.review_needed", "عقد مستني اعتمادك: العقد المبدئي", "/lawyer"],
    ],
    AGENT: [["service_request.assigned", "اتسند لك طلب معاينة جديد", "/broker?tab=services"]],
    FINANCE: [["deposit.held", "عربون جديد اتحفظ في حساب الضمان", "/reports"]],
    ADMIN: [["documents.expiring", "مستندات محتاجة تجديد: 6 هتنتهي خلال 30 يوم", "/reports"]],
  };
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const u of staffUsers) {
    (byRole[u.role] ?? []).forEach(([kind, title, link], i) =>
      rows.push({ userId: u.id, kind, title, link: `/ar${link}`, createdAt: ago(i * 0.3), readAt: i === 2 ? ago(0.1) : null }),
    );
  }
  if (sellerWithListing)
    rows.push(
      { userId: sellerWithListing.id, kind: "listing.interest", title: "فيه مشتري مهتم بقطعتك", body: "الوسيط هيتابع معاه، وبياناته بتظهر لك بعد اتفاق العمولة.", link: "/ar/account", createdAt: ago(0.2) },
      { userId: sellerWithListing.id, kind: "listing.published", title: "قطعتك اتنشرت في السجل", link: "/ar/account", createdAt: ago(2), readAt: ago(1) },
    );
  if (buyerWithDeal)
    rows.push(
      { userId: buyerWithDeal.id, kind: "contract.sign_needed", title: "مطلوب توقيعك على اتفاق العمولة", body: "افتح غرفة الصفقة ووقّع إلكترونياً.", link: "/ar/account", createdAt: ago(0.1) },
      { userId: buyerWithDeal.id, kind: "buy_request.match", title: "عرض جديد مطابق لطلبك في القاهرة الجديدة", link: "/ar/listings?city=NEW_CAIRO", createdAt: ago(1) },
    );
  await prisma.notification.createMany({ data: rows });
  console.log(`${rows.length} إشعار تجريبي اتضاف.`);
}

/** PERM-04/05: إسناد العروض (نفس SQL الـ migrations) + حسابين تجربة للأدوار الجديدة */
async function backfillAssignments() {
  for (const dir of [
    "20261127030000_permissions",
    "20261127032000_backfill_assignments",
    "20261127032500_backfill_lawyers",
    "20261127033000_fix_locked_rates",
    "20261127033500_fix_locked_rates_fallback",
  ]) {
    const sql = readFileSync(join(process.cwd(), "prisma", "migrations", dir, "migration.sql"), "utf8");
    const updates = sql
      .split(";")
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter((s) => /^(UPDATE|WITH)\b/i.test(s));
    for (const s of updates) await prisma.$executeRawUnsafe(s);
  }
  const extra = [
    { id: "demo-broker-lead", name: "رانيا مختار", phone: "+201000000111", role: "BROKER_LEAD" as const },
    { id: "demo-partner", name: "شريف الدسوقي", phone: "+201000000222", role: "PARTNER_BROKER" as const, brokerRegNo: "BR-2024-0457", partnerApprovedAt: new Date() },
  ];
  for (const u of extra) {
    if (await prisma.user.findFirst({ where: { OR: [{ id: u.id }, { phone: u.phone }] } })) continue;
    await prisma.user.create({ data: { ...u, accountLevel: "VERIFIED", locale: "ar", termsAcceptedAt: new Date(), twoFactorEnabled: u.role === "BROKER_LEAD" } });
  }
}

async function main() {
  if (await prisma.appSetting.findUnique({ where: { key: "demo.seeded" } })) {
    console.log("البيانات التجريبية موجودة بالفعل — بنكمّل الإضافات بس.");
    await backfillBoundaries();
    await seedNotifications();
    await backfillAssignments();
    return;
  }
  if ((await prisma.user.count()) > 0) {
    console.log("قاعدة البيانات فيها بيانات بالفعل. نضّفها الأول: npm run db:clean -- --yes");
    process.exit(1);
  }
  const t0 = Date.now();
  const chunk = async <T,>(list: T[], fn: (part: T[]) => Promise<unknown>, size = 200) => {
    for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size));
  };
  await prisma.user.createMany({ data: rows.users });
  await chunk(rows.blobs, (d) => prisma.fileBlob.createMany({ data: d }), 100);
  await prisma.exchangeRate.createMany({ data: rows.rates });
  await prisma.plot.createMany({ data: rows.plots });
  await prisma.listing.createMany({ data: rows.listings });
  await prisma.serviceRequest.createMany({ data: rows.services });
  await prisma.deal.createMany({ data: rows.deals });
  await chunk(rows.docs, (d) => prisma.document.createMany({ data: d }));
  await prisma.kycProfile.createMany({ data: rows.kyc });
  await prisma.review.createMany({ data: rows.reviews });
  await prisma.contract.createMany({ data: rows.contracts });
  await prisma.dealEvent.createMany({ data: rows.events });
  await prisma.commission.createMany({ data: rows.commissions });
  await prisma.deposit.createMany({ data: rows.deposits });
  await prisma.priceIndex.createMany({ data: rows.index });
  await prisma.buyRequest.createMany({ data: rows.buy });
  await chunk(rows.audit, (d) => prisma.auditLog.createMany({ data: d }));
  await prisma.appSetting.createMany({
    data: [
      { key: "commission.rates", value: { sellerPct: 1.5, buyerPct: 1.5 } },
      { key: "service.fees", value: { deadlineRescueEgp: 15000, siteInspectionEgp: 3500 } },
      {
        key: "contract.templates",
        value: [
          { type: "COMMISSION_AGREEMENT", version: "v3", updatedAt: "2026-11-01" },
          { type: "PRELIMINARY_CONTRACT", version: "v3", updatedAt: "2026-11-01" },
          { type: "DEPOSIT_RECEIPT", version: "v2", updatedAt: "2026-10-15" },
          { type: "POWER_OF_ATTORNEY", version: "v2", updatedAt: "2026-10-15" },
        ],
      },
      { key: "demo.seeded", value: { at: new Date().toISOString() } },
    ],
  });
  await backfillBoundaries();
  await seedNotifications();
  await backfillAssignments();
  const c = (k: keyof typeof rows) => rows[k].length;
  console.log(
    `تمام في ${((Date.now() - t0) / 1000).toFixed(1)} ث: ${c("users")} مستخدم، ${c("listings")} عرض، ${c("deals")} صفقة، ${c("contracts")} عقد، ${c("docs")} مستند بمرفقاته، ${c("services")} طلب خدمة، ${c("buy")} طلب شراء، ${c("rates")} سعر صرف.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
