const WEBSITE_IMPORT_USER_AGENT =
  "RingPaw Website Importer/1.0 (+https://ringpaw.ai)";
const MAX_EXTRA_PAGES = 3;

const SERVICE_BLACKLIST = [
  "call",
  "text",
  "email",
  "location",
  "hours",
  "address",
  "contact",
  "policy",
  "faq",
  "question",
  "parking",
];

const STATE_TIMEZONES: Record<string, string> = {
  AK: "America/Anchorage",
  AL: "America/Chicago",
  AR: "America/Chicago",
  AZ: "America/Phoenix",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  IA: "America/Chicago",
  ID: "America/Denver",
  IL: "America/Chicago",
  IN: "America/New_York",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/New_York",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  MT: "America/Denver",
  NC: "America/New_York",
  ND: "America/Chicago",
  NE: "America/Chicago",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NV: "America/Los_Angeles",
  NY: "America/New_York",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VA: "America/New_York",
  VT: "America/New_York",
  WA: "America/Los_Angeles",
  WI: "America/Chicago",
  WV: "America/New_York",
  WY: "America/Denver",
};

type HoursEntry = {
  open: string;
  close: string;
  enabled: boolean;
};

type DayKey = "Mon - Fri" | "Saturday" | "Sunday";

type StructuredBusinessData = {
  name?: string;
  telephone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  hours?: WebsiteImportHours;
};

export type WebsiteImportHours = Record<DayKey, HoursEntry>;

export type WebsiteImportService = {
  name: string;
  price: string;
  duration: string;
};

export type WebsiteImportPage = {
  url: string;
  html: string;
};

export type WebsiteImportDraft = {
  sourceUrl: string;
  businessName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  timezone?: string;
  hours?: WebsiteImportHours;
  services: WebsiteImportService[];
  importedFields: string[];
  inspectedPages: string[];
};

function createDefaultHours(): WebsiteImportHours {
  return {
    "Mon - Fri": { open: "9:00 AM", close: "5:00 PM", enabled: false },
    Saturday: { open: "10:00 AM", close: "2:00 PM", enabled: false },
    Sunday: { open: "9:00 AM", close: "5:00 PM", enabled: false },
  };
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function stripTags(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function htmlToLines(html: string) {
  return stripTags(html)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 3);
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePhoneForForm(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value.trim();
}

function normalizeState(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : trimmed.slice(0, 2);
}

function inferTimezone(state?: string) {
  return state ? STATE_TIMEZONES[state] : undefined;
}

function parseJsonLikeBlock(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function flattenStructuredNodes(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap((item) => flattenStructuredNodes(item));
  }

  const record = node as Record<string, unknown>;
  const graph = flattenStructuredNodes(record["@graph"]);
  return [record, ...graph];
}

function hasBusinessType(value: unknown) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((item) => {
    if (typeof item !== "string") {
      return false;
    }

    return /LocalBusiness|PetStore|Store|Organization|ProfessionalService/i.test(
      item
    );
  });
}

function schemaDayToKey(value: string) {
  const day = value
    .replace(/^https?:\/\/schema\.org\//i, "")
    .trim()
    .toLowerCase();

  if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(day)) {
    return "weekday" as const;
  }
  if (day === "saturday") {
    return "Saturday" as const;
  }
  if (day === "sunday") {
    return "Sunday" as const;
  }
  return null;
}

function normalizeHourNumber(hours: number, suffix?: "AM" | "PM") {
  if (suffix) {
    let hour = hours % 12;
    if (suffix === "PM") {
      hour += 12;
    }
    if (suffix === "AM" && hours === 12) {
      hour = 0;
    }
    return hour;
  }
  return hours;
}

function minutesToTwelveHour(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${suffix}`;
}

function parseTimeToken(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const timeMatch = cleaned.match(/^(\d{1,2})(?::(\d{2}))?(AM|PM)?$/);
  if (!timeMatch) {
    return null;
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2] ?? "0");
  const suffix = (timeMatch[3] as "AM" | "PM" | undefined) ?? undefined;

  if (hours > 24 || minutes > 59) {
    return null;
  }

  const normalizedHours = suffix ? normalizeHourNumber(hours, suffix) : hours;
  return normalizedHours * 60 + minutes;
}

function applyHoursRange(
  hours: WebsiteImportHours,
  key: DayKey | "weekday",
  open: string,
  close: string
) {
  const openMinutes = parseTimeToken(open);
  const closeMinutes = parseTimeToken(close);

  if (openMinutes === null || closeMinutes === null) {
    return;
  }

  const normalized = {
    open: minutesToTwelveHour(openMinutes),
    close: minutesToTwelveHour(closeMinutes),
    enabled: true,
  };

  if (key === "weekday") {
    hours["Mon - Fri"] = normalized;
    return;
  }

  hours[key] = normalized;
}

function parseStructuredHours(node: Record<string, unknown>) {
  const hours = createDefaultHours();
  let matched = false;

  const specs = node.openingHoursSpecification;
  if (Array.isArray(specs) || (specs && typeof specs === "object")) {
    const entries = Array.isArray(specs) ? specs : [specs];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const days = Array.isArray(record.dayOfWeek)
        ? record.dayOfWeek
        : [record.dayOfWeek];
      const normalizedDays = days
        .filter((day): day is string => typeof day === "string")
        .map((day) => schemaDayToKey(day))
        .filter((day): day is NonNullable<typeof day> => Boolean(day));
      const opens =
        typeof record.opens === "string" ? record.opens : undefined;
      const closes =
        typeof record.closes === "string" ? record.closes : undefined;

      if (!opens || !closes || normalizedDays.length === 0) {
        continue;
      }

      matched = true;
      const uniqueDays = new Set(normalizedDays);
      if (uniqueDays.size === 1 && uniqueDays.has("weekday")) {
        applyHoursRange(hours, "weekday", opens, closes);
        continue;
      }

      for (const day of uniqueDays) {
        applyHoursRange(hours, day, opens, closes);
      }
    }
  }

  if (matched) {
    return hours;
  }

  const openingHours = node.openingHours;
  const rawEntries = Array.isArray(openingHours)
    ? openingHours
    : typeof openingHours === "string"
      ? [openingHours]
      : [];

  let openingMatch = false;
  for (const entry of rawEntries) {
    const match = entry.match(
      /(Mo|Mon)(?:nday)?-(Fr|Fri)(?:day)?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i
    );
    if (match) {
      applyHoursRange(hours, "weekday", match[3], match[4]);
      openingMatch = true;
    }

    const saturdayMatch = entry.match(
      /(Sa|Sat)(?:urday)?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i
    );
    if (saturdayMatch) {
      applyHoursRange(hours, "Saturday", saturdayMatch[2], saturdayMatch[3]);
      openingMatch = true;
    }

    const sundayMatch = entry.match(
      /(Su|Sun)(?:day)?\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i
    );
    if (sundayMatch) {
      applyHoursRange(hours, "Sunday", sundayMatch[2], sundayMatch[3]);
      openingMatch = true;
    }
  }

  return openingMatch ? hours : undefined;
}

function extractStructuredData(html: string): StructuredBusinessData[] {
  const matches = Array.from(
    html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  );

  const results: StructuredBusinessData[] = [];

  for (const match of matches) {
    const blocks = parseJsonLikeBlock(decodeHtml(match[1]));
    for (const block of blocks) {
      const nodes = flattenStructuredNodes(block);
      for (const node of nodes) {
        if (!hasBusinessType(node["@type"])) {
          continue;
        }

        const address =
          node.address && typeof node.address === "object"
            ? (node.address as Record<string, unknown>)
            : null;
        results.push({
          name: typeof node.name === "string" ? node.name.trim() : undefined,
          telephone:
            typeof node.telephone === "string"
              ? node.telephone.trim()
              : undefined,
          streetAddress:
            typeof address?.streetAddress === "string"
              ? address.streetAddress.trim()
              : undefined,
          city:
            typeof address?.addressLocality === "string"
              ? address.addressLocality.trim()
              : undefined,
          state:
            typeof address?.addressRegion === "string"
              ? normalizeState(address.addressRegion)
              : undefined,
          hours: parseStructuredHours(node),
        });
      }
    }
  }

  return results;
}

function extractMetaContent(html: string, name: string) {
  const match = html.match(
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i"
    )
  );
  return match?.[1]?.trim();
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}

function extractBusinessName(pages: WebsiteImportPage[], structured: StructuredBusinessData[]) {
  const structuredName = structured.find((item) => item.name)?.name;
  if (structuredName) {
    return structuredName;
  }

  for (const page of pages) {
    const ogSiteName = extractMetaContent(page.html, "og:site_name");
    if (ogSiteName) {
      return ogSiteName;
    }

    const heading = page.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    if (heading) {
      return stripTags(heading).trim();
    }

    const title = extractTitle(page.html);
    if (title) {
      return title.split(/[|\-]/)[0]?.trim();
    }
  }

  return undefined;
}

function extractPhone(lines: string[], structured: StructuredBusinessData[]) {
  const structuredPhone = structured.find((item) => item.telephone)?.telephone;
  if (structuredPhone) {
    return normalizePhoneForForm(structuredPhone);
  }

  for (const line of lines) {
    const match = line.match(
      /(?:\+?1[\s.-]*)?(?:\(?(\d{3})\)?[\s.-]*)?(\d{3})[\s.-]*(\d{4})/
    );
    if (!match) {
      continue;
    }

    const digits = match[0].replace(/\D/g, "");
    if (digits.length < 10) {
      continue;
    }
    return normalizePhoneForForm(match[0]);
  }

  return undefined;
}

function extractAddress(lines: string[], structured: StructuredBusinessData[]) {
  const structuredEntry = structured.find(
    (item) => item.streetAddress || item.city || item.state
  );
  if (structuredEntry) {
    return {
      address: structuredEntry.streetAddress,
      city: structuredEntry.city,
      state: structuredEntry.state,
    };
  }

  for (const line of lines) {
    const match = line.match(
      /(\d{1,5}\s+[A-Za-z0-9.\-'\s]+?),\s*([A-Za-z.\-\s]+),\s*([A-Z]{2})(?:\s+\d{5})?/i
    );

    if (!match) {
      continue;
    }

    return {
      address: match[1].trim(),
      city: toTitleCase(match[2].trim()),
      state: normalizeState(match[3]),
    };
  }

  return {};
}

function extractHours(lines: string[], structured: StructuredBusinessData[]) {
  const structuredHours = structured.find((item) => item.hours)?.hours;
  if (structuredHours) {
    return structuredHours;
  }

  const hours = createDefaultHours();
  let matched = false;

  const candidates: Array<[DayKey | "weekday", RegExp]> = [
    [
      "weekday",
      /(Mon(?:day)?(?:\s*[-to]+\s*Fri(?:day)?)?|Mon\s*&\s*Fri)[^0-9A-Za-z]*(.+)$/i,
    ],
    ["Saturday", /(Sat(?:urday)?)[^0-9A-Za-z]*(.+)$/i],
    ["Sunday", /(Sun(?:day)?)[^0-9A-Za-z]*(.+)$/i],
  ];

  for (const line of lines) {
    for (const [key, regex] of candidates) {
      const match = line.match(regex);
      if (!match) {
        continue;
      }

      if (/closed/i.test(match[2])) {
        if (key === "weekday") {
          hours["Mon - Fri"].enabled = false;
        } else {
          hours[key].enabled = false;
        }
        matched = true;
        continue;
      }

      const times = match[2].match(
        /(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i
      );
      if (!times) {
        continue;
      }

      applyHoursRange(hours, key, times[1], times[2]);
      matched = true;
    }
  }

  return matched ? hours : undefined;
}

function guessDuration(line: string) {
  const durationMatch = line.match(
    /(\d{1,3})\s*(?:min|mins|minutes|hr|hrs|hour|hours)/i
  );

  if (!durationMatch) {
    return "60";
  }

  const quantity = Number(durationMatch[1]);
  if (/hr|hour/i.test(durationMatch[0])) {
    return String(quantity * 60);
  }

  return String(quantity);
}

function cleanServiceName(value: string) {
  return value
    .replace(/^[\s:|.-]+/, "")
    .replace(/[\s:|.-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeServiceName(value: string) {
  const lowered = value.toLowerCase();
  if (value.length < 3 || value.length > 50) {
    return false;
  }

  if (SERVICE_BLACKLIST.some((term) => lowered.includes(term))) {
    return false;
  }

  return /[a-z]/i.test(value);
}

function extractServices(lines: string[]) {
  const services: WebsiteImportService[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const priceMatch = line.match(/\$ ?(\d{1,4}(?:\.\d{2})?)/);
    if (!priceMatch) {
      continue;
    }

    const nameCandidate = cleanServiceName(
      line.slice(0, priceMatch.index).replace(/\bfrom\b/i, "")
    );
    if (!looksLikeServiceName(nameCandidate)) {
      continue;
    }

    const normalizedName = nameCandidate.toLowerCase();
    if (seen.has(normalizedName)) {
      continue;
    }

    seen.add(normalizedName);
    services.push({
      name: toTitleCase(nameCandidate),
      price: priceMatch[1],
      duration: guessDuration(line),
    });

    if (services.length >= 8) {
      break;
    }
  }

  return services;
}

function sanitizeUrl(input: string) {
  const prefixed =
    /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const parsed = new URL(prefixed);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Please enter a valid website URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

async function fetchPage(url: string, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": WEBSITE_IMPORT_USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Unsupported content type for ${url}`);
    }

    return {
      url: response.url || url,
      html: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractCandidateUrls(page: WebsiteImportPage) {
  const origin = new URL(page.url).origin;
  const candidates = new Set<string>();
  const defaultPaths = ["/services", "/pricing", "/contact", "/faq"];

  for (const path of defaultPaths) {
    candidates.add(new URL(path, origin).toString());
  }

  const matches = Array.from(
    page.html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)
  );
  for (const match of matches) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
      continue;
    }

    try {
      const resolved = new URL(href, page.url);
      if (resolved.origin !== origin) {
        continue;
      }

      if (!/(service|pricing|contact|faq|about|groom)/i.test(resolved.pathname)) {
        continue;
      }

      resolved.hash = "";
      candidates.add(resolved.toString());
    } catch {
      continue;
    }
  }

  return [...candidates]
    .filter((candidate) => candidate !== page.url)
    .slice(0, MAX_EXTRA_PAGES);
}

async function fetchWebsitePages(sourceUrl: string, fetchImpl: typeof fetch) {
  const homepage = await fetchPage(sourceUrl, fetchImpl);
  const extraUrls = extractCandidateUrls(homepage);

  const extraPages = await Promise.allSettled(
    extraUrls.map((url) => fetchPage(url, fetchImpl))
  );

  return [
    homepage,
    ...extraPages
      .filter(
        (result): result is PromiseFulfilledResult<WebsiteImportPage> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value),
  ];
}

export function extractWebsiteDraftFromPages(
  sourceUrl: string,
  pages: WebsiteImportPage[]
): WebsiteImportDraft {
  const structured = pages.flatMap((page) => extractStructuredData(page.html));
  const lines = pages.flatMap((page) => htmlToLines(page.html));

  const businessName = extractBusinessName(pages, structured);
  const phone = extractPhone(lines, structured);
  const addressParts = extractAddress(lines, structured);
  const state = normalizeState(addressParts.state);
  const hours = extractHours(lines, structured);
  const services = extractServices(lines);

  const draft: WebsiteImportDraft = {
    sourceUrl,
    businessName,
    phone,
    address: addressParts.address,
    city: addressParts.city,
    state,
    timezone: inferTimezone(state),
    hours,
    services,
    importedFields: [],
    inspectedPages: pages.map((page) => page.url),
  };

  if (draft.businessName) draft.importedFields.push("businessName");
  if (draft.phone) draft.importedFields.push("phone");
  if (draft.address) draft.importedFields.push("address");
  if (draft.city) draft.importedFields.push("city");
  if (draft.state) draft.importedFields.push("state");
  if (draft.timezone) draft.importedFields.push("timezone");
  if (draft.hours && Object.values(draft.hours).some((entry) => entry.enabled)) {
    draft.importedFields.push("hours");
  }
  if (draft.services.length > 0) draft.importedFields.push("services");

  return draft;
}

export async function importWebsiteDraft(
  url: string,
  fetchImpl: typeof fetch = fetch
) {
  const sourceUrl = sanitizeUrl(url);
  const pages = await fetchWebsitePages(sourceUrl, fetchImpl);
  return extractWebsiteDraftFromPages(sourceUrl, pages);
}
