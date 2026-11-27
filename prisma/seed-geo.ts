import type { PrismaClient } from "@prisma/client";

/**
 * المدن والأحياء الحقيقية لأراضي «بيت الوطن» (من إعلانات الطروحات 7 → 11، 2021–2026).
 * المصادر: masrawy (الطرح 8 و10)، albayt.news (الطرح 9)، al-ain (التكميلي 2025)، elbalad / cairo24 / banker.news (الطرح 11)،
 * كراسة شروط الطرح 11 (shbabbek)، وقائمة أحياء المُلّاك (engeg.com — مصدر غير رسمي).
 * ⚠️ أسماء الأحياء مش كاملة لكل المدن — الأدمن يكمّلها من تبويب «الأحياء والطروحات».
 * آمن يتكرر: بيضيف الناقص بس، وما بيعدّلش تعديلات الأدمن، وما بيمسحش حاجة.
 */
type D = [string, string];
const CITIES: { id: string; ar: string; en: string; slug: string; code: string; districts: D[] }[] = [
  { id: "NEW_CAIRO", ar: "القاهرة الجديدة", en: "New Cairo", slug: "new-cairo", code: "NC", districts: [["شمال الرحاب", "North Rehab"], ["الحي الأول", "District 1"], ["الحي الثاني", "District 2"], ["الحي الثالث", "District 3"], ["الحي الرابع", "District 4"], ["الحي الخامس", "District 5"], ["الحي السادس", "District 6"], ["الحي السابع", "District 7"], ["الحي الثامن", "District 8"], ["الأوركيد", "Orchid"], ["امتداد النرجس", "El Narges Extension"], ["جنوب طريق السويس", "South Suez Road"], ["حدائق الأندلس", "Andalus Gardens"], ["شمال بيت الوطن", "North Beit El Watan"], ["مثلث الأمل", "Amal Triangle"], ["غرب الجامعات", "West of Universities"], ["الامتداد الشرقي", "Eastern Extension"]] },
  { id: "SHEIKH_ZAYED", ar: "الشيخ زايد", en: "Sheikh Zayed", slug: "sheikh-zayed", code: "SZ", districts: [["الثورة الخضراء", "Green Revolution"], ["توسعات المدينة", "City Expansions"], ["توسعات المدينة - جنوب جامعة المعرفة", "City Expansions - South Knowledge University"], ["توسعات المدينة بالقرار 77", "City Expansions (Decree 77)"], ["الحي الحادي عشر - المجاورة الثانية", "District 11 - Neighborhood 2"], ["الحي الثالث عشر", "District 13"], ["منطقة A", "Zone A"]] },
  { id: "OCTOBER", ar: "6 أكتوبر", en: "6th of October", slug: "6th-of-october", code: "OC", districts: [["التوسعات الشمالية", "Northern Expansions"], ["التوسعات الشمالية - السياحيات", "Northern Expansions - Touristic"], ["التوسعات الشرقية", "Eastern Expansions"], ["الحي السادس", "District 6"], ["الحي التاسع", "District 9"], ["الحي المتميز (المنطقة السياحية)", "Distinguished District (Touristic Zone)"], ["شمال نادي 6 أكتوبر", "North of 6 October Club"], ["غرب سكن العاملين بجامعة القاهرة", "West of Cairo University Staff Housing"], ["غرب سوميد", "West Somid"]] },
  { id: "NEW_OCTOBER", ar: "أكتوبر الجديدة", en: "New October", slug: "new-october", code: "NO", districts: [["شمال المطار - الحي العاشر", "North Airport - District 10"], ["شمال الواحة - الحي الأول", "North Oasis - District 1"], ["شمال الواحة - الحي الثاني", "North Oasis - District 2"], ["شمال الواحة - الحي الثالث", "North Oasis - District 3"]] },
  { id: "NEW_DAMIETTA", ar: "دمياط الجديدة", en: "New Damietta", slug: "new-damietta", code: "ND", districts: [["منطقة (أ)", "Zone A"], ["الحي السادس", "District 6"], ["شرق المدينة", "East of City"], ["شمال جامعة دمياط", "North Damietta University"], ["المنطقة المركزية (ج)", "Central Zone C"], ["شمال الحي 22 / شرق جامعة حورس", "North District 22 / East Horus University"], ["بيت الوطن بالساحل", "Beit El Watan Coast"], ["غرب المدينة / غرب الميناء", "West City / West Port"]] },
  { id: "10TH_OF_RAMADAN", ar: "العاشر من رمضان", en: "10th of Ramadan", slug: "10th-of-ramadan", code: "TR", districts: [["منطقة المال والأعمال", "Business District"]] },
  { id: "OBOUR", ar: "العبور", en: "El Obour", slug: "obour", code: "OB", districts: [["الحي الثامن", "District 8"], ["الحي الرابع", "District 4"]] },
  { id: "NEW_OBOUR", ar: "العبور الجديدة", en: "New Obour", slug: "new-obour", code: "NOB", districts: [["المنطقة TA", "Zone TA"], ["الحي الرابع والعشرون - طريق R2", "District 24 - R2 Road"]] },
  { id: "BADR", ar: "بدر", en: "Badr", slug: "badr", code: "BD", districts: [["الامتداد الشرقي", "Eastern Extension"], ["الحديقة المركزية", "Central Park"], ["الحي الأول", "District 1"], ["الحي الثاني", "District 2"], ["الحي الثالث", "District 3"], ["الحي المتميز", "Distinguished District"], ["المنطقة الترفيهية", "Recreational Zone"], ["المنطقة الترفيهية غرب المدينة", "West City Recreational Zone"]] },
  { id: "SHOROUK", ar: "الشروق", en: "El Shorouk", slug: "shorouk", code: "SH", districts: [["زهرة الشروق - جنوب المركز الطبي العالمي", "Zahrat El Shorouk - South International Medical Center"]] },
  { id: "15_MAY", ar: "15 مايو", en: "15th of May", slug: "15th-of-may", code: "FM", districts: [["المركز الفرعي رقم 3", "Sub-Center No. 3"]] },
  { id: "SADAT", ar: "السادات", en: "Sadat City", slug: "sadat", code: "SD", districts: [["المحور المركزي الثاني", "Second Central Axis"]] },
  { id: "NEW_MANSOURA", ar: "المنصورة الجديدة", en: "New Mansoura", slug: "new-mansoura", code: "NM", districts: [["المنطقة السادسة B", "Zone 6B"]] },
  { id: "NEW_ALAMEIN", ar: "العلمين الجديدة", en: "New Alamein", slug: "new-alamein", code: "NA", districts: [["المنطقة C (بجوار الأكاديمية العربية)", "Zone C (near the Arab Academy)"]] },
  { id: "NEW_SPHINX", ar: "سفنكس الجديدة", en: "New Sphinx", slug: "new-sphinx", code: "SX", districts: [["موقع 145 فدان شمال السليمانية", "145-feddan site, North Soleimaniya"]] },
  { id: "NEW_BORG_EL_ARAB", ar: "برج العرب الجديدة", en: "New Borg El Arab", slug: "new-borg-el-arab", code: "BA", districts: [] },
  { id: "CAPITAL_GARDENS", ar: "حدائق العاصمة", en: "Capital Gardens", slug: "capital-gardens", code: "CG", districts: [["المنطقة A", "Zone A"], ["المنطقة B", "Zone B"]] },
  { id: "NEW_MINYA", ar: "المنيا الجديدة", en: "New Minya", slug: "new-minya", code: "MN", districts: [["منطقة الـ310 فدان - السياحية الثالثة", "310-feddan area - Third Touristic Zone"]] },
  { id: "NEW_ASWAN", ar: "أسوان الجديدة", en: "New Aswan", slug: "new-aswan", code: "AW", districts: [["منطقة الـ350 فدان جنوب الحي السياحي", "350-feddan area, South Touristic District"]] },
  { id: "NEW_QENA", ar: "قنا الجديدة", en: "New Qena", slug: "new-qena", code: "QN", districts: [] },
  { id: "NEW_ASSIUT", ar: "أسيوط الجديدة", en: "New Assiut", slug: "new-assiut", code: "AS", districts: [] },
  { id: "NEW_SOHAG", ar: "سوهاج الجديدة", en: "New Sohag", slug: "new-sohag", code: "SO", districts: [] },
  { id: "NEW_AKHMIM", ar: "أخميم الجديدة", en: "New Akhmim", slug: "new-akhmim", code: "AK", districts: [] },
  { id: "NEW_FAYOUM", ar: "الفيوم الجديدة", en: "New Fayoum", slug: "new-fayoum", code: "FY", districts: [] },
  { id: "NEW_BENI_SUEF", ar: "بني سويف الجديدة", en: "New Beni Suef", slug: "new-beni-suef", code: "BS", districts: [] },
];

/** الطروحات القومية لبيت الوطن (مش مرتبطة بمدينة واحدة) */
const ROUNDS: { n: number; ar: string; en: string; year: number }[] = [
  { n: 7, ar: "الطرح السابع", en: "Round 7", year: 2021 },
  { n: 8, ar: "الطرح الثامن", en: "Round 8", year: 2022 },
  { n: 9, ar: "الطرح التاسع", en: "Round 9", year: 2023 },
  { n: 10, ar: "الطرح العاشر", en: "Round 10", year: 2025 },
  { n: 10, ar: "الطرح العاشر التكميلي", en: "Round 10 (supplementary)", year: 2025 },
  { n: 11, ar: "الطرح الحادي عشر", en: "Round 11", year: 2026 },
];

export async function seedBeitElWatanGeo(prisma: PrismaClient) {
  for (const [i, c] of CITIES.entries()) {
    const exists = await prisma.city.findFirst({ where: { OR: [{ id: c.id }, { slug: c.slug }] } });
    if (!exists) {
      const prefixTaken = await prisma.city.findFirst({ where: { codePrefix: c.code } });
      if (!prefixTaken) await prisma.city.create({ data: { id: c.id, nameAr: c.ar, nameEn: c.en, slug: c.slug, codePrefix: c.code, sortOrder: i + 1 } });
    }
    const cityId = exists?.id ?? c.id;
    if (!(await prisma.city.findUnique({ where: { id: cityId } }))) continue;
    for (const [k, [ar, en]] of c.districts.entries()) {
      const d = await prisma.district.findUnique({ where: { city_nameAr: { city: cityId, nameAr: ar } } });
      if (!d) await prisma.district.create({ data: { city: cityId, nameAr: ar, nameEn: en, sort: 100 + k } });
    }
  }
  for (const r of ROUNDS) {
    if (!(await prisma.offeringRound.findFirst({ where: { cityId: null, nameAr: r.ar } }))) {
      await prisma.offeringRound.create({ data: { cityId: null, nameAr: r.ar, nameEn: r.en, number: r.n, year: r.year, installmentCurrency: "USD" } });
    }
  }
  // مرة واحدة بس: إيقاف أحياء التجربة اللي مش موجودة في الواقع (ما بتتمسحش — القطع القديمة بتفضل عليها)
  if (!(await prisma.appSetting.findUnique({ where: { key: "geo.realSeeded" } }))) {
    for (const c of CITIES) {
      const real = new Set(c.districts.map((d) => d[0]));
      // أحياء بيانات التجربة بس (بأسمائها) — أي حي ضافه الأدمن بيفضل زي ما هو
      const demo = await prisma.district.findMany({ where: { city: c.id, active: true, nameAr: { in: ["الحي الأول", "الحي الثاني", "الحي الثالث", "منطقة الجامعات"] } } });
      for (const d of demo) if (!real.has(d.nameAr)) await prisma.district.update({ where: { id: d.id }, data: { active: false } });
    }
    // «المرحلة الأولى…» الخاصة بكل مدينة كانت بيانات تجربة → تتوقف، والطروحات القومية هي المعروضة
    await prisma.offeringRound.updateMany({ where: { cityId: { not: null }, nameAr: { startsWith: "المرحلة" } }, data: { isActive: false } });
    await prisma.appSetting.create({ data: { key: "geo.realSeeded", value: { at: new Date().toISOString(), cities: CITIES.length } } });
  }
}
