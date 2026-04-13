"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { readApiError } from "@/lib/client-api";
import { formatCurrency } from "@/lib/utils";
import { InfoIcon } from "@/components/ui/info-icon";
import { toast } from "@/components/ui/toast";

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
  duration: number;
  isAddon: boolean;
  isActive: boolean;
}

type ServiceForm = {
  id?: string;
  name: string;
  price: string;
  duration: string;
  isAddon: boolean;
};

export default function PricingPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [rules, setRules] = useState<PricingRule[]>([]);
  // Services split in two: savedServices reflects what's in the DB (used to
  // populate the pricing-rule dropdown so rules always reference real services),
  // while services is the editable form state.
  const [savedServices, setSavedServices] = useState<Service[]>([]);
  const [services, setServices] = useState<ServiceForm[]>([]);
  const [savingServices, setSavingServices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
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
    setPageError("");
    try {
      const [rulesRes, profileRes] = await Promise.all([
        fetch("/api/pricing"),
        fetch("/api/business/profile"),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.pricingRules || []);
      } else {
        setPageError(await readApiError(rulesRes, "Failed to load pricing rules."));
      }

      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data.business?.services) {
          const active = data.business.services.filter(
            (s: Service) => s.isActive
          );
          setSavedServices(active);
          setServices(
            active.map((s: Service) => ({
              id: s.id,
              name: s.name,
              price: s.price.toString(),
              duration: s.duration.toString(),
              isAddon: Boolean(s.isAddon),
            }))
          );
        }
      } else {
        setPageError((current) => current || "Failed to load services.");
      }
    } catch {
      setPageError("Failed to load pricing data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function saveServices() {
    // Strip blank rows and validate there's at least one real service
    const valid = services.filter((s) => s.name.trim());
    if (valid.length === 0) {
      toast.error("Add at least one service before saving.");
      return;
    }
    setSavingServices(true);
    try {
      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: valid }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to save services");
      } else {
        toast.success(data.synced ? "Saved and synced to voice agent" : "Services saved");
        await fetchData();
      }
    } catch {
      toast.error("Network error — check your connection");
    } finally {
      setSavingServices(false);
    }
  }

  async function addRule() {
    setFormError("");
    if (savedServices.length === 0) {
      setFormError("Add and save at least one service before creating pricing rules.");
      return;
    }
    if (!form.serviceId || !form.price) {
      setFormError("Service and price are required.");
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0 || price > 9999) {
      setFormError("Price must be between $0 and $9,999.");
      return;
    }

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
        setFormError("");
        setForm({ serviceId: "", breed: "", size: "", price: "", notes: "" });
        await fetchData();
        toast.success("Pricing rule added");
      } else {
        setFormError(await readApiError(res, "Failed to add rule."));
      }
    } catch {
      setFormError("Failed to add rule. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/pricing?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
        toast.success("Rule removed");
      } else {
        toast.error(await readApiError(res, "Failed to remove rule."));
      }
    } catch {
      toast.error("Failed to remove rule");
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
      {pageError && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-3xl border border-red-200 bg-red-50 px-5 py-4">
          <p className="flex-1 text-sm font-medium text-red-700">{pageError}</p>
          <button
            onClick={() => void fetchData()}
            className="rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-paw-brown">Services &amp; Pricing</h1>
          <p className="text-paw-brown/60 font-medium mt-1">
            Manage the services you offer and any breed- or size-specific pricing overrides. Your AI agent quotes these to callers.
          </p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setShowForm(true);
          }}
          disabled={savedServices.length === 0}
          className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft flex items-center gap-2 hover:bg-opacity-90 transition-colors disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Pricing Rule
        </button>
      </div>

      {/* Services — editable list */}
      <div className="bg-white rounded-3xl shadow-card border border-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-paw-brown">Your Services</h2>
            <p className="text-xs text-paw-brown/60 mt-1">
              Base prices quoted to callers. Toggle &ldquo;Add-on&rdquo; to let your AI upsell that service after a primary booking.
            </p>
          </div>
          <button
            onClick={saveServices}
            disabled={savingServices}
            className="px-4 py-2 bg-paw-brown text-white rounded-full font-bold text-xs shadow-soft hover:bg-opacity-90 transition-colors disabled:opacity-50 shrink-0"
          >
            {savingServices ? "Saving..." : "Save Services"}
          </button>
        </div>

        <div className="space-y-3">
          {services.map((service, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-paw-brown/60 uppercase tracking-wide">
                  Service
                  <InfoIcon text="The service name spoken to callers (e.g. 'Full Groom', 'Bath & Brush', 'Nail Trim'). Keep names short and recognizable — callers will hear exactly what you type here." />
                </label>
                <input
                  type="text"
                  value={service.name}
                  onChange={(e) => {
                    const updated = [...services];
                    updated[i] = { ...service, name: e.target.value };
                    setServices(updated);
                  }}
                  className="w-full px-4 py-2.5 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 sm:w-24 sm:flex-none space-y-1">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-paw-brown/60 uppercase tracking-wide">
                    Price ($)
                    <InfoIcon text="Base price quoted to callers for this service. Use the breed/size overrides below if you need more specific pricing." />
                  </label>
                  <input
                    type="number"
                    value={service.price}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...service, price: e.target.value };
                      setServices(updated);
                    }}
                    className="w-full px-4 py-2.5 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  />
                </div>
                <div className="flex-1 sm:w-28 sm:flex-none space-y-1">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-paw-brown/60 uppercase tracking-wide">
                    Duration (min)
                    <InfoIcon text="How long this service takes in minutes. The AI uses this to block the right amount of time on your calendar." />
                  </label>
                  <input
                    type="number"
                    value={service.duration}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...service, duration: e.target.value };
                      setServices(updated);
                    }}
                    className="w-full px-4 py-2.5 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  />
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <label className="text-[10px] font-semibold text-paw-brown/60 uppercase tracking-wide whitespace-nowrap">
                    Add-on
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer h-10">
                    <input
                      type="checkbox"
                      checked={service.isAddon}
                      onChange={(e) => {
                        const updated = [...services];
                        updated[i] = { ...service, isAddon: e.target.checked };
                        setServices(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-paw-brown/20 rounded-full peer peer-checked:bg-paw-amber transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </div>
                <button
                  onClick={() => setServices(services.filter((_, j) => j !== i))}
                  disabled={services.length <= 1}
                  className="h-10 w-10 shrink-0 rounded-xl text-paw-brown/50 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-paw-brown/50 flex items-center justify-center"
                  aria-label="Remove service"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              setServices([
                ...services,
                { name: "", price: "", duration: "60", isAddon: false },
              ])
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-paw-brown/10 bg-paw-cream/50 text-paw-brown font-bold text-xs hover:bg-paw-cream transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Service
          </button>
        </div>

        {savedServices.length > 0 && (
          <div className="mt-6 pt-5 border-t border-paw-brown/5">
            <p className="text-[10px] font-semibold text-paw-brown/50 uppercase tracking-wide mb-2">
              Currently quoting
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {savedServices.map((service) => (
                <div key={service.id} className="bg-paw-cream/40 rounded-xl px-3 py-2">
                  <p className="font-semibold text-paw-brown text-xs truncate">{service.name}</p>
                  <p className="text-sm font-extrabold text-paw-brown">
                    {formatCurrency(service.price)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
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
                    <InfoIcon text="Choose which service this pricing rule overrides. The rule will only activate when a caller books this specific service — it won't affect other services." />
                  </span>
                </label>
                <select
                  value={form.serviceId}
                  onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                >
                  <option value="">Select service...</option>
                  {savedServices.map((s) => (
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
                      <InfoIcon text="Optional. Enter a breed name to apply this price only to that breed (e.g. 'Standard Poodle', 'Goldendoodle'). Leave blank to match all breeds." />
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
                      <InfoIcon text="Optional. Restrict this rule to a specific dog size. When both Breed and Size are set, the rule only applies when both match." />
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
                    <InfoIcon text="The price the AI will quote when this rule matches. This overrides the base service price for the specified breed and/or size." />
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
                    <InfoIcon text="Internal note only — not shared with callers. Use it to remind yourself why this rule exists (e.g. '+$20 for dematting', 'large dog surcharge')." />
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
              {formError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormError("");
                  }}
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
