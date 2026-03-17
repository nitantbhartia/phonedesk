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
import { InfoIcon } from "@/components/ui/info-icon";
import { toast } from "@/components/ui/toast";
import {
  Bot,
  Volume2,
  MessageSquare,
  Save,
  Plus,
  Trash2,
  ShieldCheck,
} from "lucide-react";

interface BusinessData {
  id: string;
  name: string;
  ownerName: string;
  bookingMode: string;
  vaccinePolicy: string;
  isActive: boolean;
  services: Array<{
    id: string;
    name: string;
    price: number;
    duration: number;
    isActive: boolean;
    isAddon: boolean;
  }>;
  retellConfig: {
    greeting: string;
    voiceId: string;
    isActive: boolean;
  } | null;
}

export default function AgentSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Form state
  const [greeting, setGreeting] = useState("");
  const [bookingMode, setBookingMode] = useState("SOFT");
  const [vaccinePolicy, setVaccinePolicy] = useState("OFF");
  const [isActive, setIsActive] = useState(true);
  const [services, setServices] = useState<
    Array<{ id?: string; name: string; price: string; duration: string; isAddon: boolean }>
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
          setVaccinePolicy(data.business.vaccinePolicy || "OFF");
          setIsActive(data.business.isActive);
          setServices(
            data.business.services.map(
              (s: { id: string; name: string; price: number; duration: number; isAddon: boolean }) => ({
                id: s.id,
                name: s.name,
                price: s.price.toString(),
                duration: s.duration.toString(),
                isAddon: Boolean(s.isAddon),
              })
            )
          );
        }
      }
    } catch {
      toast.error("Failed to load settings. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: business?.name,
          ownerName: business?.ownerName,
          bookingMode,
          vaccinePolicy,
          services: services.filter((s) => s.name.trim()),
          agentActive: isActive,
          greeting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save settings");
      } else {
        toast.success(data.synced ? "Saved and synced to voice agent" : "Settings saved");
        setLastSaved(new Date());
      }
    } catch {
      toast.error("Network error — check your connection");
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
            Manage your AI receptionist&apos;s greeting, services, and booking behavior. Changes sync to your live agent automatically.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {lastSaved && (
            <span className="text-xs text-muted-foreground">
              Saved {lastSaved.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <Button onClick={saveSettings} disabled={saving} className="w-full sm:w-auto">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

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

      {/* Opening Greeting */}
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
            onChange={(e) => setGreeting(e.target.value.slice(0, 300))}
            placeholder="Hi! You've reached [Business Name]..."
            maxLength={300}
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Leave blank to use the auto-generated greeting based on your business name.
            </p>
            <p className={`text-xs font-medium tabular-nums ${greeting.length > 260 ? "text-orange-500" : "text-muted-foreground/50"}`}>
              {greeting.length}/300
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Booking Mode */}
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

      {/* Vaccine Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Vaccine Policy
          </CardTitle>
          <CardDescription>
            Control whether Pip asks about rabies and Bordetella vaccination status during booking calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={vaccinePolicy} onValueChange={setVaccinePolicy}>
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFF">
                Off — don&apos;t ask about vaccines
              </SelectItem>
              <SelectItem value="FLAG_ONLY">
                Ask &amp; note, but always book
              </SelectItem>
              <SelectItem value="REQUIRE">
                Ask &amp; block if unvaccinated
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {vaccinePolicy === "OFF"
              ? "Pip won't ask about vaccines during calls. Vaccination is still collected on the intake form."
              : vaccinePolicy === "FLAG_ONLY"
                ? "Pip asks about rabies and Bordetella before booking. If the owner says no or is unsure, Pip books anyway and notes the status for your review."
                : "Pip asks about rabies and Bordetella before booking. If the owner says their dog isn't vaccinated, Pip will not book and will ask them to call back after getting updated."}
          </p>
        </CardContent>
      </Card>

      {/* Services */}
      <Card>
        <CardHeader>
          <CardTitle>Services & Pricing</CardTitle>
          <CardDescription>
            The AI shares these with callers when asked about services. Toggle &ldquo;Add-on&rdquo; to let the AI upsell that service to returning customers after confirming their primary booking.
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
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Add-on
                  </Label>
                  <Switch
                    checked={service.isAddon}
                    onCheckedChange={(checked) => {
                      const updated = [...services];
                      updated[i] = { ...service, isAddon: checked };
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
              setServices([...services, { name: "", price: "", duration: "60", isAddon: false }])
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
