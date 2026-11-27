import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter, configure } from "@zip.js/zip.js";
import { db } from "./db";
import { readBytes, saveFile } from "./storage";
import { renderPdf, stampPdf, type Block } from "./pdf-ar";
import { buildManifest, safeName, toCsv, uniquePaths, zipPassword, REASON_AR, type Entry } from "./export-core";
import { CONTRACT_TYPE, DEAL_STAGE, DOC_TYPE, ESCROW_STATUS, label } from "./labels";
import { dealRef } from "./action-otp-core";
import { toNum } from "./format";
import { decryptIban } from "./bank";
import { notify, idsByRole } from "./notifications";
import { queueMessage } from "./outbox";
import { audit } from "./audit";
import { eventSentence } from "./deal-overview";

configure({ useWebWorkers: false });

const enc = (s: string) => new TextEncoder().encode(s);
const cairo = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Cairo" }).format(d).replace(",", "") : "";
const json = (v: unknown) => enc(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? String(x) : x), 2));

type Actor = { id: string; name: string; role: string };

async function fileOf(d: { storageKey: string; mimeType: string; fileName: string; title?: string | null }, stamp: string) {
  const raw = await readBytes(d.storageKey);
  if (!raw) return null;
  const data = d.mimeType === "application/pdf" ? await stampPdf(raw, stamp) : raw;
  const ext = d.fileName.includes(".") ? d.fileName.slice(d.fileName.lastIndexOf(".")) : "";
  const base = d.title ? `${safeName(d.title)}${ext}` : safeName(d.fileName);
  return { name: base, data };
}

/** ADM-EXP-01 — ملف الصفقة كاملاً (المحامي: من غير البيانات البنكية الكاملة) */
export async function buildDealEntries(dealId: string, actor: Actor, reason: string, fullBank: boolean) {
  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: {
      listing: { include: { plot: true, seller: true, documents: true } },
      buyer: true,
      broker: true,
      lawyer: true,
      agent: true,
      contracts: { include: { verifiedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } },
      documents: { include: { uploadedBy: { select: { name: true } } } },
      deposits: true,
      commission: true,
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      buyerBankAccount: true,
      sellerBankAccount: true,
    },
  });
  const ref = dealRef(deal.id);
  const stamp = `صادر بواسطة ${actor.name} — ${cairo(new Date())} — للاستخدام الداخلي`;
  const entries: Entry[] = [];
  const pdf = async (path: string, title: string, blocks: Block[]) => entries.push({ path, data: new Uint8Array((await renderPdf({ title, code: `${ref}-EXP`, watermark: "INTERNAL", subtitle: stamp }, blocks)).bytes) });

  // 00 ملخص
  const stages = deal.events.filter((e) => e.type === "STAGE_CHANGED").map((e) => [cairo(e.createdAt), label(DEAL_STAGE, e.toStage, "ar")]);
  await pdf("00_ملخص_الصفقة.pdf", `ملخص صفقة ${ref}`, [
    { kind: "h1", text: `ملخص صفقة ${ref}` },
    {
      kind: "kv",
      rows: [
        // نسخة المحامي: من غير أرقام الموبايل الكاملة
        ["البائع", `${deal.listing.seller.name} — ${fullBank ? deal.listing.seller.phone : `•••${deal.listing.seller.phone.slice(-3)}`}`],
        ["المشتري", `${deal.buyer.name} — ${fullBank ? deal.buyer.phone : `•••${deal.buyer.phone.slice(-3)}`}`],
        ["الفريق", `الوسيط: ${deal.broker?.name ?? "—"} · المحامي: ${deal.lawyer?.name ?? "—"} · المندوب: ${deal.agent?.name ?? "—"}`],
        ["القطعة", `${deal.listing.plot.city} — ${deal.listing.plot.district} — ${deal.listing.plot.code} — ${toNum(deal.listing.plot.areaSqm)} م²`],
        ["السعر المتفق", deal.agreedPrice ? `${toNum(deal.agreedPrice).toLocaleString("en-US")} ج.م` : "—"],
        ["سعر الصرف", deal.lockedUsdEgpRate ? `${toNum(deal.lockedUsdEgpRate)} — مقفول ${cairo(deal.rateLockedAt)} (${deal.fxSource ?? ""})` : "استرشادي"],
        ["الحالة", `${label(DEAL_STAGE, deal.stage, "ar")} — ${deal.status}`],
        ["سبب التصدير", REASON_AR[reason] ?? reason],
      ],
    },
    { kind: "h2", text: "المراحل وتواريخها" },
    { kind: "table", head: ["التاريخ", "المرحلة"], rows: [[cairo(deal.createdAt), "فتح الصفقة"], ...stages] },
    ...(deal.commission
      ? ([{ kind: "h2", text: "العمولة" }, { kind: "kv", rows: [["البائع", `${toNum(deal.commission.sellerAmount).toLocaleString("en-US")} ج.م (${toNum(deal.commission.sellerRatePct)}٪)`], ["المشتري", `${toNum(deal.commission.buyerAmount).toLocaleString("en-US")} ج.م (${toNum(deal.commission.buyerRatePct)}٪)`], ["الحالة", deal.commission.status]] }] as Block[])
      : []),
  ]);

  // 01 العقود: المسودة المعتمدة + الموقّعة الأصلية + محضر التحقق
  const docById = new Map([...deal.documents, ...deal.listing.documents].map((d) => [d.id, d]));
  for (const c of deal.contracts) {
    const folder = `01_العقود/${safeName(label(CONTRACT_TYPE, c.type, "ar"))}_${c.templateVersion}`;
    for (const [id, nm] of [[c.draftDocumentId, "المسودة_المعتمدة"], [c.signedUploadDocumentId, "النسخة_الموقعة_الأصلية"], [c.pdfDocumentId, "نسخة_مزود_التوقيع"]] as const) {
      const d = id ? docById.get(id) : null;
      if (!d) continue;
      const f = await fileOf(d, stamp);
      if (f) entries.push({ path: `${folder}/${nm}${f.name.slice(f.name.lastIndexOf("."))}`, data: f.data });
    }
    await pdf(`${folder}/محضر_التحقق.pdf`, `محضر تحقق — ${label(CONTRACT_TYPE, c.type, "ar")}`, [
      { kind: "kv", rows: [["الحالة", c.status], ["اعتمده", c.approvedBy?.name ?? "—"], ["اتحقق منه", c.verifiedBy ? `${c.verifiedBy.name} — ${cairo(c.verifiedAt)}` : "—"], ["الطريقة", c.verificationMethod ?? c.signedVia ?? "—"], ["مكان الأصل الورقي", c.paperOriginalLocation ?? "—"], ["كود آخر نسخة", c.draftCode ?? "—"], ["بصمة المسودة", c.draftSha256 ?? "—"]] },
      { kind: "small", text: `بنود المطابقة: ${JSON.stringify(c.verificationChecklist ?? [])}` },
      { kind: "small", text: `التوقيعات: ${JSON.stringify(c.signatures ?? [])}` },
    ]);
  }

  // 02/03/04 المستندات حسب الطرف + نسخ سابقة
  const usedInContracts = new Set(deal.contracts.flatMap((c) => [c.draftDocumentId, c.signedUploadDocumentId, c.pdfDocumentId].filter(Boolean) as string[]));
  const all = [...deal.listing.documents, ...deal.documents].filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i && !usedInContracts.has(d.id));
  for (const d of all) {
    if (!fullBank && d.type === "OTHER" && (await db.bankAccount.findFirst({ where: { proofDocumentId: d.id }, select: { id: true } }))) continue;
    const who = d.ownerId === deal.listing.sellerId || d.uploadedById === deal.listing.sellerId ? "02_مستندات_البائع" : d.ownerId === deal.buyerId || d.uploadedById === deal.buyerId ? "03_مستندات_المشتري" : "04_مستندات_أخرى";
    const f = await fileOf({ ...d, title: d.title ?? label(DOC_TYPE, d.type, "ar") }, stamp);
    if (f) entries.push({ path: `${who}${d.status === "SUPERSEDED" ? "/_نسخ_سابقة" : ""}/${f.name}`, data: f.data });
  }

  // 05 المالية
  const mask = (last4?: string | null) => (last4 ? `•••• ${last4}` : "—");
  const iban = (a: { ibanEnc: string; ibanLast4: string } | null) => (a ? (fullBank ? decryptIban(a.ibanEnc) : mask(a.ibanLast4)) : "—");
  entries.push({
    path: "05_المالية/الحركات.csv",
    data: toCsv([
      ["التاريخ", "البند", "المبلغ", "العملة", "الحالة", "مرجع البنك", "مصاريف التحويل (على المستلم)", "الصافي", "الحساب"],
      ...deal.deposits.map((d) => [cairo(d.createdAt), "عربون", toNum(d.amount), d.currency, label(ESCROW_STATUS, d.escrowStatus, "ar"), d.bankReference, d.payoutFeeEgp ? toNum(d.payoutFeeEgp) : "", d.payoutNetEgp ? toNum(d.payoutNetEgp) : "", d.escrowStatus === "RELEASED_TO_SELLER" ? iban(deal.sellerBankAccount) : d.escrowStatus === "REFUNDED_TO_BUYER" ? iban(deal.buyerBankAccount) : ""]),
      ...(deal.commission ? [[cairo(deal.commission.createdAt), "عمولة البائع", toNum(deal.commission.sellerAmount), "EGP", deal.commission.status, "", "", "", ""], [cairo(deal.commission.createdAt), "عمولة المشتري", toNum(deal.commission.buyerAmount), "EGP", deal.commission.status, "", "", "", ""]] : []),
    ]),
  });
  entries.push({ path: "05_المالية/الحسابات_البنكية.json", data: json({ seller: deal.sellerBankAccount ? { bank: deal.sellerBankAccount.bankName, iban: iban(deal.sellerBankAccount), status: deal.sellerBankAccount.status } : null, buyer: deal.buyerBankAccount ? { bank: deal.buyerBankAccount.bankName, iban: iban(deal.buyerBankAccount), status: deal.buyerBankAccount.status } : null, lockedAt: deal.bankLockedAt }) });

  // 06 الموافقات
  const consents = await db.consentRecord.findMany({ where: { dealId }, orderBy: { acceptedAt: "asc" } });
  entries.push({ path: "06_الموافقات/سجل_الموافقات.json", data: json(consents) });

  // 07 سجل التدقيق
  const ids = [dealId, ...deal.contracts.map((c) => c.id), ...deal.documents.map((d) => d.id), ...deal.deposits.map((d) => d.id)];
  const logs = await db.auditLog.findMany({ where: { entityId: { in: ids } }, orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true, role: true } } } });
  entries.push({ path: "07_سجل_التدقيق.csv", data: toCsv([["الوقت (القاهرة)", "مين", "الدور", "الفعل", "النوع", "المعرّف", "IP"], ...logs.map((g) => [cairo(g.createdAt), g.actor?.name ?? "النظام", g.actor?.role ?? "", g.action, g.entityType, g.entityId, g.ip])]) });

  // 08 المراسلات (ملاحظات غرفة الصفقة)
  await pdf("08_المراسلات.pdf", `مراسلات صفقة ${ref}`, [
    { kind: "table", head: ["الوقت", "الحدث"], widths: [0.25, 0.75], rows: deal.events.map((e) => [cairo(e.createdAt), `${eventSentence({ type: e.type, toStage: e.toStage, data: (e.data ?? {}) as Record<string, unknown> }, e.actor?.name ?? "—", true)}${typeof (e.data as { note?: string } | null)?.note === "string" ? ` — ${(e.data as { note: string }).note}` : ""}`]) },
  ]);

  // data.json
  const { listing, buyer, broker, lawyer, agent, buyerBankAccount, sellerBankAccount, ...rest } = deal;
  void broker;
  void lawyer;
  void agent;
  entries.push({
    path: "data.json",
    data: json({ ...rest, listing: { ...listing, seller: { id: listing.seller.id, name: listing.seller.name, phone: fullBank ? listing.seller.phone : null } }, buyer: { id: buyer.id, name: buyer.name, phone: fullBank ? buyer.phone : null }, bank: { buyer: buyerBankAccount ? iban(buyerBankAccount) : null, seller: sellerBankAccount ? iban(sellerBankAccount) : null } }),
  });
  return { entries: uniquePaths(entries), name: `${ref}_${new Date().toISOString().slice(0, 10)}`, partyIds: [deal.buyerId, deal.listing.sellerId] };
}

/** ADM-EXP-02 — ملف المستخدم كاملاً (للأدمن) */
export async function buildUserEntries(userId: string, actor: Actor, reason: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { kycProfile: true } });
  const stamp = `صادر بواسطة ${actor.name} — ${cairo(new Date())} — للاستخدام الداخلي`;
  const entries: Entry[] = [];
  const [docs, banks, listings, buyReqs, dealsB, dealsS, consents, logs] = await Promise.all([
    db.document.findMany({ where: { OR: [{ ownerId: userId }, { uploadedById: userId }] } }),
    db.bankAccount.findMany({ where: { userId } }),
    db.listing.findMany({ where: { sellerId: userId }, include: { plot: true } }),
    db.buyRequest.findMany({ where: { buyerId: userId } }),
    db.deal.findMany({ where: { buyerId: userId }, select: { id: true, stage: true, status: true, agreedPrice: true, createdAt: true } }),
    db.deal.findMany({ where: { listing: { sellerId: userId } }, select: { id: true, stage: true, status: true, agreedPrice: true, createdAt: true } }),
    db.consentRecord.findMany({ where: { userId }, orderBy: { acceptedAt: "asc" } }),
    db.auditLog.findMany({ where: { OR: [{ actorId: userId }, { entityId: userId }] }, orderBy: { createdAt: "asc" }, take: 5000, include: { actor: { select: { name: true } } } }),
  ]);
  const { totpSecret, ...profile } = u;
  void totpSecret;
  entries.push({ path: "00_الملف_الشخصي.json", data: json(profile) });
  for (const d of docs) {
    const f = await fileOf({ ...d, title: d.title ?? label(DOC_TYPE, d.type, "ar") }, stamp);
    if (f) entries.push({ path: `01_المستندات/${d.status === "SUPERSEDED" ? "_نسخ_سابقة/" : ""}${f.name}`, data: f.data });
  }
  entries.push({ path: "02_الحسابات_البنكية.json", data: json(banks.map((b) => ({ ...b, ibanEnc: undefined, accountNumberEnc: undefined, iban: decryptIban(b.ibanEnc) }))) });
  entries.push({ path: "03_العروض_وطلبات_الشراء.json", data: json({ listings, buyRequests: buyReqs }) });
  entries.push({ path: "04_الصفقات.json", data: json({ asBuyer: dealsB.map((d) => ({ ...d, ref: dealRef(d.id) })), asSeller: dealsS.map((d) => ({ ...d, ref: dealRef(d.id) })) }) });
  entries.push({ path: "05_الموافقات.json", data: json(consents) });
  entries.push({ path: "06_سجل_النشاط.csv", data: toCsv([["الوقت (القاهرة)", "مين", "الفعل", "النوع", "المعرّف", "IP"], ...logs.map((g) => [cairo(g.createdAt), g.actor?.name ?? "النظام", g.action, g.entityType, g.entityId, g.ip])]) });
  void reason;
  return { entries: uniquePaths(entries), name: `user_${safeName(u.name)}_${new Date().toISOString().slice(0, 10)}`, partyIds: [userId] };
}

/** تنفيذ التصدير في الخلفية: ZIP مشفّر (AES-256) + manifest، تخزين مؤقت، رابط لمرة واحدة لمدة ساعة */
export async function runExport(jobId: string) {
  const job = await db.exportJob.findUniqueOrThrow({ where: { id: jobId }, include: { requestedBy: true } });
  try {
    const actor = { id: job.requestedBy.id, name: job.requestedBy.name, role: job.requestedBy.role };
    const built = job.kind === "USER" ? await buildUserEntries(job.subjectId, actor, job.reason) : await buildDealEntries(job.subjectId, actor, job.reason, job.requestedBy.role === "ADMIN");
    const manifest = buildManifest(built.entries, { exportedAt: new Date().toISOString(), exportedBy: `${actor.name} (${actor.id})`, reason: `${REASON_AR[job.reason] ?? job.reason}${job.reasonNote ? ` — ${job.reasonNote}` : ""}`, subject: built.name });
    const files = [...built.entries, { path: "manifest.json", data: json(manifest) }];
    const password = zipPassword(randomBytes(32));
    const zw = new ZipWriter(new Uint8ArrayWriter(), { password, encryptionStrength: 3 });
    for (const f of files) await zw.add(`${built.name}/${f.path}`, new Uint8ArrayReader(f.data));
    const zip = await zw.close();
    const saved = await saveFile(Buffer.from(zip), "application/zip", "exports");
    const token = randomBytes(24).toString("base64url");
    await db.exportJob.update({
      where: { id: jobId },
      data: { status: "READY", storageKey: saved.key, fileName: `${built.name}.zip`, sha256: saved.sha256, sizeBytes: saved.sizeBytes, fileCount: files.length, tokenHash: createHash("sha256").update(token).digest("hex"), readyAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) },
    });
    await audit(actor.id, `export.${job.kind.toLowerCase()}.ready`, "ExportJob", jobId, { subject: job.subjectId, reason: job.reason, bytes: saved.sizeBytes, sha256: saved.sha256, files: files.length });
    // PRIV-01: الأطراف يشوفوها في «مين شاف ملفاتي؟» — إلا طلب جهة رسمية ممنوع الإخطار بيه
    if (job.reason !== "official_request") for (const pid of built.partyIds) await audit(actor.id, "export.included", "User", pid, { jobId, kind: job.kind });
    await notify([actor.id], { kind: "export.ready", ar: ["ملف التصدير جاهز", "الرابط شغال مرة واحدة لمدة ساعة."], en: ["Your export is ready", "The link works once, for one hour."], link: `/api/exports/${jobId}?t=${token}` });
    // كلمة السر في رسالة منفصلة
    await notify([actor.id], { kind: "export.password", ar: ["كلمة سر ملف التصدير", password], en: ["Export file password", password] });
    if (job.requestedBy.email) await queueMessage("email", job.requestedBy.email, "export.password", `كلمة سر ملف التصدير ${built.name}: ${password}`);
    if (job.kind === "DEALS_MONTH") await notify((await idsByRole("ADMIN")).filter((x) => x !== actor.id), { kind: "export.bulk", ar: [`${actor.name} عمل تصدير جماعي`], en: [`${actor.name} ran a bulk export`] });
  } catch (e) {
    await db.exportJob.update({ where: { id: jobId }, data: { status: "FAILED", error: String((e as Error).message).slice(0, 300) } });
  }
}
