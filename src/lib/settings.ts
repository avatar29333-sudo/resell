import "server-only";
import { db } from "./db";

export type CommissionRates = { sellerPct: number; buyerPct: number };
export type ServiceFees = {
  deadlineRescueEgp: number;
  siteInspectionEgp: number;
  /** رسوم التنازل في الجهاز كنسبة — null لحد ما تتحدد من آخر قرار */
  authorityTransferPct?: number | null;
  /** أتعاب المحامي على المشتري (0 = مش بتتحسب) */
  buyerLawyerFeeEgp?: number;
};
export type ContractTemplate = { type: string; version: string; updatedAt: string; note?: string };

export const DEFAULTS = {
  "commission.rates": { sellerPct: 1.5, buyerPct: 1.5 } as CommissionRates,
  "service.fees": { deadlineRescueEgp: 15000, siteInspectionEgp: 3500 } as ServiceFees,
  "contract.templates": [
    { type: "COMMISSION_AGREEMENT", version: "v3", updatedAt: "2026-11-01" },
    { type: "PRELIMINARY_CONTRACT", version: "v3", updatedAt: "2026-11-01" },
    { type: "DEPOSIT_RECEIPT", version: "v2", updatedAt: "2026-10-15" },
    { type: "POWER_OF_ATTORNEY", version: "v2", updatedAt: "2026-10-15" },
  ] as ContractTemplate[],
};
type Key = keyof typeof DEFAULTS;

export async function getSetting<K extends Key>(key: K): Promise<(typeof DEFAULTS)[K]> {
  const row = await db.appSetting.findUnique({ where: { key: key as string } });
  return (row?.value as (typeof DEFAULTS)[K]) ?? DEFAULTS[key];
}

export async function templateVersion(type: string) {
  const list = await getSetting("contract.templates");
  return list.find((t) => t.type === type)?.version ?? "v1";
}
