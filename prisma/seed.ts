// بيانات تجريبية للتطوير والاختبار: حساب لكل دور + قطعة وعرض وسعر صرف وطلب إنقاذ مهلة.
// التشغيل:  npm run db:seed   (آمن يتشغل أكتر من مرة)
// الأرقام وهمية (+2010000000xx) — ما تستخدمهاش على الإنتاج.
import { PrismaClient, Role, AccountLevel } from "@prisma/client";

const prisma = new PrismaClient();

const testUsers: { name: string; phone: string; role: Role }[] = [
  { name: "أدمن تجريبي", phone: "+201000000001", role: Role.ADMIN },
  { name: "وسيط تجريبي", phone: "+201000000002", role: Role.BROKER },
  { name: "محامي تجريبي", phone: "+201000000003", role: Role.LAWYER },
  { name: "مندوب تجريبي", phone: "+201000000004", role: Role.AGENT },
  { name: "مالي تجريبي", phone: "+201000000005", role: Role.FINANCE },
  { name: "بائع تجريبي", phone: "+201000000006", role: Role.CLIENT },
  { name: "مشتري تجريبي", phone: "+201000000007", role: Role.CLIENT },
];

async function main() {
  const users: Record<string, { id: string }> = {};
  for (const u of testUsers) {
    const staff = u.role !== Role.CLIENT;
    users[u.phone] = await prisma.user.upsert({
      where: { phone: u.phone },
      update: {},
      create: {
        ...u,
        countryOfResidence: "EG",
        accountLevel: staff ? AccountLevel.VERIFIED : AccountLevel.BASIC,
        twoFactorEnabled: staff,
      },
    });
  }
  const seller = users["+201000000006"];
  const broker = users["+201000000002"];

  const plot = await prisma.plot.upsert({
    where: { city_district_code: { city: "NEW_CAIRO", district: "الحي الأول", code: "TEST-0001" } },
    update: {},
    create: {
      city: "NEW_CAIRO",
      district: "الحي الأول",
      code: "TEST-0001",
      areaSqm: "450.00",
      paymentStatus: "FULLY_PAID",
      buildDeadline: new Date("2027-06-30"),
      constructionPercent: 0,
      createdById: broker.id,
    },
  });

  const existingListing = await prisma.listing.findFirst({ where: { plotId: plot.id } });
  if (!existingListing) {
    await prisma.listing.create({
      data: {
        plotId: plot.id,
        sellerId: seller.id,
        priceType: "ALL_INCLUSIVE",
        price: "4500000.00",
        currency: "EGP",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
  }

  const today = new Date(new Date().toISOString().slice(0, 10));
  const rate = await prisma.exchangeRate.findFirst({ where: { date: today, source: "MANUAL" } });
  if (!rate) {
    await prisma.exchangeRate.create({
      data: { date: today, buy: "48.5000", sell: "48.6000", source: "MANUAL", enteredById: users["+201000000005"].id },
    });
  }

  if ((await prisma.serviceRequest.count()) === 0) {
    await prisma.serviceRequest.create({
      data: {
        type: "DEADLINE_RESCUE",
        contactName: "مالك تجريبي",
        contactPhone: "+201000000099",
        city: "SHEIKH_ZAYED",
        district: "المرحلة الثانية",
        plotCode: "TEST-0002",
        message: "طلب تجريبي من فورم إنقاذ المهلة",
      },
    });
  }

  console.log(`تمام: ${testUsers.length} حسابات تجريبية، قطعة وعرض، سعر صرف، وطلب إنقاذ مهلة.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
