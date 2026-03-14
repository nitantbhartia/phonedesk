import { describe, expect, it } from "vitest";
import {
  computeCallScorecard,
  normalizeCallExtraction,
} from "./call-scorecard";

describe("call-scorecard", () => {
  it("normalizes common extracted-data key variants", () => {
    expect(
      normalizeCallExtraction({
        customer_name: "Jamie",
        dog_name: "Buddy",
        breed: "Poodle",
        pet_size: "MEDIUM",
        service_name: "Bath",
        special_handling_notes: "Sensitive paws",
      })
    ).toEqual({
      customerName: "Jamie",
      petName: "Buddy",
      breed: "Poodle",
      size: "MEDIUM",
      service: "Bath",
      outcome: null,
      notes: "Sensitive paws",
    });
  });

  it("awards the maximum score for a fully captured booked call", () => {
    const result = computeCallScorecard({
      callerName: "Jamie",
      status: "COMPLETED",
      summary: "Booked Buddy for a bath tomorrow afternoon.",
      appointment: {
        petName: "Buddy",
        serviceName: "Bath",
      },
      extractedData: {
        customer_name: "Jamie",
        pet_name: "Buddy",
        pet_breed: "Poodle",
        service_name: "Bath",
      },
    });

    expect(result.total).toBe(7);
    expect(result.max).toBe(7);
    expect(result.label).toBe("Excellent");
  });

  it("gives partial credit when the call did not book but the outcome is still documented", () => {
    const result = computeCallScorecard({
      callerName: "Morgan",
      status: "NO_BOOKING",
      summary: "Customer asked for pricing and will call back.",
      extractedData: {
        customer_name: "Morgan",
        service: "Full Groom",
        outcome: "price_shopped",
      },
    });

    expect(result.total).toBe(4);
    expect(result.label).toBe("Healthy");
    expect(result.criteria.find((criterion) => criterion.key === "outcome")).toMatchObject({
      passed: true,
      points: 1,
    });
  });
});
