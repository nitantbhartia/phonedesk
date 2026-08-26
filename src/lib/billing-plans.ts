/** Customer-facing RingPaw plan economics, shared by UI and usage metering. */
export const RINGPAW_PLAN_PRICE = 99;
export const RINGPAW_PLAN_MINUTES = 200;
export const RINGPAW_ESTIMATED_CALLS = Math.round(RINGPAW_PLAN_MINUTES / 2);

export const PLAN_MINUTES: Record<string, number> = {
  STARTER: 75,
  PRO: RINGPAW_PLAN_MINUTES,
  BUSINESS: 500,
};
