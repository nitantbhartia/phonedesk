"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { readApiError } from "@/lib/client-api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  Clock,
  Save,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "@/components/ui/toast";

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

const TIME_OPTIONS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM",
];

interface HoursEntry {
  open: string;
  close: string;
  enabled: boolean;
}

interface GroomerEntry {
  id?: string;
  name: string;
  specialties: string;
}

function toTwelveHour(value: string) {
  if (value.includes("AM") || value.includes("PM")) return value;
  const [rawHour, minute] = value.split(":");
  const hour = Number(rawHour);
  if (hour === 0) return `12:${minute} AM`;
  if (hour < 12) return `${hour}:${minute} AM`;
  if (hour === 12) return `12:${minute} PM`;
  return `${hour - 12}:${minute} PM`;
}

function toTwentyFourHour(value: string) {
  if (!value.includes("AM") && !value.includes("PM")) return value;
  const [time, meridiem] = value.split(" ");
  const [rawHour, minute] = time.split(":");
  let hour = Number(rawHour);
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }
  return `${hour.toString().padStart(2, "0")}:${minute}`;
}

const DEFAULT_HOURS: Record<string, HoursEntry> = {
  "Mon - Fri": { open: "9:00 AM", close: "5:00 PM", enabled: true },
  Saturday: { open: "10:00 AM", close: "2:00 PM", enabled: true },
  Sunday: { open: "9:00 AM", close: "5:00 PM", enabled: false },
};

function savedHoursToForm(saved: Record<string, { open: string; close: string }> | null): Record<string, HoursEntry> {
  if (!saved) return { ...DEFAULT_HOURS };
  const weekdays = ["mon", "tue", "wed", "thu", "fri"];
  const hasWeekday = weekdays.some((d) => d in saved);
  if (hasWeekday) {
    const first = saved[weekdays.find((d) => d in saved)!];
    return {
      "Mon - Fri": {
        open: toTwelveHour(first.open),
        close: toTwelveHour(first.close),
        enabled: true,
      },
      Saturday: saved.sat
        ? { open: toTwelveHour(saved.sat.open), close: toTwelveHour(saved.sat.close), enabled: true }
        : { ...DEFAULT_HOURS.Saturday, enabled: false },
      Sunday: saved.sun
        ? { open: toTwelveHour(saved.sun.open), close: toTwelveHour(saved.sun.close), enabled: true }
        : { ...DEFAULT_HOURS.Sunday, enabled: false },
    };
  }
  return { ...DEFAULT_HOURS };
}

function formHoursToSaved(form: Record<string, HoursEntry>): Record<string, { open: string; close: string }> {
  const result: Record<string, { open: string; close: string }> = {};
  const mf = form["Mon - Fri"];
  if (mf.enabled) {
    for (const d of ["mon", "tue", "wed", "thu", "fri"]) {
      result[d] = { open: toTwentyFourHour(mf.open), close: toTwentyFourHour(mf.close) };
    }
  }
  const sat = form.Saturday;
  if (sat.enabled) {
    result.sat = { open: toTwentyFourHour(sat.open), close: toTwentyFourHour(sat.close) };
  }
  const sun = form.Sunday;
  if (sun.enabled) {
    result.sun = { open: toTwentyFourHour(sun.open), close: toTwentyFourHour(sun.close) };
  }
  return result;
}

export default function BusinessProfilePage() {
  const { status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; message: string } | null>(null);

  // Business fields
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [hours, setHours] = useState<Record<string, HoursEntry>>({ ...DEFAULT_HOURS });

  // Groomers
  const [groomers, setGroomers] = useState<GroomerEntry[]>([]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchBusiness();
  }, [status, router]);

  async function fetchBusiness() {
    setFetchError("");
    try {
      const [profileRes, groomersRes] = await Promise.all([
        fetch("/api/business/profile"),
        fetch("/api/business/groomers"),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data.business) {
          setName(data.business.name || "");
          setOwnerName(data.business.ownerName || "");
          setPhone(data.business.phone || "");
          setAddress(data.business.address || "");
          setCity(data.business.city || "");
          setState(data.business.state || "");
          setTimezone(data.business.timezone || "America/Los_Angeles");
          setHours(savedHoursToForm(data.business.businessHours));
        }
      } else {
        setFetchError(await readApiError(profileRes, "Failed to load profile data."));
      }
      if (groomersRes.ok) {
        const data = await groomersRes.json();
        if (data.groomers?.length > 0) {
          setGroomers(
            data.groomers.map((g: { id: string; name: string; specialties: string[] }) => ({
              id: g.id,
              name: g.name,
              specialties: g.specialties?.join(", ") || "",
            }))
          );
        }
      } else {
        setFetchError((current) => current || "Failed to load groomers.");
      }
    } catch {
      setFetchError("Failed to load profile data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!name.trim() || !ownerName.trim()) {
      const message = "Business name and owner name are required.";
      setSaveStatus({ ok: false, message });
      toast.error(message);
      return;
    }

    setSaving(true);
    setSaveStatus(null);
    try {
      const [profileRes, groomersRes] = await Promise.all([
        fetch("/api/business/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            ownerName,
            phone,
            address,
            city,
            state,
            timezone,
            businessHours: formHoursToSaved(hours),
          }),
        }),
        fetch("/api/business/groomers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groomers: groomers
              .filter((g) => g.name.trim())
              .map((g) => ({
                id: g.id,
                name: g.name.trim(),
                specialties: g.specialties
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })),
          }),
        }),
      ]);

      const profileData = await profileRes.json().catch(() => ({}));
      const groomersData = await groomersRes.json().catch(() => ({}));

      if (!profileRes.ok) {
        setSaveStatus({ ok: false, message: profileData.error || "Failed to save profile" });
      } else if (!groomersRes.ok) {
        setSaveStatus({ ok: false, message: groomersData.error || "Profile saved but groomers failed" });
      } else {
        setSaveStatus({ ok: true, message: "Business profile saved" + (profileData.synced ? " and synced to voice agent" : "") });
        // Refresh groomers to get server-assigned IDs
        if (groomersData.groomers) {
          setGroomers(
            groomersData.groomers.map((g: { id: string; name: string; specialties: string[] }) => ({
              id: g.id,
              name: g.name,
              specialties: g.specialties?.join(", ") || "",
            }))
          );
        }
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
      {fetchError && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="flex-1 text-sm text-red-700 font-medium">{fetchError}</p>
          <button
            onClick={() => void fetchBusiness()}
            className="text-red-700 hover:text-red-900 text-xs font-bold"
          >
            Retry
          </button>
          <button onClick={() => setFetchError("")} className="text-red-400 hover:text-red-600 text-xs font-bold">Dismiss</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Business Profile</h1>
          <p className="text-muted-foreground">
            Update your business details. Changes sync to your AI receptionist automatically.
          </p>
        </div>
        <Button onClick={saveProfile} disabled={saving} className="w-full sm:w-auto">
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

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Business Information
          </CardTitle>
          <CardDescription>
            Core details about your business. The AI uses these to answer caller questions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Business Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paws & Claws Grooming" />
            </div>
            <div className="space-y-2">
              <Label>Owner Name</Label>
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Jane Smith" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Street Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main Street" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="San Francisco" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Business Hours
          </CardTitle>
          <CardDescription>
            Set your operating hours. The AI tells callers these when asked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(hours).map(([label, entry]) => (
            <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 sm:w-40">
                <Switch
                  checked={entry.enabled}
                  onCheckedChange={(checked) =>
                    setHours({ ...hours, [label]: { ...entry, enabled: checked } })
                  }
                />
                <Label className="font-medium">{label}</Label>
              </div>
              {entry.enabled && (
                <div className="flex items-center gap-2 ml-8 sm:ml-0">
                  <Select
                    value={entry.open}
                    onValueChange={(v) =>
                      setHours({ ...hours, [label]: { ...entry, open: v } })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">to</span>
                  <Select
                    value={entry.close}
                    onValueChange={(v) =>
                      setHours({ ...hours, [label]: { ...entry, close: v } })
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!entry.enabled && (
                <span className="text-sm text-muted-foreground ml-8 sm:ml-0">Closed</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Groomers / Team */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Groomers
          </CardTitle>
          <CardDescription>
            Add your groomers so callers can request a specific person. The AI will offer them as options.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {groomers.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No groomers added yet. Add your team members below.
            </p>
          )}
          {groomers.map((groomer, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label>Name</Label>
                <Input
                  value={groomer.name}
                  onChange={(e) => {
                    const updated = [...groomers];
                    updated[i] = { ...groomer, name: e.target.value };
                    setGroomers(updated);
                  }}
                  placeholder="Sarah"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label>Specialties (comma-separated)</Label>
                <Input
                  value={groomer.specialties}
                  onChange={(e) => {
                    const updated = [...groomers];
                    updated[i] = { ...groomer, specialties: e.target.value };
                    setGroomers(updated);
                  }}
                  placeholder="doodles, hand stripping, cats"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setGroomers(groomers.filter((_, j) => j !== i))}
                className="shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() => setGroomers([...groomers, { name: "", specialties: "" }])}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Groomer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
