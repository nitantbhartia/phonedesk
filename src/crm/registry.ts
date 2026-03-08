import { prisma } from "@/lib/prisma";
import { SquareAdapter } from "./adapters/SquareAdapter";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";
import type { GroomingCRM } from "./GroomingCRM";

// Add new adapters here as one-line entries when new CRMs are integrated:
// import { MoeGoAdapter } from "./adapters/MoeGoAdapter";
// import { GingrAdapter } from "./adapters/GingrAdapter";

export async function getCRMForBusiness(businessId: string): Promise<GroomingCRM> {
  const connection = await prisma.calendarConnection.findFirst({
    where: { businessId, provider: "SQUARE", isActive: true },
  });

  if (connection?.accessToken) {
    const meta = connection.metadata as { locationId?: string } | null;
    const locationId = meta?.locationId || "";
    const baseUrl =
      process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";
    return new SquareAdapter(connection.accessToken, locationId, baseUrl);
  }

  // Future CRMs: check for moego/gingr connections here
  // const moegoConnection = await prisma.calendarConnection.findFirst({ where: { businessId, provider: "MOEGO", isActive: true } });
  // if (moegoConnection?.accessToken) return new MoeGoAdapter(moegoConnection.accessToken);

  return new PawAnswersDBAdapter(businessId);
}
