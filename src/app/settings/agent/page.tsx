"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { InfoIcon } from "@/components/ui/info-icon";
import {
  Bot,
  Volume2,
  MessageSquare,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  Mic,
} from "lucide-react";

interface AgentPersonality {
  tone: string;
  style: string;
  language: string;
  customInstructions: string;
}

interface BusinessData {
  id: string;
  name: string;
  ownerName: string;
  bookingMode: string;
  isActive: boolean;
  services: Array<{
    id: string;
    name: string;
    price: number;
    duration: number;
    isActive: boolean;
  }>;
  retellConfig: {
    greeting: string;
    voiceId: string;
    isActive: boolean;
    personality: AgentPersonality | null;
  } | null;
}

const VOICE_OPTIONS = [
  { id: "11labs-Adrian", label: "Adrian", gender: "Male", accent: "American", desc: "Warm and professional" },
  { id: "11labs-Myra", label: "Myra", gender: "Female", accent: "American", desc: "Friendly and clear" },
  { id: "11labs-Josh", label: "Josh", gender: "Male", accent: "American", desc: "Casual and upbeat" },
  { id: "11labs-Dorothy", label: "Dorothy", gender: "Female", accent: "British", desc: "Elegant and refined" },
  { id: "11labs-Adam", label: "Adam", gender: "Male", accent: "American", desc: "Deep and authoritative" },
  { id: "11labs-Rachel", label: "Rachel", gender: "Female", accent: "American", desc: "Warm and conversational" },
  { id: "11labs-Antoni", label: "Antoni", gender: "Male", accent: "American", desc: "Young and energetic" },
  { id: "11labs-Bella", label: "Bella", gender: "Female", accent: "American", desc: "Soft and soothing" },
];

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly", desc: "Warm, approachable, like your favorite neighbor", icon: "😊" },
  { value: "professional", label: "Professional", desc: "Polished and courteous, all business", icon: "👔" },
  { value: "bubbly", label: "Bubbly", desc: "Enthusiastic and energetic, full of excitement", icon: "✨" },
  { value: "calm", label: "Calm", desc: "Soothing and reassuring, great for anxious pet parents", icon: "🧘" },
];

const STYLE_OPTIONS = [
  { value: "concise", label: "Concise", desc: "Brief and to the point" },
  { value: "conversational", label: "Conversational", desc: "Natural back-and-forth, like chatting" },
  { value: "detailed", label: "Detailed", desc: "Thorough with proactive info" },
];

export default function AgentSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Form state
  const [greeting, setGreeting] = useState("");
  const [bookingMode, setBookingMode] = useState("SOFT");
  const [isActive, setIsActive] = useState(true);
  const [voiceId, setVoiceId] = useState("11labs-Adrian");
  const [tone, setTone] = useState("friendly");
  const [style, setStyle] = useState("conversational");
  const [language, setLanguage] = useState("casual");
  const [customInstructions, setCustomInstructions] = useState("");
  const [services, setServices] = useState<
    Array<{ id?: string; name: string; price: string; duration: string }>
  >([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchBusiness();
  }, [status, router]);

  async function fetchBusiness() {
    try {
      const res = await fetch("/api/business/profile");
      if (res.ok) {
        const data = await res.json();
        if (data.business) {
          setBusiness(data.business);
          setGreeting(data.business.retellConfig?.greeting || "");
          setBookingMode(data.business.bookingMode);
          setIsActive(data.business.isActive);
          setVoiceId(data.business.retellConfig?.voiceId || "11labs-Adrian");
          const p = data.business.retellConfig?.personality;
          if (p) {
            setTone(p.tone || "friendly");
            setStyle(p.style || "conversational");
            setLanguage(p.language || "casual");
            setCustomInstructions(p.customInstructions || "");
          }
          setServices(
            data.business.services.map(
              (s: { id: string; name: string; price: number; duration: number }) => ({
                id: s.id,
                name: s.name,
                price: s.price.toString(),
                duration: s.duration.toString(),
              })
            )
          );
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setSaveStatus(null);
    try {
      // Single API call to save everything and sync to Retell
      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: business?.name,
          ownerName: business?.ownerName,
          bookingMode,
          services: services.filter((s) => s.name.trim()),
          // Agent config fields — handled in the same request
          agentActive: isActive,
          voiceId,
          personality: { tone, style, language, customInstructions },
          greeting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveStatus({ ok: false, message: data.error || "Failed to save settings" });
      } else if (data.synced) {
        setSaveStatus({ ok: true, message: "Settings saved and synced to voice agent" });
      } else {
        setSaveStatus({ ok: true, message: "Settings saved" });
      }
    } catch (error) {
      console.error("Error saving:", error);
      setSaveStatus({ ok: false, message: "Network error — check your connection" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">AI Agent Settings</h1>
          <p className="text-muted-foreground">
            Configure how your AI receptionist handles calls.
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {saveStatus && (
        <div className={`p-3 rounded-lg text-sm ${
          saveStatus.ok
            ? "bg-green-50 text-green-800 border border-green-200"
            : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {saveStatus.message}
        </div>
      )}

      {/* Agent Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Agent Status
              </CardTitle>
              <CardDescription>
                Control whether your AI agent is actively taking calls.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isActive ? "success" : "warning"}>
                {isActive ? "Active - Booking" : "Paused - Messages Only"}
              </Badge>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Voice Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Agent Voice
          </CardTitle>
          <CardDescription>
            Choose the voice your AI receptionist uses on calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.id}
                onClick={() => setVoiceId(voice.id)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  voiceId === voice.id
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm">{voice.label}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full">
                    {voice.gender}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{voice.desc}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{voice.accent}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Personality & Tone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Personality & Tone
          </CardTitle>
          <CardDescription>
            Shape how your AI receptionist sounds and feels to callers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="inline-flex items-center gap-1.5">
              Conversation Tone
              <InfoIcon text="Shapes how your AI sounds to every caller. Friendly feels warm and upbeat, Professional is polished and efficient, Empathetic is gentle and patient. Pick what fits your brand." />
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTone(opt.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    tone === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="text-lg mb-1">{opt.icon}</div>
                  <div className="font-bold text-sm">{opt.label}</div>
                  <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5">
                Conversation Style
                <InfoIcon text="Controls how much the AI says in each turn. Concise keeps answers short and fast. Natural matches how people actually talk. Detailed gives thorough explanations — good if callers ask lots of follow-up questions." />
              </Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} — {opt.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="inline-flex items-center gap-1.5">
                Language Style
                <InfoIcon text="Casual uses contractions and everyday phrases (e.g. 'I'll get that booked for you!'). Formal avoids slang and is more polished (e.g. 'I will arrange that appointment.'). Most grooming clients prefer casual." />
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual — Everyday language, contractions</SelectItem>
                  <SelectItem value="formal">Formal — Polite, no slang or contractions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="inline-flex items-center gap-1.5">
              Custom Instructions (optional)
              <InfoIcon text="Rules injected into every call. Use this to handle special cases: 'Always mention we offer free nail trims with full grooms' or 'We only groom dogs, not cats.' Keep instructions clear and specific." />
            </Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Always mention we offer free nail trims with full grooms. If asked about cats, say we only groom dogs."
            />
            <p className="text-xs text-muted-foreground">
              Add specific instructions for your AI. These get included in every call.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Greeting */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Opening Greeting
          </CardTitle>
          <CardDescription>
            The first thing callers hear when the AI picks up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Hi! You've reached [Business Name]..."
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to use the auto-generated greeting based on your business name.
          </p>
        </CardContent>
      </Card>

      {/* Booking Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Mode</CardTitle>
          <CardDescription>
            Choose how the AI handles appointment bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={bookingMode} onValueChange={setBookingMode}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SOFT">
                Soft Book (hold for 2 hours)
              </SelectItem>
              <SelectItem value="HARD">
                Hard Book (confirm immediately)
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {bookingMode === "SOFT"
              ? "Soft booking holds the slot for 2 hours and sends the customer a confirmation link."
              : "Hard booking confirms the appointment immediately on your calendar."}
          </p>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services & Pricing</CardTitle>
          <CardDescription>
            The AI shares these with callers when asked about services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((service, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label className="inline-flex items-center gap-1.5">
                  Service
                  <InfoIcon text="The service name spoken to callers (e.g. 'Full Groom', 'Bath & Brush', 'Nail Trim'). Keep names short and recognizable — callers will hear exactly what you type here." />
                </Label>
                <Input
                  value={service.name}
                  onChange={(e) => {
                    const updated = [...services];
                    updated[i] = { ...service, name: e.target.value };
                    setServices(updated);
                  }}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 sm:w-24 sm:flex-none space-y-1">
                  <Label className="inline-flex items-center gap-1.5">
                    Price ($)
                    <InfoIcon text="Base price quoted to callers for this service. If you have breed- or size-specific pricing, set those overrides in the Pricing tab — this is the default fallback." />
                  </Label>
                  <Input
                    type="number"
                    value={service.price}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...service, price: e.target.value };
                      setServices(updated);
                    }}
                  />
                </div>
                <div className="flex-1 sm:w-28 sm:flex-none space-y-1">
                  <Label className="inline-flex items-center gap-1.5">
                    Duration (min)
                    <InfoIcon text="How long this service takes in minutes. The AI uses this to block the right amount of time on your calendar and avoid back-to-back conflicts." />
                  </Label>
                  <Input
                    type="number"
                    value={service.duration}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...service, duration: e.target.value };
                      setServices(updated);
                    }}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setServices(services.filter((_, j) => j !== i))}
                  disabled={services.length <= 1}
                  className="shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setServices([...services, { name: "", price: "", duration: "60" }])
            }
          >
            <Plus className="w-4 h-4 mr-2" /> Add Service
          </Button>
        </CardContent>
      </Card>

      {/* SMS Commands Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            SMS Command Reference
          </CardTitle>
          <CardDescription>
            You can manage your AI agent via text message. Send these commands to
            your RingPaw number.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { cmd: '"Block tomorrow"', desc: "Marks you unavailable all day" },
              { cmd: '"Block Thu 2-4pm"', desc: "Blocks a specific time slot" },
              { cmd: '"Add service: Puppy bath $45"', desc: "Adds a new service" },
              { cmd: '"Change hours to 9am-5pm Mon-Sat"', desc: "Updates bookable hours" },
              { cmd: '"Pause bookings"', desc: "Switch to message-taking mode" },
              { cmd: '"Resume bookings"', desc: "Return to full booking mode" },
              { cmd: '"Show today\'s schedule"', desc: "See today\'s appointments" },
              { cmd: '"Cancel [name] appt"', desc: "Cancel and notify customer" },
              { cmd: '"Price list"', desc: "View current services & pricing" },
            ].map((item) => (
              <div key={item.cmd} className="flex flex-col sm:flex-row gap-1 sm:gap-4 py-2 border-b last:border-0">
                <code className="text-primary font-medium sm:min-w-[280px]">
                  {item.cmd}
                </code>
                <span className="text-muted-foreground">{item.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
