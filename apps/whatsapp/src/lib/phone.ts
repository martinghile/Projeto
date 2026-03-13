import { config } from "../config.js";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhoneNumber(value: string, defaultCountryCode = config.defaultCountryCode) {
  let digits = digitsOnly(value);

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!digits.startsWith(defaultCountryCode) && (digits.length === 10 || digits.length === 11)) {
    digits = `${defaultCountryCode}${digits}`;
  }

  return digits;
}

export function phonesMatch(left: string, right: string) {
  const normalizedLeft = normalizePhoneNumber(left);
  const normalizedRight = normalizePhoneNumber(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(normalizedRight) ||
    normalizedRight.endsWith(normalizedLeft)
  );
}

export function toWhatsAppChatId(value: string) {
  const digits = normalizePhoneNumber(value);
  return digits ? `${digits}@c.us` : "";
}

export function normalizeIncomingJid(value: string) {
  return normalizePhoneNumber(value.split("@")[0] ?? "");
}
