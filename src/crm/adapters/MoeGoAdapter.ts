// MoeGo CRM Adapter skeleton — implement when a paying client requests it.
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

export class MoeGoAdapter implements GroomingCRM {
  private readonly baseUrl = "https://openapi.moego.pet/v1";

  constructor(
    private readonly apiKey: string,
    private readonly staffId?: string
  ) {}

  private async request(method: string, path: string, body?: object): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`MoeGo API error: ${res.status} ${path}`);
    return res.json();
  }

  async getCustomer(_phone: string): Promise<CRMCustomer | null> {
    throw new Error("MoeGoAdapter.getCustomer: not implemented");
  }
  async getPets(_customerId: string): Promise<CRMPet[]> {
    throw new Error("MoeGoAdapter.getPets: not implemented");
  }
  async getServices(): Promise<CRMService[]> {
    throw new Error("MoeGoAdapter.getServices: not implemented");
  }
  async getAvailability(_date: string, _serviceId: string): Promise<CRMSlot[]> {
    throw new Error("MoeGoAdapter.getAvailability: not implemented");
  }
  async createCustomer(_data: NewCRMCustomer): Promise<CRMCustomer> {
    throw new Error("MoeGoAdapter.createCustomer: not implemented");
  }
  async createAppointment(_data: CRMAppointmentData): Promise<CRMBooking> {
    throw new Error("MoeGoAdapter.createAppointment: not implemented");
  }
  async addNote(_customerId: string, _note: string): Promise<void> {
    throw new Error("MoeGoAdapter.addNote: not implemented");
  }
  async flagNoShow(_customerId: string, _appointmentId: string): Promise<void> {
    throw new Error("MoeGoAdapter.flagNoShow: not implemented");
  }
  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      return true;
    } catch {
      return false;
    }
  }
  getCRMType(): string {
    return "moego";
  }
}
