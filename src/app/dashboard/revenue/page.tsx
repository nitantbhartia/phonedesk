"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RevenueSummary {
  totalRevenue6mo: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  totalCustomers: number;
  atRiskCount: number;
  topService: string | null;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface ServiceRevenue {
  service: string;
  revenue: number;
  count: number;
}

interface DayRevenue {
  day: string;
  revenue: number;
}

interface CustomerLtv {
  phone: string;
  name: string;
  revenue: number;
  visits: number;
  lastVisit: string;
  avgPerVisit: number;
}

interface AtRiskCustomer {
  phone: string;
  name: string;
  lastVisit: string;
  daysSince: number;
  revenue: number;
  visits: number;
}

interface RevenueData {
  summary: RevenueSummary;
  revenueByMonth: MonthlyRevenue[];
  revenueByService: ServiceRevenue[];
  revenueByDay: DayRevenue[];
  vipCustomers: CustomerLtv[];
  atRiskCustomers: AtRiskCustomer[];
}

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatDollars(n: number) {
  return `$${n.toLocaleString()}`;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct;
}

const ORANGE = "#E8650A";
const AMBER = "#F59E0B";
const BROWN = "#3B2A1A";

export default function RevenuePage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "customers">("overview");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (status === "authenticated") {
      fetch("/api/analytics/revenue")
        .then((r) => r.json())
        .then(setData)
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-white/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white/50 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white/50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { summary, revenueByMonth, revenueByService, revenueByDay, vipCustomers, atRiskCustomers } = data;
  const mom = pctChange(summary.revenueThisMonth, summary.revenueLastMonth);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-paw-brown">Revenue Intelligence</h1>
        <p className="text-paw-brown/60 font-medium mt-1">
          Turn your data into decisions — last 6 months
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">This Month</p>
          <p className="text-2xl font-extrabold text-paw-brown mt-1">
            {formatDollars(summary.revenueThisMonth)}
          </p>
          {mom !== null && (
            <p className={`text-xs font-bold mt-1 ${mom >= 0 ? "text-green-600" : "text-red-500"}`}>
              {mom >= 0 ? "+" : ""}{mom}% vs last month
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">6-Month Total</p>
          <p className="text-2xl font-extrabold text-paw-brown mt-1">
            {formatDollars(summary.totalRevenue6mo)}
          </p>
          <p className="text-xs text-paw-brown/40 mt-1">All completed bookings</p>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">At-Risk Clients</p>
          <p className="text-2xl font-extrabold text-paw-brown mt-1">{summary.atRiskCount}</p>
          <p className="text-xs text-paw-brown/40 mt-1">Overdue for rebooking</p>
        </div>

        <div className="bg-paw-brown p-4 rounded-2xl shadow-soft">
          <p className="text-xs font-bold text-paw-amber uppercase tracking-wider">Top Service</p>
          <p className="text-lg font-extrabold text-white mt-1 leading-snug">
            {summary.topService ?? "—"}
          </p>
          <p className="text-xs text-white/50 mt-1">By revenue, 6 months</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["overview", "customers"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
              activeTab === tab
                ? "bg-paw-brown text-white"
                : "bg-white text-paw-brown/60 hover:bg-paw-sky"
            }`}
          >
            {tab === "overview" ? "Revenue Overview" : "Customer Intelligence"}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Monthly trend */}
          <div className="bg-white rounded-2xl shadow-card border border-white/50 p-6">
            <h2 className="text-lg font-bold text-paw-brown mb-4">Monthly Revenue Trend</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={revenueByMonth}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ORANGE} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={ORANGE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 12, fill: "#8B6F5C" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fontSize: 12, fill: "#8B6F5C" }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(v: number) => [formatDollars(v), "Revenue"]}
                  labelFormatter={formatMonth}
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={ORANGE}
                  strokeWidth={2.5}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Revenue by service */}
            <div className="bg-white rounded-2xl shadow-card border border-white/50 p-6">
              <h2 className="text-lg font-bold text-paw-brown mb-4">Revenue by Service</h2>
              {revenueByService.length === 0 ? (
                <p className="text-paw-brown/40 text-sm text-center py-8">No completed appointments yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={revenueByService.slice(0, 6)}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `$${v}`}
                      tick={{ fontSize: 11, fill: "#8B6F5C" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="service"
                      tick={{ fontSize: 11, fill: "#3B2A1A" }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip
                      formatter={(v: number, _: string, props: { payload?: ServiceRevenue }) => [
                        `${formatDollars(v)} (${props.payload?.count ?? 0} bookings)`,
                        "Revenue",
                      ]}
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                    />
                    <Bar dataKey="revenue" fill={ORANGE} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by day */}
            <div className="bg-white rounded-2xl shadow-card border border-white/50 p-6">
              <h2 className="text-lg font-bold text-paw-brown mb-4">Revenue by Day of Week</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede8" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 12, fill: "#8B6F5C" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fontSize: 11, fill: "#8B6F5C" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatDollars(v), "Revenue"]}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}
                  />
                  <Bar dataKey="revenue" fill={AMBER} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === "customers" && (
        <div className="space-y-6">
          {/* VIP customers */}
          <div className="bg-white rounded-2xl shadow-card border border-white/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-paw-amber/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BROWN} strokeWidth="2.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-paw-brown">VIP Customers — Top by Lifetime Value</h2>
            </div>
            {vipCustomers.length === 0 ? (
              <p className="text-center py-10 text-paw-brown/40 text-sm">No completed appointments yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest border-b border-gray-50 bg-paw-cream/30">
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Lifetime Value</th>
                      <th className="px-6 py-3 hidden sm:table-cell">Visits</th>
                      <th className="px-6 py-3 hidden md:table-cell">Avg / Visit</th>
                      <th className="px-6 py-3 hidden md:table-cell">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {vipCustomers.map((c, i) => (
                      <tr key={c.phone} className="hover:bg-paw-sky/10 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-paw-brown/30 w-5">#{i + 1}</span>
                            <div>
                              <p className="font-bold text-paw-brown text-sm">{c.name}</p>
                              <p className="text-xs text-paw-brown/40">{c.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-bold text-paw-orange">{formatDollars(c.revenue)}</span>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell text-sm text-paw-brown/70">{c.visits}</td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm text-paw-brown/70">
                          {formatDollars(c.avgPerVisit)}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm text-paw-brown/60">
                          {new Date(c.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* At-risk customers */}
          <div className="bg-white rounded-2xl shadow-card border border-white/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-paw-brown">At-Risk Clients — Overdue for Rebooking</h2>
              </div>
              {atRiskCustomers.length > 0 && (
                <a
                  href="/dashboard/campaigns"
                  className="text-sm font-bold text-paw-orange hover:underline"
                >
                  Send Win-Back Campaign →
                </a>
              )}
            </div>
            {atRiskCustomers.length === 0 ? (
              <p className="text-center py-10 text-green-600 font-bold text-sm">
                All your clients are up to date!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest border-b border-gray-50 bg-paw-cream/30">
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Days Overdue</th>
                      <th className="px-6 py-3 hidden sm:table-cell">Lifetime Value</th>
                      <th className="px-6 py-3 hidden md:table-cell">Visits</th>
                      <th className="px-6 py-3 hidden md:table-cell">Last Visit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {atRiskCustomers.map((c) => (
                      <tr key={c.phone} className="hover:bg-red-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-paw-brown text-sm">{c.name}</p>
                          <p className="text-xs text-paw-brown/40">{c.phone}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-sm font-bold ${
                              c.daysSince > 90 ? "text-red-600" : "text-amber-600"
                            }`}
                          >
                            {c.daysSince}d overdue
                          </span>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell text-sm text-paw-brown/70">
                          {formatDollars(c.revenue)}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm text-paw-brown/70">
                          {c.visits}
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm text-paw-brown/60">
                          {new Date(c.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
