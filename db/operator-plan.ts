import { istDateParts } from "@/lib/operator/calendar";
import { dailyPlanCacheKey, parseCachedDailyPlan, serializeDailyPlanCache } from "@/lib/operator/plan-cache";
import type { OperatorPlanResult } from "@/lib/operator/model-adapter";
import { getMeta, setMeta } from "./operator-meta";

export function istPlanDate(now?: string) {
  const date = now && !Number.isNaN(Date.parse(now)) ? new Date(now) : new Date();
  const parts = istDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function readDailyPlanCache(today: string) {
  return parseCachedDailyPlan(await getMeta(dailyPlanCacheKey(today)));
}

export async function writeDailyPlanCache(today: string, result: OperatorPlanResult) {
  await setMeta(dailyPlanCacheKey(today), serializeDailyPlanCache(result));
}
