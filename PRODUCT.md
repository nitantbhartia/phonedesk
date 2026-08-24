# Bookable — voicemail that books

Working name: **Bookable**. Former product: RingPaw. Validation MVP (v0.1) for independent pet groomers.

Callers who hit a shop number (or a no-answer / busy / after-hours forward) hear a short shop-branded voicemail. They book with the keypad. This is not a conversational receptionist.

Copy never says AI, virtual receptionist, or assistant. Shop name first. It should feel like voicemail.

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

The older Retell conversational agent remains in the repo behind `inboundPath = RETELL_AGENT`. It is not the default inbound path and is not on the Bookable critical path.

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

Home shows: calls, booking attempts, booked, estimated revenue, callbacks, and recent activity. No receptionist pitch.

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
