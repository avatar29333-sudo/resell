"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Props = {
  polygon?: GeoJSON.MultiPolygon | null;
  /** مكان تقريبي (دايرة) بدل الحدود الحقيقية */
  approx?: [number, number] | null;
  label: string;
  height?: number;
};

/** خريطة القطعة: الحدود بالظبط للي من حقه، أو دايرة تقريبية للباقيين */
export function PlotMap({ polygon, approx, label, height = 320 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      if (polygon) {
        const layer = L.geoJSON(polygon, { style: { color: "#193EA8", weight: 3, fillColor: "#2B55D6", fillOpacity: 0.25 } }).addTo(map);
        map.fitBounds(layer.getBounds(), { maxZoom: 18, padding: [30, 30] });
      } else if (approx) {
        // لازم الخريطة يبقى ليها مكان قبل ما الدايرة تتضاف
        map.setView(approx, 13);
        L.circle(approx, { radius: 1200, color: "#193EA8", weight: 2, fillOpacity: 0.12 }).addTo(map);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [polygon, approx]);

  return <div ref={ref} role="img" aria-label={label} style={{ height }} className="z-0 w-full border border-line" />;
}
