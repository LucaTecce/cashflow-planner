export function normalizeIban(v: string) {
  return (v ?? "").replace(/\s+/g, "").toUpperCase()
}

export function formatIbanGroups(iban: string) {
  const s = normalizeIban(iban)
  return s.replace(/(.{4})/g, "$1 ").trim()
}

export function maskIban(iban: string) {
  const s = normalizeIban(iban)
  if (!s) return ""
  const last4 = s.slice(-4)
  // gleiche Länge behalten, aber alles außer last4 maskieren
  const masked = s.slice(0, -4).replace(/[A-Z0-9]/g, "•") + last4
  return formatIbanGroups(masked)
}
