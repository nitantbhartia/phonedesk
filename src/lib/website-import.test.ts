import { describe, expect, it } from "vitest";
import { extractWebsiteDraftFromPages } from "./website-import";

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
});
