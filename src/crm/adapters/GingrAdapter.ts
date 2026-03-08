// Gingr CRM Adapter skeleton — implement when a paying client requests it.
// NOTE: Gingr uses session-based auth, not Bearer tokens.
// Verify token refresh approach with Gingr API docs before implementing.
// See PRD section 14.4 for step-by-step implementation guide.

import type {
  GroomingCRM,
  CRMCustomer,
  CRMPet,
  CRMService,
  CRMSlot,
  NewCRMCustomer,
  CRMAppointmentData,
  CRMBooking,
} from "../GroomingCRM";

export class GingrAdapter implements GroomingCRM {
  private readonly baseUrl = "https://app.gingrapp.com/api/v2";

  constructor(
    private readonly accessToken: string,
    private readonly accountId: string
  ) {}

  async getCustomer(_phone: string): Promise<CRMCustomer | null> {
    throw new Error("GingrAdapter.getCustomer: not implemented");
  }
  async getPets(_customerId: string): Promise<CRMPet[]> {
    throw new Error("GingrAdapter.getPets: not implemented");
  }
  async getServices(): Promise<CRMService[]> {
    throw new Error("GingrAdapter.getServices: not implemented");
  }
  async getAvailability(_date: string, _serviceId: string): Promise<CRMSlot[]> {
    throw new Error("GingrAdapter.getAvailability: not implemented");
  }
  async createCustomer(_data: NewCRMCustomer): Promise<CRMCustomer> {
    throw new Error("GingrAdapter.createCustomer: not implemented");
  }
  async createAppointment(_data: CRMAppointmentData): Promise<CRMBooking> {
    throw new Error("GingrAdapter.createAppointment: not implemented");
  }
  async addNote(_customerId: string, _note: string): Promise<void> {
    throw new Error("GingrAdapter.addNote: not implemented");
  }
  async flagNoShow(_customerId: string, _appointmentId: string): Promise<void> {
    throw new Error("GingrAdapter.flagNoShow: not implemented");
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
  getCRMType(): string {
    return "gingr";
  }
}
