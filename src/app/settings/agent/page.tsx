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
  MessageSquare,
  Save,
  ShieldCheck,
} from "lucide-react";

interface BusinessData {
  id: string;
  name: string;
  ownerName: string;
  bookingMode: string;
  vaccinePolicy: string;
  isActive: boolean;
}

export default function AgentSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Form state
  const [bookingMode, setBookingMode] = useState("SOFT");
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
          setBookingMode(data.business.bookingMode);
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
          inboundPath: "BOOKABLE_VOICEMAIL",
          vaccinePolicy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save settings");
      } else {
        const activeRes = await fetch("/api/business/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        });
        if (!activeRes.ok) {
          const activeData = await activeRes.json().catch(() => ({}));
          throw new Error(activeData.error || "Failed to update line status");
        }
        toast.success("Settings saved");
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
          <h1 className="font-display text-3xl tracking-tight text-ink">Call answering</h1>
          <p className="text-muted-foreground">
            RingPaw answers missed grooming calls and books real openings. Manage services from the <a href="/settings/pricing" className="underline underline-offset-2 font-medium">Services &amp; Pricing</a> page.
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
          <CardTitle>Missed-call booking line</CardTitle>
          <CardDescription>
            RingPaw uses your connected phone line to offer grooming services, book open times, and collect callback requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mt-2">
            Callers hear your shop name, then press 1 to book or 9 to leave a message.
          </p>
        </CardContent>
      </Card>

      {/* Line Status */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle>Line status</CardTitle>
              <CardDescription>
                Pause RingPaw if you need forwarded calls to stop being answered.
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

      {/* Booking Mode */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Mode</CardTitle>
          <CardDescription>
            Choose how RingPaw writes appointments.
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
