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

export class SquareAdapter implements GroomingCRM {
  private readonly squareVersion = "2024-10-17";

  constructor(
    private readonly accessToken: string,
    private readonly locationId: string,
    private readonly baseUrl: string = "https://connect.squareup.com"
  ) {}

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": this.squareVersion,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Square API error ${res.status} ${path}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  async getCustomer(phone: string): Promise<CRMCustomer | null> {
    // Square expects phone without + prefix in search
    const cleanPhone = phone.replace(/^\+/, "");
    const data = await this.request<{
      customers?: Array<{
        id: string;
        given_name?: string;
        family_name?: string;
        phone_number?: string;
        email_address?: string;
        created_at: string;
      }>;
    }>("POST", "/v2/customers/search", {
      query: {
        filter: {
          phone_number: { exact: phone },
        },
      },
    }).catch(async () => {
      // Try without + prefix as fallback
      return this.request<{ customers?: Array<{
        id: string;
        given_name?: string;
        family_name?: string;
        phone_number?: string;
        email_address?: string;
        created_at: string;
      }> }>("POST", "/v2/customers/search", {
        query: { filter: { phone_number: { exact: cleanPhone } } },
      });
    });

    const customer = data.customers?.[0];
    if (!customer) return null;

    return {
      id: customer.id,
      name: [customer.given_name, customer.family_name].filter(Boolean).join(" ") || "Unknown",
      phone: customer.phone_number || phone,
      email: customer.email_address,
      visitCount: 0,   // not tracked in Square by default
      noShowCount: 0,
      vip: false,
      createdAt: customer.created_at,
    };
  }

  async getPets(_customerId: string): Promise<CRMPet[]> {
    // Square does not have a native pets concept — return empty
    return [];
  }

  async getServices(): Promise<CRMService[]> {
    const data = await this.request<{
      objects?: Array<{
        id: string;
        type: string;
        item_data?: {
          name?: string;
          product_type?: string;
          variations?: Array<{
            id: string;
            item_variation_data?: {
              name?: string;
              price_money?: { amount?: number; currency?: string };
              service_duration?: number;  // milliseconds
            };
          }>;
        };
      }>;
    }>("GET", "/v2/catalog/list?types=ITEM");

    const items = (data.objects || []).filter(
      (obj) =>
        obj.type === "ITEM" &&
        obj.item_data?.product_type === "APPOINTMENTS_SERVICE"
    );

    return items.map((item) => {
      const variation = item.item_data?.variations?.[0];
      const variationData = variation?.item_variation_data;
      const priceCents = variationData?.price_money?.amount ?? 0;
      const durationMs = variationData?.service_duration ?? 3600000; // default 60 min

      return {
        id: variation?.id || item.id,
        name: item.item_data?.name || "Unknown Service",
        priceCents: typeof priceCents === "number" ? priceCents : 0,
        durationMinutes: Math.round(durationMs / 60000),
        active: true,
      };
    });
  }

  async getAvailability(_date: string, _serviceId: string): Promise<CRMSlot[]> {
    // Delegated to existing calendar.ts — not re-implemented here
    return [];
  }

  async createCustomer(data: NewCRMCustomer): Promise<CRMCustomer> {
    const nameParts = data.name.trim().split(/\s+/);
    const givenName = nameParts[0] || data.name;
    const familyName = nameParts.slice(1).join(" ") || undefined;

    const res = await this.request<{
      customer: {
        id: string;
        given_name?: string;
        family_name?: string;
        phone_number?: string;
        email_address?: string;
        created_at: string;
      };
    }>("POST", "/v2/customers", {
      given_name: givenName,
      ...(familyName ? { family_name: familyName } : {}),
      phone_number: data.phone,
      ...(data.email ? { email_address: data.email } : {}),
    });

    const c = res.customer;
    return {
      id: c.id,
      name: [c.given_name, c.family_name].filter(Boolean).join(" ") || data.name,
      phone: c.phone_number || data.phone,
      email: c.email_address,
      visitCount: 0,
      noShowCount: 0,
      vip: false,
      createdAt: c.created_at,
    };
  }

  async createAppointment(_data: CRMAppointmentData): Promise<CRMBooking> {
    // Delegated to existing calendar.ts bookAppointment — not re-implemented
    throw new Error("createAppointment: use existing calendar.ts bookAppointment");
  }

  async addNote(customerId: string, note: string): Promise<void> {
    await this.request("PUT", `/v2/customers/${customerId}`, {
      note,
    });
  }

  async flagNoShow(customerId: string, appointmentId: string): Promise<void> {
    // Fetch current note, append no-show entry
    const data = await this.request<{
      customer?: { note?: string };
    }>("GET", `/v2/customers/${customerId}`).catch(() => ({ customer: {} }));

    const currentNote = data.customer?.note || "";
    const noShowEntry = `No-show: ${appointmentId} (${new Date().toLocaleDateString()})`;
    const updatedNote = currentNote
      ? `${currentNote}\n${noShowEntry}`
      : noShowEntry;

    await this.request("PUT", `/v2/customers/${customerId}`, {
      note: updatedNote,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/v2/locations");
      return true;
    } catch {
      return false;
    }
  }

  getCRMType(): string {
    return "square";
  }
}
