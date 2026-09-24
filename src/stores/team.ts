import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { humanizeError, supabase } from '@/lib/supabase'
import type { DailyLogDetail, InternProgress, LogAdjustment, TimeAdjustment } from '@/types/db'

import { useAuthStore } from './auth'

/**
 * Admin-side reads. Nothing filters by person here on purpose: the RLS
 * policies already decide what comes back, so the query stays a plain select
 * and the access rule lives in one place rather than two.
 */
export const useTeamStore = defineStore('team', () => {
  const auth = useAuthStore()

  const interns = ref<InternProgress[]>([])
  const logs = ref<DailyLogDetail[]>([])
  const adjustments = ref<LogAdjustment[]>([])
  const loading = ref(false)
  const error = ref('')

  const unreviewed = computed(() =>
    logs.value.filter((l) => l.status === 'submitted' && !l.reviewed_at),
  )

  async function loadAdjustments() {
    if (!auth.isAdmin) return
    const { data, error: e } = await supabase
      .from('log_adjustment_details')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (e) error.value = humanizeError(e)
    else adjustments.value = (data as LogAdjustment[]) ?? []
  }

  /**
   * Goes through the adjust_log_times function rather than a plain update so
   * the reason reaches the audit trigger in the same transaction. A direct
   * update would still be recorded — the trigger sees to that — but with no
   * explanation attached.
   */
  async function adjustTimes(logId: string, patch: TimeAdjustment) {
    const { error: e } = await supabase.rpc('adjust_log_times', {
      p_log_id: logId,
      p_clock_in: patch.clock_in ?? null,
      p_clock_out: patch.clock_out ?? null,
      p_break_minutes: patch.break_minutes ?? null,
      p_reason: patch.reason.trim() || null,
    })
    if (e) {
      error.value = humanizeError(e)
      return false
    }
    await load()
    await loadAdjustments()
    return true
  }

  async function load() {
    if (!auth.isAdmin) return
    loading.value = true
    error.value = ''
    const [progress, recent] = await Promise.all([
      supabase.from('intern_progress').select('*').order('full_name'),
      supabase
        .from('daily_log_details')
        .select('*')
        .order('log_date', { ascending: false })
        .limit(200),
    ])
    if (progress.error) error.value = humanizeError(progress.error)
    if (recent.error) error.value = humanizeError(recent.error)
    interns.value = (progress.data as InternProgress[]) ?? []
    logs.value = ((recent.data as DailyLogDetail[]) ?? []).filter(
      (l) => l.intern_id !== auth.profile?.id,
    )
    loading.value = false
  }

  /** The guard trigger keeps this write to the review columns only. */
  async function review(logId: string, comment: string) {
    if (!auth.profile) return false
    const { error: e } = await supabase
      .from('daily_logs')
      .update({
        supervisor_comment: comment.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: auth.profile.id,
      })
      .eq('id', logId)
    if (e) {
      error.value = humanizeError(e)
      return false
    }
    await load()
    return true
  }

  return {
    interns,
    logs,
    adjustments,
    loading,
    error,
    unreviewed,
    load,
    loadAdjustments,
    adjustTimes,
    review,
  }
})
