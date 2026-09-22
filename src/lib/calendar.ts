import { todayISO } from './format'

/**
 * Month-grid arithmetic for the calendar views.
 *
 * Every date here is built with the local-time Date constructor and formatted
 * by hand. toISOString() is never used: it converts to UTC first, which in
 * Manila (UTC+8) reports the previous day for anything before 08:00 — the app
 * would quietly file a morning clock-in against yesterday.
 *
 * Weeks start on Monday so Saturday and Sunday sit together at the right-hand
 * edge, which is what makes an attendance grid readable at a glance.
 */

export interface MonthCell {
  iso: string
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Weeks of seven cells, padded out to whole weeks with neighbouring days. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1)
  // getDay() is Sunday-based; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7
  const today = todayISO()

  const weeks: MonthCell[][] = []
  let cursor = new Date(year, month, 1 - lead)

  // Six rows covers every possible month; the trailing all-outside row is
  // dropped below so February does not render an empty week.
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + d)
      const iso = isoOf(cur)
      week.push({
        iso,
        day: cur.getDate(),
        inMonth: cur.getMonth() === month && cur.getFullYear() === year,
        isToday: iso === today,
        isWeekend: d >= 5,
      })
    }
    weeks.push(week)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
    if (week.every((c) => !c.inMonth) && w > 0) {
      weeks.pop()
      break
    }
  }
  return weeks
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

/** The month a given ISO date falls in — used to open the calendar somewhere useful. */
export function monthOf(iso: string): { year: number; month: number } {
  const d = new Date(`${iso}T00:00:00`)
  return { year: d.getFullYear(), month: d.getMonth() }
}
