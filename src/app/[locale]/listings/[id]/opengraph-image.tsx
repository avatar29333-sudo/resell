import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { latestRate, totalEgp } from "@/lib/listing";
import { toNum } from "@/lib/format";
import { CITY } from "@/lib/labels";
import { getSetting } from "@/lib/settings";

// UX-08: صورة المشاركة (واتساب وغيره) لكل عرض: المدينة والمساحة والسعر واللوجو.
// مولّد الصور (Satori) ما بيدعمش تشكيل الحروف العربي، فالنص هنا بالإنجليزي والأرقام.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Resell — Beit El Watan plot";

export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  const l = await db.listing.findUnique({ where: { id }, include: { plot: true, seller: { select: { status: true } } } });
  const visible = l && ["PUBLISHED", "IN_DEAL", "SOLD"].includes(l.status) && l.seller.status === "ACTIVE";
  const rate = visible ? await latestRate() : null;
  const city = visible ? CITY[l!.plot.city][1] : "Beit El Watan";
  const district = visible ? (l!.plot.districtEn ?? "") : "";
  const area = visible ? `${toNum(l!.plot.areaSqm).toLocaleString("en-US")} m²` : "";
  const price = visible ? `EGP ${Math.round(totalEgp(l!, toNum(rate?.sell ?? 50))).toLocaleString("en-US")}` : "";
  // MKT-15: رقم القيد من إعدادات الأدمن
  const reg = (await getSetting("brokerRegistrationNumber")).value;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0A1944", color: "white", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, border: "4px solid white", display: "flex" }}>
            <div style={{ width: 24, height: 48, borderRight: "4px solid white" }} />
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>Resell</div>
          <div style={{ fontSize: 26, color: "#B9C3DE", marginLeft: 12 }}>Beit El Watan resale</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>{city}</div>
          {district && <div style={{ fontSize: 40, color: "#D6DCEE" }}>{district}</div>}
          <div style={{ display: "flex", gap: 28, marginTop: 18, fontSize: 48, fontWeight: 700 }}>
            {area && <div style={{ display: "flex", background: "white", color: "#0A1944", padding: "8px 22px" }}>{area}</div>}
            {price && <div style={{ display: "flex", padding: "8px 0" }}>{price}</div>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#B9C3DE" }}>
          <div>Lawyer-checked papers · Licensed brokerage</div>
          {reg && <div style={{ display: "flex" }}>{`Broker reg. no. ${reg}`}</div>}
        </div>
      </div>
    ),
    size,
  );
}
