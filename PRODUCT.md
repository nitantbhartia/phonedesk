# Call Slot — voicemail that books

Display name: **Call Slot**. Short / product id: **callslot**. Former names: Bookable, RingPaw. Validation MVP (v0.1).

Callers who hit a shop number (or a no-answer / busy / after-hours forward) hear a short shop-branded voicemail. They book with the keypad. This is not a conversational receptionist.

Copy never says AI, virtual receptionist, or assistant. Shop name first. It should feel like voicemail. In-app tagline: **Your voicemail can book.**

---

## What v0.1 does

Inbound call → Twilio Voice DTMF tree (default inbound path):

1. **Greeting:** `Thanks for calling {Shop}. To book, press 1. To leave a message, press 9.`
2. **Press 1:** service menu first (max 3 phone-bookable services, e.g. Bath / Full Groom / press 9 callback).
3. **Then two real openings** for that service’s duration, shop hours, busy times, and the existing calendar buffers/lead time. `Tue 2pm, press 1. Wed 10am, press 2. More times, press 3.`
4. **Press 3:** two more slots. Max **6 slots per call**, then press 9 for a callback.
5. **On a slot digit:** re-read availability, then write. If that time was taken, offer the next live opening. Never send a confirmation SMS before a successful write.
6. **New / unknown caller:** REQUEST mode — hold the time, text the owner `Y` confirm / `N` decline. Known caller (existing customer record on this shop) can auto-book.
7. **Press 9:** optional recording up to 30 seconds. Owner SMS: `Callback: {number}, called {time}` plus recording URL when present. No generated summary.
8. **After hours:** same tree. Openings are the next times after the shop opens.
9. **Calendar failure or no slots:** do not improvise. Fall to callback notify.

Google Calendar is the v1 must-write path. Square Appointments and Acuity are used only if already connected. There is no new CRM and no native MoeGo/Gingr API.

If Google can only show busy (no reliable event write), operate in request mode. If a required calendar write fails, cancel the hold and notify the owner as a callback.

---

## What v0.1 does not build

Conversational agent, speech recognition, personality, bilingual small talk, SMS-first booking threads, booking links, chat widgets, waitlist / review / lapsing SMS factory, deposits, payments, multi-location, Spanish, breed quoting, a new CRM.

The older Retell conversational agent remains in the repo behind `inboundPath = RETELL_AGENT`. It is not the default inbound path and is not on the Call Slot critical path.

---

## Stack (existing)

- Next.js 15 App Router, Prisma / PostgreSQL
- Twilio Voice for DTMF (Twilio was already in the repo for SMS)
- Twilio SMS for confirm / request / callback / `C` cancel
- Google Calendar, Square, Acuity via `src/lib/calendar.ts`
- `Business.inboundPath` defaults to `BOOKABLE_VOICEMAIL`

---

## Persistence

Each inbound call writes a `Call` and a `BookableSession`:

`call_id`, shop, caller, service, offered slots, status, `calendar_event_id`, customer/owner SMS status.

Statuses: `IN_PROGRESS` → `BOOKED` | `REQUESTED` | `CALLBACK` | `NO_SLOTS` | `FAILED`.

Duplicate keypad digits after a successful write replay the same result. They do not create a second appointment.

---

## SMS

Only after the appointment (and required calendar event) exists:

| Event | Message |
|---|---|
| Auto-book | `{Shop}: {service}, {time}. Reply C to cancel.` |
| Request | `{Shop}: request for {service}, {time}. We'll confirm shortly.` |
| Owner request | `Request: {number} wants {service}, {time}. Reply Y to confirm, N to decline.` |
| Callback | `Callback: {number}, called {time}` (+ recording URL if recorded) |

No booking link. `C` cancels the caller’s next appointment.

---

## Dashboard

Home shows: calls, booking attempts, booked, estimated revenue, callbacks, recent activity, **calendar health** (read busy + write events), and **booking funnel drop-off** (30-day). No receptionist pitch.

---

## Onboarding (6 steps, ~5 minutes)

1. Shop name (+ account)
2. Connect Google Calendar
3. Hours
4. Up to 3 phone-bookable services (name, duration, optional starting price)
5. Carrier forwarding (no-answer / busy / after-hours codes + iPhone path)
6. `/api/voice/simulate` test + success moment in UI

---

## Voice menu (PRD copy)

- Shop name first. During hours: “We’re helping another customer right now.” After hours: “We’re currently closed.”
- Press **1** book (known callers: usual `{pet}` `{service}` shortcut, or service menu)
- Press **2** hours + starting prices (one line), then booking path
- Press **3** more slot times (in slots state) or another service (known callers at menu)
- Press **0** repeat current menu
- Press **9** callback + optional 30s recording
- Invalid digit: repeat once, then callback
- Prefetch availability when the call starts

---

## Funnel analytics (persisted)

Events: `call_forwarded`, `menu_started`, `menu_digit_pressed`, `booking_selected`, `service_selected`, `pricing_heard`, `slots_requested`, `slots_presented`, `slot_selected`, `booking_started`, `booking_succeeded`, `booking_failed`, `sms_sent`, `callback_selected`, `voicemail_recorded`, `call_abandoned` — each with elapsed ms when available.

---

## Pricing

**$79/mo** — one location, one line. Single live plan (no tiers). Set `STRIPE_PRO_PRICE_ID` in env for Stripe checkout.

---

## Audit fields (`BookableSession`)

`call_id`, `shop_id`, `caller_phone`, `service_id`, `slots_offered`, `slot_selected`, `booking_status`, `calendar_event_id`, `sms_customer_status`, `sms_owner_status`.

---

## Brand

Customer-facing copy: **Call Slot** / “Your voicemail can book.” Never AI, virtual receptionist, assistant, or voice agent in landing, dashboard, settings, SMS, or voice prompts. Internal identifiers (`BookableSession`, `BOOKABLE_VOICEMAIL`, `/api/voice/*`) stay as-is. Domain may remain ringpaw.com until callslot.ai is live.

Retell conversational agent stays behind `inboundPath = RETELL_AGENT` (not default owner UX).

---

## Voice endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/voice/inbound` | Twilio Voice webhook. Greeting + gather. |
| POST | `/api/voice/gather?sid=` | Digit handler. |
| POST | `/api/voice/recording?sid=` | 30s callback recording. |
| POST | `/api/voice/simulate` | Walk the tree without a phone. |

---

## Local try path

See the pull request for env, Twilio webhook, Google Calendar, and simulate curl. Short version:

1. Shop account with name, hours, two services + durations, Google Calendar connected.
2. Point a Twilio Voice number at `POST /api/voice/inbound` (or use `/api/voice/simulate`).
3. Forward the shop line unanswered to that number.
4. Press 1 → service → two real times → press 1 → Google event + owner notify + caller SMS (no link) + dashboard row.
5. Or press 9 → message → owner callback SMS.

---

*Last updated: August 2026*
