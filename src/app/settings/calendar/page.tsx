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
import { Calendar, CheckCircle, ExternalLink, Trash2, Plus } from "lucide-react";

interface CalendarConnection {
  id: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
  calendarId: string | null;
  createdAt: string;
}

export default function CalendarSettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchConnections();
  }, [status, router]);

  async function fetchConnections() {
    try {
      const res = await fetch("/api/business/profile");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.business?.calendarConnections || []);
      }
    } catch (error) {
      console.error("Error fetching calendars:", error);
    } finally {
      setLoading(false);
    }
  }

  function connectCalendar(provider: string) {
    const params = new URLSearchParams({
      provider,
      redirect: "/settings/calendar",
    });
    window.location.href = `/api/calendar/connect?${params}`;
  }

  const providerNames: Record<string, string> = {
    GOOGLE: "Google Calendar",
    CALENDLY: "Calendly",
    CALCOM: "Cal.com",
  };

  const providerColors: Record<string, string> = {
    GOOGLE: "bg-red-100 text-red-600",
    CALENDLY: "bg-blue-100 text-blue-600",
    CALCOM: "bg-gray-100 text-gray-600",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calendar Settings</h1>
        <p className="text-muted-foreground">
          Connect calendars to check availability and book appointments.
        </p>
      </div>

      {/* Connected Calendars */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Calendars</CardTitle>
          <CardDescription>
            The AI checks all connected calendars for conflicts before offering
            time slots. New bookings go to the primary calendar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No calendars connected yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${providerColors[conn.provider] || "bg-gray-100"}`}
                  >
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {providerNames[conn.provider] || conn.provider}
                      </span>
                      {conn.isPrimary && (
                        <Badge variant="success">Primary</Badge>
                      )}
                      {conn.isActive ? (
                        <Badge variant="outline">Connected</Badge>
                      ) : (
                        <Badge variant="destructive">Disconnected</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {conn.calendarId || "Default calendar"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={conn.isActive} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>Add Calendar</CardTitle>
          <CardDescription>Connect up to 3 calendars.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <button
              onClick={() => connectCalendar("google")}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
              disabled={connections.length >= 3}
            >
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Google Calendar</div>
                <div className="text-sm text-muted-foreground">
                  Read &amp; write via OAuth 2.0
                </div>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => connectCalendar("calendly")}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
              disabled={connections.length >= 3}
            >
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Calendly</div>
                <div className="text-sm text-muted-foreground">
                  Read &amp; write via OAuth
                </div>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => connectCalendar("calcom")}
              className="flex items-center gap-4 p-4 border rounded-lg hover:bg-slate-50 transition-colors text-left"
              disabled={connections.length >= 3}
            >
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium">Cal.com</div>
                <div className="text-sm text-muted-foreground">
                  Read &amp; write via API key
                </div>
              </div>
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
