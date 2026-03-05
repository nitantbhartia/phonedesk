import { useState } from "react";

const sections = [
  { id: "overview", label: "Overview", icon: "◎" },
  { id: "users", label: "Users", icon: "♟" },
  { id: "features", label: "Core Features", icon: "◈" },
  { id: "onboarding", label: "Onboarding", icon: "⟳" },
  { id: "tech", label: "Architecture", icon: "⚙" },
  { id: "pricing", label: "Pricing", icon: "$" },
  { id: "phases", label: "Build Phases", icon: "▸" },
  { id: "questions", label: "Open Questions", icon: "?" },
];

const Tag = ({ children, color = "#0EA5E9", bg = "#E0F2FE" }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.05em", textTransform: "uppercase", marginRight: 6 }}>
    {children}
  </span>
);

const Table = ({ headers, rows }) => (
  <div style={{ overflowX: "auto", marginTop: 12, marginBottom: 16 }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} style={{ background: "#0F172A", color: "#F1F5F9", padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? "#F8FAFC" : "#FFFFFF" }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: "8px 12px", borderBottom: "1px solid #E2E8F0", color: "#334155", verticalAlign: "top" }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Bullet = ({ children, sub = false }) => (
  <div style={{ display: "flex", gap: 8, marginBottom: 6, paddingLeft: sub ? 20 : 0 }}>
    <span style={{ color: "#0EA5E9", marginTop: 2, flexShrink: 0 }}>{sub ? "◦" : "•"}</span>
    <span style={{ color: "#475569", fontSize: 14, lineHeight: 1.6 }}>{children}</span>
  </div>
);

const Section = ({ title, children, id }) => (
  <div id={id} style={{ marginBottom: 40 }}>
    <div style={{ borderLeft: "3px solid #0EA5E9", paddingLeft: 14, marginBottom: 20 }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A", fontFamily: "'DM Serif Display', Georgia, serif" }}>{title}</h2>
    </div>
    {children}
  </div>
);

const Sub = ({ title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</h3>
    {children}
  </div>
);

const Callout = ({ children, type = "info" }) => {
  const colors = { info: ["#DBEAFE", "#1D4ED8", "ℹ"], warn: ["#FEF3C7", "#92400E", "⚠"], tip: ["#D1FAE5", "#065F46", "✓"] };
  const [bg, fg, icon] = colors[type];
  return (
    <div style={{ background: bg, borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: fg, fontWeight: 700, fontSize: 14 }}>{icon}</span>
      <span style={{ color: fg, fontSize: 13, lineHeight: 1.6 }}>{children}</span>
    </div>
  );
};

export default function PRD() {
  const [active, setActive] = useState("overview");
  const scrollTo = (id) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#F8FAFC", minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
        code { font-family: 'JetBrains Mono', monospace; background: #1E293B; color: #7DD3FC; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#0F172A", position: "fixed", top: 0, left: 0, height: "100vh", padding: "24px 0", overflowY: "auto", zIndex: 100 }}>
        <div style={{ padding: "0 20px 24px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#F1F5F9", fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.02em" }}>RingPaw AI</div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 4 }}>Product Requirements v1.0</div>
        </div>
        <div style={{ borderTop: "1px solid #1E293B", paddingTop: 12 }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 20px",
              background: active === s.id ? "#1E293B" : "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
              borderLeft: active === s.id ? "2px solid #0EA5E9" : "2px solid transparent",
              transition: "all 0.15s"
            }}>
              <span style={{ color: active === s.id ? "#0EA5E9" : "#475569", fontSize: 14, width: 16 }}>{s.icon}</span>
              <span style={{ color: active === s.id ? "#F1F5F9" : "#94A3B8", fontSize: 13, fontWeight: active === s.id ? 600 : 400 }}>{s.label}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "24px 20px 0", borderTop: "1px solid #1E293B", marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.8 }}>
            <div>🟢 <span style={{ color: "#64748B" }}>Target MRR: $10K</span></div>
            <div>⏱ <span style={{ color: "#64748B" }}>MVP: 2-3 weeks</span></div>
            <div>💰 <span style={{ color: "#64748B" }}>Cost/client: ~$60/mo</span></div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: 220, padding: "40px 48px", maxWidth: 900, flex: 1 }}>

        {/* Hero */}
        <div style={{ marginBottom: 48, paddingBottom: 32, borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Tag>Voice AI</Tag><Tag color="#7C3AED" bg="#EDE9FE">Bookings</Tag><Tag color="#059669" bg="#D1FAE5">Groomers</Tag>
          </div>
          <h1 style={{ margin: "0 0 12px", fontSize: 36, fontWeight: 800, color: "#0F172A", fontFamily: "'DM Serif Display', serif", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            Voice AI Receptionist<br />for Pet Groomers &amp; Service Businesses
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: "#64748B", lineHeight: 1.7 }}>
            Product Requirements Document &nbsp;|&nbsp; v1.0 &nbsp;|&nbsp; March 2026
          </p>
        </div>

        {/* 1. Product Overview */}
        <Section title="1. Product Overview" id="overview">
          <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginTop: 0, marginBottom: 20 }}>
            RingPaw AI is a voice-based AI receptionist that answers missed calls for small service businesses — starting with pet groomers. When a business owner is busy with a client, RingPaw picks up, holds a natural conversation, collects booking details, checks real-time availability, and confirms appointments — all without any human intervention.
          </p>
          <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.7, marginTop: 0, marginBottom: 20 }}>
            Owners set up once, connect their calendar(s), and never miss a lead again. They receive SMS/Slack summaries after every call. Customers get instant responses and confirmed bookings within 60 seconds of calling.
          </p>

          <Sub title="1.1 Problem Statement">
            <Bullet>Solo and small-team groomers miss 30–60% of calls while working on clients</Bullet>
            <Bullet>Calling back cold leads has &lt;40% connect rate</Bullet>
            <Bullet>Competitors who answer first win the booking</Bullet>
            <Bullet>Existing solutions (voicemail, generic answering services) don't qualify or book — they just take a message</Bullet>
          </Sub>

          <Sub title="1.2 Solution">
            <Bullet>Dedicated Twilio phone number per business — forwarded to from their existing line on no-answer</Bullet>
            <Bullet>Vapi.ai voice AI handles the call with natural conversation and groomer-specific questions</Bullet>
            <Bullet>n8n workflow checks live calendar availability and books confirmed or soft appointments</Bullet>
            <Bullet>Owner notified instantly via SMS with full call summary</Bullet>
            <Bullet>Owner can text back to the AI agent to update hours, block dates, or change settings</Bullet>
          </Sub>
        </Section>

        {/* 2. Users & Personas */}
        <Section title="2. Users & Personas" id="users">
          <Sub title="2.1 Primary User — Business Owner (The Groomer)">
            <Bullet>Solo groomer or 1–3 person shop, 20–80 appointments/week</Bullet>
            <Bullet>Has existing iPhone/Android number they use for business</Bullet>
            <Bullet>Uses Google Calendar, Calendly, or a basic booking app</Bullet>
            <Bullet>Not technical — needs zero-code setup</Bullet>
            <Bullet>Wants to review bookings on phone, not log into dashboards</Bullet>
          </Sub>
          <Sub title="2.2 Secondary User — The Caller (Customer)">
            <Bullet>Pet owner calling to book a grooming appointment</Bullet>
            <Bullet>Expects fast, friendly, human-like response</Bullet>
            <Bullet>Wants a confirmed time slot, not a callback promise</Bullet>
            <Bullet>May call during evenings and weekends</Bullet>
          </Sub>
          <Sub title="2.3 Tertiary User — Platform Admin (You, the Builder)">
            <Bullet>Manages client onboarding, phone number provisioning, and billing</Bullet>
            <Bullet>Monitors agent performance, call transcripts, and error rates</Bullet>
            <Bullet>White-labels the product for agencies in V2</Bullet>
          </Sub>
        </Section>

        {/* 3. Core Features & Requirements */}
        <Section title="3. Core Features & Requirements" id="features">

          {/* 3.1 Phone Number Provisioning */}
          <Sub title="3.1 Phone Number Provisioning">
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>How It Works</div>
            <Bullet>On signup, system automatically provisions a Twilio number via Twilio's API</Bullet>
            <Bullet>Number is local area code matched to the business's city (e.g., San Diego → 619/858/760)</Bullet>
            <Bullet>Owner sets up call forwarding on their iPhone: Settings → Phone → Call Forwarding (or carrier code <code>*61*[RingPaw number]#</code>)</Bullet>
            <Bullet>Onboarding wizard walks them through this with screenshots — takes 2 minutes</Bullet>
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8, marginTop: 16 }}>Technical Requirements</div>
            <Bullet><code>POST /api/provision-number</code> → calls Twilio API → stores number in DB tied to <code>business_id</code></Bullet>
            <Bullet>Number supports both inbound calls and outbound SMS</Bullet>
            <Bullet>If owner wants RingPaw number as their PRIMARY listed number (e.g., Google Business Profile), system supports that too</Bullet>
            <Bullet>Number porting supported in V2 (owner brings existing number)</Bullet>
          </Sub>

          {/* 3.2 Voice AI Agent */}
          <Sub title="3.2 Voice AI Agent (Vapi.ai)">
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>Conversation Design — Groomer Flow</div>
            <div style={{ background: "#0F172A", borderRadius: 10, padding: 20, marginBottom: 16 }}>
              {[
                ["AI", "Hi! You've reached [Business Name]. [Owner] is with a client right now, but I can help you book an appointment. What's your name?"],
                ["", "→ Collect: customer name, dog name, breed, size (S/M/L/XL), service requested"],
                ["", "→ Ask clarifying questions: first visit? any special handling needs? preferred day/time?"],
                ["AI", "Let me check availability... I have Tuesday at 2pm or Thursday at 10am. Which works better?"],
                ["", "→ Book or soft-book based on owner config"],
                ["AI", "Perfect! I've booked [Dog] for [Service] on [Date] at [Time]. You'll get a confirmation text shortly. Is there anything else?"],
              ].map(([speaker, text], i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: speaker === "AI" ? "#0EA5E9" : "#64748B", width: 44, flexShrink: 0, paddingTop: 2 }}>{speaker || ""}</span>
                  <span style={{ color: speaker === "AI" ? "#E2E8F0" : "#94A3B8", fontSize: 13, lineHeight: 1.6, fontStyle: speaker === "" ? "italic" : "normal" }}>{text}</span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>Agent Configuration</div>
            <Bullet>Owner sets business name, owner name, services offered, and pricing via onboarding form</Bullet>
            <Bullet>Vapi system prompt auto-generated from this data</Bullet>
            <Bullet>Owner can update agent behavior by texting the AI (see Section 3.5)</Bullet>
            <Bullet>Fallback: if caller asks something agent can't handle, it says "I'll have [Owner] call you back shortly" and notifies owner</Bullet>
          </Sub>

          {/* 3.3 Calendar Integration */}
          <Sub title="3.3 Calendar Integration">
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>Supported Calendars</div>
            <Table
              headers={["Calendar", "Method", "Read", "Write", "Priority"]}
              rows={[
                ["Google Calendar", "OAuth 2.0", "Yes", "Yes", "V1"],
                ["Calendly", "OAuth + API v2", "Yes", "Yes (invitee create)", "V1"],
                ["Cal.com", "API Key", "Yes", "Yes", "V1"],
                ["Apple iCal / iCloud", "CalDAV", "Yes", "Yes", "V2"],
                ["Acuity Scheduling", "OAuth", "Yes", "Yes", "V2"],
                ["Square Appointments", "OAuth", "Yes", "Yes", "V2"],
              ]}
            />
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8, marginTop: 16 }}>Multi-Calendar Support</div>
            <Bullet>Owner can connect up to 3 calendars simultaneously</Bullet>
            <Bullet>System checks ALL connected calendars for conflicts before offering slots</Bullet>
            <Bullet>Primary calendar (owner-designated) receives new bookings</Bullet>
            <Bullet>Example: Google Cal (personal) + Calendly (business) — agent avoids double-booking</Bullet>
            <Bullet>Calendar sync runs in real-time during call via n8n workflow</Bullet>
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8, marginTop: 16 }}>Booking Logic</div>
            <Bullet><strong>Hard booking:</strong> creates confirmed event on calendar, sends customer SMS confirmation</Bullet>
            <Bullet><strong>Soft booking:</strong> holds a slot for 2 hours, sends customer SMS with confirm link</Bullet>
            <Bullet>Owner configures which mode per service type (e.g., new clients = soft, returning = hard)</Bullet>
          </Sub>

          {/* 3.4 Post-Call Notifications */}
          <Sub title="3.4 Post-Call Notifications">
            <Callout type="info">Owner gets an SMS within 30 seconds of every call ending. Example: "[RingPaw] New booking! Buddy (Golden, L) - Full groom - Tue Mar 10 @ 2pm. Customer: Sarah (619-555-0123). Added to Google Cal."</Callout>
            <Table
              headers={["Notification", "Channel", "Timing", "Required?"]}
              rows={[
                ["New booking summary", "SMS to owner", "< 30s post-call", "Yes"],
                ["New booking summary", "Email to owner", "< 2 min post-call", "Optional"],
                ["Booking confirmation", "SMS to customer", "Immediate", "Yes"],
                ["Appointment reminder", "SMS to customer", "24hr before", "Yes"],
                ["Missed call (no booking)", "SMS to owner", "< 30s post-call", "Yes"],
                ["Call transcript", "Link in SMS", "< 2 min post-call", "Yes"],
              ]}
            />
          </Sub>

          {/* 3.5 Owner SMS Control Interface */}
          <Sub title="3.5 Owner SMS Control Interface">
            <Callout type="tip">The most important differentiator: the owner manages everything via text. No app login needed. This makes RingPaw feel like a real employee, not software.</Callout>
            <Table
              headers={["Owner Texts", "What Happens"]}
              rows={[
                ["\"Block tomorrow\"", "Marks owner as unavailable all day on calendar"],
                ["\"Block Thu 2-4pm\"", "Creates blocked slot on primary calendar"],
                ["\"Add service: Puppy bath $45\"", "Adds service to agent's knowledge base"],
                ["\"Change hours to 9am-5pm Mon-Sat\"", "Updates agent's bookable window"],
                ["\"Pause bookings\"", "Agent switches to message-taking mode only"],
                ["\"Resume bookings\"", "Returns to full booking mode"],
                ["\"Show today's schedule\"", "Agent replies with today's appointments"],
                ["\"Cancel [customer name] appt\"", "Cancels booking and notifies customer"],
                ["\"Price list\"", "Agent replies with current services and pricing"],
              ]}
            />
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8, marginTop: 16 }}>Technical Implementation</div>
            <Bullet>Twilio webhook on inbound SMS → n8n workflow → OpenAI parses intent → action executed</Bullet>
            <Bullet>Confirmation sent back to owner: "Done! Tomorrow is blocked on your calendar."</Bullet>
            <Bullet>Unknown commands: "I didn't understand that. Try 'block [date]', 'add service', or 'show schedule'"</Bullet>
          </Sub>
        </Section>

        {/* 4. Setup & Onboarding Flow */}
        <Section title="4. Setup & Onboarding Flow" id="onboarding">
          <Sub title="4.1 Onboarding Steps (Owner Experience)">
            <Table
              headers={["Step", "What Owner Does", "What System Does", "Time"]}
              rows={[
                ["1. Sign Up", "Enters name, business name, email, city", "Creates account, provisions Twilio number", "2 min"],
                ["2. Business Profile", "Fills services, prices, business hours", "Generates Vapi system prompt", "5 min"],
                ["3. Calendar Connect", "OAuth connects Google/Calendly/Cal.com", "Stores tokens, tests read/write", "3 min"],
                ["4. Call Forwarding", "Follows in-app guide to forward on no-answer", "Sends test call to verify setup", "2 min"],
                ["5. Test Call", "Calls their RingPaw number", "Runs full agent flow in demo mode", "2 min"],
                ["6. Go Live", "Confirms everything looks good", "Activates live call handling", "1 tap"],
              ]}
            />
          </Sub>
          <Sub title="4.2 UI/UX Requirements">
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>Web Dashboard (Required for Setup Only)</div>
            <Bullet>Responsive web app — mobile-first (owners will use iPhone)</Bullet>
            <Bullet>Stack: Next.js + Tailwind + shadcn/ui</Bullet>
            <Bullet>Pages: Onboarding wizard, Dashboard home, Calendar settings, Agent settings, Call log, Billing</Bullet>
            <Bullet>Auth: Clerk or NextAuth with Google SSO</Bullet>
            <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8, marginTop: 16 }}>Dashboard Home — Key Metrics</div>
            <Bullet>Calls answered this week / this month</Bullet>
            <Bullet>Bookings confirmed vs. missed</Bullet>
            <Bullet>Revenue protected estimate (bookings x avg service price)</Bullet>
            <Bullet>Recent call log with transcript links</Bullet>
            <Callout type="info">Mobile App — NOT Required in V1. SMS control interface replaces the need for a mobile app. Progressive Web App (PWA) in V2 for push notifications.</Callout>
          </Sub>
        </Section>

        {/* 5. Technical Architecture */}
        <Section title="5. Technical Architecture" id="tech">
          <Sub title="5.1 System Components">
            <Table
              headers={["Component", "Tool", "Purpose", "$/client/mo"]}
              rows={[
                ["Phone number", "Twilio", "Inbound calls + SMS", "$1-2"],
                ["Voice AI", "Vapi.ai", "Natural voice conversation", "$20-50 (usage)"],
                ["Workflow engine", "n8n (self-hosted)", "Orchestration logic", "$5-10 (infra)"],
                ["Calendar APIs", "Google/Calendly/Cal.com", "Availability + booking", "$0-16"],
                ["SMS", "Twilio", "Owner & customer notifications", "$5-10"],
                ["AI brain", "OpenAI GPT-4o", "Intent parsing for SMS commands", "$2-5"],
                ["Database", "PostgreSQL (Railway)", "Business data, call logs", "$5"],
                ["Web app hosting", "Vercel", "Dashboard frontend", "$0-20"],
                [<strong key="total">Total</strong>, "", "", <strong key="total-val">~$40-100/client</strong>],
              ]}
            />
          </Sub>
          <Sub title="5.2 n8n Workflow Map">
            {[
              {
                name: "Workflow 1: Inbound Call Handler",
                steps: [
                  "Trigger: Vapi webhook (call started)",
                  "Action: Load business profile from DB",
                  "Action: Pass context to Vapi agent (services, hours, owner name)",
                  "Trigger: Vapi webhook (call ended + transcript)",
                  "Action: Parse extracted data (name, dog, service, time preference)",
                  "Action: Query calendar API for available slots",
                  "Action: Create booking on primary calendar",
                  "Action: Send SMS to customer (confirmation)",
                  "Action: Send SMS to owner (summary)",
                  "Action: Log call to DB",
                ],
              },
              {
                name: "Workflow 2: Owner SMS Command Handler",
                steps: [
                  "Trigger: Twilio inbound SMS to RingPaw number",
                  "Action: Identify business from phone number",
                  "Action: OpenAI GPT-4o parses intent and entities",
                  "Decision: Route to correct sub-workflow (block calendar / add service / show schedule / etc.)",
                  "Action: Execute action (calendar API / DB update / etc.)",
                  "Action: SMS confirmation back to owner",
                ],
              },
              {
                name: "Workflow 3: Reminder Scheduler",
                steps: [
                  "Trigger: Cron job every 30 minutes",
                  "Action: Query DB for appointments in next 24 hours without reminder sent",
                  "Action: Send reminder SMS to customer",
                  "Action: Mark reminder_sent = true in DB",
                ],
              },
            ].map(w => (
              <div key={w.name} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 13, marginBottom: 8 }}>{w.name}</div>
                {w.steps.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
                    <span style={{ color: "#CBD5E1", fontSize: 11, flexShrink: 0, marginTop: 3 }}>{i + 1}.</span>
                    <span style={{ color: "#475569", fontSize: 13 }}>{s}</span>
                  </div>
                ))}
              </div>
            ))}
          </Sub>
        </Section>

        {/* 6. Pricing Model */}
        <Section title="6. Pricing Model" id="pricing">
          <Table
            headers={["Plan", "Price", "Calls/Month", "Calendars", "SMS Commands", "Best For"]}
            rows={[
              ["Starter", "$149/mo", "Up to 100", "1", "Basic (block/resume)", "Solo groomer, low volume"],
              ["Pro", "$249/mo", "Up to 300", "3", "Full command set", "Growing shop, 1-3 staff"],
              ["Business", "$399/mo", "Unlimited", "5", "Full + API access", "Multi-location, agencies"],
            ]}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24, marginTop: 8 }}>
            {[
              { name: "Starter", price: "$149", features: ["Up to 100 calls/mo", "1 calendar", "Basic SMS (block/resume)"], color: "#F1F5F9", border: "#E2E8F0", tag: null },
              { name: "Pro", price: "$249", features: ["Up to 300 calls/mo", "3 calendars", "Full SMS command set"], color: "#EFF6FF", border: "#BFDBFE", tag: "Most Popular" },
              { name: "Business", price: "$399", features: ["Unlimited calls", "5 calendars", "Full + API access"], color: "#F0FDF4", border: "#BBF7D0", tag: null },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.color, border: `1.5px solid ${plan.border}`, borderRadius: 12, padding: 20, position: "relative" }}>
                {plan.tag && <div style={{ position: "absolute", top: -10, right: 12, background: "#0EA5E9", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, letterSpacing: "0.05em" }}>{plan.tag}</div>}
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 12, fontFamily: "'DM Serif Display', serif" }}>{plan.price}<span style={{ fontSize: 13, fontWeight: 400, color: "#64748B" }}>/mo</span></div>
                {plan.features.map(f => (
                  <div key={f} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ color: "#10B981", fontSize: 12 }}>✓</span>
                    <span style={{ color: "#475569", fontSize: 13 }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <Bullet>Setup fee: $299 one-time (waived for annual plans)</Bullet>
          <Bullet>Overage: $0.10/call beyond plan limit</Bullet>
          <Bullet>Your cost per client: $40-100/month → margins of 50-75%</Bullet>
        </Section>

        {/* 7. Build Phases */}
        <Section title="7. Build Phases" id="phases">
          <Table
            headers={["Phase", "What to Build", "Timeline", "Goal"]}
            rows={[
              ["Phase 1 — MVP", "Vapi agent + n8n + Twilio SMS + Google Calendar only", "2-3 weeks", "First paying client"],
              ["Phase 2 — Onboarding", "Web dashboard + onboarding wizard + Calendly integration", "3-4 weeks", "Self-serve signups"],
              ["Phase 3 — SMS Control", "Owner SMS command handler + multi-calendar support", "2-3 weeks", "Retention & stickiness"],
              ["Phase 4 — Scale", "Agency white-label, Stripe billing, analytics dashboard", "4-6 weeks", "$10K MRR"],
            ]}
          />
          <Callout type="warn">Don't build the dashboard before you have a paying client. Do manual onboarding first — it will teach you exactly what to automate.</Callout>
        </Section>

        {/* 8. Open Questions & Decisions */}
        <Section title="8. Open Questions & Decisions" id="questions">
          <Table
            headers={["Question", "Options", "Recommendation"]}
            rows={[
              ["Vapi vs Retell for voice?", "Vapi (more features), Retell (easier)", "Start with Vapi"],
              ["n8n self-hosted vs cloud?", "Self-host (cheaper at scale), Cloud (faster to start)", "Cloud for MVP, self-host at 20+ clients"],
              ["Hard vs soft booking default?", "Hard (better UX), Soft (safer for new clients)", "Soft by default, owner can change to hard"],
              ["App or pure SMS?", "Dashboard (better for setup), SMS (better for daily use)", "Dashboard for setup, SMS for ops"],
              ["Name the product?", "RingPaw, TailGate, PickupPaw, AnswerPaw", "Validate with 5 groomers first"],
            ]}
          />
        </Section>

        <div style={{ paddingTop: 32, borderTop: "1px solid #E2E8F0", color: "#94A3B8", fontSize: 12 }}>
          RingPaw AI — PRD v1.0 — March 2026 — Confidential
        </div>
      </div>
    </div>
  );
}
