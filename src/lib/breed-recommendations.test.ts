import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BREED_RECOMMENDATIONS,
  seedBreedRecommendations,
} from "./breed-recommendations";

describe("breed recommendations", () => {
  it("ships sane default recommendations", () => {
    expect(DEFAULT_BREED_RECOMMENDATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          breedKeyword: "poodle",
          recommendedServiceKeyword: "full groom",
          priority: 10,
        }),
        expect.objectContaining({
          breedKeyword: "labrador",
          recommendedServiceKeyword: "bath",
        }),
      ])
    );
  });

  it("seeds each default recommendation idempotently via upsert", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const prismaClient = {
      breedRecommendation: { upsert },
    } as never;

    await seedBreedRecommendations("biz_1", prismaClient);

    expect(upsert).toHaveBeenCalledTimes(DEFAULT_BREED_RECOMMENDATIONS.length);
    expect(upsert).toHaveBeenCalledWith({
      where: {
        businessId_breedKeyword: {
          businessId: "biz_1",
          breedKeyword: "poodle",
        },
      },
      create: {
        businessId: "biz_1",
        breedKeyword: "poodle",
        recommendedServiceKeyword: "full groom",
        reason: expect.any(String),
        priority: 10,
      },
      update: {},
    });
  });
});
