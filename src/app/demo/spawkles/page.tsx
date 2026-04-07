import { prisma } from "@/lib/prisma";
import { BrandLogo } from "@/components/brand-logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spawkles Mobile Dog Grooming — RingPaw Demo",
  description: "Try Pip, your phone receptionist for Spawkles Mobile Dog Grooming.",
  robots: "noindex, nofollow",
};

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

function toE164(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("1") ? `+${d}` : `+1${d}`;
}

export default async function SpawklesDemoPage() {
  const businessId = process.env.SPAWKLES_BUSINESS_ID;

  let phoneDisplay = "";
  let phoneTel = "";

  if (businessId) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: { phoneNumber: true },
    });

    if (business?.phoneNumber) {
      const raw = business.phoneNumber.retellPhoneNumber || business.phoneNumber.number;
      phoneDisplay = formatPhone(raw);
      phoneTel = toE164(raw);
    }
  }

  return (
    <div className="min-h-screen bg-paw-cream flex flex-col">
      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center space-y-8">
          {/* Greeting */}
          <div className="space-y-3">
            <h1 className="text-3xl font-extrabold text-paw-brown">
              Hi Shirine!
            </h1>
            <p className="text-paw-brown/70 text-lg leading-relaxed">
              We built a custom demo of <span className="font-bold text-paw-brown">Pip</span>, your
              phone receptionist, answering calls for Spawkles Mobile Dog Grooming.
            </p>
          </div>

          {/* Phone number card */}
          {phoneDisplay ? (
            <div className="bg-white rounded-3xl shadow-soft border border-paw-brown/5 px-8 py-8 space-y-4">
              <p className="text-sm font-semibold text-paw-brown/50 uppercase tracking-wider">
                Call to hear Pip in action
              </p>
              <a
                href={`tel:${phoneTel}`}
                className="block text-3xl font-extrabold text-paw-brown hover:text-paw-orange transition-colors"
              >
                {phoneDisplay}
              </a>
              <p className="text-paw-brown/50 text-sm">
                Tap to call on mobile, or dial from any phone
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-soft border border-paw-brown/5 px-8 py-8">
              <p className="text-paw-brown/60">
                Demo number is being set up. Check back shortly!
              </p>
            </div>
          )}

          {/* Suggestions */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-paw-brown/50 uppercase tracking-wider">
              Things to try
            </p>
            <div className="grid gap-2">
              {[
                "Book a grooming for your dog",
                "Ask about pricing",
                "Ask how mobile grooming works",
                "Ask what neighborhoods you serve",
              ].map((suggestion) => (
                <div
                  key={suggestion}
                  className="bg-white/70 border border-paw-brown/5 rounded-2xl px-4 py-3 text-sm text-paw-brown/70"
                >
                  &ldquo;{suggestion}&rdquo;
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          <p className="text-xs text-paw-brown/40 leading-relaxed max-w-sm mx-auto">
            This is a 2-minute demo call. Pip will handle the call just like she would
            for a real customer calling Spawkles.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="pb-8 pt-4 flex flex-col items-center gap-2">
        <BrandLogo mobileWidth={100} desktopWidth={120} />
        <p className="text-xs text-paw-brown/30">
          Powered by RingPaw
        </p>
      </footer>
    </div>
  );
}
