import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    intakeForm: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

describe("/api/intake/[token]", () => {
  beforeEach(() => {
    vi.mocked(prisma.intakeForm.findUnique).mockReset();
    vi.mocked(prisma.intakeForm.updateMany).mockReset();
  });

  it("returns the public intake form payload", async () => {
    vi.mocked(prisma.intakeForm.findUnique).mockResolvedValue({
      id: "intake_1",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: "Poodle",
      petAge: "4",
      petWeight: "20lb",
      vaccinated: true,
      vetName: "Happy Pets",
      vetPhone: "555-1111",
      temperament: "Sweet",
      biteHistory: false,
      allergies: "None",
      emergencyName: "Alex",
      emergencyPhone: "555-2222",
      specialNotes: "Handle gently",
      completed: false,
      business: { name: "Paw House" },
    } as never);

    const response = await GET(new Request("http://localhost/intake/tok_123") as never, {
      params: Promise.resolve({ token: "tok_123" }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).businessName).toBe("Paw House");
  });

  it("sanitizes and submits the intake form only once", async () => {
    vi.mocked(prisma.intakeForm.findUnique).mockResolvedValueOnce({ id: "intake_1" } as never);
    vi.mocked(prisma.intakeForm.updateMany).mockResolvedValue({ count: 1 } as never);

    const response = await POST(new Request("http://localhost/intake/tok_123", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        petName: " Buddy\u0001 ",
        vaccinated: "true",
        biteHistory: false,
        specialNotes: " Calm dog\t\n",
      }),
    }) as never, { params: Promise.resolve({ token: "tok_123" }) });

    expect(prisma.intakeForm.updateMany).toHaveBeenCalledWith({
      where: { token: "tok_123", completed: false },
      data: expect.objectContaining({
        petName: "Buddy",
        vaccinated: true,
        biteHistory: false,
        specialNotes: "Calm dog",
        completed: true,
      }),
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
