"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ReviewsPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") {
      fetchConfig();
    }
  }, [authStatus, router]);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/reviews/config");
      if (res.ok) {
        const data = await res.json();
        setGoogleReviewUrl(data.googleReviewUrl || "");
      }
    } catch {
      // Non-critical: just start with empty field
    } finally {
      setLoading(false);
    }
  }

  async function saveConfig() {
    setSaveError("");
    try {
      const res = await fetch("/api/reviews/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleReviewUrl }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setSaveError("Failed to save. Please try again.");
      }
    } catch {
      setSaveError("Failed to save. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-white/50 rounded-3xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold text-paw-brown">Google Reviews</h1>
        <p className="text-paw-brown/60 font-medium mt-1">
          Automatically send a Google review request after each appointment. Paste your review link once and your AI handles the rest.
        </p>
      </div>

      {/* Setup */}
      <div className="bg-white rounded-3xl shadow-card border border-white p-8">
        <h2 className="font-bold text-paw-brown text-lg mb-4">Google Review Link</h2>
        <p className="text-sm text-paw-brown/60 mb-4">
          Paste your direct Google review link. Customers will receive an SMS 2 hours after pickup with this link.
        </p>
        <div className="flex gap-3">
          <input
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            placeholder="https://g.page/r/your-business/review"
            className="flex-1 px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
          />
          <button
            onClick={saveConfig}
            className="px-6 py-3 bg-paw-brown text-white rounded-xl font-bold text-sm shadow-soft hover:bg-opacity-90 transition-colors"
          >
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-sm text-red-600">{saveError}</p>}
      </div>

      {/* How it works */}
      <div className="bg-paw-brown rounded-4xl p-10 text-paw-cream relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-paw-amber/10 rounded-full blur-3xl" />
        <h3 className="text-xl font-bold text-paw-amber mb-6">How Review Automation Works</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">1</div>
            <h4 className="font-bold text-sm">Auto-Trigger</h4>
            <p className="text-xs text-white/60">
              2 hours after you mark a pet as &quot;Picked Up&quot;, the system sends a friendly review request SMS.
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">2</div>
            <h4 className="font-bold text-sm">Smart Throttling</h4>
            <p className="text-xs text-white/60">
              Each customer is only asked once every 90 days. No spam, no annoying repeat requests.
            </p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">3</div>
            <h4 className="font-bold text-sm">Direct Link</h4>
            <p className="text-xs text-white/60">
              Customers tap straight to the Google review box — no landing page, no friction. Maximum conversion.
            </p>
          </div>
        </div>
      </div>

      {/* Sample message preview */}
      <div className="bg-white rounded-3xl shadow-card border border-white p-8">
        <h2 className="font-bold text-paw-brown text-lg mb-4">Message Preview</h2>
        <div className="bg-paw-cream/50 rounded-2xl p-6 border border-paw-brown/5">
          <p className="text-sm text-paw-brown/80 leading-relaxed">
            So glad Buddy got pampered today at Your Business! If you have 30 seconds, a Google review would mean the world to us: <span className="text-paw-orange underline">[your review link]</span>
          </p>
        </div>
        <p className="text-xs text-paw-brown/40 mt-3">
          Sent automatically 2 hours after marking the pet as picked up
        </p>
      </div>
    </div>
  );
}
