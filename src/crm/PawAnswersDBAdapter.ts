import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { lookupCustomerContext } from "@/lib/customer-memory";
import type {
  GroomingCRM,
  CRMCustomer,
  CRMPet,
  CRMService,
  CRMSlot,
  NewCRMCustomer,
  CRMAppointmentData,
  CRMBooking,
} from "./GroomingCRM";

/**
 * Fallback CRM adapter using PawAnswers' own PostgreSQL database.
 * Always available — used when Square (or other external CRM) is down or not connected.
 */
export class PawAnswersDBAdapter implements GroomingCRM {
  constructor(private readonly businessId: string) {}

  async getCustomer(phone: string): Promise<CRMCustomer | null> {
    const context = await lookupCustomerContext(this.businessId, phone);
    if (!context.customer) return null;

    const c = context.customer;
    return {
      id: c.id,
      pawanswersId: c.id,
      name: c.name,
      phone: c.phone,
      visitCount: c.visitCount,
      noShowCount: c.noShowCount ?? 0,
      vip: c.vipFlag,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async getPets(customerId: string): Promise<CRMPet[]> {
    const pets = await prisma.pet.findMany({
      where: { customerId },
      orderBy: { createdAt: "asc" },
    });

    return pets.map((pet) => ({
      id: pet.id,
      customerId: pet.customerId,
      name: pet.name,
      breed: pet.breed || "",
      size: (pet.size || "MEDIUM") as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
      temperamentNotes: pet.notes || undefined,
    }));
  }

  async getServices(): Promise<CRMService[]> {
    const services = await prisma.service.findMany({
      where: { businessId: this.businessId, isActive: true },
    });

    return services.map((s) => ({
      id: s.id,
      name: s.name,
      priceCents: Math.round(s.price * 100),
      durationMinutes: s.duration,
      active: s.isActive,
    }));
  }

  async getAvailability(_date: string, _serviceId: string): Promise<CRMSlot[]> {
    return [];
  }

  async createCustomer(data: NewCRMCustomer): Promise<CRMCustomer> {
    const normalized = normalizePhoneNumber(data.phone);
    if (!normalized) throw new Error("Invalid phone number");

    const customer = await prisma.customer.upsert({
      where: {
        businessId_phone: { businessId: this.businessId, phone: normalized },
      },
      create: {
        businessId: this.businessId,
        phone: normalized,
        name: data.name,
        visitCount: 0,
      },
      update: { name: data.name },
    });

    return {
      id: customer.id,
      pawanswersId: customer.id,
      name: customer.name,
      phone: customer.phone,
      visitCount: customer.visitCount,
      noShowCount: customer.noShowCount ?? 0,
      vip: customer.vipFlag,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async createAppointment(_data: CRMAppointmentData): Promise<CRMBooking> {
    throw new Error("createAppointment: use existing calendar.ts bookAppointment");
  }

  async addNote(customerId: string, note: string): Promise<void> {
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastCallSummary: note },
    });
  }

  async flagNoShow(_customerId: string, _appointmentId: string): Promise<void> {
    // No-shows are tracked via Appointment.status in the existing system
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  getCRMType(): string {
    return "pawanswers";
  }
}
