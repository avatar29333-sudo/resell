"use client";

import { useRef, useState } from "react";

/**
 * DOC-01 — رفع أكتر من ملف مرة واحدة (اختيار متعدد + سحب وإفلات) مع شريط تقدم لكل ملف.
 * PDF / JPG / PNG / HEIC لحد 20MB؛ HEIC بيتحول JPG هنا قبل الرفع. كل ملف لازم له عنوان.
 * بيضيف للفورم: docIds (لكل ملف خلص) + title_<id>.
 */
type Item = { key: string; name: string; title: string; progress: number; status: "converting" | "uploading" | "done" | "error"; error?: string; id?: string };

const MAX = 20 * 1024 * 1024;
const OK_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

export function MultiUpload({ locale, single = false, label, titleRequired = true, defaultTitle }: { locale: string; single?: boolean; label?: string; titleRequired?: boolean; defaultTitle?: string }) {
  const ar = locale !== "en";
  const L = (a: string, e: string) => (ar ? a : e);
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const patch = (key: string, p: Partial<Item>) => setItems((cur) => cur.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const ERR: Record<string, string> = {
    size: L("الملف أكبر من 20 ميجا.", "The file is larger than 20 MB."),
    type: L("النوع مش مسموح — PDF أو JPG أو PNG أو HEIC بس.", "Type not allowed — PDF, JPG, PNG or HEIC only."),
    heic: L("ما قدرناش نحوّل صورة HEIC — صوّرها JPG وجرّب تاني.", "Couldn't convert the HEIC photo — save it as JPG and retry."),
    rate: L("رفعت ملفات كتير في الساعة دي — استنى شوية.", "Too many uploads this hour — wait a bit."),
    net: L("النت فصل — جرّب تاني.", "Connection lost — try again."),
  };

  function putChunk(url: string, blob: Blob, onProgress: (loaded: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("PUT", url);
      x.upload.onprogress = (e) => onProgress(e.loaded);
      x.onload = () => (x.status < 300 ? resolve() : reject(new Error("chunk")));
      x.onerror = () => reject(new Error("net"));
      x.send(blob);
    });
  }

  async function upload(file0: File, key: string) {
    let file = file0;
    try {
      if (isHeic(file)) {
        patch(key, { status: "converting" });
        const heic2any = (await import("heic2any")).default;
        const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
        const blob = Array.isArray(out) ? out[0] : out;
        file = new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
        patch(key, { name: file.name });
      }
    } catch {
      patch(key, { status: "error", error: ERR.heic });
      return;
    }
    if (file.size > MAX) return patch(key, { status: "error", error: ERR.size });
    if (!OK_TYPES.includes(file.type)) return patch(key, { status: "error", error: ERR.type });
    patch(key, { status: "uploading", progress: 0 });
    try {
      const init = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }) });
      const s = await init.json();
      if (!init.ok) return patch(key, { status: "error", error: ERR[s.error] ?? ERR.type });
      let sent = 0;
      for (let i = 0; i < s.chunkCount; i++) {
        const part = file.slice(i * s.chunkBytes, Math.min(file.size, (i + 1) * s.chunkBytes));
        await putChunk(`/api/uploads/${s.id}?i=${i}`, part, (loaded) => patch(key, { progress: Math.round(((sent + loaded) / file.size) * 100) }));
        sent += part.size;
      }
      const done = await fetch(`/api/uploads/${s.id}/complete`, { method: "POST" });
      const d = await done.json();
      if (!done.ok) return patch(key, { status: "error", error: ERR[d.error] ?? ERR.type });
      patch(key, { status: "done", progress: 100, id: d.id });
    } catch {
      patch(key, { status: "error", error: ERR.net });
    }
  }

  function add(list: FileList | null) {
    if (!list?.length) return;
    const files = single ? [list[0]] : Array.from(list);
    const fresh = files.map((f, n) => ({ key: `${Date.now()}-${n}-${f.name}`, name: f.name, title: defaultTitle ?? f.name.replace(/\.[a-z0-9]+$/i, ""), progress: 0, status: "uploading" as const }));
    setItems((cur) => (single ? fresh : [...cur, ...fresh]));
    files.forEach((f, n) => void upload(f, fresh[n].key));
  }

  const busy = items.some((x) => x.status === "uploading" || x.status === "converting");
  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={label ?? L("اختار ملفات أو اسحبها هنا", "Choose files or drop them here")}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 border-2 border-dashed p-4 text-center text-sm ${drag ? "border-brand bg-[#EEF3FC]" : "border-line"}`}
      >
        <span className="font-semibold">{label ?? (single ? L("اختار ملف أو اسحبه هنا", "Choose a file or drop it here") : L("اختار ملفات أو اسحبها هنا", "Choose files or drop them here"))}</span>
        <span className="text-[13px] text-muted">{L("PDF أو JPG أو PNG أو HEIC — لحد 20 ميجا للملف", "PDF, JPG, PNG or HEIC — up to 20 MB each")}</span>
        <span className="text-[13px] text-muted">{L("🔒 ملفاتك سرية: ما بتتعرضش غير بموافقتك، ومش بتتباع لأي جهة.", "🔒 Your files are confidential: shown only with your consent, never sold.")}</span>
        <input ref={input} type="file" multiple={!single} accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" tabIndex={-1} onChange={(e) => add(e.target.files)} />
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((x) => (
            <li key={x.key} className="flex flex-col gap-1 border border-line p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate font-semibold" dir="auto">
                  {x.name}
                </span>
                <span className={x.status === "error" ? "text-[#A32020]" : x.status === "done" ? "text-ok" : "text-muted"}>
                  {x.status === "converting" ? L("بنحوّل HEIC لـ JPG…", "Converting HEIC to JPG…") : x.status === "uploading" ? `${x.progress}%` : x.status === "done" ? L("✓ اترفع", "✓ Uploaded") : x.error}
                </span>
              </div>
              <div className="h-2 w-full bg-paper" role="progressbar" aria-valuenow={x.progress} aria-valuemin={0} aria-valuemax={100} aria-label={x.name}>
                <div className={`h-2 ${x.status === "error" ? "bg-[#A32020]" : "bg-brand"}`} style={{ width: `${x.status === "error" ? 100 : x.progress}%` }} />
              </div>
              {x.status === "done" && x.id && (
                <>
                  <input type="hidden" name="docIds" value={x.id} />
                  <label className="flex flex-col gap-1">
                    {L("عنوان المستند", "Document title")}
                    <input
                      name={`title_${x.id}`}
                      required={titleRequired}
                      minLength={3}
                      maxLength={120}
                      value={x.title}
                      onChange={(e) => patch(x.key, { title: e.target.value })}
                      placeholder={L("مثلاً: إيصال قسط أخير", "e.g. Last installment receipt")}
                      className="min-h-11 border border-line px-2"
                    />
                  </label>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* الفورم ما يتبعتش وفيه ملف لسه بيترفع */}
      {busy && <input required value="" onChange={() => {}} aria-label={L("استنى لحد ما الرفع يخلص", "Wait for uploads to finish")} className="sr-only" />}
    </div>
  );
}
