export function normalizeIndianMobile(value) {
  if (typeof value !== "string") return "";
  if (!/^[+\d\s()-]+$/.test(value)) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}

export function isValidIndianMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizeIndianMobile(value));
}
