// SEC-20 + DEAL-03: النسخة الرسمية (OFFICIAL_DEPLOYMENT=1) ما تتبنيش أبداً والوضع التجريبي شغال —
// يعني مفيش «دخول سريع» ولا رمز تحقق بيظهر على الشاشة في الإنتاج الحقيقي.
const official = process.env.OFFICIAL_DEPLOYMENT === "1";
const demo = process.env.DEMO_MODE === "true";
if (official && demo) {
  console.error("✖ SEC-20: DEMO_MODE=true is not allowed on the official production deployment (OFFICIAL_DEPLOYMENT=1). Build stopped.");
  process.exit(1);
}
if (official) console.log("✓ SEC-20: official deployment, demo mode off.");
else console.log("ℹ SEC-20: demo/preview deployment (OFFICIAL_DEPLOYMENT not set) — fake data only, never use this link in ads.");
