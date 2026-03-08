// GroomingCRM.ts — The complete interface contract for all CRM adapters.
// Never edit this file when adding a new CRM — only add new adapters.

export interface CRMCustomer {
  id: string;                    // CRM-native customer ID
  pawanswersId?: string;         // PawAnswers DB ID if synced
  name: string;
  phone: string;                 // E.164 format
  email?: string;
  visitCount: number;
  noShowCount: number;
  vip: boolean;
  createdAt: string;             // ISO 8601
}

export interface CRMPet {
  id: string;
  customerId: string;
  name: string;
  breed: string;
  size: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE";
  weightLbs?: number;
  coatType?: string;
  temperamentNotes?: string;
  medicalNotes?: string;
  lastService?: string;
  lastVisitDate?: string;        // ISO 8601
}

export interface CRMService {
  id: string;                    // CRM-native service ID
  name: string;
  priceCents: number;            // always in cents to avoid float issues
  durationMinutes: number;
  active: boolean;
}

export interface CRMSlot {
  startTime: string;             // ISO 8601 — never reformat
  endTime: string;
  display: string;               // 'Tuesday Mar 10 at 10am'
  teamMemberId?: string;
}

export interface NewCRMCustomer {
  name: string;
  phone: string;
  email?: string;
}

export interface CRMAppointmentData {
  customerId: string;            // CRM-native
  serviceId: string;             // CRM-native
  startTime: string;             // ISO 8601 from CRMSlot.startTime
  petName: string;
  petBreed: string;
  petSize: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE";
  notes?: string;
  teamMemberId?: string;
}

export interface CRMBooking {
  id: string;                    // CRM-native booking ID
  confirmationDisplay: string;   // 'Tuesday March 10 at 10:00 AM'
  customerId: string;
  serviceName: string;
  startTime: string;
}

export interface GroomingCRM {
  // READ
  getCustomer(phone: string): Promise<CRMCustomer | null>;
  getPets(customerId: string): Promise<CRMPet[]>;
  getServices(): Promise<CRMService[]>;
  getAvailability(date: string, serviceId: string): Promise<CRMSlot[]>;

  // WRITE
  createCustomer(data: NewCRMCustomer): Promise<CRMCustomer>;
  createAppointment(data: CRMAppointmentData): Promise<CRMBooking>;
  addNote(customerId: string, note: string): Promise<void>;
  flagNoShow(customerId: string, appointmentId: string): Promise<void>;

  // META
  healthCheck(): Promise<boolean>;
  getCRMType(): string;
}
