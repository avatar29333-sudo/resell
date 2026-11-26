import "server-only";
import { db } from "./db";

export type PlotGeo = { polygon: GeoJSON.MultiPolygon | null; center: [number, number] | null };

/** حدود القطعة من PostGIS (Prisma ما بيقراش geometry، فبنستخدم SQL) */
export async function plotGeo(plotId: string): Promise<PlotGeo> {
  const rows = await db.$queryRaw<{ geo: string | null; lat: number | null; lng: number | null }[]>`
    SELECT ST_AsGeoJSON(boundary) AS geo, ST_Y(ST_Centroid(boundary)) AS lat, ST_X(ST_Centroid(boundary)) AS lng
    FROM "Plot" WHERE id = ${plotId}`;
  const r = rows[0];
  if (!r?.geo) return { polygon: null, center: null };
  return { polygon: JSON.parse(r.geo), center: [r.lat!, r.lng!] };
}

/**
 * مكان تقريبي للي لسه ما وقّعش اتفاق العمولة: دايرة نصف قطرها ~1.2 كم
 * مركزها مزحزح بشكل ثابت عن القطعة، عشان المكان الحقيقي ما يتعرفش.
 */
export function approximateCenter(center: [number, number], seed: string): [number, number] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dLat = (((h % 1000) / 1000) - 0.5) * 0.012;
  const dLng = ((((h >>> 10) % 1000) / 1000) - 0.5) * 0.012;
  return [center[0] + dLat, center[1] + dLng];
}
