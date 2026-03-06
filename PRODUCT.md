# RingPaw AI — Product Documentation

> AI-powered voice receptionist for pet grooming businesses. Answers calls, books appointments, sends SMS, and manages your schedule 24/7 — so you can focus on the dogs.

---

## Table of Contents

1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
3. [Feature Reference](#feature-reference)
   - [Voice AI Receptionist](#1-voice-ai-receptionist)
   - [Smart Booking Engine](#2-smart-booking-engine)
   - [Live Appointment Status](#3-live-appointment-status)
   - [SMS Command System](#4-sms-command-system)
   - [No-Show Protection](#5-no-show-protection)
   - [Waitlist Auto-Fill](#6-waitlist-auto-fill)
   - [New Client Intake Forms](#7-new-client-intake-forms)
   - [Lapsing Client Re-engagement](#8-lapsing-client-re-engagement)
   - [Missed Call Auto-Reply](#9-missed-call-auto-reply)
   - [Dynamic Pricing Matrix](#10-dynamic-pricing-matrix)
   - [Smart Rebooking Engine](#11-smart-rebooking-engine)
   - [Behavioral Risk Logging](#12-behavioral-risk-logging)
   - [Google Review Automation](#13-google-review-automation)
   - [Customer Memory](#14-customer-memory)
   - [Calendar Integration](#15-calendar-integration)
   - [Call Log & Transcript Search](#16-call-log--transcript-search)
   - [Dashboard Analytics](#17-dashboard-analytics)
   - [Agent Personality Configuration](#18-agent-personality-configuration)
   - [Billing & Plan Management](#19-billing--plan-management)
4. [Data Models](#data-models)
5. [API Reference](#api-reference)
6. [Onboarding Flow](#onboarding-flow)

---

## Overview

RingPaw is a vertical SaaS product built specifically for independent pet grooming salons and mobile groomers. The core premise: groomers lose significant revenue every day by missing phone calls while their hands are full. RingPaw's AI answers every call, books the appointment, and handles all follow-up communication automatically.

**Tech Stack**
- Framework: Next.js 15.2 (App Router), React 19, TypeScript
- Database: PostgreSQL + Prisma ORM
- Voice AI: Retell AI (LLM-powered voice agent)
- Auth: NextAuth.js
- SMS: Retell SMS API
- Calendar: Google Calendar API, Square Appointments API, Acuity Scheduling API
- UI: Tailwind CSS, Radix UI primitives

---

## Core Architecture

```
Inbound Call
     │
     ▼
Retell AI Voice Agent
     │
     ├── lookup-customer   → Customer Memory (returning client context)
     ├── check-availability → Calendar Integration (real-time slot check)
     ├── get-quote          → Dynamic Pricing Matrix
     └── book-appointment   → Appointment + Calendar + SMS Notifications
                                    │
                                    ├── Owner SMS notification
                                    ├── Customer SMS confirmation
                                    └── Intake form (new clients only)

Post-call Webhooks
     │
     ├── call_ended   → Transcript saved, NO_BOOKING → missed call auto-reply
     └── call_analyzed → Summary, extracted data, customer memory updated
```

---

## Feature Reference

### 1. Voice AI Receptionist

The centerpiece of RingPaw. A Retell AI voice agent answers every call to the business's provisioned phone number with a customizable greeting.

**What it does:**
- Answers in a configurable voice and personality (warm, professional, playful, etc.)
- Identifies returning customers by phone number and personalizes the conversation
- Collects: customer name, phone, pet name, breed, size, requested service, preferred date/time
- Checks real-time availability against connected calendars
- Quotes pricing based on the dynamic pricing matrix
- Books the appointment directly into the calendar
- Reads back a confirmation and tells the customer to expect a text

**Configuration (Settings → Agent):**
- Voice selection
- Agent greeting message
- Fallback message (when unable to help)
- Personality tone (warm / professional / playful)
- Communication style (concise / detailed)
- Language (English / Spanish / French / etc.)
- Custom system prompt override

**Retell custom tools wired up:**
| Tool | Endpoint | Purpose |
|------|----------|---------|
| `lookup_customer` | `/api/retell/lookup-customer` | Pull returning customer context |
| `check_availability` | `/api/retell/check-availability` | Real-time slot availability |
| `get_quote` | `/api/retell/get-quote` | Price lookup by breed/size/service |
| `book_appointment` | `/api/retell/book-appointment` | Create appointment + send notifications |

---

### 2. Smart Booking Engine

Two booking modes are available, set per business:

**HARD mode (direct booking):**
- Appointment is immediately `CONFIRMED`
- Calendar event created instantly
- Customer receives confirmation SMS

**SOFT mode (tentative hold):**
- Appointment is created as `PENDING` with a 2-hour hold
- Customer receives an SMS with a one-tap confirmation link
- If not confirmed within 2 hours, slot is released
- Owner is notified of soft bookings in real-time

**Appointment lifecycle:**
```
PENDING → CONFIRMED → COMPLETED
        ↘ CANCELLED
        ↘ NO_SHOW
```

**Fields captured per appointment:**
- Customer name, phone
- Pet name, breed, size (SMALL / MEDIUM / LARGE / XLARGE)
- Service name, price
- Start time, end time
- Calendar event ID
- Grooming status (live tracking)
- Confirmation link + timestamp
- Reminder sent flags (24h, 48h)
- Rebooking reminder sent flag
- Review request sent flag
- No-show tracking

---

### 3. Live Appointment Status

**"Is My Dog Ready?" — Today's Page**

Groomers can update a live status for each appointment that day. Customers can text `STATUS` to check in without calling.

**Status progression:**
```
CHECKED_IN → IN_PROGRESS → READY_FOR_PICKUP → PICKED_UP
```

The Today page (`/today`) shows all appointments for the current day with one-tap status update buttons. Each status change can trigger an SMS to the customer (e.g., "Max is ready for pickup!").

---

### 4. SMS Command System

Both customers and the business owner can control RingPaw entirely via SMS.

**Customer commands** (sent to the RingPaw number):

| Command | Action |
|---------|--------|
| `STATUS` | Get live grooming status for their pet |
| `CONFIRM` | Confirm a pending (soft-booked) appointment |
| `CANCEL` | Cancel their upcoming appointment |
| `REBOOK` | Request rebooking |
| `BOOK` | Initiate a new booking request |

**Owner commands** (sent from the owner's personal number to the RingPaw number):

| Command | Action |
|---------|--------|
| `CANCEL [phone]` | Cancel appointment for a customer by phone |
| `CONFIRM [phone]` | Manually confirm a pending appointment |

All SMS interactions are logged in the `SmsLog` table with intent parsing, direction, and timestamps.

---

### 5. No-Show Protection

A multi-layer system to reduce missed appointments and recover revenue.

**Layer 1 — 48-hour reminder:**
- Cron job sends SMS to all unconfirmed customers 48 hours before their appointment
- Message includes one-tap `REPLY CONFIRM` or `CANCEL` instructions
- `reminder48hSent` flag updated to prevent duplicates

**Layer 2 — 24-hour reminder:**
- Second reminder sent 24 hours before for still-unconfirmed appointments
- `reminderSent` flag tracks this

**Layer 3 — No-response follow-up:**
- If customer hasn't replied to either reminder, a final follow-up is sent
- Owner is notified

**Layer 4 — No-show marking:**
- Dashboard shows all upcoming unconfirmed appointments
- Groomer can mark any appointment as `NO_SHOW` with one click
- `noShowMarkedAt` timestamp recorded

**Repeat offender tracking:**
- Customers with 2+ no-shows are flagged on the No-Show Protection page
- Shown with no-show count, last no-show date, phone number
- Groomer can decide to require deposits or manual calls for these clients

**Dashboard stats (30-day rolling):**
- Total no-shows, no-show rate %
- Confirmed count (via SMS reply)
- Upcoming unconfirmed count
- Estimated revenue saved (confirmed count × avg service price × 15%)

---

### 6. Waitlist Auto-Fill

When an appointment is cancelled, the system automatically checks the waitlist and notifies the first matching customer.

**How it works:**
1. Customer cancels (via SMS `CANCEL` or owner marks cancelled)
2. System searches for waitlist entries matching the same date
3. First-come-first-served: earliest entry is selected
4. Customer receives SMS: `"A spot just opened up at [Business]. Reply BOOK to grab this slot."`
5. Waitlist entry status updated to `NOTIFIED`
6. Owner receives SMS: `"[Name] cancelled. Contacting [Waitlist Name] to fill the opening."`

**Waitlist management (No-Show Protection → Waitlist tab):**
- View all waiting customers
- Manually add customers with: name, phone, pet, service, preferred date/time
- Remove entries
- Entry statuses: `WAITING` → `NOTIFIED` → `BOOKED` / `EXPIRED` / `DECLINED`

---

### 7. New Client Intake Forms

When the AI books a first-time customer, it automatically generates and SMS-links a digital intake form.

**Trigger:** `visitCount === 0` on the customer record at booking time.

**What the form collects:**
- Pet details: name, breed, age, weight, size
- Health: vaccinated status, vet name/phone, known allergies, bite/aggression history
- Emergency contact: name and phone
- Special handling notes

**Technical details:**
- Each form has a unique random `token` for unauthenticated public access
- Form URL: `/intake/[token]`
- No login required for the customer
- Submitted data is stored and linked to the appointment
- SMS sent from the business's RingPaw number immediately after booking

---

### 8. Lapsing Client Re-engagement

Automatically identifies clients who haven't booked within their breed's expected rebooking window.

**How lapsing is determined:**
- Each appointment can have a `rebookInterval` (days) — defaults to the business's `RebookingConfig.defaultInterval` (default: 42 days)
- A client is "lapsing" if: their last completed appointment was more than `rebookInterval` days ago AND they have no future appointment scheduled

**Lapsing Clients tab (No-Show Protection page):**
- Lists all lapsing clients with: name, pet, last visit date, days since visit
- Color-coded urgency: amber (overdue), red (90+ days)
- **"Text All N" blast button**: sends a re-engagement SMS to every lapsing client in one click
- SMS message: `"Hi! It's been a while since [Business] last saw your pup. Ready to book? Reply BOOK and our AI will get you scheduled."`
- Sent count confirmation shown after blast

**Automated rebooking reminders (cron):**
- The `/api/notifications/rebooking` cron endpoint sends breed-specific reminders automatically
- `rebookingReminderSent` flag prevents duplicate messages

---

### 9. Missed Call Auto-Reply

When a call ends without a booking being made, RingPaw automatically reaches out to both parties.

**Owner notification:**
```
[RingPaw] Missed call - no booking made.
Caller: [Name] ([Phone])
They may call back or you can reach out.
```

**Caller auto-reply (new):**
```
Hi [Name]! Sorry we missed your call to [Business Name]. Reply BOOK to schedule an appointment, or call us back anytime. We'd love to help! 🐾
```

This turns every missed/incomplete call into a recovery opportunity — the caller gets an immediate touchpoint rather than silence.

---

### 10. Dynamic Pricing Matrix

A breed × service × size pricing grid that the AI quotes from in real-time.

**Structure:**
- Base price set per service (e.g., Full Groom: $65)
- Override rules by: breed name + pet size + service combination
- Example: `Golden Retriever` + `LARGE` + `Full Groom` = $95

**Management (Settings → Pricing):**
- Add/edit/delete pricing rules
- Rules take priority over base service prices
- AI agent uses `/api/retell/get-quote` to fetch the correct price during a call

**Price lookup logic:**
1. Try exact match: breed + size + service
2. Fall back to: breed + service (any size)
3. Fall back to: service base price

---

### 11. Smart Rebooking Engine

Breed-aware reminders that know when each dog is due back.

**Configuration (per business):**
- Default rebooking interval (default: 42 days / ~6 weeks)
- Can be overridden per appointment at booking time

**Automated flow:**
1. Appointment completed → `completedAt` timestamp set
2. Cron job checks if `completedAt + rebookInterval - reminderLeadDays` has passed
3. If yes and no future appointment exists → sends rebooking SMS
4. `rebookingReminderSent` flag set

**Rebooking SMS example:**
> "Hi [Name]! It's almost time for [Pet]'s next grooming at [Business]. Reply BOOK to schedule, or call us anytime!"

---

### 12. Behavioral Risk Logging

Track pet behavior and special handling needs across visits.

**Severity levels:**
| Level | Use case |
|-------|----------|
| `NOTE` | General notes (prefers back entrance, nervous around dryers) |
| `CAUTION` | Requires extra patience, has nipped before |
| `HIGH_RISK` | Muzzle required, known biting history |

**Tags system:**
- `muzzle_required`, `anxious`, `biting`, `reactive`, `special_handling`, etc.

**AI integration:**
- Before each call, the AI agent fetches the customer's behavior brief via `/api/behavior/brief`
- The brief is injected into the agent's context so it knows to mention requirements during booking

**Access:**
- Behavior logs are linked to customer or pet records
- Viewable via the dashboard; accessible to the voice agent during calls

---

### 13. Google Review Automation

Automatically requests Google reviews from customers after their appointment.

**Trigger:** 2 hours after appointment marked `COMPLETED` (or estimated pickup time).

**Flow:**
1. Cron job (`/api/notifications/reviews`) finds completed appointments where review hasn't been requested
2. SMS sent to customer with a trackable link
3. Click tracked via `/api/reviews/click` (redirects to actual Google review URL)
4. `ReviewRequest` record updated with `clickedAt` timestamp

**Configuration (Settings → Reviews):**
- Paste in your Google Business review URL
- System wraps it with a tracking redirect

**Review SMS example:**
> "Hi [Name]! Hope [Pet] is looking great after their visit to [Business]. Mind leaving us a quick review? It helps so much: [link]"

---

### 14. Customer Memory

The AI remembers returning customers so calls feel personal, not robotic.

**What's stored per customer:**
- Name, phone (primary key: businessId + phone)
- Pet name, breed, size
- Preferred service
- Visit count
- VIP flag
- No-show count
- Last appointment start time
- Notes and special handling info
- Last call summary

**How it works:**
- On call start: `/api/retell/lookup-customer` queries by caller phone number
- Returns a context block injected into the AI's prompt:
  > "Returning customer: Sarah. Pet: Max, Golden Retriever, Large. Usually books Full Groom. 3 previous visits. No known issues."
- After each call: `upsertCustomerMemoryFromCall` updates the record with new data extracted from the transcript

**Customer model also tracks:**
- `visitCount` — used to determine if intake form should be sent
- `noShowCount` — feeds into repeat offender detection
- `isVip` — can be manually flagged for special treatment

---

### 15. Calendar Integration

RingPaw syncs with existing calendar tools so bookings appear everywhere automatically.

**Supported providers:**
| Provider | Auth | Use case |
|----------|------|----------|
| Google Calendar | OAuth 2.0 | Primary calendar for most salons |
| Square Appointments | OAuth 2.0 | Salons using Square for POS/booking |
| Acuity Scheduling | OAuth 2.0 | Salons using Acuity |

**Key tip for groomers using Gingr/MoeGo:** Connect the same Google Calendar that your grooming software syncs with. RingPaw bookings will appear as busy events in your grooming software automatically, preventing double-bookings.

**Connect flow:**
1. Settings → Calendar → "Connect Account"
2. OAuth redirect to provider
3. Tokens stored; calendar ID identified
4. First connection auto-set as primary

**Disconnect flow:**
- "Disconnect" button on each connected provider
- Marks connection inactive, clears tokens
- Calendar events already created remain untouched

**Conflict checking:**
- Before booking, `/api/retell/check-availability` queries connected calendars
- "Busy" events on personal/work calendars block slots
- Optional 15-minute buffer before and after each appointment

**Booking logic settings:**
- Primary destination calendar selection
- Respect "Busy" events toggle
- Buffer time toggle

---

### 16. Call Log & Transcript Search

Full history of every call the AI has handled.

**Per-call data:**
- Caller name (extracted by AI)
- Caller phone number
- Call status: `IN_PROGRESS` / `COMPLETED` / `NO_BOOKING` / `MISSED` / `FAILED`
- Duration (seconds)
- Full transcript
- AI-generated summary
- Extracted data (pet, breed, size, service, notes)
- Linked appointment (if booking was made)
- Recording URL (if available)

**Search (new):**
- Search bar on `/calls` page
- Searches across: caller name, phone number, transcript text, call summary
- Works alongside status filter tabs
- Paginated results (20 per page)

**Filter tabs:**
- All Calls
- Confirmed (call resulted in booked appointment)
- Soft Booking (pending confirmation)
- Missed (call ended, no booking)

**Transcript viewer:**
- Click "View Transcript" on any call
- Modal shows: caller info, status, extracted data, linked appointment, AI summary, full transcript

---

### 17. Dashboard Analytics

High-level KPIs visible on the main dashboard (`/dashboard`).

**Metrics displayed:**
- Calls this week / this month
- Confirmed bookings
- Missed calls (no booking made)
- Average call duration
- Revenue protected (estimated from no-show prevention)
- Recent calls list with appointment links

**No-Show Protection stats (30-day):**
- No-show count and rate %
- Confirmed via SMS count
- Upcoming unconfirmed count
- Waitlist size
- Estimated revenue saved

**Today's view (`/today`):**
- All appointments for today
- Live grooming status per appointment
- One-tap status update buttons
- Customer name + pet info

---

### 18. Agent Personality Configuration

Full control over how the AI sounds and behaves.

**Settings → Agent:**

| Setting | Options |
|---------|---------|
| Voice | Multiple voices via Retell |
| Greeting | Custom opening line |
| Fallback message | What AI says when it can't help |
| Tone | Warm / Professional / Playful |
| Style | Concise / Detailed |
| Language | English, Spanish, French, and more |
| System prompt | Free-text override for advanced customization |

Changes are pushed to Retell via `/api/retell/configure` which updates the LLM configuration in real-time.

---

### 19. Billing & Plan Management

**Plans:**

| Plan | Price | Minutes | Calendars | SMS |
|------|-------|---------|-----------|-----|
| Starter | $49/mo | 50 min | 1 | Basic |
| Growth | $149/mo | 200 min | 3 | Full |
| Pro | $299/mo | 500 min | 5 | Full + API |

**Settings → Billing:**
- Current plan display with features list
- Monthly minutes used with progress bar
- Warning at 80% usage, hard limit alert at 100%
- Upgrade / downgrade buttons per plan
- Payment method management

---

## Data Models

```
Business
  ├── User (1:1 via NextAuth)
  ├── PhoneNumber (assigned RingPaw number)
  ├── CalendarConnection[] (Google, Square, Acuity)
  ├── Service[] (offerings with price/duration)
  ├── PricingRule[] (breed × size × service overrides)
  ├── RetellConfig (agent settings)
  ├── RebookingConfig (rebooking intervals)
  ├── Appointment[]
  │     ├── Customer (linked by phone)
  │     ├── Call (call that created it)
  │     ├── IntakeForm
  │     └── ReviewRequest
  ├── Call[]
  ├── Customer[]
  │     └── Pet[]
  ├── WaitlistEntry[]
  ├── BehaviorLog[]
  └── SmsLog[]
```

---

## API Reference

### Voice Agent Tools
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/retell/lookup-customer` | POST | Customer context by phone |
| `/api/retell/check-availability` | POST | Available slots for date/time |
| `/api/retell/get-quote` | POST | Price for breed/size/service |
| `/api/retell/book-appointment` | POST | Create appointment during call |
| `/api/retell/webhook` | POST | Retell event handler (call lifecycle) |
| `/api/retell/configure` | POST | Push config changes to Retell agent |

### Appointments
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/appointments/today` | GET | Today's appointments |
| `/api/appointments/stats` | GET | No-show stats + lapsing clients |
| `/api/appointments/status` | GET/POST | Live grooming status |
| `/api/appointments/confirm` | GET/POST | One-tap confirmation |
| `/api/appointments/cancel` | POST | Cancel + trigger waitlist fill |
| `/api/appointments/no-show` | POST | Mark as no-show |

### Calls
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calls` | GET | List calls (filterable, searchable, paginated) |

### Calendar
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/calendar/connect` | GET | OAuth connect + callback handler |
| `/api/calendar/connect` | DELETE | Disconnect provider |
| `/api/calendar/availability` | GET | Available slots |
| `/api/calendar/book` | POST | Create calendar event |

### SMS & Notifications
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sms/webhook` | POST | Inbound SMS handler (customer + owner commands) |
| `/api/notifications/send` | POST | Send SMS to customer |
| `/api/notifications/reminder-48h` | POST | Cron: 48h reminders |
| `/api/notifications/rebooking` | POST | Cron: breed-specific rebooking nudges |
| `/api/notifications/reviews` | POST | Cron: Google review requests |
| `/api/notifications/lapsing-blast` | POST | Blast SMS to all lapsing clients |

### Other
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/business/profile` | GET/POST | Business profile + settings |
| `/api/waitlist` | GET/POST/DELETE | Waitlist management |
| `/api/pricing` | GET/POST/DELETE | Pricing rules |
| `/api/behavior` | GET/POST | Behavior logs |
| `/api/behavior/brief` | GET | AI-ready behavior summary |
| `/api/intake/[token]` | GET/POST | Public intake form |
| `/api/reviews/config` | GET/POST | Google review URL |
| `/api/reviews/click` | GET | Track + redirect review clicks |
| `/api/provision-number` | POST | Provision Retell phone number |

---

## Onboarding Flow

New businesses complete a 7-step wizard before going live:

1. **Business info** — Name, owner name, address, phone number
2. **Business hours** — Days open, open/close times per day
3. **Services** — Add services with name, price, duration
4. **Timezone** — Select local timezone for accurate scheduling
5. **Calendar** — Connect Google Calendar (or skip)
6. **Phone number** — Provision a RingPaw AI phone number via Retell
7. **Agent personality** — Set greeting, voice, and tone

After onboarding, the business is live: calls to the provisioned number are answered by the AI immediately.

---

*Last updated: March 2026*
