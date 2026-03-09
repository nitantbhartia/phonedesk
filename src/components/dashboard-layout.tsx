"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { isOwnerDashboardEmailClient } from "@/lib/owner-auth";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/calls",
    label: "Call Log",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/no-shows",
    label: "No-Shows",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M15 9l-6 6" />
        <path d="M9 9l6 6" />
      </svg>
    ),
  },
  {
    href: "/today",
    label: "Today",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    href: "/settings/profile",
    label: "Business",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    ),
  },
  {
    href: "/settings/pricing",
    label: "Pricing",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/settings/billing",
    label: "Billing",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    href: "/settings/reviews",
    label: "Reviews",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    href: "/settings/calendar",
    label: "Bookings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/settings/agent",
    label: "AI Settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const ownerNavItem = {
  href: "/owner",
  label: "Owner",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-5" />
      <path d="M19 8v5h-5" />
    </svg>
  ),
};

interface UsageStats {
  minutesUsed: number;
  minutesLimit: number;
  plan: string;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const showOwnerNav = isOwnerDashboardEmailClient(session?.user?.email || null);
  const finalNavItems = showOwnerNav ? [...navItems, ownerNavItem] : navItems;
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [forwardingReady, setForwardingReady] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/business/profile")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.business) {
          const plan = data.business.plan || "STARTER";
          const limits: Record<string, number> = { STARTER: 50, PRO: 200, BUSINESS: 500 };
          setUsage({
            minutesUsed: data.stats?.totalCallMinutes ?? 0,
            minutesLimit: limits[plan] ?? 500,
            plan,
          });
          // Show banner if no phone number has been provisioned yet
          setForwardingReady(!!data.business.phoneNumber);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-paw-sky flex">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-paw-cream/80 backdrop-blur-xl border-b border-white/50 px-4 py-3 flex items-center justify-between">
        <BrandLogo
          mobileWidth={124}
          desktopWidth={156}
          className="min-w-0 max-w-[124px]"
        />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 text-paw-brown"
        >
          {sidebarOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-paw-cream/50 backdrop-blur-xl border-r border-white/50 p-8 flex flex-col gap-8 transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="mb-4">
          <BrandLogo
            mobileWidth={148}
            desktopWidth={184}
            className="max-w-[184px]"
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-2">
          {finalNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`sidebar-link flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold transition-all ${
                  isActive
                    ? "active"
                    : "text-paw-brown/60 hover:text-paw-brown hover:bg-white/50"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Plan usage card */}
        <div className="bg-paw-brown rounded-3xl p-6 text-paw-cream relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-paw-orange/20 rounded-full blur-xl" />
          <p className="text-xs font-bold text-paw-amber uppercase tracking-wider mb-2">
            {usage?.plan?.replace("_", " ") || "Pro"} Plan
          </p>
          <p className="text-sm font-medium opacity-80 mb-4">
            {usage ? `${usage.minutesUsed} / ${usage.minutesLimit}` : "— / —"} minutes used this month.
          </p>
          <div className="w-full bg-white/10 h-2 rounded-full mb-6">
            <div
              className="bg-paw-amber h-full rounded-full transition-all"
              style={{ width: usage ? `${Math.min(100, (usage.minutesUsed / usage.minutesLimit) * 100)}%` : "0%" }}
            />
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full py-2 bg-white/10 hover:bg-white/20 transition-colors rounded-xl text-xs font-bold uppercase tracking-widest"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto min-h-screen pt-20 lg:pt-10">
        {/* Call forwarding setup banner */}
        {forwardingReady === false && !bannerDismissed && (
          <div className="mb-6 flex items-center gap-4 bg-paw-amber/30 border border-paw-amber rounded-2xl px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-paw-orange flex items-center justify-center flex-shrink-0 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.13 12 19.79 19.79 0 0 1 1.06 3.38 2 2 0 0 1 3.04 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-paw-brown text-sm">Your AI receptionist isn&apos;t active yet</p>
              <p className="text-paw-brown/60 text-sm">Set up call forwarding so RingPaw can answer your missed calls.</p>
            </div>
            <a
              href="/setup/call-forwarding"
              className="flex-shrink-0 px-4 py-2 bg-paw-brown text-paw-cream rounded-xl font-bold text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Set up now →
            </a>
            <button
              onClick={() => setBannerDismissed(true)}
              className="flex-shrink-0 text-paw-brown/40 hover:text-paw-brown transition-colors"
              aria-label="Dismiss"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
