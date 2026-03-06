"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { InfoIcon } from "@/components/ui/info-icon";

interface PricingRule {
  id: string;
  breed: string | null;
  size: string | null;
  price: number;
  notes: string | null;
  service: { id: string; name: string; price: number };
}

interface Service {
  id: string;
  name: string;
  price: number;
}

export default function PricingPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    serviceId: "",
    breed: "",
    size: "",
    price: "",
    notes: "",
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") {
      fetchData();
    }
  }, [authStatus, router]);

  async function fetchData() {
    try {
      const [rulesRes, profileRes] = await Promise.all([
        fetch("/api/pricing"),
        fetch("/api/business/profile"),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.pricingRules || []);
      }

      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data.business?.services) {
          setServices(data.business.services.filter((s: Service & { isActive: boolean }) => s.isActive));
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addRule() {
    if (!form.serviceId || !form.price) return;
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0 || price > 9999) return;

    setSaving(true);
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: form.serviceId,
          breed: form.breed || null,
          size: form.size || null,
          price,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ serviceId: "", breed: "", size: "", price: "", notes: "" });
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/pricing?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-white/50 rounded-3xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Group rules by service
  const rulesByService = rules.reduce<Record<string, PricingRule[]>>((acc, rule) => {
    const key = rule.service.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(rule);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-paw-brown">Pricing Matrix</h1>
          <p className="text-paw-brown/60 font-medium mt-1">
            Set breed and size-specific pricing. Your AI agent uses this for accurate quotes.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft flex items-center gap-2 hover:bg-opacity-90 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Pricing Rule
        </button>
      </div>

      {/* Base service prices */}
      <div className="bg-white rounded-3xl shadow-card border border-white p-6">
        <h2 className="font-bold text-paw-brown mb-4">Base Service Prices</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {services.map((service) => (
            <div key={service.id} className="bg-paw-cream/50 rounded-2xl p-4">
              <p className="font-bold text-paw-brown text-sm">{service.name}</p>
              <p className="text-2xl font-extrabold text-paw-brown mt-1">
                {formatCurrency(service.price)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Breed/Size overrides */}
      {Object.keys(rulesByService).length === 0 ? (
        <div className="bg-white rounded-4xl shadow-soft p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-paw-brown/30">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <p className="font-bold text-paw-brown/50">No breed-specific pricing rules yet</p>
          <p className="text-sm text-paw-brown/40 mt-1">
            Add rules so your AI can give accurate quotes like &quot;A standard poodle full groom is $120&quot;
          </p>
        </div>
      ) : (
        Object.entries(rulesByService).map(([serviceName, serviceRules]) => (
          <div key={serviceName} className="bg-white rounded-3xl shadow-card border border-white overflow-x-auto">
            <div className="px-6 py-4 bg-paw-cream/50 border-b border-paw-brown/5">
              <h3 className="font-bold text-paw-brown">{serviceName}</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-wider">
                  <th className="px-3 sm:px-6 py-3">Breed</th>
                  <th className="px-3 sm:px-6 py-3">Size</th>
                  <th className="px-3 sm:px-6 py-3">Price</th>
                  <th className="px-3 sm:px-6 py-3 hidden sm:table-cell">Notes</th>
                  <th className="px-3 sm:px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paw-brown/5">
                {serviceRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-paw-cream/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 text-sm font-medium text-paw-brown">
                      {rule.breed || "Any breed"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-paw-brown/70">
                      {rule.size || "Any size"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm font-bold text-paw-brown">
                      {formatCurrency(rule.price)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-paw-brown/50 hidden sm:table-cell">
                      {rule.notes || "—"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-right">
                      <button
                        onClick={() => deleteRule(rule.id)}
                        disabled={deleting === rule.id}
                        className="text-red-500 font-bold text-xs hover:underline disabled:opacity-50"
                      >
                        {deleting === rule.id ? "Removing..." : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Add pricing rule form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-soft">
            <h2 className="text-xl font-bold text-paw-brown mb-4">Add Pricing Rule</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Service *
                    <InfoIcon text="Pick which base service this custom price rule applies to." />
                  </span>
                </label>
                <select
                  value={form.serviceId}
                  onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                >
                  <option value="">Select service...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (base: {formatCurrency(s.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                    <span className="inline-flex items-center gap-1">
                      Breed
                      <InfoIcon text="Optional: limit this rule to a specific breed." />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.breed}
                    onChange={(e) => setForm({ ...form, breed: e.target.value })}
                    placeholder="e.g. Standard Poodle"
                    className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                    <span className="inline-flex items-center gap-1">
                      Size
                      <InfoIcon text="Optional: limit this rule to one dog size." />
                    </span>
                  </label>
                  <select
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  >
                    <option value="">Any size</option>
                    <option value="SMALL">Small</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LARGE">Large</option>
                    <option value="XLARGE">Extra Large</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Price *
                    <InfoIcon text="Final quoted price when this rule matches." />
                  </span>
                </label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="85"
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Notes
                    <InfoIcon text="Optional internal note for why this pricing override exists." />
                  </span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. +$30 if matted"
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 bg-white rounded-full font-bold text-sm border border-paw-brown/10 hover:bg-paw-cream transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addRule}
                  disabled={!form.serviceId || !form.price || saving}
                  className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft hover:bg-opacity-90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Adding..." : "Add Rule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
