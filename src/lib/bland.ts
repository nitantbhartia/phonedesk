/**
 * Bland inbound (BYOT Twilio) client.
 */
import { prisma } from "@/lib/prisma";
import {
  BANNED_VOICE_COPY,
  buildPricingLine,
  phoneBookableServices,
} from "@/lib/bookable";
import { normalizePhoneNumber } from "@/lib/phone";
import type { Business, Service } from "@prisma/client";

const BLAND_API_BASE = "https://api.bland.ai";

type BlandJson = Record<string, unknown> | null;

type BlandFetchResult = {
  ok: boolean;
  status: number;
  json: BlandJson;
  text: string;
};

export type BlandShop = Business & {
  services: Service[];
  phoneNumber: { number: string } | null;
};

type BusinessHoursMap = Record<string, { open: string; close: string }>;

let memoryEncryptedKey: string | undefined;
let loggedEncryptedKeyHint = false;

export function blandEnabled() {
  return Boolean(process.env.BLAND_API_KEY?.trim());
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://ringpaw.com"
  ).replace(/\/+$/, "");
}

function getBlandApiKey() {
  const key = process.env.BLAND_API_KEY?.trim();
  if (!key) throw new Error("BLAND_API_KEY is not set");
  return key;
}

export async function blandFetch(
  path: string,
  options: { method?: string; body?: unknown; encryptedKey?: string } = {}
): Promise<BlandFetchResult> {
  const headers: Record<string, string> = {
    authorization: getBlandApiKey(),
    "Content-Type": "application/json",
  };
  if (options.encryptedKey) headers.encrypted_key = options.encryptedKey;
  const url = path.startsWith("http")
    ? path
    : `${BLAND_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: BlandJson = null;
  if (text) {
    try { json = JSON.parse(text) as BlandJson; }
    catch { json = { raw: text }; }
  }
  return { ok: response.ok, status: response.status, json, text };
}

export async function getEncryptedTwilioKey(): Promise<string> {
  const fromEnv = process.env.BLAND_ENCRYPTED_TWILIO_KEY?.trim();
  if (fromEnv) return fromEnv;
  if (memoryEncryptedKey) return memoryEncryptedKey;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required to create a Bland encrypted Twilio key");
  }
  const result = await blandFetch("/v1/accounts", {
    method: "POST",
    body: { account_sid: accountSid, auth_token: authToken },
  });
  const key = result.json && typeof result.json.encrypted_key === "string" ? result.json.encrypted_key : "";
  if (!result.ok || !key) {
    throw new Error(`Bland encrypted key create failed (${result.status}): ${result.text.slice(0, 400)}`);
  }
  memoryEncryptedKey = key;
  if (!loggedEncryptedKeyHint) {
    loggedEncryptedKeyHint = true;
    console.info("[bland] Created a Bland encrypted Twilio key. Save it as BLAND_ENCRYPTED_TWILIO_KEY to skip recreating it.");
  }
  return memoryEncryptedKey;
}

function blandMessage(result: BlandFetchResult) {
  if (result.json && typeof result.json.message === "string") return result.json.message;
  return result.text;
}

function alreadyInserted(result: BlandFetchResult, e164: string) {
  const message = blandMessage(result).toLowerCase();
  if (message.includes("already") || message.includes("already inserted") || message.includes("already in")) return true;
  const inserted = result.json?.inserted;
  if (Array.isArray(inserted) && inserted.includes(e164)) return true;
  return result.json?.status === "success";
}

export async function importTwilioNumber(e164: string) {
  const encryptedKey = await getEncryptedTwilioKey();
  let result = await blandFetch("/v1/inbound", {
    method: "POST",
    encryptedKey,
    body: { numbers: [e164] },
  });
  if (result.status === 400) {
    console.warn("[bland] inbound-insert with numbers returned 400; retrying with phone_numbers");
    result = await blandFetch("/v1/inbound", {
      method: "POST",
      encryptedKey,
      body: { phone_numbers: [e164] },
    });
  }
  if (alreadyInserted(result, e164)) {
    return { ok: true as const, alreadyInserted: !result.ok || result.status === 409 };
  }
  if (!result.ok) {
    throw new Error(`Bland inbound insert failed (${result.status}): ${blandMessage(result).slice(0, 400)}`);
  }
  return { ok: true as const, alreadyInserted: false };
}

function safeVoiceCopy(text: string, fallback: string) {
  return BANNED_VOICE_COPY.test(text) ? fallback : text;
}

function hoursAndPricesLine(shop: BlandShop) {
  try {
    return buildPricingLine(shop.services, shop.businessHours as BusinessHoursMap | null);
  } catch (error) {
    console.error("[bland] buildPricingLine failed:", error);
    return "Hours vary — call back for details.";
  }
}

function buildInboundPrompt(shop: BlandShop) {
  const shopName = shop.name || "the shop";
  const hours = hoursAndPricesLine(shop);
  const prompt = [
    `You answer the phone for ${shopName}. Greet briefly, then help the caller book.`,
    `Use GetOpenings before offering times. Offer the next two real openings, spoken naturally (for example "Tue 2pm"). If they pick one, collect their name if you do not have it, then BookAppointment.`,
    `After a successful book, tell them we will text confirmation. If BookAppointment returns requested=true, say the shop will confirm by text.`,
  ].join(" ");
  const rest = [`If they want a person, transfer. If they want hours or prices, say: ${hours}`, "Never invent times. If GetOpenings returns none, offer to transfer or take a callback message."].join(" ");
  const full = `${prompt} ${rest}`;
  const trimmed = full.length > 2000 ? full.slice(0, 1990) : full;
  return safeVoiceCopy(trimmed, `You answer the phone for ${shopName}. Help the caller book. Use GetOpenings before offering times. Never invent times.`);
}

function buildInboundTools(appUrl: string, toolSecret: string) {
  const headers = {
    "x-call-slot-tool-secret": toolSecret,
    "Content-Type": "application/json",
  };
  return [
    {
      name: "GetOpenings",
      description: "Looks up the next real openings for the shop. Call this before offering any times.",
      url: `${appUrl}/api/bland/openings`,
      method: "POST",
      headers,
      body: { to: "{{to}}", from: "{{from}}", call_id: "{{call_id}}", service: "{{input.service}}", limit: "{{input.limit}}" },
      input_schema: {
        example: { speech: "Let me check the next openings.", service: "full groom", limit: 2 },
        type: "object",
        properties: { speech: "string", service: "optional service name", limit: "optional number of openings, default 2" },
      },
      response: { ok: "$.ok", slots: "$.slots", error: "$.error" },
    },
    {
      name: "BookAppointment",
      description: "Books or requests the chosen opening. Use only after the caller picks a real time from GetOpenings.",
      url: `${appUrl}/api/bland/book`,
      method: "POST",
      headers,
      body: { to: "{{to}}", from: "{{from}}", call_id: "{{call_id}}", start: "{{input.start}}", date: "{{input.date}}", time: "{{input.time}}", service: "{{input.service}}", customer_name: "{{input.customer_name}}", pet_name: "{{input.pet_name}}" },
      input_schema: {
        example: { speech: "One second while I book that.", start: "2026-08-26T14:00:00", date: "2026-08-26", time: "2:00 PM", service: "full groom", customer_name: "Alex", pet_name: "Luna" },
        type: "object",
        properties: { speech: "string", start: "ISO start time from GetOpenings when available", date: "YYYY-MM-DD if start is not available", time: "h:mm AM/PM or HH:MM if start is not available", service: "service name", customer_name: "caller name", pet_name: "optional pet name" },
      },
      response: { ok: "$.ok", booked: "$.booked", requested: "$.requested", spoken: "$.spoken", serviceName: "$.serviceName", error: "$.error" },
    },
  ];
}

export async function configureInboundAgent(options: { phone: string; shop: BlandShop }) {
  const { phone, shop } = options;
  const encryptedKey = await getEncryptedTwilioKey();
  const appUrl = getAppUrl();
  const toolSecret = process.env.BLAND_TOOL_SECRET?.trim() || "";
  const shopName = shop.name || "the shop";
  const firstSentence = safeVoiceCopy(`${shopName}. How can I help you book?`, "Thanks for calling. How can I help you book?");
  const ownerE164 = normalizePhoneNumber(shop.phone);
  const body: Record<string, unknown> = {
    model: "base",
    interruption_threshold: 100,
    first_sentence: firstSentence,
    prompt: buildInboundPrompt(shop),
    timezone: shop.timezone || "America/Los_Angeles",
    record: true,
    max_duration: 12,
    webhook: `${appUrl}/api/bland/webhook`,
    language: "en-US",
    voice: "maya",
  };
  if (ownerE164) body.transfer_list = { default: ownerE164 };
  if (toolSecret) {
    body.tools = buildInboundTools(appUrl, toolSecret);
  } else {
    console.error("[bland] BLAND_TOOL_SECRET is not set; inbound agent will have no booking tools until it is configured");
  }
  const encodedPhone = encodeURIComponent(phone);
  // Bland's inbound update endpoint is the number resource itself. The
  // `/update` suffix returns a 404 and leaves the imported number unconfigured.
  const result = await blandFetch(`/v1/inbound/${encodedPhone}`, {
    method: "POST",
    encryptedKey,
    body,
  });
  if (!result.ok || result.json?.status === "error") {
    throw new Error(`Bland inbound update failed (${result.status}): ${blandMessage(result).slice(0, 400)}`);
  }
  return result.json;
}

async function loadShop(businessId: string): Promise<BlandShop | null> {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      phoneNumber: true,
    },
  });
}

/** Import a Twilio DID into Bland and configure the inbound booking agent. Never throws — provision must still succeed if Bland fails. */
export async function attachBlandInbound(
  phoneE164: string,
  businessId: string
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  if (!blandEnabled()) {
    return { ok: false, skipped: true, reason: "BLAND_API_KEY missing" };
  }
  const normalized = normalizePhoneNumber(phoneE164) || phoneE164;
  if (!/^\+\d{10,15}$/.test(normalized)) {
    const reason = `invalid phone ${phoneE164}`;
    console.error("[bland] attach skipped:", reason);
    return { ok: false, reason };
  }
  try {
    const shop = await loadShop(businessId);
    if (!shop) {
      const reason = `business ${businessId} not found`;
      console.error("[bland] attach skipped:", reason);
      return { ok: false, reason };
    }
    void phoneBookableServices(shop.services);
    await importTwilioNumber(normalized);
    await configureInboundAgent({ phone: normalized, shop });
    console.info("[bland] inbound attached for", normalized, "business", businessId);
    return { ok: true };
  } catch (error) {
    console.error("[bland] attachBlandInbound failed (Twilio number is still assigned):", error);
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
