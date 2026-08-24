import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";

interface PageProps {
  params: Promise<{ token: string }>;
}

function buildGoogleCalendarUrl(
  title: string,
  startTime: Date,
  endTime: Date,
  description: string,
  location: string
): string {
  function toCalendarDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarDate(startTime)}/${toCalendarDate(endTime)}`,
    details: description,
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default async function AppointmentConfirmPage({ params }: PageProps) {
  const { token } = await params;

  const appointment = await prisma.appointment.findFirst({
    where: { groomerToken: token },
    include: { business: true },
  });

  if (!appointment) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center px-4">
        <div className="rounded-sm border border-line bg-surface p-10 text-center max-w-md w-full">
          <h1 className="font-display text-2xl tracking-tight text-ink mb-2">
            Appointment not found
          </h1>
          <p className="text-muted text-sm">
            This confirmation link is invalid or has expired. Please contact
            your salon directly for assistance.
          </p>
        </div>
      </div>
    );
  }

  const { business } = appointment;
  const timezone = business.timezone ?? "America/Los_Angeles";

  const formattedStart = formatDateTime(appointment.startTime, timezone);
  const formattedEnd = formatDateTime(appointment.endTime, timezone);

  const businessAddress = [
    business.address,
    business.city,
    business.state,
  ]
    .filter(Boolean)
    .join(", ");

  const calendarTitle = `${appointment.serviceName ?? "Grooming"} at ${business.name}`;
  const calendarDescription = `Your grooming appointment at ${business.name} for ${appointment.petName ?? "your pet"}.`;
  const calendarUrl = buildGoogleCalendarUrl(
    calendarTitle,
    appointment.startTime,
    appointment.endTime,
    calendarDescription,
    businessAddress
  );

  const prepTips = [
    "Don't bathe your pet 24 hours before the appointment",
    "Arrive 5 minutes early so your pet has time to settle",
    "Bring vaccination records if this is your first visit",
  ];

  return (
    <div className="min-h-screen bg-surface py-10 px-4">
      <div className="mx-auto max-w-lg space-y-4">

        {/* Header card */}
        <div className="rounded-sm border border-line bg-ink p-8 text-center">
          <h1 className="font-display text-3xl tracking-tight text-surface leading-tight">
            Your appointment is confirmed
          </h1>
          {appointment.customerName && (
            <p className="text-accent mt-1 font-medium">
              Hi {appointment.customerName}, we can&apos;t wait to see you.
            </p>
          )}
        </div>

        {/* Appointment details card */}
        <div className="rounded-sm bg-surface p-6 space-y-5">

          {/* Pet + Service */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted mb-0.5">
                Pet
              </p>
              <p className="text-2xl font-medium text-ink">
                {appointment.petName ?? "Your Pet"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-widest text-muted mb-0.5">
                Service
              </p>
              <p className="text-lg font-bold text-accent">
                {appointment.serviceName ?? "Grooming"}
              </p>
            </div>
          </div>

          <div className="h-px bg-ink/5" />

          {/* Date & time */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted mb-1">
              Date &amp; Time
            </p>
            <p className="text-ink font-semibold text-base">
              {formattedStart}
            </p>
            <p className="text-muted text-sm">
              Until {formattedEnd}
            </p>
          </div>

          <div className="h-px bg-ink/5" />

          {/* Salon info */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">
              Salon
            </p>
            <p className="text-ink font-bold text-lg">{business.name}</p>
            {businessAddress && (
              <p className="text-muted text-sm mt-0.5">{businessAddress}</p>
            )}
            {business.phone && (
              <a
                href={`tel:${business.phone}`}
                className="inline-flex items-center gap-1.5 mt-1 text-accent font-semibold text-sm hover:text-ink transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5 19.79 19.79 0 0 1 1.62 5C1.6 3.99 2.2 3.08 3.07 2.71L6 1.42a2 2 0 0 1 2.73.97l1.07 2.68a2 2 0 0 1-.45 2.11L8 8.09a16 16 0 0 0 6 6l.91-1.35a2 2 0 0 1 2.11-.45l2.68 1.07A2 2 0 0 1 22 16.92Z" />
                </svg>
                {formatPhoneNumber(business.phone)}
              </a>
            )}
          </div>
        </div>

        {/* Add to Calendar button */}
        <a
          href={calendarUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-sm bg-accent py-3 text-accent-foreground text-[13px] hover:bg-accent-hover transition-colors"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Add to Google Calendar
        </a>

        {/* Grooming prep tips */}
        <div className="rounded-sm bg-surface p-6 ">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">
            Grooming Prep Tips
          </h2>
          <ul className="space-y-3">
            {prepTips.map((tip) => (
              <li key={tip} className="text-ink/80 text-sm leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* See you soon message */}
        <div className="rounded-sm bg-line border border-line p-6 text-center ">
          <p className="text-ink font-bold text-lg">
            See you soon.
          </p>
          <p className="text-muted text-sm mt-1">
            — The team at {business.name}
          </p>
        </div>

        <p className="text-center text-muted text-xs pb-4">
          Powered by{" "}
          <a
            href="https://ringpaw.com"
            className="hover:text-muted transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Call Slot
          </a>
        </p>
      </div>
    </div>
  );
}
