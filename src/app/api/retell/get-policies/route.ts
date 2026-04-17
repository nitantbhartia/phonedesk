import { NextRequest, NextResponse } from "next/server";
import {
  parseRetellRequest,
  resolveRetellBusiness,
} from "@/lib/retell-tool-helpers";

type BusinessPolicies = {
  cancellationFee?: string;
  depositRequired?: boolean;
  depositAmount?: string;
  latePolicyMinutes?: number;
  customPolicies?: Array<{ name: string; description: string }>;
};

export async function POST(req: NextRequest) {
  const parsed = await parseRetellRequest(req);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  const { call } = parsed;
  const business = await resolveRetellBusiness(call.to_number);
  if (!business) {
    return NextResponse.json({
      vaccine_policy: "OFF",
      booking_mode: "SOFT",
      cancellation_fee: null,
      deposit_required: false,
      custom_policies: [],
    });
  }

  const policies = (business.policies as BusinessPolicies) || {};

  return NextResponse.json({
    vaccine_policy: business.vaccinePolicy || "OFF",
    booking_mode: business.bookingMode || "SOFT",
    cancellation_fee: policies.cancellationFee || null,
    deposit_required: policies.depositRequired || false,
    deposit_amount: policies.depositAmount || null,
    late_policy_minutes: policies.latePolicyMinutes || null,
    custom_policies: policies.customPolicies || [],
  });
}
