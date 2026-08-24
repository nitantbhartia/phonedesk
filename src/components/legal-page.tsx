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
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between border-b border-line pb-5">
          <BrandLogo priority />
          <div className="flex items-center gap-5 text-[13px] text-muted">
            <Link href="/privacy-policy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </div>
        </div>

        <article className="mt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-[13px] text-muted">
            Effective date: {effectiveDate}
          </p>
          <div className="mt-6 space-y-4 border-b border-line pb-10 text-[16px] leading-8 text-ink/80">
            {intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <div className="space-y-10 py-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-2xl tracking-tight">{section.title}</h2>
                <div className="mt-4 space-y-4 text-[15px] leading-8 text-ink/80">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
