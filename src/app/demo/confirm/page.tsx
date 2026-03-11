"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

function ConfirmPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("t") ?? "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLaunch() {
    if (!token) {
      setError("Missing token. Please click the link from your email again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { ldt?: string; error?: string };

      if (!res.ok || !data.ldt) {
        if (data.error === "token_used") {
          router.replace("/demo?error=token_used");
        } else if (data.error === "token_expired") {
          router.replace("/demo?error=token_expired");
        } else {
          router.replace("/demo?error=invalid_token");
        }
        return;
      }

      router.replace(`/demo?ldt=${encodeURIComponent(data.ldt)}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-paw-sky antialiased flex flex-col relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg className="leaf-shape absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber opacity-60" viewBox="0 0 200 200" fill="currentColor">
          <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
        </svg>
        <svg className="leaf-shape absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] text-white opacity-50" viewBox="0 0 200 200" fill="currentColor">
          <path d="M100 200C140 160 180 120 200 60C160 70 120 90 100 0C80 90 40 70 0 60C20 120 60 160 100 200Z" />
        </svg>
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-4xl mx-auto w-full">
        <Link href="/">
          <BrandLogo mobileWidth={120} desktopWidth={140} priority />
        </Link>
      </nav>

      <main className="flex-1 flex items-center justify-center px-4 relative z-10">
        <div className="w-full max-w-sm">
          <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
            <div className="text-5xl mb-5">🐾</div>
            <h1 className="text-2xl font-extrabold text-paw-brown mb-3">Ready to hear your AI?</h1>
            <p className="text-paw-brown/60 text-sm font-medium mb-8 leading-relaxed">
              Click below to get your live demo number. We&apos;ll give you a real line to call.
            </p>

            {error && (
              <p className="text-sm text-red-600 font-medium mb-4">{error}</p>
            )}

            <button
              onClick={handleLaunch}
              disabled={loading || !token}
              className="w-full px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Setting up…
                </>
              ) : (
                <>
                  Launch my live demo
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>

            <p className="text-xs text-paw-brown/40 mt-4">Link expires in 1 hour · one-time use</p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 text-center py-6 text-xs text-paw-brown/40 font-medium">
        © {new Date().getFullYear()} RingPaw · <Link href="/" className="hover:text-paw-brown transition-colors">ringpaw.com</Link>
      </footer>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmPageInner />
    </Suspense>
  );
}
