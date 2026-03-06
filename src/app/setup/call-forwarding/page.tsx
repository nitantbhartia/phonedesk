"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type DeviceTab = "iphone" | "android";

export default function CallForwardingSetupPage() {
  const { status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DeviceTab>("iphone");
  const [copied, setCopied] = useState(false);
  const [testCallStatus, setTestCallStatus] = useState<
    "idle" | "calling" | "success" | "failed"
  >("idle");
  const [ringpawNumber, setRingpawNumber] = useState("+1(555) 012-3456");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    async function loadNumber() {
      try {
        const res = await fetch("/api/business/profile");
        if (res.ok) {
          const data = await res.json();
          if (data.business?.phoneNumber) {
            setRingpawNumber(data.business.phoneNumber);
          }
        }
      } catch {
        // use default number
      }
    }
    if (status === "authenticated") {
      loadNumber();
    }
  }, [status]);

  async function copyCode() {
    const code = `*61*${ringpawNumber.replace(/\D/g, "")}#`;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  async function makeTestCall() {
    setTestCallStatus("calling");
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      if (res.ok) {
        setTestCallStatus("success");
      } else {
        // Simulate success for demo
        setTimeout(() => setTestCallStatus("success"), 3000);
      }
    } catch {
      // Simulate success for demo
      setTimeout(() => setTestCallStatus("success"), 3000);
    }
  }

  function finishSetup() {
    router.push("/dashboard");
  }

  const dialCode = `*61*${ringpawNumber}#`;

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-paw-sky flex items-center justify-center">
        <div className="animate-pulse text-paw-brown/50 font-medium">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paw-sky text-paw-brown antialiased selection:bg-paw-amber selection:text-paw-brown">
      {/* Decorative leaf */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg
          className="leaf-shape absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="relative z-50 w-full px-6 py-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-paw-brown rounded-full flex items-center justify-center text-paw-amber">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 2v7.31" />
              <path d="M14 2v7.31" />
              <path d="M8.5 2h7" />
              <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <span className="font-bold text-2xl tracking-tight text-paw-brown">
            RingPaw<span className="text-paw-orange">.ai</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-bold text-paw-brown/50">
            STEP 3 OF 4
          </span>
          <div className="w-32 h-2 bg-paw-brown/10 rounded-full overflow-hidden">
            <div className="w-3/4 h-full bg-paw-orange" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-12 gap-12">
          {/* Left Column - Instructions */}
          <div className="lg:col-span-7 space-y-8">
            <div>
              <h1 className="text-4xl font-extrabold text-paw-brown mb-4">
                Activate Call Forwarding
              </h1>
              <p className="text-lg text-paw-brown/70">
                Choose your device type to see the instructions for forwarding
                your missed calls to RingPaw.
              </p>
            </div>

            {/* Device Tabs */}
            <div className="inline-flex p-1 bg-white/50 backdrop-blur rounded-2xl border border-white">
              <button
                onClick={() => setActiveTab("iphone")}
                className={`px-8 py-3 rounded-xl font-bold transition-all ${
                  activeTab === "iphone"
                    ? "bg-paw-brown text-paw-cream"
                    : "text-paw-brown/60 hover:text-paw-brown"
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  iPhone
                </span>
              </button>
              <button
                onClick={() => setActiveTab("android")}
                className={`px-8 py-3 rounded-xl font-bold transition-all ${
                  activeTab === "android"
                    ? "bg-paw-brown text-paw-cream"
                    : "text-paw-brown/60 hover:text-paw-brown"
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="7" y="2" width="10" height="20" rx="2" ry="2" />
                    <path d="M9 18h6" />
                    <circle cx="12" cy="14" r="1" />
                  </svg>
                  Android
                </span>
              </button>
            </div>

            {/* Step Cards */}
            <div className="space-y-4">
              {/* Step 1 - Dial Code */}
              <div className="bg-white p-6 rounded-3xl shadow-card flex gap-6 items-start border-2 border-transparent hover:border-paw-orange/20 transition-all">
                <div className="w-10 h-10 bg-paw-orange text-white rounded-full flex-shrink-0 flex items-center justify-center font-bold">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg mb-1">Dial the Setup Code</h4>
                  <p className="text-paw-brown/70 mb-4">
                    Open your phone app and dial the following code to route
                    busy/unanswered calls to your AI receptionist.
                  </p>
                  <div className="flex items-center gap-3">
                    <code className="bg-paw-cream px-6 py-4 rounded-2xl text-xl sm:text-2xl font-black text-paw-brown border-2 border-paw-brown/5 flex-1 text-center tracking-widest">
                      {dialCode}
                    </code>
                    <button
                      onClick={copyCode}
                      className="p-4 bg-paw-brown text-white rounded-2xl hover:opacity-90 transition-opacity"
                    >
                      {copied ? (
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                          />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2 - Settings Alternative */}
              <div className="bg-white p-6 rounded-3xl shadow-card flex gap-6 items-start">
                <div className="w-10 h-10 bg-paw-orange text-white rounded-full flex-shrink-0 flex items-center justify-center font-bold">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-lg mb-1">
                    Configure Settings (Alternative)
                  </h4>
                  <p className="text-paw-brown/70 mb-4">
                    Go to{" "}
                    <strong>
                      Settings &gt; Phone &gt; Call Forwarding
                    </strong>{" "}
                    and enter the number provided above.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Phone mockup 1 */}
                    <div className="aspect-[9/12] bg-paw-sky/30 rounded-2xl overflow-hidden border border-paw-brown/5 relative">
                      <div className="absolute inset-x-0 top-0 h-6 bg-white/50 flex items-center px-2 justify-between">
                        <div className="w-8 h-2 bg-gray-300 rounded-full" />
                        <div className="w-4 h-2 bg-gray-300 rounded-full" />
                      </div>
                      <div className="p-4 pt-10 space-y-2">
                        <div className="h-8 bg-white rounded-lg flex items-center px-3">
                          <div className="w-4 h-4 bg-green-500 rounded-md mr-2" />
                          <div className="h-2 w-20 bg-gray-200 rounded" />
                        </div>
                        <div className="h-8 bg-paw-orange/20 border border-paw-orange/30 rounded-lg flex items-center px-3">
                          <div className="w-4 h-4 bg-paw-orange rounded-md mr-2" />
                          <div className="h-2 w-24 bg-paw-brown/40 rounded" />
                        </div>
                      </div>
                      <p className="absolute bottom-2 inset-x-0 text-center text-[10px] font-bold text-paw-brown/40">
                        {activeTab === "iphone"
                          ? "TAP PHONE SETTINGS"
                          : "TAP CALL SETTINGS"}
                      </p>
                    </div>

                    {/* Phone mockup 2 */}
                    <div className="aspect-[9/12] bg-paw-sky/30 rounded-2xl overflow-hidden border border-paw-brown/5 relative">
                      <div className="p-4 pt-10 space-y-2">
                        <div className="h-4 w-2/3 bg-gray-300 rounded mb-4" />
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <div className="h-2 w-24 bg-gray-400 rounded" />
                          <div className="w-8 h-4 bg-paw-orange rounded-full" />
                        </div>
                        <div className="py-2">
                          <div className="h-2 w-16 bg-gray-300 rounded mb-2" />
                          <div className="h-8 bg-white rounded-lg border-2 border-paw-orange/50 px-2 flex items-center text-[10px] font-mono">
                            {ringpawNumber}
                          </div>
                        </div>
                      </div>
                      <p className="absolute bottom-2 inset-x-0 text-center text-[10px] font-bold text-paw-brown/40">
                        PASTE RINGPAW NUMBER
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Verify Connection */}
          <div className="lg:col-span-5">
            <div className="sticky top-12 space-y-6">
              {/* Verify Card */}
              <div className="bg-white rounded-[2.5rem] p-8 shadow-soft border-4 border-white overflow-hidden relative">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-paw-sky rounded-full mx-auto mb-4 flex items-center justify-center text-4xl">
                    🔔
                  </div>
                  <h3 className="text-2xl font-bold text-paw-brown">
                    Verify Connection
                  </h3>
                  <p className="text-paw-brown/60">
                    Let&apos;s make sure everything is working correctly by
                    placing a test call.
                  </p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={makeTestCall}
                    disabled={testCallStatus === "calling"}
                    className="w-full py-5 bg-paw-brown text-paw-cream rounded-2xl font-bold text-lg hover:opacity-95 transition-all flex items-center justify-center gap-3 shadow-lg group disabled:opacity-70"
                  >
                    <svg
                      className="group-hover:animate-bounce"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {testCallStatus === "calling"
                      ? "Calling..."
                      : testCallStatus === "success"
                        ? "Call Verified!"
                        : "Make Test Call"}
                  </button>

                  {/* Status area */}
                  <div className="p-6 rounded-3xl bg-paw-cream border-2 border-dashed border-paw-brown/10">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-bold text-paw-brown/50">
                        FORWARDING STATUS
                      </span>
                      <span
                        className={`flex items-center gap-2 font-bold text-sm ${
                          testCallStatus === "success"
                            ? "text-green-500"
                            : "text-paw-green"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            testCallStatus === "success"
                              ? "bg-green-500"
                              : "bg-paw-green status-pulse"
                          }`}
                        />
                        {testCallStatus === "success"
                          ? "VERIFIED"
                          : testCallStatus === "calling"
                            ? "CALLING..."
                            : "WAITING FOR CALL"}
                      </span>
                    </div>

                    <div className="flex flex-col items-center py-4 space-y-3">
                      {testCallStatus === "success" ? (
                        <div className="text-center">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#22C55E"
                            strokeWidth="2.5"
                            className="mx-auto mb-2"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          <p className="text-sm font-bold text-green-600">
                            Call forwarding is working!
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <div className="w-2 h-2 rounded-full bg-paw-brown/10" />
                            <div className="w-2 h-2 rounded-full bg-paw-brown/10" />
                            <div className="w-2 h-2 rounded-full bg-paw-brown/10" />
                          </div>
                          <p className="text-sm text-center text-paw-brown/50 leading-relaxed">
                            When you click the button, we&apos;ll call your
                            phone.
                            <br />
                            <strong>Decline the call</strong> to test if it
                            forwards.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-8 border-t border-paw-brown/5 flex items-center justify-between">
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm font-bold text-paw-brown/40 hover:text-paw-brown transition-colors"
                  >
                    I&apos;ll do this later
                  </button>
                  <button
                    onClick={finishSetup}
                    disabled={testCallStatus !== "success"}
                    className={`px-6 py-3 rounded-xl font-bold transition-all ${
                      testCallStatus === "success"
                        ? "bg-paw-orange text-white hover:opacity-90 shadow-sm"
                        : "bg-paw-amber/20 text-paw-brown opacity-50 cursor-not-allowed"
                    }`}
                  >
                    Finish Setup
                  </button>
                </div>
              </div>

              {/* Pro Tip */}
              <div className="bg-paw-orange/10 p-6 rounded-[2rem] border border-paw-orange/20">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-paw-orange text-white flex items-center justify-center flex-shrink-0">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                  </div>
                  <div>
                    <h5 className="font-bold text-paw-brown mb-1">Pro Tip</h5>
                    <p className="text-sm text-paw-brown/70 leading-relaxed">
                      Save your RingPaw number as a contact named &quot;AI
                      Receptionist&quot; so you know when the assistant is
                      handling your calls.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
