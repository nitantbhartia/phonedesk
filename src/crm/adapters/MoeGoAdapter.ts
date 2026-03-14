// MoeGo CRM Adapter — write-back implementation.
// API reference: https://github.com/MoeGolibrary/moegoapis (production branch)
//
// Auth: Authorization header value is the Base64-encoded API key (no "Bearer" prefix).
// The apiKey, companyId, and preferredBusinessId are stored in CalendarConnection:
//   accessToken = API key
//   metadata    = { companyId: string, preferredBusinessId: string }

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

interface MoeGoCustomer {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  createdTime?: string;
}

interface MoeGoListCustomersResponse {
  customers?: MoeGoCustomer[];
  nextPageToken?: string;
}

export class MoeGoAdapter implements GroomingCRM {
  private readonly baseUrl = "https://openapi.moego.pet";

  constructor(
    private readonly apiKey: string,
    /** Obfuscated MoeGo company ID (from ListCompany API or settings) */
    private readonly companyId: string,
    /** Obfuscated MoeGo business ID (preferredBusinessId for new customers) */
    private readonly preferredBusinessId: string,
  ) {}

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        // MoeGo uses Base64-encoded API key as the raw Authorization value
        Authorization: Buffer.from(this.apiKey).toString("base64"),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`MoeGo API error ${res.status} ${path}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  // ── READ ──────────────────────────────────────────────────────────────────

  async getCustomer(phone: string): Promise<CRMCustomer | null> {
    const data = await this.request<MoeGoListCustomersResponse>(
      "POST",
      "/v1/customers:list",
      {
        companyId: this.companyId,
        pagination: { pageSize: 1 },
        filter: { mainPhoneNumber: phone },
      },
    );
    const c = data.customers?.[0];
    return c ? this.mapCustomer(c) : null;
  }

  async getPets(_customerId: string): Promise<CRMPet[]> {
    // MoeGo has pet endpoints, but pet sync is out of scope for write-back MVP
    return [];
  }

  async getServices(): Promise<CRMService[]> {
    // Availability is handled by calendar.ts; services come from internal DB
    return [];
  }

  async getAvailability(_date: string, _serviceId: string): Promise<CRMSlot[]> {
    return [];
  }

  // ── WRITE ─────────────────────────────────────────────────────────────────

  async createCustomer(data: NewCRMCustomer): Promise<CRMCustomer> {
    const nameParts = data.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? data.name;
    // MoeGo requires lastName — use "." when customer gave only one name
    const lastName = nameParts.slice(1).join(" ") || ".";

    const created = await this.request<MoeGoCustomer>("POST", "/v1/customers", {
      companyId: this.companyId,
      preferredBusinessId: this.preferredBusinessId,
      firstName,
      lastName,
      phone: data.phone,
      ...(data.email ? { email: data.email } : {}),
    });

    return this.mapCustomer(created);
  }

  async createAppointment(_data: CRMAppointmentData): Promise<CRMBooking> {
    // Appointments are created via calendar.ts; not re-implemented here
    throw new Error("MoeGoAdapter.createAppointment: use calendar.ts bookAppointment");
  }

  async addNote(customerId: string, note: string): Promise<void> {
    await this.request("POST", `/v1/customers/${customerId}/notes`, {
      notes: [{ note }],
    });
  }

  async flagNoShow(customerId: string, appointmentId: string): Promise<void> {
    const entry = `No-show: appointment ${appointmentId} on ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    await this.addNote(customerId, entry);
  }

  // ── META ──────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", `/v1/businesses/${this.preferredBusinessId}`);
      return true;
    } catch {
      return false;
    }
  }

  getCRMType(): string {
    return "moego";
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private mapCustomer(c: MoeGoCustomer): CRMCustomer {
    return {
      id: c.id,
      name: [c.firstName, c.lastName]
        .map((s) => s?.trim())
        .filter((s) => s && s !== ".")
        .join(" ") || "Unknown",
      phone: c.phone || "",
      email: c.email,
      visitCount: 0,
      noShowCount: 0,
      vip: false,
      createdAt: c.createdTime || new Date().toISOString(),
    };
  }
}
