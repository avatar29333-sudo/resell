/**
 * PRIV-01 — الجهات الخارجية المسموح تستلم بيانات (قائمة ثابتة في الكود وفي سياسة الخصوصية).
 * أي إضافة هنا بقرار أدمن مسجّل + تحديث السياسة. ممنوع أي جهة إعلانية تستلم بيانات شخصية.
 */
export const ALLOWED_THIRD_PARTIES: { key: string; ar: string; en: string; purposeAr: string; purposeEn: string }[] = [
  { key: "authority", ar: "جهاز المدينة / وزارة الإسكان", en: "City authority / Ministry of Housing", purposeAr: "تقديم التنازل ومتابعته", purposeEn: "Filing and following up the transfer" },
  { key: "escrow_bank", ar: "بنك حساب الضمان", en: "Escrow bank", purposeAr: "حفظ العربون وصرفه أو رده", purposeEn: "Holding, releasing or refunding the deposit" },
  { key: "esign", ar: "مزوّد التوقيع الإلكتروني المرخّص", en: "Licensed e-signature provider", purposeAr: "توقيع العقود", purposeEn: "Signing contracts" },
  { key: "storage", ar: "مزوّد التخزين المشفّر (S3/R2)", en: "Encrypted storage provider (S3/R2)", purposeAr: "حفظ المستندات مشفّرة", purposeEn: "Storing documents encrypted" },
  { key: "messaging", ar: "مزوّدي الرسائل (واتساب / SMS / إيميل)", en: "Messaging providers (WhatsApp / SMS / email)", purposeAr: "رموز التحقق والإشعارات", purposeEn: "Verification codes and notifications" },
];
