import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  className?: string;
  priority?: boolean;
  mobileWidth?: number;
  desktopWidth?: number;
};

export function BrandLogo({
  href = "/",
  className = "",
}: BrandLogoProps) {
  const logo = (
    <span
      className={`inline-flex max-w-full items-center font-extrabold tracking-tight text-paw-brown ${className}`.trim()}
    >
      <span className="whitespace-nowrap text-[1.65rem] leading-none sm:text-[1.85rem]">
        Call Slot
      </span>
    </span>
  );

  return href ? (
    <Link href={href} aria-label="Call Slot home" className="inline-flex max-w-full">
      {logo}
    </Link>
  ) : (
    logo
  );
}
