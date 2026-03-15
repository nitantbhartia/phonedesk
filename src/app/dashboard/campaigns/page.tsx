"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type CampaignType =
  | "WIN_BACK"
  | "SEASONAL"
  | "CAPACITY_FILL"
  | "NEW_SERVICE"
  | "BIRTHDAY"
  | "MILESTONE";

type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENT" | "CANCELLED";

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  messageTemplate: string;
  sentAt: string | null;
  sentCount: number;
  replyCount: number;
  bookingsCount: number;
  createdAt: string;
}

interface Template {
  type: CampaignType;
  label: string;
  description: string;
  icon: string;
  defaultName: string;
  defaultMessage: string;
  color: string;
}

const TEMPLATES: Template[] = [
  {
    type: "WIN_BACK",
    label: "Win-Back",
    description: "Re-engage lapsed clients who haven't booked in a while",
    icon: "💌",
    defaultName: "Win-Back Campaign",
    defaultMessage:
      "Hey {customerName}! We miss {petName} at the salon. It's been a while — ready to book their next groom? Reply BOOK and we'll get you scheduled. 🐾",
    color: "bg-rose-50 border-rose-200",
  },
  {
    type: "SEASONAL",
    label: "Seasonal Promo",
    description: "Time-of-year promotions — shedding season, summer, holidays",
    icon: "🌸",
    defaultName: "Spring Shedding Campaign",
    defaultMessage:
      "Spring shedding season is here! 🌸 Time to get {petName} de-shed and looking fresh. Book now before slots fill up — reply BOOK to schedule!",
    color: "bg-green-50 border-green-200",
  },
  {
    type: "CAPACITY_FILL",
    label: "Capacity Fill",
    description: "Fill empty calendar slots when you have openings this week",
    icon: "📅",
    defaultName: "Open Slots This Week",
    defaultMessage:
      "Hi {customerName}! We have a few open spots this week — perfect timing to bring {petName} in for a fresh groom. Reply BOOK to grab a slot before they fill up! 🐶",
    color: "bg-blue-50 border-blue-200",
  },
  {
    type: "NEW_SERVICE",
    label: "New Service",
    description: "Announce a new offering to your entire client base",
    icon: "✨",
    defaultName: "New Service Announcement",
    defaultMessage:
      "Exciting news, {customerName}! We just added a new service we think {petName} would love. Reply INFO for details or BOOK to schedule!",
    color: "bg-purple-50 border-purple-200",
  },
  {
    type: "BIRTHDAY",
    label: "Pet Birthday",
    description: "Celebrate your clients' pets with a birthday greeting",
    icon: "🎂",
    defaultName: "Pet Birthday Greeting",
    defaultMessage:
      "Happy Birthday to {petName}! 🎂🐾 Wishing them a tail-wagging day — treat them to a birthday groom! Reply BOOK to schedule a special appointment.",
    color: "bg-yellow-50 border-yellow-200",
  },
  {
    type: "MILESTONE",
    label: "Milestone",
    description: "Celebrate loyalty milestones like 5th or 10th visit",
    icon: "🏆",
    defaultName: "Loyalty Milestone",
    defaultMessage:
      "Thank you, {customerName}! {petName} has hit a grooming milestone with us — we're so grateful for your loyalty! As a thank-you, mention this text for $10 off your next visit. 🐾",
    color: "bg-amber-50 border-amber-200",
  },
];

const STATUS_BADGE: Record<CampaignStatus, { label: string; class: string }> = {
  DRAFT: { label: "Draft", class: "bg-gray-100 text-gray-600" },
  SCHEDULED: { label: "Scheduled", class: "bg-blue-100 text-blue-700" },
  SENT: { label: "Sent", class: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Cancelled", class: "bg-red-100 text-red-600" },
};

const TYPE_LABELS: Record<CampaignType, string> = {
  WIN_BACK: "Win-Back",
  SEASONAL: "Seasonal",
  CAPACITY_FILL: "Capacity Fill",
  NEW_SERVICE: "New Service",
  BIRTHDAY: "Birthday",
  MILESTONE: "Milestone",
};

export default function CampaignsPage() {
  const { status } = useSession();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Preview / send state
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sentCount: number; totalRecipients: number } | null>(null);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (status === "authenticated") fetchCampaigns();
  }, [status, router]);

  async function fetchCampaigns() {
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    }
    setLoading(false);
  }

  function openBuilder(template: Template) {
    setSelectedTemplate(template);
    setCampaignName(template.defaultName);
    setMessageText(template.defaultMessage);
    setSaveError("");
    setBuilderOpen(true);
  }

  async function saveCampaign() {
    if (!selectedTemplate) return;
    setSaving(true);
    setSaveError("");
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        type: selectedTemplate.type,
        messageTemplate: messageText,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setCampaigns((prev) => [data.campaign, ...prev]);
      setBuilderOpen(false);
    } else {
      setSaveError("Failed to save campaign. Please try again.");
    }
    setSaving(false);
  }

  async function openPreview(campaign: Campaign) {
    setPreviewCampaign(campaign);
    setRecipientCount(null);
    setSendResult(null);
    setSendError("");
    const res = await fetch(`/api/campaigns/${campaign.id}/preview`);
    if (res.ok) {
      const data = await res.json();
      setRecipientCount(data.recipientCount);
    }
  }

  async function sendCampaign() {
    if (!previewCampaign) return;
    setSending(true);
    setSendError("");
    const res = await fetch(`/api/campaigns/${previewCampaign.id}/send`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      setSendResult({ sentCount: data.sentCount, totalRecipients: data.totalRecipients });
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === previewCampaign.id
            ? { ...c, status: "SENT", sentAt: new Date().toISOString(), sentCount: data.sentCount }
            : c
        )
      );
    } else {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "Failed to send campaign.");
    }
    setSending(false);
  }

  async function deleteCampaign(id: string) {
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-white/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-white/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-paw-brown">Marketing Campaigns</h1>
          <p className="text-paw-brown/60 font-medium mt-1">
            Send targeted SMS campaigns to your customer base
          </p>
        </div>
      </div>

      {/* Template Gallery */}
      <div>
        <h2 className="text-lg font-bold text-paw-brown mb-4">Campaign Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TEMPLATES.map((tpl) => (
            <div
              key={tpl.type}
              className={`border-2 rounded-2xl p-5 ${tpl.color} hover:shadow-md transition-all cursor-pointer group`}
              onClick={() => openBuilder(tpl)}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{tpl.icon}</span>
                <span className="text-xs font-bold text-paw-brown/40 uppercase tracking-wider">
                  {tpl.label}
                </span>
              </div>
              <h3 className="font-bold text-paw-brown text-base">{tpl.label}</h3>
              <p className="text-sm text-paw-brown/60 mt-1 leading-snug">{tpl.description}</p>
              <button className="mt-3 text-xs font-bold text-paw-orange group-hover:underline">
                Use template →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Past Campaigns */}
      <div>
        <h2 className="text-lg font-bold text-paw-brown mb-4">Your Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-white/50 shadow-card text-center py-14">
            <p className="text-4xl mb-3">📣</p>
            <p className="font-bold text-paw-brown">No campaigns yet</p>
            <p className="text-sm text-paw-brown/50 mt-1">
              Pick a template above to create your first campaign
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-card border border-white/50 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest border-b border-gray-50 bg-paw-cream/30">
                  <th className="px-6 py-3">Campaign</th>
                  <th className="px-6 py-3 hidden sm:table-cell">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 hidden md:table-cell">Sent</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-paw-sky/10 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-paw-brown text-sm">{c.name}</p>
                      <p className="text-xs text-paw-brown/40 mt-0.5 truncate max-w-xs">
                        {c.messageTemplate.slice(0, 60)}…
                      </p>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className="text-xs font-bold text-paw-brown/60">
                        {TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_BADGE[c.status].class}`}
                      >
                        {STATUS_BADGE[c.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-sm text-paw-brown/60">
                      {c.status === "SENT" ? (
                        <span>
                          {c.sentCount} recipients
                          {c.sentAt && (
                            <span className="text-paw-brown/40 ml-1">
                              · {new Date(c.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {c.status === "DRAFT" && (
                          <button
                            onClick={() => openPreview(c)}
                            className="px-3 py-1.5 bg-paw-orange text-white text-xs font-bold rounded-xl hover:bg-paw-orange/80 transition-colors"
                          >
                            Send
                          </button>
                        )}
                        {c.status === "DRAFT" && (
                          <button
                            onClick={() => deleteCampaign(c.id)}
                            className="px-3 py-1.5 border border-gray-200 text-xs font-bold rounded-xl text-paw-brown/50 hover:border-red-200 hover:text-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                        {c.status === "SENT" && (
                          <span className="text-xs text-green-600 font-bold">
                            ✓ Delivered
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Builder Modal */}
      {builderOpen && selectedTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setBuilderOpen(false)}
        >
          <div
            className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-paw-brown">{selectedTemplate.label} Campaign</h3>
                  <p className="text-xs text-paw-brown/50">{selectedTemplate.description}</p>
                </div>
              </div>
              <button
                onClick={() => setBuilderOpen(false)}
                className="text-paw-brown/30 hover:text-paw-brown transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase tracking-wider mb-1.5">
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium text-paw-brown focus:outline-none focus:ring-2 focus:ring-paw-orange/30"
                  placeholder="e.g. Spring Win-Back 2025"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase tracking-wider mb-1.5">
                  Message
                </label>
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-paw-brown focus:outline-none focus:ring-2 focus:ring-paw-orange/30 resize-none"
                />
                <p className="text-xs text-paw-brown/40 mt-1">
                  Use <code className="bg-gray-100 px-1 rounded">{"{customerName}"}</code> and{" "}
                  <code className="bg-gray-100 px-1 rounded">{"{petName}"}</code> for personalization.
                  ({messageText.length} chars)
                </p>
              </div>

              {saveError && (
                <p className="text-sm text-red-600 font-medium">{saveError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setBuilderOpen(false)}
                  className="flex-1 py-3 rounded-2xl border-2 border-gray-100 font-bold text-paw-brown hover:bg-paw-sky transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCampaign}
                  disabled={saving || !campaignName.trim() || !messageText.trim()}
                  className="flex-1 py-3 rounded-2xl bg-paw-brown text-paw-cream font-bold hover:bg-opacity-90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Campaign"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview / Send Modal */}
      {previewCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => !sending && setPreviewCampaign(null)}
        >
          <div
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-paw-brown">Send Campaign</h3>
              {!sending && (
                <button
                  onClick={() => setPreviewCampaign(null)}
                  className="text-paw-brown/30 hover:text-paw-brown"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {sendResult ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-paw-brown mb-1">Campaign Sent!</p>
                <p className="text-paw-brown/60">
                  Delivered to <strong>{sendResult.sentCount}</strong> of {sendResult.totalRecipients} recipients
                </p>
                <button
                  onClick={() => setPreviewCampaign(null)}
                  className="mt-6 w-full py-3 bg-paw-brown text-paw-cream rounded-2xl font-bold hover:bg-opacity-90 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-paw-sky/40 rounded-2xl p-4">
                  <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-1.5">
                    Message Preview
                  </p>
                  <p className="text-sm text-paw-brown leading-relaxed">
                    {previewCampaign.messageTemplate
                      .replace(/{customerName}/g, "Sarah")
                      .replace(/{petName}/g, "Biscuit")}
                  </p>
                </div>

                <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-4">
                  <div>
                    <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">
                      Estimated Recipients
                    </p>
                    <p className="text-2xl font-extrabold text-paw-brown mt-0.5">
                      {recipientCount === null ? (
                        <span className="animate-pulse text-paw-brown/30">…</span>
                      ) : (
                        recipientCount
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-paw-brown/40">
                      Excludes opted-out customers
                    </p>
                  </div>
                </div>

                {sendError && (
                  <p className="text-sm text-red-600 font-medium">{sendError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setPreviewCampaign(null)}
                    disabled={sending}
                    className="flex-1 py-3 rounded-2xl border-2 border-gray-100 font-bold text-paw-brown hover:bg-paw-sky transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendCampaign}
                    disabled={sending || recipientCount === 0}
                    className="flex-1 py-3 rounded-2xl bg-paw-orange text-white font-bold hover:bg-paw-orange/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Sending…
                      </>
                    ) : (
                      `Send to ${recipientCount ?? "…"} customers`
                    )}
                  </button>
                </div>

                <p className="text-xs text-center text-paw-brown/40">
                  This will immediately send SMS messages. Opt-out replies are tracked automatically.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
