export function personName(p: { first_name: string; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ");
}

/**
 * A wa.me number for a South African phone number as typed: "082 123 4567",
 * "+27 82 123 4567" and "27821234567" all become "27821234567".
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `27${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("27")) return digits;
  if (digits.length >= 10 && !digits.startsWith("0")) return digits;
  return null;
}
