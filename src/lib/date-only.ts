export function parseDateOnly(ymd: string) {
  // ymd: "YYYY-MM-DD" -> local Date at 12:00 to avoid DST edge cases
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

export function formatDateOnly(d: Date) {
  // local date -> "YYYY-MM-DD"
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function toDateOnlyInput(value: string | null | undefined) {
  if (!value) return ""
  // if backend returns ISO timestamp, take first 10 chars
  if (value.length >= 10 && value[4] === "-" && value[7] === "-") return value.slice(0, 10)
  return ""
}