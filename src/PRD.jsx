import { useState } from "react";
const sections = [
  { id: "overview", label: "Overview", icon: "◎" },
  { id: "phone", label: "Phone Numbers", icon: "☎" },
  { id: "voice", label: "Voice Agent", icon: "◈" },
  { id: "calendar", label: "Calendars", icon: "▦" },
  { id: "sms", label: "SMS Control", icon: "⌨" },
  { id: "onboarding", label: "Onboarding", icon: "⟳" },
  { id: "tech", label: "Tech Stack", icon: "⚙" },
  { id: "pricing", label: "Pricing", icon: "$" },
  { id: "phases", label: "Build Phases", icon: "▸" },
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
            Voice AI Receptionist<br />for Service Businesses
          </h1>
          <p style={{ margin: 0, fontSize: 16, color: "#64748B", lineHeight: 1.7, maxWidth: 620 }}>
            When a groomer is elbow-deep in a golden retriever and the phone rings — RingPaw answers, qualifies the caller, checks availability, and books the appointment. The owner wakes up to confirmed bookings, not cold leads.
          </p>
        </div>
        {/* Overview */}
        <Section title="1. Product Overview" id="overview">
          <Callout type="tip">Core value prop: A groomer who misses 5 calls/week at $80/booking is losing ~$1,700/month. RingPaw pays for itself in the first week.</Callout>
          <Bullet>Dedicated Twilio number provisioned per business — call forwarded from existing iPhone on no-answer</Bullet>
          <Bullet>Vapi.ai handles natural voice conversation with groomer-specific questions (breed, size, service)</Bullet>
          <Bullet>n8n orchestrates real-time calendar check → booking → owner SMS alert</Bullet>
          <Bullet>Owner manages availability via text — no app logins needed for daily operations</Bullet>
          <Bullet>Starts with groomers, same workflow works for trainers, nail salons, massage therapists</Bullet>
          <Sub title="Problem">
            <Table
              headers={["Pain Point", "Current Reality", "RingPaw Fix"]}
              rows={[
                ["Missed calls", "Goes to voicemail, lead goes cold", "Answered in 2 rings by AI"],
                ["Slow response", "Owner calls back hours later, 40% connect", "Booking confirmed during original call"],
                ["After-hours leads", "No answer, caller tries competitor", "24/7 coverage"],
                ["Appointment confusion", "Manual back-and-forth via text", "Automated slot selection + confirmation"],
              ]}
            />
          </Sub>
        </Section>
        {/* Phone Numbers */}
        <Section title="2. Phone Number Provisioning" id="phone">
          <Callout type="info">Each business gets a dedicated number. Customers call the owner's existing number — it quietly forwards to RingPaw on no-answer. Zero friction for the owner, zero friction for the caller.</Callout>
          <Sub title="How It Works">
            <Bullet>On signup, system calls Twilio's API to provision a local number (area code matched to business city)</Bullet>
            <Bullet>Owner sets up conditional forwarding on iPhone: no-answer after 3 rings → forwards to RingPaw number</Bullet>
            <Bullet>iPhone code: dial <code>*61*[RingPaw number]**11*20#</code> to set 20-second no-answer forward</Bullet>
            <Bullet>Onboarding wizard shows this step with carrier-specific screenshots</Bullet>
            <Bullet>System sends a test call to verify forwarding is active before going live</Bullet>
          </Sub>
          <Sub title="Number Options">
            <Table
              headers={["Scenario", "Setup", "Use Case"]}
              rows={[
                ["Forwarding (default)", "Keep existing number, forward on no-answer", "Best for established businesses"],
                ["RingPaw as primary", "List RingPaw number on Google Business", "New businesses or rebrand"],
                ["Port existing number (V2)", "Transfer their number to Twilio", "Businesses want one number forever"],
              ]}
            />
          </Sub>
          <Sub title="Technical">
            <Bullet>API: <code>POST /api/provision-number</code> → Twilio Buy Number API → store in DB with <code>business_id</code></Bullet>
            <Bullet>Number supports inbound voice (Vapi webhook) + inbound/outbound SMS (Twilio messaging)</Bullet>
            <Bullet>Cost to you: $1.15/number/month + usage</Bullet>
          </Sub>
        </Section>
        {/* Voice Agent */}
        <Section title="3. Voice AI Agent (Vapi.ai)" id="voice">
          <Sub title="Conversation Flow — Groomer">
            <div style={{ background: "#0F172A", borderRadius: 10, padding: 20, marginBottom: 16 }}>
              {[
                ["AI", "Hi! You've reached Paws & Claws Grooming. Jessica's with a client right now, but I can help you book an appointment. What's your name?"],
                ["Caller", "Hi, I'm Sarah. I want to get my dog groomed."],
                ["AI", "Great, Sarah! What's your dog's name and breed?"],
                ["Caller", "His name is Buddy, he's a golden retriever."],
                ["AI", "Lovely! Golden retrievers usually need about 2 hours. Are you looking for a bath and trim, or a full groom with everything?"],
                ["Caller", "Full groom please."],
                ["AI", "Perfect. And is Buddy a new client with us, or has he been here before?"],
                ["Caller", "First time."],
                ["AI", "Welcome! Let me check availability... I have this Thursday at 10am or next Tuesday at 2pm. Which works better for you?"],
                ["Caller", "Thursday works!"],
                ["AI", "I've got Buddy down for a full groom this Thursday at 10am. You'll get a confirmation text at this number. Anything else?"],
              ].map(([speaker, text], i) => (
                <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: speaker === "AI" ? "#0EA5E9" : "#94A3B8", width: 44, flexShrink: 0, paddingTop: 2 }}>{speaker}</span>
                  <span style={{ color: speaker === "AI" ? "#E2E8F0" : "#94A3B8", fontSize: 13, lineHeight: 1.6 }}>{text}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub title="Agent Configuration">
            <Bullet>Owner fills: business name, owner name, services + prices, hours, special handling notes</Bullet>
            <Bullet>System auto-generates Vapi system prompt from this data — owner never writes a prompt</Bullet>
            <Bullet>Fallback handling: if caller asks anything out of scope, agent says "I'll have Jessica call you back" + notifies owner</Bullet>
            <Bullet>Language: English V1, Spanish V2 (huge opportunity in groomer market)</Bullet>
          </Sub>
          <Sub title="Key Questions Agent Always Asks">
            <Table
              headers={["Question", "Why It Matters"]}
              rows={[
                ["Dog name + breed", "Personalization, affects service time estimate"],
                ["Dog size (S/M/L/XL)", "Slot duration and pricing"],
                ["Service type", "Which calendar slot length to book"],
                ["First-time or returning", "Determines hard vs. soft booking, waiver needed?"],
                ["Preferred day/time", "Narrows calendar search"],
                ["Contact number (if unknown)", "For confirmation + reminder SMS"],
              ]}
            />
          </Sub>
        </Section>
        {/* Calendar */}
        <Section title="4. Calendar Integration" id="calendar">
          <Callout type="tip">Multi-calendar is the biggest differentiator. A groomer might use Google Calendar personally AND Calendly publicly. RingPaw checks both so there's zero double-booking.</Callout>
          <Sub title="Supported Calendars">
            <Table
              headers={["Calendar", "Method", "Read", "Write", "Phase"]}
              rows={[
                ["Google Calendar", "OAuth 2.0", "✓", "✓", "V1"],
                ["Calendly", "OAuth + API v2", "✓", "✓ (invitee create)", "V1"],
                ["Cal.com", "API Key", "✓", "✓", "V1"],
                ["Apple iCal / iCloud", "CalDAV", "✓", "✓", "V2"],
                ["Acuity Scheduling", "OAuth", "✓", "✓", "V2"],
                ["Square Appointments", "OAuth", "✓", "✓", "V2"],
              ]}
            />
          </Sub>
          <Sub title="Multi-Calendar Logic">
            <Bullet>Owner connects up to 3 calendars simultaneously</Bullet>
            <Bullet>System checks ALL connected calendars for busy/free status before offering slots</Bullet>
            <Bullet>Owner designates one calendar as "primary" — new bookings written here</Bullet>
            <Bullet>Example: Google Cal blocks a dentist appt → that slot invisible to RingPaw even if Calendly shows free</Bullet>
            <Bullet>Sync is real-time during the call (n8n → Calendar API → Vapi function call)</Bullet>
          </Sub>
          <Sub title="Booking Modes">
            <Table
              headers={["Mode", "What Happens", "When to Use"]}
              rows={[
                ["Hard Book", "Confirmed slot created, SMS sent, done", "Returning clients, confident caller"],
                ["Soft Book", "Slot held 2hrs, customer gets confirm link", "First-time clients, add-on services unclear"],
                ["Message Only", "No booking, owner gets transcript", "Owner has paused bookings (vacation, etc.)"],
              ]}
            />
          </Sub>
        </Section>
        {/* SMS Control */}
        <Section title="5. Owner SMS Control" id="sms">
          <Callout type="tip">This is the stickiness feature. Owners don't log into dashboards — they run their business over text. This makes RingPaw feel like a real employee, not software.</Callout>
          <Sub title="Command Reference">
            <Table
              headers={["Owner Texts", "What Happens", "Example Response"]}
              rows={[
                ["\"Block tomorrow\"", "Creates all-day block on primary calendar", "Done! Tomorrow is blocked. Callers will be offered Wed or later."],
                ["\"Block Thu 2-4pm\"", "Creates 2hr block on calendar", "Blocked! Thu 2-4pm is off limits."],
                ["\"Add service: Puppy bath $45 45min\"", "Adds to agent knowledge base", "Added! Puppy bath ($45, 45 min) is now bookable."],
                ["\"Change hours to 9-5 Mon-Sat\"", "Updates bookable window", "Updated! I'll only offer 9am-5pm slots Mon-Sat."],
                ["\"Pause bookings\"", "Switches to message-only mode", "Paused. I'll take messages but won't book until you say 'resume'."],
                ["\"Resume bookings\"", "Returns to full booking mode", "Back online! Booking appointments again."],
                ["\"Today's schedule\"", "Replies with day's appointments", "You have 4 appointments today: 9am Max (bath)..."],
                ["\"Cancel Sarah Thursday\"", "Cancels + notifies customer", "Cancelled and Sarah has been texted."],
              ]}
            />
          </Sub>
          <Sub title="Technical Flow">
            <Bullet>Twilio inbound SMS webhook → n8n → OpenAI GPT-4o parses intent + extracts entities</Bullet>
            <Bullet>Intent router dispatches to correct action node (calendar write / DB update / schedule query)</Bullet>
            <Bullet>Confirmation SMS back to owner within 5 seconds</Bullet>
            <Bullet>Unknown commands: suggests closest match or lists available commands</Bullet>
          </Sub>
        </Section>
        {/* Onboarding */}
        <Section title="6. Setup & Onboarding" id="onboarding">
          <Sub title="Owner Journey (Target: < 15 minutes to live)">
            <Table
              headers={["Step", "Owner Action", "System Action", "Time"]}
              rows={[
                ["1. Sign Up", "Name, business name, city, email", "Provision Twilio number, create account", "2 min"],
                ["2. Business Profile", "Services, prices, hours, pet types", "Generate Vapi system prompt", "5 min"],
                ["3. Connect Calendar", "OAuth button for Google/Calendly/Cal.com", "Store tokens, verify read/write", "2 min"],
                ["4. Set Forwarding", "Follow guided steps for iPhone/Android", "Send test call to verify", "3 min"],
                ["5. Test Call", "Call their RingPaw number", "Run demo mode, show transcript", "2 min"],
                ["6. Go Live", "Tap 'Activate'", "Enable live call handling", "1 tap"],
              ]}
            />
          </Sub>
          <Sub title="Web Dashboard (Setup + Monitoring)">
            <Bullet><strong>Stack:</strong> Next.js + Tailwind + shadcn/ui, deployed on Vercel</Bullet>
            <Bullet><strong>Auth:</strong> Clerk with Google SSO (no password needed)</Bullet>
            <Bullet><strong>Pages:</strong> Onboarding wizard, Dashboard home, Calendar settings, Agent config, Call log, Billing</Bullet>
            <Bullet><strong>Dashboard metrics:</strong> Calls answered, bookings confirmed, estimated revenue protected, recent call log</Bullet>
            <Bullet><strong>Mobile app:</strong> Not needed in V1 — SMS handles daily ops. PWA in V2.</Bullet>
          </Sub>
        </Section>
        {/* Tech Stack */}
        <Section title="7. Technical Architecture" id="tech">
          <Sub title="Stack">
            <Table
              headers={["Layer", "Tool", "Why", "$/client/mo"]}
              rows={[
                ["Phone", "Twilio", "Industry standard, reliable, SMS + Voice", "$2"],
                ["Voice AI", "Vapi.ai", "Best latency, function calling, groomer-friendly UX", "$20-50"],
                ["Orchestration", "n8n (self-hosted)", "Visual, powerful, no per-execution fees at scale", "$5"],
                ["Calendars", "Google / Calendly / Cal.com APIs", "Where groomers actually live", "$0-16"],
                ["AI for SMS", "OpenAI GPT-4o mini", "Intent parsing is cheap + fast", "$2"],
                ["Database", "PostgreSQL on Railway", "Simple, reliable, cheap", "$5"],
                ["Frontend", "Next.js on Vercel", "Fast deploys, great DX", "$0-20"],
                ["Billing", "Stripe", "Subscriptions + usage billing", "$0 + 2.9%"],
                ["TOTAL", "", "", "~$40-100"],
              ]}
            />
          </Sub>
          <Sub title="n8n Workflow Architecture">
            {[
              { name: "Workflow 1: Inbound Call", steps: ["Vapi webhook (call started) → load business profile", "Inject context into Vapi agent (services, hours, owner name)", "Vapi webhook (call ended + transcript)", "Parse extracted data → query calendar API", "Create booking → SMS customer → SMS owner → log call"] },
              { name: "Workflow 2: Owner SMS Commands", steps: ["Twilio inbound SMS → identify business from number", "GPT-4o parses intent + entities", "Route to: block calendar / add service / query schedule / toggle mode", "Execute action → confirm SMS back to owner < 5s"] },
              { name: "Workflow 3: Reminders", steps: ["Cron every 30 min → query appointments in next 24hrs without reminder", "Send reminder SMS to customer → mark sent in DB"] },
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
        {/* Pricing */}
        <Section title="8. Pricing Model" id="pricing">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              { name: "Starter", price: "$149", calls: "100 calls/mo", calendars: "1 calendar", sms: "Basic SMS control", color: "#F1F5F9", border: "#E2E8F0", tag: null },
              { name: "Pro", price: "$249", calls: "300 calls/mo", calendars: "3 calendars", sms: "Full SMS control", color: "#EFF6FF", border: "#BFDBFE", tag: "Most Popular" },
              { name: "Business", price: "$399", calls: "Unlimited", calendars: "5 calendars", sms: "Full + API access", color: "#F0FDF4", border: "#BBF7D0", tag: null },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.color, border: `1.5px solid ${plan.border}`, borderRadius: 12, padding: 20, position: "relative" }}>
                {plan.tag && <div style={{ position: "absolute", top: -10, right: 12, background: "#0EA5E9", color: "white", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, letterSpacing: "0.05em" }}>{plan.tag}</div>}
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", marginBottom: 12, fontFamily: "'DM Serif Display', serif" }}>{plan.price}<span style={{ fontSize: 13, fontWeight: 400, color: "#64748B" }}>/mo</span></div>
                {[plan.calls, plan.calendars, plan.sms].map(f => (
                  <div key={f} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ color: "#10B981", fontSize: 12 }}>✓</span>
                    <span style={{ color: "#475569", fontSize: 13 }}>{f}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <Bullet>Setup fee: $299 one-time (waived for annual plans)</Bullet>
          <Bullet>Your COGS per client: ~$40-100/month → 50-75% margins</Bullet>
          <Bullet>ROI pitch: groomer losing 5 calls/week at $80 avg = $1,700/month lost. RingPaw at $149 = 11x ROI</Bullet>
        </Section>
        {/* Build Phases */}
        <Section title="9. Build Phases" id="phases">
          <Table
            headers={["Phase", "What to Build", "Timeline", "Exit Criteria"]}
            rows={[
              ["Phase 1 — MVP", "Vapi + n8n + Twilio + Google Calendar only. Manual onboarding.", "2-3 weeks", "1 paying groomer client"],
              ["Phase 2 — Self-Serve", "Web dashboard + onboarding wizard + Calendly + Cal.com integration", "3-4 weeks", "5 paying clients via self-serve"],
              ["Phase 3 — Stickiness", "Owner SMS control interface + multi-calendar support + reminder system", "2-3 weeks", "< 5% monthly churn"],
              ["Phase 4 — Scale", "Agency white-label, Stripe billing automation, analytics, Spanish language", "4-6 weeks", "$10K MRR"],
            ]}
          />
          <Sub title="Phase 1 MVP — Exact Build Order">
            <Bullet>1. Set up Vapi account → build groomer agent with hardcoded test prompt</Bullet>
            <Bullet>2. Buy Twilio number → point at Vapi webhook</Bullet>
            <Bullet>3. Build n8n workflow: Vapi end-of-call → parse → Google Calendar check → create event</Bullet>
            <Bullet>4. Add Twilio SMS node: owner alert + customer confirmation</Bullet>
            <Bullet>5. Test end-to-end with real call</Bullet>
            <Bullet>6. Manually onboard first groomer, charge $149/mo on Stripe</Bullet>
          </Sub>
          <Callout type="warn">Don't build the dashboard before you have a paying client. Do manual onboarding first — it will teach you exactly what to automate.</Callout>
        </Section>
        <div style={{ paddingTop: 32, borderTop: "1px solid #E2E8F0", color: "#94A3B8", fontSize: 12 }}>
          RingPaw AI — PRD v1.0 — March 2026 — Confidential
        </div>
      </div>
    </div>
  );
}
