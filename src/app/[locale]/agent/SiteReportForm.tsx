"use client";

import { useRef, useState } from "react";

/**
 * OPS-02: صور المعاينة من الموبايل. بياخد مكان الجهاز (GPS) ووقت التصوير، وبيصغّر الصور
 * قبل الرفع (أقصى ضلع 1600px، JPEG) عشان تعدّي حد الرفع — والتصغير بيشيل بيانات EXIF.
 */
export function SiteReportForm({ action, ar, adminReason }: { action: (f: FormData) => void; ar: boolean; adminReason?: boolean }) {
  const L = (a: string, e: string) => (ar ? a : e);
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "asking" | "ok" | "denied">("idle");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [takenAt, setTakenAt] = useState("");

  const locate = () => {
    if (!("geolocation" in navigator)) return setGeoState("denied");
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setGeoState("ok");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  async function shrink(file: File) {
    if (!file.type.startsWith("image/")) return file;
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.82));
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 10);
    // المكان بيتاخد وقت اختيار الصور (مش أول ما الصفحة تفتح)
    if (geoState === "idle") locate();
    setBusy(true);
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(await shrink(f));
    if (input.current) input.current.files = dt.files;
    setCount(dt.files.length);
    setTakenAt(new Date().toISOString());
    setBusy(false);
  }

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-2">
      <input type="hidden" name="lat" value={geo?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo?.lng ?? ""} />
      <input type="hidden" name="accuracy" value={geo?.accuracy ?? ""} />
      <input type="hidden" name="takenAt" value={takenAt} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        {L("صور الموقع (لحد 10)", "Site photos (up to 10)")}
        <input ref={input} name="photos" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple required onChange={onPick} className="border border-dashed border-line p-2" />
      </label>
      <span className="text-xs text-muted">
        {geoState === "ok" && geo
          ? L(`المكان اتسجل (دقة ${Math.round(geo.accuracy)} متر)`, `Location captured (±${Math.round(geo.accuracy)} m)`)
          : geoState === "asking"
            ? L("بنجيب مكانك…", "Getting your location…")
            : geoState === "denied"
              ? L("ما قدرناش ناخد المكان — اسمح بالموقع للمتصفح، أو كمّل من غيره.", "Couldn't get your location — allow location access, or continue without it.")
              : ""}{" "}
        {geoState === "denied" && (
          <button type="button" onClick={locate} className="font-semibold text-brand underline">
            {L("جرّب تاني", "Try again")}
          </button>
        )}
      </span>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {L("تقدير نسبة التنفيذ (%)", "Estimated construction (%)")}
        <input name="estimate" type="number" min={0} max={100} step={1} inputMode="numeric" className="min-h-11 w-32 border border-line px-2" />
      </label>
      {adminReason && <input aria-label={L("سبب تدخّل الأدمن (إجباري)", "Admin override reason (required)")} name="overrideReason" required minLength={5} placeholder={L("سبب تدخّل الأدمن (إجباري)", "Admin override reason (required)")} className="min-h-9 border border-[#F0D9A8] bg-[#FDF3E1] px-2 text-sm" />}
      <button disabled={busy} className="inline-flex min-h-11 items-center justify-center self-start bg-brand px-4 font-semibold text-white disabled:opacity-50">
        {busy ? L("بنجهّز الصور…", "Preparing photos…") : count ? L(`ابعت التقرير (${count} صورة)`, `Send report (${count} photos)`) : L("ابعت التقرير", "Send report")}
      </button>
    </form>
  );
}
