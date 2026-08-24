import Link from "next/link";

type BrandLogoProps = {
  href?: string | null;
  className?: string;
  priority?: boolean;
  mobileWidth?: number;
  desktopWidth?: number;
  invert?: boolean;
};

export function BrandLogo({
  href = "/",
  className = "",
  invert = false,
}: BrandLogoProps) {
  const logo = (
    <span
      className={`inline-flex max-w-full items-center font-display text-[1.55rem] leading-none tracking-tight sm:text-[1.7rem] ${
        invert ? "text-paper" : "text-ink"
      } ${className}`.trim()}
    >
      Call Slot
    </span>
  );

  if (href === null) {
    return logo;
  }

  return href ? (
    <Link href={href} aria-label="Call Slot home" className="inline-flex max-w-full">
      {logo}
    </Link>
  ) : (
    logo
  );
}
