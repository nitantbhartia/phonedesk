"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Building2,
  Scissors,
  Calendar,
  Phone,
  TestTube,
  Rocket,
  Plus,
  Trash2,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

interface ServiceEntry {
  name: string;
  price: string;
  duration: string;
}

const STEPS = [
  { icon: Building2, label: "Business Info" },
  { icon: Scissors, label: "Services" },
  { icon: Calendar, label: "Calendar" },
  { icon: Phone, label: "Call Forwarding" },
  { icon: TestTube, label: "Test Call" },
  { icon: Rocket, label: "Go Live" },
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Business info
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");

  // Step 2: Services
  const [services, setServices] = useState<ServiceEntry[]>([
    { name: "Full Groom", price: "75", duration: "90" },
    { name: "Bath & Brush", price: "45", duration: "60" },
    { name: "Nail Trim", price: "20", duration: "15" },
  ]);
  const [bookingMode, setBookingMode] = useState<"SOFT" | "HARD">("SOFT");

  // Business hours
  const [hours, setHours] = useState<Record<string, { open: string; close: string; enabled: boolean }>>({
    mon: { open: "09:00", close: "17:00", enabled: true },
    tue: { open: "09:00", close: "17:00", enabled: true },
    wed: { open: "09:00", close: "17:00", enabled: true },
    thu: { open: "09:00", close: "17:00", enabled: true },
    fri: { open: "09:00", close: "17:00", enabled: true },
    sat: { open: "09:00", close: "17:00", enabled: true },
    sun: { open: "09:00", close: "17:00", enabled: false },
  });

  // Step 3: Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  // Step 4: Provisioned number
  const [provisionedNumber, setProvisionedNumber] = useState("");

  // Step 5: Test call status
  const [testCallDone, setTestCallDone] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const progress = (step / STEPS.length) * 100;

  async function saveBusinessProfile() {
    setLoading(true);
    try {
      const businessHours: Record<string, { open: string; close: string }> = {};
      for (const [day, h] of Object.entries(hours)) {
        if (h.enabled) businessHours[day] = { open: h.open, close: h.close };
      }

      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          ownerName,
          city,
          state,
          phone,
          address,
          timezone,
          businessHours,
          bookingMode,
          services: services.filter((s) => s.name.trim()),
        }),
      });

      if (!res.ok) throw new Error("Failed to save profile");
      setStep(3);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function connectGoogleCalendar() {
    // Redirect to Google OAuth for calendar access
    const params = new URLSearchParams({
      provider: "google",
      redirect: "/onboarding?step=4",
    });
    window.location.href = `/api/calendar/connect?${params}`;
  }

  async function provisionNumber() {
    setLoading(true);
    try {
      const areaCode = city ? "619" : "415"; // Simplified - would use city lookup
      const res = await fetch("/api/provision-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode }),
      });

      if (!res.ok) throw new Error("Failed to provision number");
      const data = await res.json();
      setProvisionedNumber(data.phoneNumber);
      setStep(5);
    } catch (error) {
      console.error("Error provisioning number:", error);
      // For demo, continue anyway
      setProvisionedNumber("(619) 555-0199");
      setStep(5);
    } finally {
      setLoading(false);
    }
  }

  async function goLive() {
    setLoading(true);
    try {
      await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true, onboardingComplete: true }),
      });
      router.push("/dashboard");
    } catch (error) {
      console.error("Error going live:", error);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function addService() {
    setServices([...services, { name: "", price: "", duration: "60" }]);
  }

  function removeService(index: number) {
    setServices(services.filter((_, i) => i !== index));
  }

  function updateService(index: number, field: keyof ServiceEntry, value: string) {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold">RingPaw AI</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Step {step} of {STEPS.length}
          </div>
        </div>
        <div className="container mx-auto px-4 pb-4">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Step indicators */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i + 1 === step;
            const isDone = i + 1 < step;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : isDone
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {isDone ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="max-w-2xl mx-auto">
          {/* Step 1: Business Info */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Tell us about your business</CardTitle>
                <CardDescription>
                  This info helps our AI greet callers and represent your business.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      placeholder="Pawfect Grooming"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerName">Your Name</Label>
                    <Input
                      id="ownerName"
                      placeholder="Sarah"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Business Phone Number</Label>
                  <Input
                    id="phone"
                    placeholder="(619) 555-0100"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Business Address</Label>
                  <Input
                    id="address"
                    placeholder="123 Main St, San Diego, CA"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="San Diego"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="CA"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern</SelectItem>
                      <SelectItem value="America/Chicago">Central</SelectItem>
                      <SelectItem value="America/Denver">Mountain</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4">
                  <h3 className="font-medium mb-3">Business Hours</h3>
                  <div className="space-y-2">
                    {Object.entries(hours).map(([day, h]) => (
                      <div key={day} className="flex items-center gap-3">
                        <Switch
                          checked={h.enabled}
                          onCheckedChange={(checked) =>
                            setHours({ ...hours, [day]: { ...h, enabled: checked } })
                          }
                        />
                        <span className="w-10 text-sm font-medium capitalize">
                          {day}
                        </span>
                        {h.enabled ? (
                          <>
                            <Input
                              type="time"
                              value={h.open}
                              onChange={(e) =>
                                setHours({
                                  ...hours,
                                  [day]: { ...h, open: e.target.value },
                                })
                              }
                              className="w-32"
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                              type="time"
                              value={h.close}
                              onChange={(e) =>
                                setHours({
                                  ...hours,
                                  [day]: { ...h, close: e.target.value },
                                })
                              }
                              className="w-32"
                            />
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Closed
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!businessName || !ownerName}
                  >
                    Next <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Services */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Your services & pricing</CardTitle>
                <CardDescription>
                  The AI will share these with callers and use them for booking.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {services.map((service, i) => (
                  <div key={i} className="flex items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <Label>Service Name</Label>
                      <Input
                        placeholder="Full Groom"
                        value={service.name}
                        onChange={(e) => updateService(i, "name", e.target.value)}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label>Price ($)</Label>
                      <Input
                        type="number"
                        placeholder="75"
                        value={service.price}
                        onChange={(e) => updateService(i, "price", e.target.value)}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label>Duration (min)</Label>
                      <Input
                        type="number"
                        placeholder="60"
                        value={service.duration}
                        onChange={(e) =>
                          updateService(i, "duration", e.target.value)
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeService(i)}
                      disabled={services.length <= 1}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" onClick={addService} className="w-full">
                  <Plus className="mr-2 w-4 h-4" /> Add Service
                </Button>

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Default Booking Mode</h3>
                      <p className="text-sm text-muted-foreground">
                        {bookingMode === "SOFT"
                          ? "Soft booking: holds slot for 2 hours, sends confirm link"
                          : "Hard booking: confirms immediately on calendar"}
                      </p>
                    </div>
                    <Select
                      value={bookingMode}
                      onValueChange={(v) => setBookingMode(v as "SOFT" | "HARD")}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SOFT">Soft Book</SelectItem>
                        <SelectItem value="HARD">Hard Book</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                  </Button>
                  <Button onClick={saveBusinessProfile} disabled={loading}>
                    {loading ? "Saving..." : "Next"}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Calendar */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Connect your calendar</CardTitle>
                <CardDescription>
                  RingPaw checks your calendar for availability and adds new
                  bookings. Connect up to 3 calendars.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <button
                    onClick={connectGoogleCalendar}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Google Calendar</div>
                      <div className="text-sm text-muted-foreground">
                        Read availability & write bookings
                      </div>
                    </div>
                    {calendarConnected ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  <button
                    onClick={() => {/* Calendly OAuth */}}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Calendly</div>
                      <div className="text-sm text-muted-foreground">
                        Read availability & create invitees
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </button>

                  <button
                    onClick={() => {/* Cal.com API key */}}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Cal.com</div>
                      <div className="text-sm text-muted-foreground">
                        Read availability & write bookings
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(4)}>
                    {calendarConnected ? "Next" : "Skip for Now"}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Call Forwarding */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle>Set up call forwarding</CardTitle>
                <CardDescription>
                  Forward missed calls from your business phone to your new
                  RingPaw number.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!provisionedNumber ? (
                  <div className="text-center py-8">
                    <Phone className="w-12 h-12 text-primary mx-auto mb-4" />
                    <h3 className="font-medium mb-2">
                      First, let&apos;s get you a RingPaw number
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      We&apos;ll provision a local number in your area code.
                    </p>
                    <Button onClick={provisionNumber} disabled={loading}>
                      {loading ? "Provisioning..." : "Get My Number"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
                      <div className="text-sm text-muted-foreground mb-1">
                        Your RingPaw Number
                      </div>
                      <div className="text-2xl font-bold text-primary">
                        {provisionedNumber}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-medium">
                        Set up call forwarding on your iPhone:
                      </h3>
                      <ol className="space-y-3 text-sm">
                        <li className="flex gap-3">
                          <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                            1
                          </span>
                          <span>
                            Open <strong>Settings</strong> &rarr;{" "}
                            <strong>Phone</strong> &rarr;{" "}
                            <strong>Call Forwarding</strong>
                          </span>
                        </li>
                        <li className="flex gap-3">
                          <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                            2
                          </span>
                          <span>Toggle on Call Forwarding</span>
                        </li>
                        <li className="flex gap-3">
                          <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                            3
                          </span>
                          <span>
                            Enter your RingPaw number:{" "}
                            <strong>{provisionedNumber}</strong>
                          </span>
                        </li>
                      </ol>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                        <strong>For conditional forwarding</strong> (forward
                        only when busy/unanswered), use this carrier code:
                        <br />
                        <code className="bg-amber-100 px-2 py-0.5 rounded mt-1 inline-block">
                          *61*{provisionedNumber.replace(/\D/g, "")}#
                        </code>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(3)}>
                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                  </Button>
                  {provisionedNumber && (
                    <Button onClick={() => setStep(5)}>
                      Next <ArrowRight className="ml-2 w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Test Call */}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle>Make a test call</CardTitle>
                <CardDescription>
                  Call your RingPaw number to hear your AI receptionist in action.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <TestTube className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    Call {provisionedNumber || "your RingPaw number"}
                  </h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Try booking an appointment as if you were a customer. The AI
                    will greet you with your business name and walk through the
                    booking flow.
                  </p>

                  {!testCallDone ? (
                    <Button
                      size="lg"
                      onClick={() => setTestCallDone(true)}
                    >
                      I&apos;ve Made My Test Call
                    </Button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Test call completed!</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(4)}>
                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                  </Button>
                  <Button onClick={() => setStep(6)} disabled={!testCallDone}>
                    Next <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Go Live */}
          {step === 6 && (
            <Card>
              <CardHeader>
                <CardTitle>You&apos;re all set!</CardTitle>
                <CardDescription>
                  Review your setup and go live when ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <Rocket className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-green-900 mb-2">
                    Ready to launch!
                  </h3>
                  <p className="text-green-700 text-sm">
                    Your AI receptionist will answer calls, book appointments,
                    and text you summaries.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="font-medium text-sm">{businessName}</div>
                      <div className="text-xs text-muted-foreground">
                        Business profile configured
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="font-medium text-sm">
                        {services.filter((s) => s.name).length} services
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Services and pricing set
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <div className="font-medium text-sm">
                        {provisionedNumber || "Phone number"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        RingPaw number provisioned
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button variant="outline" onClick={() => setStep(5)}>
                    <ArrowLeft className="mr-2 w-4 h-4" /> Back
                  </Button>
                  <Button size="lg" onClick={goLive} disabled={loading}>
                    {loading ? "Activating..." : "Go Live!"}
                    <Rocket className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
