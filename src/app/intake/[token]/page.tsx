"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InfoIcon } from "@/components/ui/info-icon";

interface FormData {
  petName: string;
  petBreed: string;
  petAge: string;
  petWeight: string;
  vaccinated: string;
  vetName: string;
  vetPhone: string;
  temperament: string;
  biteHistory: string;
  allergies: string;
  emergencyName: string;
  emergencyPhone: string;
  specialNotes: string;
}

const initialFormData: FormData = {
  petName: "",
  petBreed: "",
  petAge: "",
  petWeight: "",
  vaccinated: "",
  vetName: "",
  vetPhone: "",
  temperament: "",
  biteHistory: "",
  allergies: "",
  emergencyName: "",
  emergencyPhone: "",
  specialNotes: "",
};

function FieldLabel({
  htmlFor,
  className,
  info,
  children,
}: {
  htmlFor: string;
  className: string;
  info: string;
  children: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      <span className="inline-flex items-center gap-1.5">
        <span>{children}</span>
        <InfoIcon text={info} />
      </span>
    </label>
  );
}

export default function IntakeFormPage() {
  const params = useParams();
  const token = params.token as string;

  const [businessName, setBusinessName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchForm() {
      try {
        const res = await fetch(`/api/intake/${token}`);
        if (!res.ok) {
          setError("This form was not found or has expired.");
          setLoading(false);
          return;
        }
        const data = await res.json();
        setBusinessName(data.businessName);
        setCustomerName(data.form.customerName);

        if (data.form.completed) {
          setSubmitted(true);
        }

        // Pre-fill any existing data
        setFormData({
          petName: data.form.petName || "",
          petBreed: data.form.petBreed || "",
          petAge: data.form.petAge || "",
          petWeight: data.form.petWeight || "",
          vaccinated:
            data.form.vaccinated === true
              ? "yes"
              : data.form.vaccinated === false
                ? "no"
                : "",
          vetName: data.form.vetName || "",
          vetPhone: data.form.vetPhone || "",
          temperament: data.form.temperament || "",
          biteHistory:
            data.form.biteHistory === true
              ? "yes"
              : data.form.biteHistory === false
                ? "no"
                : "",
          allergies: data.form.allergies || "",
          emergencyName: data.form.emergencyName || "",
          emergencyPhone: data.form.emergencyPhone || "",
          specialNotes: data.form.specialNotes || "",
        });
      } catch {
        setError("Failed to load the form. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    fetchForm();
  }, [token]);

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        ...formData,
        vaccinated:
          formData.vaccinated === "yes"
            ? true
            : formData.vaccinated === "no"
              ? false
              : null,
        biteHistory:
          formData.biteHistory === "yes"
            ? true
            : formData.biteHistory === "no"
              ? false
              : null,
      };

      const res = await fetch(`/api/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Submission failed");
      }

      setSubmitted(true);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="animate-pulse text-ink text-lg font-bold">
          Loading...
        </div>
      </div>
    );
  }

  if (error && !businessName) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="rounded-sm bg-surface p-8 text-center">
          <p className="text-ink text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="rounded-sm bg-surface p-8 text-center max-w-md w-full">
          <h1 className="font-display text-2xl tracking-tight text-ink mb-2">
            Thank you
          </h1>
          <p className="text-muted">
            Your intake form for <span className="font-bold">{businessName}</span> has been submitted.
            We look forward to seeing you and your pet!
          </p>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-sm border border-line bg-surface px-4 py-3 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink transition-colors";
  const labelClass = "block text-sm font-bold text-ink mb-1";

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="mx-auto max-w-lg">
        <div className="rounded-sm bg-surface p-6 sm:p-8 ">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="font-display text-2xl tracking-tight text-ink">
              New client intake
            </h1>
            <p className="text-muted mt-1">
              Welcome to <span className="font-bold text-ink">{businessName}</span>
            </p>
            <p className="text-muted text-sm mt-1">
              Hi {customerName}, please fill out this form before your visit.
            </p>
          </div>

          {error && (
            <div className="rounded-sm bg-paper border border-line p-3 mb-4 text-accent text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Pet Information */}
            <div className="rounded-sm bg-paper p-4 space-y-3">
              <h2 className="font-bold text-ink text-lg">
                Pet Information
              </h2>

              <div>
                <FieldLabel htmlFor="petName" className={labelClass} info="Your pet's name as you'd like staff to use it.">
                  Pet Name *
                </FieldLabel>
                <input
                  id="petName"
                  name="petName"
                  type="text"
                  required
                  value={formData.petName}
                  onChange={handleChange}
                  placeholder="e.g. Buddy"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="petBreed" className={labelClass} info="Breed helps estimate grooming time and coat handling needs.">
                    Breed
                  </FieldLabel>
                  <input
                    id="petBreed"
                    name="petBreed"
                    type="text"
                    value={formData.petBreed}
                    onChange={handleChange}
                    placeholder="e.g. Golden Retriever"
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="petAge" className={labelClass} info="Approximate age is okay and helps with handling considerations.">
                    Age
                  </FieldLabel>
                  <input
                    id="petAge"
                    name="petAge"
                    type="text"
                    value={formData.petAge}
                    onChange={handleChange}
                    placeholder="e.g. 3 years"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="petWeight" className={labelClass} info="Weight helps with sizing and appointment planning.">
                  Weight
                </FieldLabel>
                <input
                  id="petWeight"
                  name="petWeight"
                  type="text"
                  value={formData.petWeight}
                  onChange={handleChange}
                  placeholder="e.g. 65 lbs"
                  className={inputClass}
                />
              </div>

              <div>
                <FieldLabel htmlFor="vaccinated" className={labelClass} info="Lets us confirm health and safety requirements before visits.">
                  Up-to-date on vaccinations?
                </FieldLabel>
                <select
                  id="vaccinated"
                  name="vaccinated"
                  value={formData.vaccinated}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            {/* Behavior */}
            <div className="rounded-sm bg-line p-4 space-y-3">
              <h2 className="font-bold text-ink text-lg">Behavior</h2>

              <div>
                <FieldLabel htmlFor="temperament" className={labelClass} info="Helps groomers approach your pet in the safest, calmest way.">
                  Temperament
                </FieldLabel>
                <select
                  id="temperament"
                  name="temperament"
                  value={formData.temperament}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  <option value="friendly">Friendly</option>
                  <option value="anxious">Anxious</option>
                  <option value="nervous">Nervous</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>

              <div>
                <FieldLabel htmlFor="biteHistory" className={labelClass} info="Share known bite incidents so staff can prepare safely.">
                  Any bite history?
                </FieldLabel>
                <select
                  id="biteHistory"
                  name="biteHistory"
                  value={formData.biteHistory}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <FieldLabel htmlFor="allergies" className={labelClass} info="List product, food, or medication allergies we should know.">
                  Allergies
                </FieldLabel>
                <input
                  id="allergies"
                  name="allergies"
                  type="text"
                  value={formData.allergies}
                  onChange={handleChange}
                  placeholder="Any known allergies"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Vet Information */}
            <div className="rounded-sm bg-paper p-4 space-y-3">
              <h2 className="font-bold text-ink text-lg">
                Veterinarian
              </h2>

              <div>
                <FieldLabel htmlFor="vetName" className={labelClass} info="Primary veterinarian contact for urgent care coordination.">
                  Vet Name
                </FieldLabel>
                <input
                  id="vetName"
                  name="vetName"
                  type="text"
                  value={formData.vetName}
                  onChange={handleChange}
                  placeholder="Veterinarian name"
                  className={inputClass}
                />
              </div>

              <div>
                <FieldLabel htmlFor="vetPhone" className={labelClass} info="Direct clinic number if we need to verify medical context.">
                  Vet Phone
                </FieldLabel>
                <input
                  id="vetPhone"
                  name="vetPhone"
                  type="tel"
                  value={formData.vetPhone}
                  onChange={handleChange}
                  placeholder="(555) 555-5555"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="rounded-sm bg-accent/10 p-4 space-y-3">
              <h2 className="font-bold text-ink text-lg">
                Emergency Contact
              </h2>

              <div>
                <FieldLabel htmlFor="emergencyName" className={labelClass} info="Backup person we can contact if we cannot reach you.">
                  Contact Name
                </FieldLabel>
                <input
                  id="emergencyName"
                  name="emergencyName"
                  type="text"
                  value={formData.emergencyName}
                  onChange={handleChange}
                  placeholder="Emergency contact name"
                  className={inputClass}
                />
              </div>

              <div>
                <FieldLabel htmlFor="emergencyPhone" className={labelClass} info="Best phone number for your emergency contact.">
                  Contact Phone
                </FieldLabel>
                <input
                  id="emergencyPhone"
                  name="emergencyPhone"
                  type="tel"
                  value={formData.emergencyPhone}
                  onChange={handleChange}
                  placeholder="(555) 555-5555"
                  className={inputClass}
                />
              </div>
            </div>

            {/* Special Notes */}
            <div>
              <FieldLabel htmlFor="specialNotes" className={labelClass} info="Anything else that helps us make the visit safe and smooth.">
                Special Notes
              </FieldLabel>
              <textarea
                id="specialNotes"
                name="specialNotes"
                rows={3}
                value={formData.specialNotes}
                onChange={handleChange}
                placeholder="Anything else we should know..."
                className={inputClass}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-sm bg-ink py-4 text-white font-bold text-lg hover:bg-ink/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Intake Form"}
            </button>
          </form>
        </div>

        <p className="text-center text-muted text-xs mt-4">
          Powered by Call Slot
        </p>
      </div>
    </div>
  );
}
