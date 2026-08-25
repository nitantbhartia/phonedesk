"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { isOwnerDashboardEmailClient } from "@/lib/owner-auth";

const navItems: Array<{ href: string; label: string; tourId?: string; icon: React.ReactNode }> = [
  {
    href: "/dashboard",
    label: "Daybook",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: "/no-shows",
    label: "No-Shows",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="M15 9l-6 6" />
        <path d="M9 9l6 6" />
      </svg>
    ),
  },
  {
    href: "/today",
    label: "Today",
    tourId: "tour-nav-today",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  },
  {
    href: "/settings/profile",
    label: "Business",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
    label: "Services & Pricing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    href: "/settings/billing",
    label: "Billing",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="5" width="20" height="14" rx="1" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    href: "/settings/reviews",
    label: "Reviews",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    href: "/settings/calendar",
    label: "Bookings",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="1" ry="1" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: "/settings/agent",
    label: "Call answering",
    tourId: "tour-nav-ai",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const bookableNavItems = navItems.filter(
  (item) => !["/no-shows", "/settings/reviews", "/settings/agent"].includes(item.href)
);

const ownerNavItem: { href: string; label: string; tourId?: string; icon: React.ReactNode } = {
  href: "/owner",
  label: "Owner",
  icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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

export function computeShowSubBanner(_business: {
  stripeSubscriptionStatus?: string | null;
  onboardingComplete?: boolean | null;
} | null | undefined): boolean {
  // Hidden during free launch mode — no Stripe subscriptions required
  return false;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const showOwnerNav = isOwnerDashboardEmailClient(session?.user?.email || null);
  const finalNavItems = showOwnerNav
    ? [...bookableNavItems, ownerNavItem]
    : bookableNavItems;
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [showSubBanner, setShowSubBanner] = useState(false);
  useEffect(() => {
    Promise.all([
      fetch("/api/business/profile").then((r) => r.ok ? r.json() : null),
      fetch("/api/billing/usage").then((r) => r.ok ? r.json() : null),
    ])
      .then(([profile, usageData]) => {
        if (profile?.business) {
          setShowSubBanner(computeShowSubBanner(profile.business));
        }
        if (usageData) {
          setUsage({
            minutesUsed: usageData.minutesUsed ?? 0,
            minutesLimit: usageData.minutesLimit ?? 75,
            plan: usageData.plan ?? "STARTER",
          });
        } else if (profile?.business) {
          const plan = profile.business.plan || "STARTER";
          const limits: Record<string, number> = { STARTER: 75, PRO: 300, BUSINESS: 500 };
          setUsage({
            minutesUsed: profile.stats?.totalCallMinutes ?? 0,
            minutesLimit: limits[plan] ?? 75,
            plan,
          });
        }
      })
      .catch(() => {});
  }, []);

  void usage;

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-paper px-5 lg:hidden">
        <BrandLogo className="text-[1.35rem] sm:text-[1.35rem]" />
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 text-ink"
        >
          {sidebarOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      <aside
        className={`fixed bottom-0 left-0 top-14 z-50 flex w-56 flex-col border-r border-line bg-paper px-5 py-6 transition-transform lg:static lg:inset-auto lg:top-auto lg:z-auto lg:h-auto lg:min-h-screen lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="hidden lg:block">
          <BrandLogo className="text-[1.4rem] sm:text-[1.45rem]" />
        </div>

        <nav className="mt-10 flex-1 space-y-0.5">
          {finalNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                {...(item.tourId ? { "data-tour": item.tourId } : {})}
                className={`sidebar-link block py-1.5 text-[13px] tracking-[0.01em] ${
                  isActive ? "active" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line pt-4">
          <p className="truncate text-[13px] text-ink">
            {session?.user?.name || "RingPaw account"}
          </p>
          <p className="truncate text-[12px] text-muted">
            {session?.user?.email || "Signed in"}
          </p>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="mt-3 text-[12px] text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="min-h-screen flex-1 overflow-y-auto px-5 pb-16 pt-20 lg:px-12 lg:pt-10">
        {showSubBanner && (
          <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-line pb-4">
            <p className="text-[13px] text-muted">RingPaw is paused. Subscribe to take forwarded calls.</p>
            <Link href="/settings/billing" className="bg-accent px-3.5 py-2 text-[12px] text-accent-foreground hover:bg-accent-hover">
              Subscribe
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
