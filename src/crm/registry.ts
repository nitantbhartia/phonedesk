import { prisma } from "@/lib/prisma";
import { SquareAdapter } from "./adapters/SquareAdapter";
import { MoeGoAdapter } from "./adapters/MoeGoAdapter";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";
import type { GroomingCRM } from "./GroomingCRM";

export async function getCRMForBusiness(businessId: string): Promise<GroomingCRM> {
  // ── Square ────────────────────────────────────────────────────────────────
  const squareConnection = await prisma.calendarConnection.findFirst({
    where: { businessId, provider: "SQUARE", isActive: true },
  });

  if (squareConnection?.accessToken) {
    const meta = squareConnection.metadata as { locationId?: string } | null;
    const locationId = meta?.locationId || "";
    const baseUrl =
      process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";
    return new SquareAdapter(squareConnection.accessToken, locationId, baseUrl);
  }

  // ── MoeGo ─────────────────────────────────────────────────────────────────
  // Credentials stored as:
  //   accessToken = API key (raw, will be Base64-encoded by the adapter)
  //   metadata    = { companyId: string, preferredBusinessId: string }
  const moegoConnection = await prisma.calendarConnection.findFirst({
    where: { businessId, provider: "MOEGO", isActive: true },
  });

  if (moegoConnection?.accessToken) {
    const meta = moegoConnection.metadata as {
      companyId?: string;
      preferredBusinessId?: string;
    } | null;
    return new MoeGoAdapter(
      moegoConnection.accessToken,
      meta?.companyId || "",
      meta?.preferredBusinessId || "",
    );
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  // Gingr write-back is not possible — their public API is read-only.
  return new PawAnswersDBAdapter(businessId);
}
