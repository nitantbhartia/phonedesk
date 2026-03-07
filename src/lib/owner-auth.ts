const SPLITTER = ",";

function parseList(value?: string | null) {
  if (!value) return [];
  return value
    .split(SPLITTER)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getOwnerDashboardEmails() {
  return parseList(
    process.env.OWNER_DASHBOARD_EMAILS || process.env.OWNER_EMAIL || ""
  );
}

export function isOwnerDashboardEmail(email?: string | null) {
  if (!email) return false;
  const allowed = getOwnerDashboardEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}

export function isOwnerDashboardEmailClient(email?: string | null) {
  if (!email) return false;
  const allowed = parseList(process.env.NEXT_PUBLIC_OWNER_DASHBOARD_EMAILS || "");
  if (allowed.length === 0) return false;
  return allowed.includes(email.toLowerCase());
}
