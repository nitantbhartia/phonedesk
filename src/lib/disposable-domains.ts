/**
 * Common disposable / throwaway email domains.
 * This list covers the most widely abused providers.
 * Not exhaustive — supplement with an external blocklist API in Phase 2 if needed.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamailblock.com",
  "grr.la",
  "sharklasers.com",
  "spam4.me",
  "trashmail.com",
  "trashmail.me",
  "trashmail.net",
  "trashmail.at",
  "trashmail.io",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "10minutemail.com",
  "10minutemail.net",
  "10minemail.com",
  "throwam.com",
  "throwam.net",
  "yopmail.com",
  "yopmail.fr",
  "cool.fr.nf",
  "jetable.fr.nf",
  "nospam.ze.tc",
  "nomail.xl.cx",
  "mega.zik.dj",
  "speed.1s.fr",
  "courriel.fr.nf",
  "moncourrier.fr.nf",
  "monemail.fr.nf",
  "monmail.fr.nf",
  "dispostable.com",
  "mailnull.com",
  "maildrop.cc",
  "mailnesia.com",
  "mailnull.com",
  "spamgourmet.com",
  "spamgourmet.net",
  "spamgourmet.org",
  "fakeinbox.com",
  "mailboxy.fun",
  "getnada.com",
  "inboxkitten.com",
  "spambox.us",
  "binkmail.com",
  "bobmail.info",
  "chammy.info",
  "devnullmail.com",
  "letthemeatspam.com",
  "mailinater.com",
  "smellfear.com",
  "tempemail.net",
  "thanksnospam.info",
  "thisisnotmyrealemail.com",
  "throwam.com",
  "uggsrock.com",
  "kasmail.com",
  "spamspot.com",
  "spamthis.co.uk",
  "objectmail.com",
  "ownmail.net",
  "petml.com",
  "postinbox.com",
  "spamavert.com",
  "spamevader.net",
  "throwaway.email",
  "throwam.net",
  "0-mail.com",
  "0815.ru",
  "0clickemail.com",
  "spamfree24.org",
  "spamfree24.de",
  "spamfree24.eu",
  "spamfree24.info",
  "spamfree24.net",
  "spamfree.eu",
]);

/**
 * Returns true if the email domain is on the disposable blocklist.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Returns true if the email looks like a valid business email
 * (has a domain with a TLD, not disposable).
 */
export function isValidBusinessEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return false;
  if (isDisposableEmail(trimmed)) return false;
  return true;
}
