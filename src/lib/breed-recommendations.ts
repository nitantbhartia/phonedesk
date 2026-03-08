import type { PrismaClient } from "@prisma/client";

export const DEFAULT_BREED_RECOMMENDATIONS = [
  {
    breedKeyword: "poodle",
    recommendedServiceKeyword: "full groom",
    reason: "poodles have curly coats that mat quickly and need scissor finishing beyond a bath",
    priority: 10,
  },
  {
    breedKeyword: "doodle",
    recommendedServiceKeyword: "full groom",
    reason: "doodle coats are highly prone to matting and need full scissor work to stay healthy",
    priority: 10,
  },
  {
    breedKeyword: "portuguese water dog",
    recommendedServiceKeyword: "full groom",
    reason: "portuguese water dogs have dense wavy coats that require full grooming",
    priority: 9,
  },
  {
    breedKeyword: "bichon",
    recommendedServiceKeyword: "full groom",
    reason: "bichons have fluffy double coats that mat and need scissor shaping",
    priority: 8,
  },
  {
    breedKeyword: "shih tzu",
    recommendedServiceKeyword: "full groom",
    reason: "shih tzus have long flowing coats that require full scissor grooming",
    priority: 8,
  },
  {
    breedKeyword: "labrador",
    recommendedServiceKeyword: "bath",
    reason: "labradors have short easy-care coats — a thorough bath and blow-dry is all they need",
    priority: 7,
  },
  {
    breedKeyword: "golden retriever",
    recommendedServiceKeyword: "bath",
    reason: "golden retrievers have wash-and-wear coats that respond well to a deep bath and brush-out",
    priority: 7,
  },
  {
    breedKeyword: "beagle",
    recommendedServiceKeyword: "bath",
    reason: "beagles have short smooth coats — a bath and nail trim covers their grooming needs",
    priority: 6,
  },
  {
    breedKeyword: "boxer",
    recommendedServiceKeyword: "bath",
    reason: "boxers have very short coats that only need a bath, not scissor work",
    priority: 6,
  },
];

/**
 * Seeds default breed recommendations for a business.
 * Uses upsert so existing customized entries are never overwritten.
 * Safe to call multiple times (idempotent).
 */
export async function seedBreedRecommendations(
  businessId: string,
  prismaClient: PrismaClient
): Promise<void> {
  for (const rec of DEFAULT_BREED_RECOMMENDATIONS) {
    await prismaClient.breedRecommendation.upsert({
      where: {
        businessId_breedKeyword: {
          businessId,
          breedKeyword: rec.breedKeyword,
        },
      },
      create: { businessId, ...rec },
      update: {}, // don't overwrite business-customized entries
    });
  }
}
