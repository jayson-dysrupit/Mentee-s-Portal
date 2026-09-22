const HOUR_MS = 3_600_000
const MIN_MS = 60_000

/** 8.07 → "8.07 h". Numerics can arrive as strings, so coerce. */
export function fmtHours(hours: number | string | null): string {
  if (hours === null || hours === undefined || hours === '') return '—'
  return `${Number(hours).toFixed(2)} h`
}

/** A live duration as 7:42:09, for the ticking clock. */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0:00:00'
  const h = Math.floor(ms / HOUR_MS)
  const m = Math.floor((ms % HOUR_MS) / MIN_MS)
  const s = Math.floor((ms % MIN_MS) / 1000)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fmtClock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "Today" / "Yesterday" / "Thu 18 Sep" — the label a person actually reads. */
export function fmtDayLabel(date: string): string {
  const iso = todayISO()
  if (date === iso) return 'Today'
  if (date === shiftISO(-1)) return 'Yesterday'
  return fmtDate(date)
}

export function todayISO(): string {
  return shiftISO(0)
}

/** Local-date arithmetic in ISO form. Never use toISOString() here — it shifts
 *  to UTC and silently reports yesterday for anyone east of Greenwich. */
export function shiftISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** A datetime-local input's value for a given instant. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export const WORK_MODE_LABELS: Record<string, string> = {
  office: 'Office',
  remote: 'Remote',
  client_site: 'Client site',
}
