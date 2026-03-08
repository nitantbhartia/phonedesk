import { getCRMForBusiness } from "./registry";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";
import type { GroomingCRM } from "./GroomingCRM";

/**
 * Get a CRM adapter for the given business, with automatic fallback to
 * PawAnswersDBAdapter if the external CRM is unreachable.
 *
 * Use this in all Retell tool routes — never call getCRMForBusiness directly
 * in production paths, as it won't fallback if the CRM API is down.
 */
export async function getCRMWithFallback(businessId: string): Promise<GroomingCRM> {
  const crm = await getCRMForBusiness(businessId);

  if (crm.getCRMType() === "pawanswers") {
    // Already the fallback — no health check needed
    return crm;
  }

  const healthy = await crm.healthCheck().catch(() => false);
  if (healthy) return crm;

  console.warn(
    `[CRM] ${crm.getCRMType()} unhealthy for business ${businessId}, falling back to PawAnswers DB`
  );
  return new PawAnswersDBAdapter(businessId);
}
