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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  Bot,
  Volume2,
  MessageSquare,
  Save,
  ShieldCheck,
} from "lucide-react";

interface BusinessData {
  id: string;
  name: string;
  ownerName: string;
  bookingMode: string;
  inboundPath: string;
  vaccinePolicy: string;
  isActive: boolean;
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
  const [inboundPath, setInboundPath] = useState("BOOKABLE_VOICEMAIL");
  const [vaccinePolicy, setVaccinePolicy] = useState("OFF");
  const [isActive, setIsActive] = useState(true);

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
          setInboundPath(data.business.inboundPath || "BOOKABLE_VOICEMAIL");
          setVaccinePolicy(data.business.vaccinePolicy || "OFF");
          setIsActive(data.business.isActive);
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
          inboundPath,
          vaccinePolicy,
          agentActive: isActive,
          greeting,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save settings");
      } else {
        toast.success(data.synced ? "Saved and synced" : "Settings saved");
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
          <h1 className="text-2xl font-bold">Call answering</h1>
          <p className="text-muted-foreground">
            Call Slot answers forwarded calls with keypad booking. Manage services from the <a href="/settings/pricing" className="underline underline-offset-2 font-medium">Services &amp; Pricing</a> page.
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

      <Card>
        <CardHeader>
          <CardTitle>Inbound path</CardTitle>
          <CardDescription>
            Bookable voicemail is the default. The older conversational path stays available but is not used for new shops.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={inboundPath} onValueChange={setInboundPath}>
            <SelectTrigger className="w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BOOKABLE_VOICEMAIL">
                Bookable voicemail (keypad)
              </SelectItem>
              <SelectItem value="RETELL_AGENT">
                Legacy conversational line
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {inboundPath === "BOOKABLE_VOICEMAIL"
              ? "Callers hear your shop name, then press 1 to book or 9 to leave a message."
              : "Keeps the previous conversational line. Do not use this for the Call Slot pilot."}
          </p>
        </CardContent>
      </Card>

      {/* Agent Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Line status
              </CardTitle>
              <CardDescription>
                Pause Call Slot if you need forwarded calls to stop being answered.
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
            The first thing callers hear when Call Slot picks up.
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
            Choose how Call Slot writes appointments.
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
            Control whether callers are asked about rabies and Bordetella vaccination status during booking calls.
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
              ? "Callers won't be asked about vaccines during the keypad flow. Vaccination is still collected on the intake form."
              : vaccinePolicy === "FLAG_ONLY"
                ? "Ask about rabies and Bordetella before booking. If they say no or are unsure, still book and note the status for your review."
                : "Ask about rabies and Bordetella before booking. If they say they aren't vaccinated, don't book and ask them to call back after getting updated."}
          </p>
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
            You can manage your shop by text. Send these commands to
            your Call Slot number.
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
