import Image from "next/image";
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
  priority = false,
  mobileWidth = 128,
  desktopWidth = 192,
}: BrandLogoProps) {
  const logo = (
    <span className={`inline-flex w-full max-w-full items-center ${className}`.trim()}>
      <Image
        src="/ringpaw-logo.svg"
        alt="RingPaw AI"
        width={desktopWidth}
        height={Math.round((desktopWidth * 1536) / 2816)}
        priority={priority}
        className="h-auto w-auto max-w-full object-contain"
        sizes={`(max-width: 640px) ${mobileWidth}px, ${desktopWidth}px`}
      />
    </span>
  );

  return href ? (
    <Link href={href} aria-label="RingPaw AI home" className="inline-flex max-w-full">
      {logo}
    </Link>
  ) : (
    logo
  );
}
