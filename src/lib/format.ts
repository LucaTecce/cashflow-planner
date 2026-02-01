export function formatDateDE(value: string | number | Date | null | undefined) {
  if (!value) return "—"

  // 1) Date instance: safe
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "—"
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value)
  }

  // 2) number: unix seconds or ms
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return "—"
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
  }

  // 3) string: prefer date-only parsing to avoid timezone shifts
  const s = value.trim()
  // Accept "YYYY-MM-DD" and also ISO timestamps, but only use the date part
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    const d = Number(m[3])
    const local = new Date(y, mo, d, 12, 0, 0, 0) // midday = DST-safe
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(local)
  }

  // Fallback: let Date parse other formats
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
}
