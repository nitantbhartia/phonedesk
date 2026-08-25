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
        toast.success(data.synced ? "Saved and synced" : "Services saved");
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
          <div key={i} className="h-20 bg-surface rounded-sm animate-pulse" />
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-sm border border-line bg-paper px-5 py-4">
          <p className="flex-1 text-sm font-medium text-accent">{pageError}</p>
          <button
            onClick={() => void fetchData()}
            className="rounded-sm border border-line bg-surface px-4 py-2 text-xs font-bold text-accent hover:bg-paper"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-display text-[2.35rem] tracking-tight text-ink">Services &amp; pricing</h1>
          <p className="mt-1 text-[14px] text-muted">
            Set the short menu callers can book by phone, plus any specific pricing overrides.
          </p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setShowForm(true);
          }}
          disabled={savedServices.length === 0}
          className="px-5 py-2.5 bg-ink text-white rounded-sm font-medium text-sm flex items-center gap-2 hover:bg-opacity-90 transition-colors disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Pricing Rule
        </button>
      </div>

      {/* Services — editable list */}
      <div className="bg-surface rounded-sm border border-line p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-2xl text-ink">Services</h2>
            <p className="text-xs text-muted mt-1">
              Base prices quoted to callers. Mark an add-on when it follows a primary booking.
            </p>
          </div>
          <button
            onClick={saveServices}
            disabled={savingServices}
            className="px-4 py-2 bg-ink text-white rounded-sm font-medium text-xs hover:bg-opacity-90 transition-colors disabled:opacity-50 shrink-0"
          >
            {savingServices ? "Saving..." : "Save Services"}
          </button>
        </div>

        <div className="space-y-3">
          {services.map((service, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide">
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
                  className="w-full px-4 py-2.5 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 sm:w-24 sm:flex-none space-y-1">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide">
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
                    className="w-full px-4 py-2.5 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                  />
                </div>
                <div className="flex-1 sm:w-28 sm:flex-none space-y-1">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-wide">
                    Duration (min)
                    <InfoIcon text="How long this service takes in minutes. Call Slot uses this to block the right amount of time on your calendar." />
                  </label>
                  <input
                    type="number"
                    value={service.duration}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...service, duration: e.target.value };
                      setServices(updated);
                    }}
                    className="w-full px-4 py-2.5 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                  />
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wide whitespace-nowrap">
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
                    <div className="relative h-5 w-10 rounded-sm bg-ink/20 peer peer-checked:bg-line after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-sm after:bg-surface after:content-[''] after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                </div>
                <button
                  onClick={() => setServices(services.filter((_, j) => j !== i))}
                  disabled={services.length <= 1}
                  className="h-10 w-10 shrink-0 rounded-sm text-muted hover:text-accent hover:bg-paper transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted flex items-center justify-center"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-line bg-surface text-ink font-bold text-xs hover:bg-surface transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Service
          </button>
        </div>

        {savedServices.length > 0 && (
          <div className="mt-6 pt-5 border-t border-line">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-2">
              Currently quoting
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {savedServices.map((service) => (
                <div key={service.id} className="bg-surface/40 rounded-sm px-3 py-2">
                  <p className="font-semibold text-ink text-xs truncate">{service.name}</p>
                  <p className="text-sm font-medium text-ink">
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
        <div className="bg-surface rounded-sm p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-muted">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <p className="font-display text-xl text-ink">No additional pricing rules yet</p>
          <p className="text-sm text-muted mt-1">
            Add a rule when a service needs a different price for a specific case.
          </p>
        </div>
      ) : (
        Object.entries(rulesByService).map(([serviceName, serviceRules]) => (
          <div key={serviceName} className="bg-surface rounded-sm border border-line overflow-x-auto">
            <div className="px-6 py-4 bg-surface border-b border-line">
              <h3 className="font-bold text-ink">{serviceName}</h3>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-bold text-muted uppercase tracking-wider">
                  <th className="px-3 sm:px-6 py-3">Category</th>
                  <th className="px-3 sm:px-6 py-3">Size</th>
                  <th className="px-3 sm:px-6 py-3">Price</th>
                  <th className="px-3 sm:px-6 py-3 hidden sm:table-cell">Notes</th>
                  <th className="px-3 sm:px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {serviceRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface transition-colors">
                    <td className="px-3 sm:px-6 py-3 text-sm font-medium text-ink">
                      {rule.breed || "Any category"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-muted">
                      {rule.size || "Any size"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm font-bold text-ink">
                      {formatCurrency(rule.price)}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-sm text-muted hidden sm:table-cell">
                      {rule.notes || "—"}
                    </td>
                    <td className="px-3 sm:px-6 py-3 text-right">
                      <button
                        onClick={() => deleteRule(rule.id)}
                        disabled={deleting === rule.id}
                        className="text-accent font-bold text-xs hover:underline disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30">
          <div className="mx-4 w-full max-w-md rounded-sm border border-line bg-surface p-6 sm:p-8">
            <h2 className="mb-4 font-display text-2xl text-ink">Add pricing rule</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Service *
                    <InfoIcon text="Choose which service this pricing rule overrides. The rule will only activate when a caller books this specific service — it won't affect other services." />
                  </span>
                </label>
                <select
                  value={form.serviceId}
                  onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
                  className="w-full px-4 py-3 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
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
                  <label className="block text-xs font-bold text-muted uppercase mb-1">
                    <span className="inline-flex items-center gap-1">
                    Category
                    <InfoIcon text="Optional. Enter a category to apply this price only to that group. Leave blank to match every booking." />
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.breed}
                    onChange={(e) => setForm({ ...form, breed: e.target.value })}
                    placeholder="e.g. Standard Poodle"
                    className="w-full px-4 py-3 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted uppercase mb-1">
                    <span className="inline-flex items-center gap-1">
                      Size
                    <InfoIcon text="Optional. Restrict this rule to a specific size. When both fields are set, the rule only applies when both match." />
                    </span>
                  </label>
                  <select
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    className="w-full px-4 py-3 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
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
                <label className="block text-xs font-bold text-muted uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Price *
                    <InfoIcon text="The price Call Slot uses when this rule matches. This overrides the base service price for the specified breed and/or size." />
                  </span>
                </label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="85"
                  className="w-full px-4 py-3 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted uppercase mb-1">
                  <span className="inline-flex items-center gap-1">
                    Notes
            <InfoIcon text="Internal note only — not shared with callers. Use it to remind yourself why this rule exists (e.g. '+$20 for extra time')." />
                  </span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. +$30 if matted"
                  className="w-full px-4 py-3 bg-surface rounded-sm border border-line focus:outline-none focus:border-ink text-sm"
                />
              </div>
              {formError && (
                <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm font-medium text-accent">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormError("");
                  }}
                  className="px-5 py-2.5 bg-surface rounded-sm font-medium text-sm border border-line hover:bg-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addRule}
                  disabled={!form.serviceId || !form.price || saving}
                  className="px-5 py-2.5 bg-ink text-white rounded-sm font-medium text-sm hover:bg-opacity-90 transition-colors disabled:opacity-50"
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
