import { describe, expect, it, vi } from "vitest";
import { extractWebsiteDraftFromPages, importWebsiteDraft } from "./website-import";

describe("extractWebsiteDraftFromPages", () => {
  it("pulls structured business details and service pricing from website pages", () => {
    const draft = extractWebsiteDraftFromPages("https://bellaspawspa.com", [
      {
        url: "https://bellaspawspa.com/",
        html: `
          <html>
            <head>
              <title>Bella's Paw Spa | Grooming in San Diego</title>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "LocalBusiness",
                  "name": "Bella's Paw Spa",
                  "telephone": "+1 (619) 555-0100",
                  "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "123 Main St",
                    "addressLocality": "San Diego",
                    "addressRegion": "CA"
                  },
                  "openingHoursSpecification": [
                    {
                      "@type": "OpeningHoursSpecification",
                      "dayOfWeek": [
                        "https://schema.org/Monday",
                        "https://schema.org/Tuesday",
                        "https://schema.org/Wednesday",
                        "https://schema.org/Thursday",
                        "https://schema.org/Friday"
                      ],
                      "opens": "09:00",
                      "closes": "17:00"
                    },
                    {
                      "@type": "OpeningHoursSpecification",
                      "dayOfWeek": "https://schema.org/Saturday",
                      "opens": "10:00",
                      "closes": "14:00"
                    }
                  ]
                }
              </script>
            </head>
            <body>
              <h1>Bella's Paw Spa</h1>
              <a href="/services">Services</a>
            </body>
          </html>
        `,
      },
      {
        url: "https://bellaspawspa.com/services",
        html: `
          <html>
            <body>
              <h2>Services</h2>
              <p>Full Groom $85 90 min</p>
              <p>Bath & Brush $55 60 min</p>
              <p>Nail Trim $20 15 min</p>
            </body>
          </html>
        `,
      },
    ]);

    expect(draft.businessName).toBe("Bella's Paw Spa");
    expect(draft.phone).toBe("619-555-0100");
    expect(draft.address).toBe("123 Main St");
    expect(draft.city).toBe("San Diego");
    expect(draft.state).toBe("CA");
    expect(draft.timezone).toBe("America/Los_Angeles");
    expect(draft.hours?.["Mon - Fri"]).toEqual({
      open: "9:00 AM",
      close: "5:00 PM",
      enabled: true,
    });
    expect(draft.hours?.Saturday).toEqual({
      open: "10:00 AM",
      close: "2:00 PM",
      enabled: true,
    });
    expect(draft.services).toEqual([
      { name: "Full Groom", price: "85", duration: "90" },
      { name: "Bath & Brush", price: "55", duration: "60" },
      { name: "Nail Trim", price: "20", duration: "15" },
    ]);
  });

  it("falls back to visible text when structured data is missing", () => {
    const draft = extractWebsiteDraftFromPages("https://freshpuppy.com", [
      {
        url: "https://freshpuppy.com/",
        html: `
          <html>
            <head>
              <title>Fresh Puppy Grooming</title>
            </head>
            <body>
              <h1>Fresh Puppy Grooming</h1>
              <p>Call us at (415) 555-0199</p>
              <p>456 Market St, San Francisco, CA 94105</p>
              <p>Mon - Fri: 8:00 AM - 6:00 PM</p>
              <p>Saturday: 9:00 AM - 3:00 PM</p>
              <p>Sunday: Closed</p>
              <p>Puppy Intro Bath $40 45 min</p>
            </body>
          </html>
        `,
      },
    ]);

    expect(draft.businessName).toBe("Fresh Puppy Grooming");
    expect(draft.phone).toBe("415-555-0199");
    expect(draft.city).toBe("San Francisco");
    expect(draft.state).toBe("CA");
    expect(draft.hours?.["Mon - Fri"].enabled).toBe(true);
    expect(draft.hours?.Sunday.enabled).toBe(false);
    expect(draft.services).toEqual([
      { name: "Puppy Intro Bath", price: "40", duration: "45" },
    ]);
  });

  it("parses openingHours strings, deduplicates services, and ignores blacklisted lines", () => {
    const draft = extractWebsiteDraftFromPages("https://tidytails.com", [
      {
        url: "https://tidytails.com/",
        html: `
          <html>
            <head>
              <title>Tidy Tails Grooming | Pet Spa</title>
              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "LocalBusiness",
                  "name": "Tidy Tails Grooming",
                  "openingHours": [
                    "Mon-Fri 08:00-17:00",
                    "Sat 09:00-13:00"
                  ]
                }
              </script>
            </head>
            <body>
              <p>Call us today</p>
              <p>Bath Package $45 60 min</p>
              <p>Bath Package $45 60 min</p>
              <p>Location & Hours</p>
            </body>
          </html>
        `,
      },
    ]);

    expect(draft.businessName).toBe("Tidy Tails Grooming");
    expect(draft.hours?.["Mon - Fri"]).toEqual({
      open: "8:00 AM",
      close: "5:00 PM",
      enabled: true,
    });
    expect(draft.hours?.Saturday).toEqual({
      open: "9:00 AM",
      close: "1:00 PM",
      enabled: true,
    });
    expect(draft.services).toEqual([
      { name: "Bath Package", price: "45", duration: "60" },
    ]);
  });

  it("imports pages live, follows internal service/contact links, and skips unsupported content types", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          `
            <html>
              <head><title>Pawfect Place</title></head>
              <body>
                <h1>Pawfect Place</h1>
                <a href="/services">Services</a>
                <a href="/contact">Contact</a>
                <a href="https://external.example/services">External</a>
              </body>
            </html>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response("<html><body><p>Full Groom $95 2 hours</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        })
      )
      .mockResolvedValueOnce(
        new Response("not html", {
          status: 200,
          headers: { "content-type": "application/pdf" },
        })
      );

    const draft = await importWebsiteDraft("pawfectplace.com", fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://pawfectplace.com/",
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": expect.stringContaining("RingPaw Website Importer"),
        }),
      })
    );
    expect(draft.sourceUrl).toBe("https://pawfectplace.com/");
    expect(draft.inspectedPages).toEqual([
      "https://pawfectplace.com/",
      "https://pawfectplace.com/services",
    ]);
    expect(draft.services).toEqual([
      { name: "Full Groom", price: "95", duration: "120" },
    ]);
  });

  it("rejects invalid URLs and non-html homepages", async () => {
    await expect(
      importWebsiteDraft("http://")
    ).rejects.toThrow("Invalid URL");

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(
      importWebsiteDraft("https://example.com", fetchImpl as never)
    ).rejects.toThrow("Unsupported content type for https://example.com/");
  });
});
