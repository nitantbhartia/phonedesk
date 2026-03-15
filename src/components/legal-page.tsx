import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
};

export function LegalPage({
  eyebrow,
  title,
  effectiveDate,
  intro,
  sections,
}: LegalPageProps) {
  return (
    <main className="min-h-screen bg-paw-sky text-paw-brown">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="glass-card rounded-full px-4 py-3 shadow-soft sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <BrandLogo priority mobileWidth={156} desktopWidth={220} />
            <div className="flex items-center gap-4 text-sm font-medium text-paw-brown/70">
              <Link href="/privacy-policy" className="transition-colors hover:text-paw-brown">
                Privacy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-paw-brown">
                Terms
              </Link>
            </div>
          </div>
        </div>

        <article className="mt-8 overflow-hidden rounded-[2rem] bg-white shadow-soft">
          <div className="border-b border-paw-brown/10 bg-gradient-to-br from-white via-paw-cream to-paw-amber/30 px-6 py-10 sm:px-10 sm:py-14">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-paw-orange">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-sm font-semibold text-paw-brown/60">
              Effective date: {effectiveDate}
            </p>
            <div className="mt-6 space-y-4 text-base leading-8 text-paw-brown/75 sm:text-lg">
              {intro.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className="px-6 py-10 sm:px-10 sm:py-12">
            <div className="space-y-10">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                  <div className="mt-4 space-y-4 text-base leading-8 text-paw-brown/75">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}
