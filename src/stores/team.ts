import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { humanizeError, supabase } from '@/lib/supabase'
import type { DailyLogDetail, InternProgress } from '@/types/db'

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
  const loading = ref(false)
  const error = ref('')

  const unreviewed = computed(() =>
    logs.value.filter((l) => l.status === 'submitted' && !l.reviewed_at),
  )

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

  return { interns, logs, loading, error, unreviewed, load, review }
})
