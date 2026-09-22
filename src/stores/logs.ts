import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { shiftISO, todayISO } from '@/lib/format'
import { captureLocation } from '@/lib/location'
import { humanizeError, supabase } from '@/lib/supabase'
import type { DailyLogDetail, ReflectionDraft, Skill, WorkMode } from '@/types/db'

import { useAuthStore } from './auth'

export const useLogsStore = defineStore('logs', () => {
  const auth = useAuthStore()

  const mine = ref<DailyLogDetail[]>([])
  const skills = ref<Skill[]>([])
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')

  const today = computed(() => mine.value.find((l) => l.log_date === todayISO()) ?? null)
  /** Yesterday counts as closeable: the 48-hour window in the RLS policy. */
  const yesterdayOpen = computed(
    () => mine.value.find((l) => l.log_date === shiftISO(-1) && l.status === 'open') ?? null,
  )
  const clockedIn = computed(() => today.value?.status === 'open')
  const withLearnings = computed(() =>
    mine.value.filter((l) => (l.learned ?? '').trim().length > 0),
  )
  const totalHours = computed(() =>
    mine.value.reduce((sum, l) => sum + Number(l.hours_worked ?? 0), 0),
  )
  const daysLogged = computed(() => mine.value.filter((l) => l.status === 'submitted').length)

  async function loadMine() {
    if (!auth.profile) return
    loading.value = true
    error.value = ''
    const { data, error: e } = await supabase
      .from('daily_log_details')
      .select('*')
      .eq('intern_id', auth.profile.id)
      .order('log_date', { ascending: false })
    if (e) error.value = humanizeError(e)
    else mine.value = (data as DailyLogDetail[]) ?? []
    loading.value = false
  }

  async function loadSkills() {
    const { data } = await supabase
      .from('skills')
      .select('*')
      .eq('active', true)
      .order('category')
      .order('name')
    skills.value = (data as Skill[]) ?? []
  }

  async function clockIn(workMode: WorkMode) {
    if (!auth.profile || busy.value) return
    busy.value = true
    error.value = ''
    const here = await captureLocation()
    const { error: e } = await supabase.from('daily_logs').insert({
      intern_id: auth.profile.id,
      log_date: todayISO(),
      clock_in: new Date().toISOString(),
      work_mode: workMode,
      clock_in_lat: here?.lat ?? null,
      clock_in_lng: here?.lng ?? null,
    })
    if (e) error.value = humanizeError(e)
    else await loadMine()
    busy.value = false
  }

  /**
   * Clock-out and the reflection are a single UPDATE because
   * daily_logs_reflection_required refuses to let them separate. That is the
   * point: a closed day always carries what was learned on it.
   */
  async function clockOut(logId: string, draft: ReflectionDraft) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    const here = await captureLocation()
    const { error: e } = await supabase
      .from('daily_logs')
      .update({
        clock_out: new Date(draft.clock_out).toISOString(),
        break_minutes: draft.break_minutes,
        worked_on: draft.worked_on.trim(),
        learned: draft.learned.trim(),
        blockers: draft.blockers.trim() || null,
        plan_tomorrow: draft.plan_tomorrow.trim() || null,
        skills: draft.skills,
        confidence: draft.confidence,
        clock_out_lat: here?.lat ?? null,
        clock_out_lng: here?.lng ?? null,
      })
      .eq('id', logId)
    busy.value = false
    if (e) {
      error.value = humanizeError(e)
      return false
    }
    await loadMine()
    return true
  }

  /** Amend an already-closed day, inside the 48-hour window the policy allows. */
  async function amend(logId: string, patch: Partial<ReflectionDraft>) {
    if (busy.value) return false
    busy.value = true
    error.value = ''
    const { error: e } = await supabase.from('daily_logs').update(patch).eq('id', logId)
    busy.value = false
    if (e) {
      error.value = humanizeError(e)
      return false
    }
    await loadMine()
    return true
  }

  return {
    mine,
    skills,
    loading,
    busy,
    error,
    today,
    yesterdayOpen,
    clockedIn,
    withLearnings,
    totalHours,
    daysLogged,
    loadMine,
    loadSkills,
    clockIn,
    clockOut,
    amend,
  }
})
