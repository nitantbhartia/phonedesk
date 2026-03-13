import { beforeEach, describe, expect, it, vi } from "vitest";
import { SquareAdapter } from "./SquareAdapter";

describe("SquareAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("falls back to searching without the plus prefix", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("bad search", { status: 400, statusText: "Bad Request" })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            customers: [
              {
                id: "cust_1",
                given_name: "Jamie",
                family_name: "Rivera",
                phone_number: "16195550100",
                email_address: "jamie@example.com",
                created_at: "2026-03-10T10:00:00.000Z",
              },
            ],
          }),
          { status: 200 }
        )
      );

    const adapter = new SquareAdapter("token", "loc_1");
    const customer = await adapter.getCustomer("+16195550100");

    expect(customer).toEqual({
      id: "cust_1",
      name: "Jamie Rivera",
      phone: "16195550100",
      email: "jamie@example.com",
      visitCount: 0,
      noShowCount: 0,
      vip: false,
      createdAt: "2026-03-10T10:00:00.000Z",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://connect.squareup.com/v2/customers/search",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: { filter: { phone_number: { exact: "16195550100" } } },
        }),
      })
    );
  });

  it("maps appointment services from the Square catalog", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          objects: [
            {
              id: "item_1",
              type: "ITEM",
              item_data: {
                name: "Full Groom",
                product_type: "APPOINTMENTS_SERVICE",
                variations: [
                  {
                    id: "var_1",
                    item_variation_data: {
                      price_money: { amount: 8500 },
                      service_duration: 5400000,
                    },
                  },
                ],
              },
            },
            {
              id: "item_ignored",
              type: "ITEM",
              item_data: {
                name: "Retail Toy",
                product_type: "REGULAR",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const adapter = new SquareAdapter("token", "loc_1");
    await expect(adapter.getServices()).resolves.toEqual([
      {
        id: "var_1",
        name: "Full Groom",
        priceCents: 8500,
        durationMinutes: 90,
        active: true,
      },
    ]);
  });

  it("creates customers with split first and last names", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          customer: {
            id: "cust_2",
            given_name: "Jamie",
            family_name: "Rivera",
            phone_number: "+16195550100",
            email_address: "jamie@example.com",
            created_at: "2026-03-10T10:00:00.000Z",
          },
        }),
        { status: 200 }
      )
    );

    const adapter = new SquareAdapter("token", "loc_1");
    const customer = await adapter.createCustomer({
      name: "Jamie Rivera",
      phone: "+16195550100",
      email: "jamie@example.com",
    });

    expect(customer.name).toBe("Jamie Rivera");
    expect(fetch).toHaveBeenCalledWith(
      "https://connect.squareup.com/v2/customers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          given_name: "Jamie",
          family_name: "Rivera",
          phone_number: "+16195550100",
          email_address: "jamie@example.com",
        }),
      })
    );
  });

  it("appends no-show notes to the existing customer note", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T08:00:00.000Z"));

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ customer: { note: "VIP client" } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    const adapter = new SquareAdapter("token", "loc_1");
    await adapter.flagNoShow("cust_1", "appt_7");

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://connect.squareup.com/v2/customers/cust_1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          note: "VIP client\nNo-show: appt_7 (3/12/2026)",
        }),
      })
    );

    vi.useRealTimers();
  });

  it("reports health based on the locations endpoint", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response("oops", { status: 500 }));

    const adapter = new SquareAdapter("token", "loc_1");

    await expect(adapter.healthCheck()).resolves.toBe(true);
    await expect(adapter.healthCheck()).resolves.toBe(false);
    expect(adapter.getCRMType()).toBe("square");
  });
});
