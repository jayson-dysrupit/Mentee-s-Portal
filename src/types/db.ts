/**
 * Hand-written to mirror supabase/migrations. Kept by hand rather than
 * generated so the app has no dependency on the Supabase CLI; if you later add
 * it, `supabase gen types typescript` replaces this file wholesale.
 */
export type Role = 'intern' | 'admin'
export type WorkMode = 'office' | 'remote' | 'client_site'
export type LogStatus = 'open' | 'submitted'

export const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: 'office', label: 'Office' },
  { value: 'remote', label: 'Remote' },
  { value: 'client_site', label: 'Client site' },
]

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  team: string | null
  supervisor_id: string | null
  internship_start: string | null
  internship_end: string | null
  required_hours: number | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface DailyLog {
  id: string
  intern_id: string
  log_date: string
  clock_in: string
  clock_out: string | null
  break_minutes: number
  work_mode: WorkMode
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  worked_on: string | null
  learned: string | null
  blockers: string | null
  plan_tomorrow: string | null
  skills: string[]
  confidence: number | null
  supervisor_comment: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

/** public.daily_log_details — daily_logs joined to the intern, with derived columns. */
export interface DailyLogDetail extends DailyLog {
  intern_email: string
  intern_name: string
  intern_team: string | null
  intern_supervisor_id: string | null
  status: LogStatus
  hours_worked: number | null
}

/** public.intern_progress — one row per intern with their running totals. */
export interface InternProgress {
  id: string
  email: string
  full_name: string
  team: string | null
  supervisor_id: string | null
  active: boolean
  internship_start: string | null
  internship_end: string | null
  required_hours: number | null
  days_logged: number
  hours_logged: number
  days_open: number
  awaiting_review: number
  last_log_date: string | null
}

export interface Skill {
  id: number
  name: string
  category: string
  active: boolean
}

/** What the clock-out form submits. The reflection and the clock-out are one
 *  write, because daily_logs_reflection_required refuses to separate them. */
export interface ReflectionDraft {
  clock_out: string
  worked_on: string
  learned: string
  blockers: string
  plan_tomorrow: string
  skills: string[]
  confidence: number | null
  break_minutes: number
}

export type AdjustableField = 'clock_in' | 'clock_out' | 'break_minutes'

/** public.log_adjustment_details — one row per field an admin changed. */
export interface LogAdjustment {
  id: string
  log_id: string
  intern_id: string
  changed_by: string
  field: AdjustableField
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
  intern_name: string
  intern_email: string
  changed_by_name: string
  log_date: string
}

/** What the admin's edit form submits; omitted fields are left alone. */
export interface TimeAdjustment {
  clock_in?: string | null
  clock_out?: string | null
  break_minutes?: number | null
  reason: string
}
