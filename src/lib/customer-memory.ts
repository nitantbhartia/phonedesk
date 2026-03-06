import { prisma } from "./prisma";
import { normalizePhoneNumber } from "./phone";

type BookingMemoryInput = {
  businessId: string;
  customerName: string;
  customerPhone?: string | null;
  petName?: string | null;
  petBreed?: string | null;
  petSize?: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE" | null;
  serviceName?: string | null;
  appointmentStart: Date;
};

type CallMemoryInput = {
  businessId: string;
  customerName: string;
  customerPhone?: string | null;
  petName?: string | null;
  petBreed?: string | null;
  petSize?: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE" | null;
  serviceName?: string | null;
  summary?: string | null;
  notes?: string | null;
  outcome?: string | null;
  contactedAt: Date;
};

export async function upsertCustomerMemory(input: BookingMemoryInput) {
  const normalizedPhone = normalizePhoneNumber(input.customerPhone);
  if (!normalizedPhone) {
    return null;
  }

  const visitCount = await prisma.appointment.count({
    where: {
      businessId: input.businessId,
      customerPhone: { in: [normalizedPhone, input.customerPhone || normalizedPhone] },
      status: { in: ["CONFIRMED", "PENDING", "COMPLETED"] },
    },
  });

  const customer = await prisma.customer.upsert({
    where: {
      businessId_phone: {
        businessId: input.businessId,
        phone: normalizedPhone,
      },
    },
    create: {
      businessId: input.businessId,
      phone: normalizedPhone,
      name: input.customerName,
      visitCount: visitCount || 1,
      lastContactAt: input.appointmentStart,
      lastVisitAt: input.appointmentStart,
      lastServiceName: input.serviceName || undefined,
      lastOutcome: "BOOKED",
    },
    update: {
      name: input.customerName,
      visitCount: visitCount || 1,
      lastContactAt: input.appointmentStart,
      lastVisitAt: input.appointmentStart,
      lastServiceName: input.serviceName || undefined,
      lastOutcome: "BOOKED",
    },
  });

  if (input.petName) {
    await prisma.pet.upsert({
      where: {
        customerId_name: {
          customerId: customer.id,
          name: input.petName,
        },
      },
      create: {
        customerId: customer.id,
        name: input.petName,
        breed: input.petBreed || undefined,
        size: input.petSize || undefined,
      },
      update: {
        breed: input.petBreed || undefined,
        size: input.petSize || undefined,
      },
    });
  }

  return customer;
}

export async function upsertCustomerMemoryFromCall(input: CallMemoryInput) {
  const normalizedPhone = normalizePhoneNumber(input.customerPhone);
  if (!normalizedPhone) {
    return null;
  }

  const customer = await prisma.customer.upsert({
    where: {
      businessId_phone: {
        businessId: input.businessId,
        phone: normalizedPhone,
      },
    },
    create: {
      businessId: input.businessId,
      phone: normalizedPhone,
      name: input.customerName,
      lastServiceName: input.serviceName || undefined,
      lastContactAt: input.contactedAt,
      lastCallSummary: input.summary || undefined,
      lastOutcome: input.outcome || "NO_BOOKING",
      notes: input.notes || undefined,
    },
    update: {
      name: input.customerName,
      lastServiceName: input.serviceName || undefined,
      lastContactAt: input.contactedAt,
      lastCallSummary: input.summary || undefined,
      lastOutcome: input.outcome || "NO_BOOKING",
      notes: input.notes || undefined,
    },
  });

  if (input.petName) {
    await prisma.pet.upsert({
      where: {
        customerId_name: {
          customerId: customer.id,
          name: input.petName,
        },
      },
      create: {
        customerId: customer.id,
        name: input.petName,
        breed: input.petBreed || undefined,
        size: input.petSize || undefined,
      },
      update: {
        breed: input.petBreed || undefined,
        size: input.petSize || undefined,
      },
    });
  }

  return customer;
}

export async function lookupCustomerContext(businessId: string, phone?: string | null) {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) {
    return {
      found: false,
      normalizedPhone: null,
      customer: null,
      pets: [],
    };
  }

  const customer = await prisma.customer.findUnique({
    where: {
      businessId_phone: {
        businessId,
        phone: normalizedPhone,
      },
    },
    include: {
      pets: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return {
    found: Boolean(customer),
    normalizedPhone,
    customer,
    pets: customer?.pets || [],
  };
}

export function buildCustomerContextSummary(context: Awaited<ReturnType<typeof lookupCustomerContext>>) {
  if (!context.customer) {
    return "No prior customer record found for this caller. Treat them as a new customer and collect full booking details.";
  }

  const petSummary =
    context.pets.length > 0
      ? context.pets
          .map((pet) => {
            const details = [pet.name, pet.breed, pet.size].filter(Boolean).join(", ");
            return details || pet.name;
          })
          .join("; ")
      : "No pets saved yet.";

  const lastVisit = context.customer.lastVisitAt
    ? new Date(context.customer.lastVisitAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  return [
    "Returning customer found.",
    `Customer name: ${context.customer.name}.`,
    `Phone: ${context.customer.phone}.`,
    `Visit count: ${context.customer.visitCount}.`,
    `Last service: ${context.customer.lastServiceName || "Unknown"}.`,
    `Last visit: ${lastVisit}.`,
    `Last contact: ${context.customer.lastContactAt ? new Date(context.customer.lastContactAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) : "Unknown"}.`,
    `Pets on file: ${petSummary}.`,
    context.customer.lastCallSummary
      ? `Last call summary: ${context.customer.lastCallSummary}.`
      : "",
    context.customer.notes ? `Customer notes: ${context.customer.notes}.` : "",
    "Greet them by name, reference their pet if relevant, and avoid asking for details already on file unless you need to confirm a change.",
  ]
    .filter(Boolean)
    .join(" ");
}
