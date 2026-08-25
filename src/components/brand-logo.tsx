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
      className={`inline-flex max-w-full items-center gap-2.5 font-bold text-[1.1rem] leading-none tracking-[-0.04em] sm:text-[1.18rem] ${
        invert ? "text-paper" : "text-ink"
      } ${className}`.trim()}
    >
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center border-2 border-current sm:h-8 sm:w-8" aria-hidden="true">
        <span className="absolute left-[5px] top-[5px] h-[5px] w-[5px] bg-current sm:left-[6px] sm:top-[6px]" />
        <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] bg-current sm:right-[6px] sm:top-[6px]" />
        <span className="absolute bottom-[5px] left-[5px] h-[5px] w-[5px] bg-current sm:bottom-[6px] sm:left-[6px]" />
        <span className="absolute bottom-[5px] right-[5px] h-[5px] w-[5px] bg-accent sm:bottom-[6px] sm:right-[6px]" />
      </span>
      RingPaw
    </span>
  );

  if (href === null) {
    return logo;
  }

  return href ? (
    <Link href={href} aria-label="RingPaw home" className="inline-flex max-w-full">
      {logo}
    </Link>
  ) : (
    logo
  );
}
