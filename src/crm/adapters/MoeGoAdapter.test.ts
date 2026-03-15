import { beforeEach, describe, expect, it, vi } from "vitest";
import { MoeGoAdapter } from "./MoeGoAdapter";

// Intercept global fetch so tests don't hit the real MoeGo API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function okResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function errorResponse(status: number, text = "Error") {
  return Promise.resolve(new Response(text, { status }));
}

const API_KEY = "test-api-key";
const COMPANY_ID = "cmp_001";
const BUSINESS_ID = "biz_001";
const BASE_URL = "https://openapi.moego.pet";

describe("MoeGoAdapter", () => {
  let adapter: MoeGoAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new MoeGoAdapter(API_KEY, COMPANY_ID, BUSINESS_ID);
  });

  // ── Auth header ────────────────────────────────────────────────────────────

  it("sends the API key as a Base64-encoded Authorization header", async () => {
    mockFetch.mockResolvedValue(okResponse({ customers: [] }));
    await adapter.getCustomer("+12125551234").catch(() => {});

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const authHeader = (init.headers as Record<string, string>)["Authorization"];
    expect(authHeader).toBe(Buffer.from(API_KEY).toString("base64"));
  });

  // ── getCustomer ────────────────────────────────────────────────────────────

  it("returns null when no customers match the phone number", async () => {
    mockFetch.mockResolvedValue(okResponse({ customers: [] }));
    const result = await adapter.getCustomer("+12125551234");
    expect(result).toBeNull();
  });

  it("returns a mapped CRMCustomer when a match is found", async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        customers: [
          {
            id: "cust_abc",
            firstName: "Sarah",
            lastName: "Johnson",
            phone: "+12125551234",
            createdTime: "2026-01-01T00:00:00Z",
          },
        ],
      })
    );

    const result = await adapter.getCustomer("+12125551234");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("cust_abc");
    expect(result!.name).toBe("Sarah Johnson");
    expect(result!.phone).toBe("+12125551234");
  });

  it("searches via POST /v1/customers:list with the correct body", async () => {
    mockFetch.mockResolvedValue(okResponse({ customers: [] }));
    await adapter.getCustomer("+12125551234");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/customers:list`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.companyId).toBe(COMPANY_ID);
    expect(body.filter.mainPhoneNumber).toBe("+12125551234");
    expect(body.pagination.pageSize).toBe(1);
  });

  // ── createCustomer ─────────────────────────────────────────────────────────

  it("creates a customer and returns a mapped CRMCustomer", async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        id: "cust_new",
        firstName: "Luna",
        lastName: ".",
        phone: "+13105550199",
        createdTime: "2026-03-14T10:00:00Z",
      })
    );

    const result = await adapter.createCustomer({
      name: "Luna",
      phone: "+13105550199",
    });

    expect(result.id).toBe("cust_new");
    // "." placeholder lastName should be stripped from the display name
    expect(result.name).toBe("Luna");
  });

  it("splits a full name into firstName and lastName", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ id: "c", firstName: "John", lastName: "Doe", phone: "+1" })
    );

    await adapter.createCustomer({ name: "John Doe", phone: "+1" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.firstName).toBe("John");
    expect(body.lastName).toBe("Doe");
  });

  it("uses '.' as lastName placeholder when only one name is provided", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ id: "c", firstName: "Buddy", lastName: ".", phone: "+1" })
    );

    await adapter.createCustomer({ name: "Buddy", phone: "+1" });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.firstName).toBe("Buddy");
    expect(body.lastName).toBe(".");
  });

  it("posts to /v1/customers with companyId and preferredBusinessId", async () => {
    mockFetch.mockResolvedValue(
      okResponse({ id: "c", firstName: "A", lastName: "B", phone: "+1" })
    );

    await adapter.createCustomer({ name: "A B", phone: "+1" });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/customers`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.companyId).toBe(COMPANY_ID);
    expect(body.preferredBusinessId).toBe(BUSINESS_ID);
    expect(body.phone).toBe("+1");
  });

  it("throws on a 4xx API error so callers can handle non-blocking failures", async () => {
    mockFetch.mockResolvedValue(errorResponse(400, "Bad Request"));
    await expect(
      adapter.createCustomer({ name: "Test", phone: "+1" })
    ).rejects.toThrow("MoeGo API error 400");
  });

  // ── addNote ────────────────────────────────────────────────────────────────

  it("posts a note to /v1/customers/{id}/notes", async () => {
    mockFetch.mockResolvedValue(okResponse({}));

    await adapter.addNote("cust_abc", "Golden retriever — full groom completed.");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v1/customers/cust_abc/notes`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].note).toBe("Golden retriever — full groom completed.");
  });

  // ── flagNoShow ─────────────────────────────────────────────────────────────

  it("flags a no-show by appending a dated note to the customer record", async () => {
    mockFetch.mockResolvedValue(okResponse({}));

    await adapter.flagNoShow("cust_abc", "appt_xyz");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cust_abc/notes");
    const body = JSON.parse(init.body as string);
    expect(body.notes[0].note).toContain("No-show");
    expect(body.notes[0].note).toContain("appt_xyz");
  });

  // ── healthCheck ────────────────────────────────────────────────────────────

  it("returns true when the business endpoint responds with 200", async () => {
    mockFetch.mockResolvedValue(okResponse({ id: BUSINESS_ID }));
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  it("returns false when the API call throws", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(false);
  });

  // ── getCRMType ─────────────────────────────────────────────────────────────

  it("identifies itself as moego", () => {
    expect(adapter.getCRMType()).toBe("moego");
  });

  // ── stubs return safely without network calls ──────────────────────────────

  it("getPets returns an empty array without hitting the API", async () => {
    const pets = await adapter.getPets("cust_abc");
    expect(pets).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getServices returns an empty array without hitting the API", async () => {
    const services = await adapter.getServices();
    expect(services).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("getAvailability returns an empty array without hitting the API", async () => {
    const slots = await adapter.getAvailability("2026-03-14", "svc_1");
    expect(slots).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("createAppointment throws — appointments use calendar.ts", async () => {
    await expect(
      adapter.createAppointment({
        customerId: "c",
        serviceId: "s",
        startTime: "2026-03-14T10:00:00Z",
        petName: "Luna",
        petBreed: "Poodle",
        petSize: "SMALL",
      })
    ).rejects.toThrow("createAppointment");
  });
});
