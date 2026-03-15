// Gingr CRM Adapter — READ-ONLY. Gingr's public API does not support write
// operations (customer creation, notes, etc.). Their support docs explicitly
// state "the public API is read only." Write-back for Gingr clients is not
// possible without a private partner API arrangement with Gingr directly.
// See: https://support.gingrapp.com/hc/en-us/articles/27482358729101

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
