import { useIntervalFn } from '@vueuse/core'
import { computed, ref, type Ref } from 'vue'

/**
 * Milliseconds since `from`, reticking every second. Used for the live "you
 * have been clocked in for 7:42:09" readout, which is the one number on the
 * page that has to be alive rather than fetched.
 */
export function useElapsed(from: Ref<string | null | undefined>) {
  const now = ref(Date.now())
  useIntervalFn(() => (now.value = Date.now()), 1000)
  return computed(() => {
    if (!from.value) return 0
    return Math.max(0, now.value - new Date(from.value).getTime())
  })
}
